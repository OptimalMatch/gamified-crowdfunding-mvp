// Four thousand people buy one thing: the buy's own stages as a watcher on
// the platform's node (the sheet's "watch the node do it"):
//
//   scheduled -> A window opens (the ladder read from the supplier's library, agreed first)
//   open      -> Read the published tier as the count climbs (the additive counter)
//             -> Close on the clock, or on the tier, whichever the window declared
//   closed    -> Place the order at the tier the count reached, against the quote the supplier published
//             -> into the supplier's shared library, one document both sides write to
//   ordered   -> the escrow takes what was held and refunds the difference (sims/escrow-and-payouts.mjs)
//   paid      -> the supplier acknowledges and ships on its own node (sims/supplier.mjs); the vote decides where (sims/vote-pipeline.mjs)
//   addressed -> the truck is booked when the goods leave the dock; shipped; delivered
import { fleet, ready, sleep, now, STORES } from "../lib/api.mjs";
import { verify, docMessage } from "../lib/crypto.mjs";

const F = fleet(); const eu = F.platform.eu, supplierLib = F.platform.supplier;
const EVERY = Number(process.env.PIPELINE_EVERY_MS || 2000);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let supplierKey = null, pass = 0;

const tierReached = (ladder, count) => [...ladder].reverse().find((t) => count >= t.at_backers) || null;

async function openWindow(buy) {
  // The ladder, agreed with the supplier before the crowd forms: the latest version valid now, signed by the supplier's node.
  const rows = (await supplierLib.find(STORES.tiers, { item_index: buy.item_index, valid_until: { $gte: now() } }, 0));
  const version = Math.max(...rows.map((r) => r.version), 0);
  const ladder = rows.filter((r) => r.version === version).sort((a, b) => a.step - b.step);
  if (!ladder.length) { log(`${buy._id}: no valid ladder for item ${buy.item_index} on the supplier's library`); return; }
  const bad = ladder.filter((t) => supplierKey && !verify(supplierKey, docMessage(t), t.signature));
  if (bad.length) { log(`${buy._id}: ${bad.length} ladder rows do not verify against the supplier's key; not opening`); return; }
  await eu.update(STORES.buys, { _id: buy._id }, { $set: { status: "open", tier_version: version, ladder: ladder.map((t) => ({ at_backers: t.at_backers, units: t.units, price_cents: t.price_cents, valid_until: t.valid_until, signature: t.signature })), max_price_cents: ladder[0].price_cents, opened_at: now(), updated_at: now() } });
  log(`${buy._id}: window open for "${buy.item}", ladder v${version} (${ladder.length} steps, ${ladder[0].price_cents} at ${ladder[0].at_backers} down to ${ladder[ladder.length - 1].price_cents} at ${ladder[ladder.length - 1].at_backers}), signed by the supplier; closes ${buy.close_on === "tier" ? `at ${buy.close_tier} or ` : ""}on the clock ${buy.window_closes_at}`);
}

async function readTier(buy) {
  const c = await eu.get1(STORES.counts, buy._id); if (!c) return null;
  const t = tierReached(buy.ladder, c.count);
  const reached = t ? t.at_backers : null;
  if (reached !== c.tier_reached) { await eu.update(STORES.counts, { _id: buy._id }, { $set: { tier_reached: reached, updated_at: now() } }); log(`${buy._id}: ${c.count} committed, tier ${reached} reached: ${t.units} units at ${t.price_cents} each`); }
  if (reached !== buy.tier_reached || c.count !== buy.count) await eu.update(STORES.buys, { _id: buy._id }, { $set: { tier_reached: reached, count: c.count, units_committed: c.units, updated_at: now() } });
  return { ...c, tier_reached: reached, tier: t };
}

