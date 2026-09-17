// A library per supplier: the supplier's own node on the library it shares
// with the platform alone. It publishes its ladder there (seeded), reads the
// orders the platform places against it and writes its side of the same
// document: the acknowledgement, what left the dock and when. A short
// shipment is a field both sides agree on, not two systems disagreeing.
import { fleet, ready, sleep, now, ensureCollection, STORES } from "../lib/api.mjs";
const F = fleet(); const me = F.supplier;
const ACK_MS = Number(process.env.SUPPLIER_ACK_MS || 5000), SHIP_MS = Number(process.env.SUPPLIER_SHIP_MS || 15000);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "supplier-northlight:", ...a);
async function main() {
  await ready(me);
  for (;;) {
    try {
      // An order the platform just placed is a member this node may not hold yet: replicate before reading.
      await ensureCollection(me, STORES.supplierOrders);
      for (const o of await me.find(STORES.supplierOrders, { status: "placed" }, 0)) {
        if (o.supplier_ack_at) continue;
        if (Date.now() - Date.parse(o.placed_at) < ACK_MS) continue;
        await me.update(STORES.supplierOrders, { _id: o._id }, { $set: { supplier_ack_at: now(), status: "acknowledged", acknowledged_by: "the dock" } });
        log(`read order ${o._id}: ${o.units} x "${o.item}" at ${o.unit_price_cents} (our quote v${o.quote_version}); acknowledged`);
      }
      for (const o of await me.find(STORES.supplierOrders, { status: "acknowledged" }, 0)) {
        if (!o.paid_at || Date.now() - Date.parse(o.supplier_ack_at) < SHIP_MS) continue;
        const short = o.units > 50 && Math.random() < 0.15 ? Math.floor(o.units * 0.02) : 0;
        await me.update(STORES.supplierOrders, { _id: o._id }, { $set: { shipped_units: o.units - short, short_because: short ? `${short} units short: one carton failed inspection` : null, left_dock_at: now(), status: "shipped" } });
        log(`${o._id}: ${o.units - short} of ${o.units} left the dock${short ? ` (${short} short, written on the order we both hold)` : ""}`);
      }
    } catch (e) { log("pass failed:", e.message.slice(0, 160)); }
    await sleep(2000);
  }
}
main();
