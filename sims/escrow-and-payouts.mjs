// Escrow and payouts: Go beside the region node in the build sheet, a
// Node.js watcher here (DECISIONS.md, 6). Holds every pledge from the
// moment it is made until the round resolves, holds every commitment in a
// buy, then pays the supplier, pays the winners, refunds what was left over,
// and does none of it until the draw's proof is published and recomputes.
// Every movement is a signed entry in the money ledger, in sequence.
import { fleet, ready, sleep, now, STORES } from "../lib/api.mjs";
import { sign, verify, ledgerMessage } from "../lib/crypto.mjs";
import { roleKey } from "../lib/keys.mjs";
import { recomputeDraw } from "../lib/verify.mjs";

const F = fleet(); const eu = F.platform.eu, supplierLib = F.platform.supplier, sponsorLib = F.platform.sponsor;
const EVERY = Number(process.env.ESCROW_EVERY_MS || 2000);
const escrowKey = roleKey("escrow");
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let seq = 0, roundPublicKey = null;

// One entry, signed, in sequence. Money moves the way the ledger says and nowhere else.
function entry(kind, amount, from, to, ref, ids = {}) {
  const sequence = ++seq; const id = `L-${String(sequence).padStart(6, "0")}`;
  const e = { _id: id, entry_id: id, round_id: ids.round_id || null, buy_id: ids.buy_id || null, sequence, kind, amount_cents: amount, from, to, ref, at: now(), signed_by: "escrow" };
  e.signature = sign(escrowKey.privateKey, ledgerMessage(e)); return e;
}
async function write(entries) { if (entries.length) await eu.put(STORES.ledger, entries); return entries.length; }

// Pledges: held from the moment they are made.
async function holdPledges() {
  const fresh = await eu.find(STORES.pledges, { held_at: { $exists: false } }, 200);
  const entries = [];
  for (const p of fresh) {
    entries.push(entry("hold", p.amount_cents, `wallet:${p.backer_id}`, "escrow", p.pledge_id, { round_id: p.round_id }));
    await eu.update(STORES.backers, { _id: p.backer_id }, { $inc: { wallet_cents: -p.amount_cents } });
    await eu.update(STORES.pledges, { _id: p._id }, { $set: { held_at: now(), held_ref: entries[entries.length - 1].entry_id } });
  }
  await write(entries);
  if (entries.length) log(`held ${entries.length} pledge(s)`);
}

// Money moves after the proof: read it, recompute it, then pay.
async function payDrawn() {
  const drawn = await eu.find(STORES.pools, { status: "drawn" }, 0);
  for (const pool of drawn) {
    const draw = await eu.get1(STORES.draws, pool.draw_id);
    const seal = await eu.get1(STORES.sealed, `${pool._id}:seal`);
    const rule = draw && (await eu.get1(STORES.rules, `${draw.rule_id}@${draw.rule_version}`));
    const pledges = (await eu.find(STORES.pledges, { round_id: pool._id }, 0)).filter((p) => p.entry_index != null);
    const check = recomputeDraw({ seal, draw, rule, entries: pledges, roundKey: roundPublicKey, verifySig: verify });
    if (!check.ok) {
      const entries = pledges.map((p) => entry("refund", p.amount_cents, "escrow", `wallet:${p.backer_id}`, p.pledge_id, { round_id: pool._id }));
      for (const p of pledges) await eu.update(STORES.backers, { _id: p.backer_id }, { $inc: { wallet_cents: p.amount_cents } });
      await write(entries);
      await eu.update(STORES.pools, { _id: pool._id }, { $set: { status: "void", void_because: `escrow could not recompute the proof: ${check.why.join("; ")}`, updated_at: now() } });
      log(`${pool._id}: VOID, the proof did not recompute (${check.why.join("; ")}); ${entries.length} refunded`); continue;
    }
    const r = draw.result; const entries = [];
    const gathered = pledges.reduce((a, p) => a + p.amount_cents, 0);
    // The sponsor's match, held like any pledge, released on the same signal as the crowd's money.
    if (draw.match_cents) { entries.push(entry("hold", draw.match_cents, "sponsor:acme", "escrow", draw.draw_id, { round_id: pool._id })); entries.push(entry("release", draw.match_cents, "escrow", `round:${pool._id}`, draw.draw_id, { round_id: pool._id })); }
    entries.push(entry("release", gathered, "escrow", `round:${pool._id}`, draw.draw_id, { round_id: pool._id }));
    const refunded = new Set(r.refunds || []);
    for (const p of pledges) if (refunded.has(p.pledge_id)) { entries.push(entry("refund", p.amount_cents, `round:${pool._id}`, `wallet:${p.backer_id}`, p.pledge_id, { round_id: pool._id })); await eu.update(STORES.backers, { _id: p.backer_id }, { $inc: { wallet_cents: p.amount_cents } }); }
    for (const w of r.winners || []) { entries.push(entry("payout", w.amount_cents, `round:${pool._id}`, `wallet:${w.backer_id}`, w.pledge_id, { round_id: pool._id })); await eu.update(STORES.backers, { _id: w.backer_id }, { $inc: { wallet_cents: w.amount_cents } }); }
    const winnersPaid = (r.winners || []).reduce((a, w) => a + w.amount_cents, 0);
    const refundsPaid = pledges.filter((p) => refunded.has(p.pledge_id)).reduce((a, p) => a + p.amount_cents, 0);
    const toIdeas = gathered + (draw.match_cents || 0) - winnersPaid - refundsPaid;
    if (toIdeas > 0 && r.funded?.length) entries.push(entry("payout", toIdeas, `round:${pool._id}`, r.funded.length === 1 ? `funded:${r.funded[0]}` : "funded:" + r.funded.join("+"), draw.draw_id, { round_id: pool._id }));
    entries.push(entry("fee", Math.round(gathered * 0.02), `round:${pool._id}`, "platform", draw.draw_id, { round_id: pool._id }));
    await write(entries);
    // Streaks and tiers: awards are writes on the backer, so the weight is a number they can read.
    for (const p of pledges) if (!p.mandate_id) await eu.update(STORES.backers, { _id: p.backer_id }, { $inc: { rounds_completed: 1, streak_weeks: 1 } });
    for (const p of pledges) { const b = await eu.get1(STORES.backers, p.backer_id); const tier = Math.min(5, Math.floor((b?.rounds_completed || 0) / 8)); if (b && tier !== b.tier) await eu.update(STORES.backers, { _id: p.backer_id }, { $set: { tier } }); }
    await eu.update(STORES.pools, { _id: pool._id }, { $set: { status: "paid", paid_at: now(), updated_at: now() } });
    try { await sponsorLib.put("round_outcomes", { _id: pool._id, round_id: pool._id, category: pool.category, gathered_cents: gathered, match_cents: draw.match_cents || 0, outcome: r.funded?.length ? "funded" : "refunded", winners: (r.winners || []).length, paid_at: now() }); } catch {}
    log(`${pool._id}: proof recomputes; ${entries.length} ledger entries: ${winnersPaid ? `${r.winners.length} winner(s) paid ${winnersPaid}, ` : ""}${refundsPaid ? `${refunded.size} refunded ${refundsPaid}, ` : ""}${toIdeas > 0 && r.funded?.length ? `${toIdeas} to ${r.funded.join(", ")}` : ""}`);
  }
}