async function closeAndOrder(buy, c, why) {
  const t = c.tier || buy.ladder[0];
  await eu.update(STORES.buys, { _id: buy._id }, { $set: { status: "closed", closed_at: now(), closed_because: why, count: c.count, tier_reached: t.at_backers, units: t.units, unit_price_cents: t.price_cents, updated_at: now() } });
  log(`${buy._id}: closed ${why} with ${c.count} committed`);
  if (!c.count) { await eu.update(STORES.buys, { _id: buy._id }, { $set: { status: "empty", updated_at: now() } }); log(`${buy._id}: nobody joined; nothing to order`); return; }
  // Place the order at the tier the count actually reached, against the quote the supplier published. Nothing is renegotiated afterwards.
  const order = { _id: `po-${buy._id}`, order_id: `po-${buy._id}`, buy_id: buy._id, supplier_id: buy.supplier_id, item: buy.item, item_index: buy.item_index, tier_reached: t.at_backers, units: t.units, unit_price_cents: t.price_cents, total_cents: t.units * t.price_cents, quote_version: buy.tier_version, quote_signature: t.signature, backers: c.count, placed_at: now(), placed_by: "the platform", status: "placed", supplier_ack_at: null, shipped_units: null, left_dock_at: null, address: null };
  await eu.put(STORES.orders, order);
  await supplierLib.put(STORES.supplierOrders, order);
  await eu.update(STORES.buys, { _id: buy._id }, { $set: { status: "ordered", order_id: order._id, ordered_at: now(), updated_at: now() } });
  log(`${buy._id}: ordered ${t.units} x "${buy.item}" at ${t.price_cents} (tier ${t.at_backers}, quote v${buy.tier_version}) = ${order.total_cents}, written into the supplier's library`);
}

// The supplier's side of the shared order document, read back into the platform's copy.
async function readSupplierWrites() {
  for (const buy of await eu.find(STORES.buys, { status: { $in: ["paid", "voting", "addressed", "shipped"] } }, 0)) {
    let theirs; try { theirs = await supplierLib.get1(STORES.supplierOrders, `po-${buy._id}`); } catch { continue; }
    if (!theirs) continue;
    const ours = await eu.get1(STORES.orders, `po-${buy._id}`); if (!ours) continue;
    const patch = {};
    for (const f of ["supplier_ack_at", "shipped_units", "left_dock_at", "status", "short_because"]) if (theirs[f] != null && theirs[f] !== ours[f] && !(f === "status" && ours.status === "paid" && theirs.status === "placed")) patch[f] = theirs[f];
    if (Object.keys(patch).length) { await eu.update(STORES.orders, { _id: ours._id }, { $set: patch }); log(`${buy._id}: the supplier wrote ${Object.keys(patch).join(", ")} on the shared order`); }
  }
}

async function main() {
  await ready(eu); await ready(supplierLib);
  supplierKey = (await eu.get1(STORES.keys, "role:supplier-northlight"))?.public_key || null;
  log("group buy pipeline: watching group_buys on", eu.name);
  for (;;) {
    pass++;
    try {
      for (const b of await eu.find(STORES.buys, { status: "scheduled" }, 0)) if (Date.parse(b.window_opens_at) <= Date.now()) await openWindow(b);
      for (const b of await eu.find(STORES.buys, { status: "open" }, 0)) {
        const c = await readTier(b); if (!c) continue;
        if (b.close_on === "tier" && b.close_tier && c.count >= b.close_tier) await closeAndOrder(b, c, `on the tier (${b.close_tier} reached)`);
        else if (Date.parse(b.window_closes_at) <= Date.now()) await closeAndOrder(b, c, "on the clock");
      }
      await readSupplierWrites();
      // A window open is the hottest moment: every join appends a member, and a read walks them all, so the hot stores are folded every pass while one is open and every minute otherwise.
      const hot = (await eu.count(STORES.buys, { status: "open" })) > 0;
      if (hot || pass % 30 === 0) for (const c of [STORES.commitments, STORES.counts, STORES.buys, STORES.ledger]) { try { await eu.post("/api/doc/compact", { collection: c }); } catch {} }
    } catch (e) { log("pass failed:", e.message.slice(0, 200)); }
    await sleep(EVERY);
  }
}
main();