// Group buys: hold each commitment as it lands; at the order, take what was held at the final price and refund the difference.
async function holdCommitments() {
  const fresh = await eu.find(STORES.commitments, { status: "joined" }, 500);
  if (!fresh.length) return;
  const entries = fresh.map((c) => entry("hold", c.put_cents * c.units, `wallet:${c.backer_id}`, "escrow", c.commitment_id, { buy_id: c.buy_id }));
  await write(entries);
  await eu.update(STORES.commitments, { _id: { $in: fresh.map((c) => c._id) } }, { $set: { status: "held", held_at: now() } }, { multi: true });
  log(`held ${fresh.length} commitment(s) in ${[...new Set(fresh.map((c) => c.buy_id))].join(", ")}`);
}
async function settleOrders() {
  const ordered = await eu.find(STORES.buys, { status: "ordered" }, 0);
  for (const buy of ordered) {
    const order = await eu.get1(STORES.orders, `po-${buy._id}`); if (!order) continue;
    const held = await eu.find(STORES.commitments, { buy_id: buy._id, status: "held" }, 0);
    const entries = []; let taken = 0, refunded = 0;
    for (const c of held) {
      const take = order.unit_price_cents * c.units, back = c.put_cents * c.units - take;
      entries.push(entry("take", take, "escrow", `buy:${buy._id}`, c.commitment_id, { buy_id: buy._id })); taken += take;
      if (back > 0) { entries.push(entry("refund", back, "escrow", `wallet:${c.backer_id}`, c.commitment_id, { buy_id: buy._id })); refunded += back; }
    }
    entries.push(entry("payout", order.total_cents, `buy:${buy._id}`, `supplier:${order.supplier_id}`, order.order_id, { buy_id: buy._id }));
    await write(entries);
    for (const c of held) await eu.update(STORES.commitments, { _id: c._id }, { $set: { status: "taken", taken_cents: order.unit_price_cents * c.units, refunded_cents: c.put_cents * c.units - order.unit_price_cents * c.units, settled_at: now() } });
    await eu.update(STORES.orders, { _id: order._id }, { $set: { paid_at: now(), status: "paid" } });
    try { await supplierLib.update(STORES.supplierOrders, { _id: order._id }, { $set: { paid_at: now(), paid_cents: order.total_cents } }); } catch {}
    await eu.update(STORES.buys, { _id: buy._id }, { $set: { status: "paid", paid_at: now(), taken_cents: taken, refunded_cents: refunded, updated_at: now() } });
    log(`${buy._id}: took ${taken} from ${held.length} commitment(s) at ${order.unit_price_cents} each, refunded ${refunded} the way it came, paid ${order.supplier_id} ${order.total_cents}`);
  }
}
// The split fee, if we do it: a line on the ledger, not a margin.
async function splitFees() {
  for (const s of await eu.find(STORES.splits, { model: "depot", fee_charged: { $exists: false } }, 0)) {
    const fee = s.fee_per_share_cents * s.shares_total; await write([entry("fee", fee, `buy:${s.buy_id}`, "platform:depot", s.split_id, { buy_id: s.buy_id })]);
    await eu.update(STORES.splits, { _id: s._id }, { $set: { fee_charged: fee, fee_charged_at: now() } }); log(`${s.buy_id}: depot fee ${fee} as a ledger line`);
  }
}
async function main() {
  await ready(eu);
  const last = (await eu.find(STORES.ledger, {}, 0)).reduce((a, e) => Math.max(a, e.sequence || 0), 0); seq = last;
  roundPublicKey = (await eu.get1(STORES.keys, "role:round"))?.public_key || null;
  log(`escrow: ledger at sequence ${seq}, round key ${roundPublicKey?.slice(0, 12)}…`);
  for (;;) {
    try { await holdPledges(); await payDrawn(); await holdCommitments(); await settleOrders(); await splitFees(); } catch (e) { log("pass failed:", e.message.slice(0, 200)); }
    await sleep(EVERY);
  }
}
main();
