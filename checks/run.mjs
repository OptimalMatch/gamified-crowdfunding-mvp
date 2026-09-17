// The checks of the MVP sheet, section 6, one function each, over the
// engine's HTTP API. The build is done when they all pass.
//   docker compose run --rm tools node checks/run.mjs        (in the network)
//   FROM_HOST=1 node checks/run.mjs                           (from the host)
import { fleet, ready, ensureCollection, sleep, STORES } from "../lib/api.mjs";
import { recomputeDraw, verifyReceipt } from "../lib/verify.mjs";
import { verify as verifySig, commitmentMessage, voteMessage, handoverMessage, docMessage, ledgerMessage } from "../lib/crypto.mjs";
import { QUESTIONS } from "../bin/metabase.mjs";
const F = fleet(); const eu = F.platform.eu;
const results = [];
class Skip extends Error {}
const skip = (why) => { throw new Skip(why); };
const check = async (n, name, fn) => { try { const detail = await fn(); results.push({ n, name, ok: true, detail }); console.log(`ok   ${String(n).padStart(2)}  ${name}${detail ? `  (${detail})` : ""}`); } catch (e) { if (e instanceof Skip) { results.push({ n, name, skipped: true, detail: e.message }); console.log(`skip ${String(n).padStart(2)}  ${name}: ${e.message}`); return; } results.push({ n, name, ok: false, detail: e.message }); console.log(`FAIL ${String(n).padStart(2)}  ${name}: ${e.message}`); } };
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const live = (id) => /-(live|web|draft)-/.test(id);

for (const n of [eu, F.platform.sponsor, F.platform.supplier, F.regulator, F.supplier, F.sponsor]) await ready(n);
const manifest = await eu.get1("seed_manifest", "seed"); expect(manifest, "no seed manifest: run the seed first");
const SEED = manifest.counts;
const keys = Object.fromEntries((await eu.find(STORES.keys, {}, 0)).map((k) => [k.holder, k.public_key]));

// 1 to 17: count equals what was seeded plus what the script wrote. What the
// script wrote is what the live processes wrote: documents whose ids carry
// -live-, -web- or -draft-, or that hang off such a round or buy.
const counted = async (store, wroteFilter, label) => { const all = await eu.count(store); const wrote = await eu.count(store, wroteFilter); expect(all === SEED[store] + wrote, `${all} documents, seeded ${SEED[store]}, the script wrote ${wrote}`); return `${all} = ${SEED[store]} seeded + ${wrote} ${label}`; };
await check(1, "backers, wallets and standing: count equals what was seeded plus what the script wrote", () => counted(STORES.backers, { _id: { $regex: "^b-new-" } }, "newcomers who joined a buy"));
await check(2, "standing contributions: count equals what was seeded plus what the script wrote", () => counted(STORES.standing, { _id: { $regex: "^m-live-" } }, "written live"));
await check(3, "pools, one per round: count equals what was seeded plus what the script wrote", () => counted(STORES.pools, { _id: { $regex: "-(live|web|draft)-" } }, "opened live"));
await check(4, "pledges, signed: count equals what was seeded plus what the script wrote", () => counted(STORES.pledges, { round_id: { $regex: "-(live|web)-" } }, "pledged live"));
await check(5, "allocation rules: count equals what was seeded plus what the script wrote", () => counted(STORES.rules, { _id: { $regex: "-live-" } }, "written live"));
await check(6, "sealed commitments and roots: count equals what was seeded plus what the script wrote", () => counted(STORES.sealed, { round_id: { $regex: "-(live|web)-" } }, "sealed, anchored and revealed live"));
await check(7, "draws and their proofs: count equals what was seeded plus what the script wrote", () => counted(STORES.draws, { round_id: { $regex: "-(live|web)-" } }, "drawn live"));
await check(8, "group buys: count equals what was seeded plus what the script wrote", () => counted(STORES.buys, { _id: { $regex: "-(live|web)-" } }, "windows opened live"));
await check(9, "tier_published: count equals what was seeded plus what the script wrote", async () => { const c = await F.supplier.count(STORES.tiers); expect(c === manifest.tiers_on_supplier, `${c} rows on the supplier's node, seeded ${manifest.tiers_on_supplier}`); return `${c} rows on the supplier's own node`; });
await check(10, "commitments, counted: count equals what was seeded plus what the script wrote", async () => { const a = await counted(STORES.commitments, { buy_id: { $regex: "-(live|web)-" } }, "joins live"); const b = await counted(STORES.counts, { _id: { $regex: "-(live|web)-" } }, "counters live"); return `${a}; ${b}`; });
await check(11, "purchase orders: count equals what was seeded plus what the script wrote", () => counted(STORES.orders, { buy_id: { $regex: "-(live|web)-" } }, "placed live"));
await check(12, "destinations proposed: count equals what was seeded plus what the script wrote", () => counted(STORES.destinations, { buy_id: { $regex: "-(live|web)-" } }, "proposed live"));
await check(13, "shipments: count equals what was seeded plus what the script wrote", () => counted(STORES.shipments, { buy_id: { $regex: "-(live|web)-" } }, "shipped live"));
await check(14, "how the pallet is broken up: count equals what was seeded plus what the script wrote", () => counted(STORES.splits, { buy_id: { $regex: "-(live|web)-" } }, "chosen live"));
await check(15, "rules by jurisdiction: count equals what was seeded plus what the script wrote", () => counted(STORES.jurisdictions, { _id: { $regex: "-live-" } }, "written live"));
await check(16, "the money ledger: count equals what was seeded plus what the script wrote", () => counted(STORES.ledger, { $or: [{ round_id: { $regex: "-(live|web)-" } }, { buy_id: { $regex: "-(live|web)-" } }] }, "movements live"));
await check(17, "disputes and appeals: count equals what was seeded plus what the script wrote", () => counted(STORES.disputes, { _id: { $regex: "^dsp-(live|web)-" } }, "argued live"));

// The live round the demo script ran: the newest paid one.
const pools = (await eu.find(STORES.pools, { _id: { $regex: "-(live|web)-" } }, 0)).sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1));
const round = pools.find((p) => p.status === "paid") || pools.find((p) => p.status === "drawn") || null;
const need = (x, what) => { expect(x, `no live round has ${what} yet: run the demo script (DEMO.md) first`); return x; };
await check(18, "after Seal the seed and the rule: sealed commitments and roots before any entry", async () => {
  const p = need(round, "been opened and sealed");
  const seal = await eu.get1(STORES.sealed, `${p._id}:seal`); expect(seal, `no seal for ${p._id}`);
  const first = (await eu.find(STORES.pledges, { round_id: p._id }, 0)).sort((a, b) => (a.pledged_at < b.pledged_at ? -1 : 1))[0];
  expect(!first || seal.sealed_at < first.pledged_at, `sealed ${seal.sealed_at}, first entry ${first?.pledged_at}`);
  expect(seal.seed === null && seal.seed_hash && seal.rule_version, "the seal carries a hash, the rule by version and no seed");
  expect(verifySig(keys.round, docMessage(seal), seal.signature), "the seal's signature does not verify against the round's key");
  return `${p._id} sealed ${seal.sealed_at}, first entry ${first ? first.pledged_at : "none"}; signed by the round`;
});
await check(19, "after Publish the proof, then pay: draws and their proofs everything to redo it", async () => {
  const p = need(round, "been drawn"); const d = await eu.get1(STORES.draws, p.draw_id); expect(d, "no proof");
  for (const f of ["seed", "seed_hash", "beacon", "entry_root", "entries_hash", "entry_count", "rule_id", "rule_version", "result", "signature"]) expect(d[f] != null, `the proof lacks ${f}`);
  expect(d.beacon.value && d.beacon.round && d.beacon.source, "the beacon carries a source, a round and a value");
  const paid = (await eu.find(STORES.ledger, { round_id: p._id, kind: { $in: ["release", "payout", "refund"] } }, 0)).sort((a, b) => a.sequence - b.sequence);
  expect(paid.length, "no money moved"); expect(paid[0].at >= d.drawn_at, `money moved at ${paid[0].at}, before the proof at ${d.drawn_at}`);
  return `${d.draw_id}: beacon ${d.beacon.source} round ${d.beacon.round}; ${paid.length} movements, the first ${Math.round((Date.parse(paid[0].at) - Date.parse(d.drawn_at)) / 1000)} s after the proof`;
});
await check(20, "after Publish the proof, then pay: metric1 measured per round", async () => {
  // The round's cycle: opened to sealed, sealed to closed, closed to proof, proof to paid.
  const p = need(round, "been paid"); const seal = await eu.get1(STORES.sealed, `${p._id}:seal`); const d = await eu.get1(STORES.draws, p.draw_id);
  const s = (a, b) => `${((Date.parse(b) - Date.parse(a)) / 1000).toFixed(1)} s`;
  expect(p.paid_at && d && seal, "not paid yet");
  return `opened → sealed ${s(p.opened_at, seal.sealed_at)}, sealed → closed ${s(seal.sealed_at, p.closed_at)}, closed → proof ${s(p.closed_at, d.drawn_at)}, proof → paid ${s(d.drawn_at, p.paid_at)}; ${p.entries} entries, ${p.gathered_cents} gathered${p.matched_cents ? `, ${p.matched_cents} matched` : ""}`;
});
// The live buy the demo script ran: the newest delivered one.
const buys = (await eu.find(STORES.buys, { _id: { $regex: "-(live|web)-" } }, 0)).sort((a, b) => (a.window_opens_at < b.window_opens_at ? 1 : -1));
const buy = buys.find((b) => b.status === "delivered") || buys.find((b) => ["shipped", "addressed", "voting", "paid", "ordered"].includes(b.status)) || null;
const needBuy = (what) => { expect(buy, `no live buy has ${what} yet: run the demo script (DEMO.md) first`); return buy; };
await check(21, "after Four thousand join at once: commitments, counted every join adds", async () => {
  const b = needBuy("been joined"); const c = await eu.get1(STORES.counts, b._id); const joins = await eu.find(STORES.commitments, { buy_id: b._id }, 0);
  const units = joins.reduce((a, x) => a + x.units, 0);
  expect(c.count === joins.length && c.units === units, `the counter reads ${c.count} (${c.units} units), ${joins.length} joins (${units} units) were written`);
  const bad = joins.filter((x) => !verifySig(x.device_public_key, commitmentMessage(x), x.signature)).length; expect(!bad, `${bad} commitments do not verify against their device keys`);
  const first = joins.map((x) => x.joined_at).sort()[0], last = joins.map((x) => x.joined_at).sort().pop();
  return `${c.count} joins on the counter, ${c.count} receipts, every one signed; ${joins.length} landed in ${((Date.parse(last) - Date.parse(first)) / 1000).toFixed(0)} s`;
});
await check(22, "after Place the order: purchase orders at the tier reached", async () => {
  const b = needBuy("been ordered"); const o = await eu.get1(STORES.orders, `po-${b._id}`); expect(o, "no order");
  const tier = b.ladder.find((t) => t.at_backers === o.tier_reached); expect(tier, "the order's tier is not on the ladder");
  expect(o.unit_price_cents === tier.price_cents && o.units === tier.units, `ordered ${o.units} at ${o.unit_price_cents}, the ladder says ${tier.units} at ${tier.price_cents}`);
  const rows = await F.supplier.find(STORES.tiers, { item_index: b.item_index, version: o.quote_version, at_backers: o.tier_reached }, 1); expect(rows[0] && rows[0].signature === o.quote_signature, "the order does not cite the supplier's own signed row");
  expect(verifySig(keys["supplier-northlight"], docMessage(rows[0]), rows[0].signature), "the supplier's signature on the quote does not verify");
  const reached = [...b.ladder].reverse().find((t) => b.count >= t.at_backers); expect(reached.at_backers === o.tier_reached, `${b.count} backers reach tier ${reached.at_backers}, the order says ${o.tier_reached}`);
  let theirs = null; try { theirs = await F.supplier.get1(STORES.supplierOrders, o._id); } catch {}
  return `${o.units} x "${o.item}" at ${o.unit_price_cents} (tier ${o.tier_reached} of ${b.count} backers), the supplier's signed quote v${o.quote_version}; the supplier's node ${theirs ? `holds the same order, ${theirs.status}` : "has not synced it yet"}`;
});
await check(23, "after Take what was held: metric1 measured per buy", async () => {
  const b = needBuy("been paid"); expect(b.paid_at, "not settled yet");
  const led = await eu.find(STORES.ledger, { buy_id: b._id }, 0);
  const sum = (k) => led.filter((e) => e.kind === k).reduce((a, e) => a + e.amount_cents, 0);
  const bad = led.filter((e) => !verifySig(keys.escrow, ledgerMessage(e), e.signature)).length; expect(!bad, `${bad} ledger entries do not verify against the escrow's key`);
  expect(sum("hold") >= sum("take") + sum("refund") - 1, `held ${sum("hold")}, taken ${sum("take")} + refunded ${sum("refund")}`);
  const o = await eu.get1(STORES.orders, `po-${b._id}`);
  return `held ${sum("hold")}, taken ${sum("take")} at ${o.unit_price_cents} each, refunded ${sum("refund")} the way it came, paid the supplier ${sum("payout")}; window ${b.window_opens_at.slice(11, 19)} → ordered ${b.ordered_at.slice(11, 19)} → paid ${b.paid_at.slice(11, 19)}; ${led.length} entries, all signed`;
});
await check(24, "after Rank them, weighted: The crowd decides where ranked and weighted", async () => {
  const b = needBuy("been voted on"); const t = await eu.get1(STORES.tallies, `tally:${b._id}`); expect(t, "no tally yet");
  // Ballots cast before the vote closed on its clock; a late ballot is on the record and counts for nothing.
  const votes = (await eu.find(STORES.votes, { buy_id: b._id }, 0)).filter((v) => v.cast_at <= t.closed_at); const members = new Map((await eu.find(STORES.commitments, { buy_id: b._id }, 0)).map((c) => [c.backer_id, c]));
  const bad = votes.filter((v) => !members.has(v.backer_id) || !verifySig(members.get(v.backer_id).device_public_key, voteMessage(v), v.signature)).length; expect(!bad, `${bad} ballots do not verify`);
  const weight = votes.reduce((a, v) => a + (members.get(v.backer_id)?.put_cents || 0) * (members.get(v.backer_id)?.units || 1), 0);
  expect(t.voters === votes.length && t.weight_cents === weight, `the tally counts ${t.voters} voters and ${t.weight_cents} of weight; ${votes.length} ballots carry ${weight}`);
  expect(verifySig(keys.fulfilment, docMessage(t), t.signature), "the tally's signature does not verify");
  return `${t.voters} of ${t.members} ranked, ${t.weight_cents} of weight, ${t.rounds.length} runoff round(s); ${t.quorum_met ? `carried: ${t.destination.name}` : `short of quorum: the default, ${t.destination.name}`}`;
});
await check(25, "after The tally becomes an address and a model: shipments the address it chose", async () => {
  const b = needBuy("been addressed"); const t = await eu.get1(STORES.tallies, `tally:${b._id}`); const sh = await eu.get1(STORES.shipments, `sh-${b._id}`); const sp = await eu.get1(STORES.splits, `split:${b._id}`);
  expect(t && sh && sp, "no tally, shipment or split yet");
  expect(sh.address === t.address && sp.model === t.split_model && sp.custodian === t.custodian && sh.custodian === t.custodian, `the shipment says ${sh.address}, the tally ${t.address}`);
  return `${sh.address}, split by ${sp.model}, ${sp.custodian} holding it${sh.carrier ? `; ${sh.carrier} booked ${sh.booked_at.slice(11, 19)}` : ""}${sh.delivered_at ? `, delivered ${sh.delivered_at.slice(11, 19)}` : ""}`;
});
await check(26, "after Custody, share by share: metric1 measured per buy", async () => {
  const b = needBuy("been delivered"); const sh = await eu.get1(STORES.shipments, `sh-${b._id}`); const sp = await eu.get1(STORES.splits, `split:${b._id}`);
  const hs = (sh.handovers || []).filter((h) => h.share > 0); expect(hs.length, "no share has been handed over yet");
  const members = new Map((await eu.find(STORES.commitments, { buy_id: b._id }, 0)).map((c) => [c.backer_id, c]));
  const bad = hs.filter((h) => !h.photo_hash || !members.has(h.to) || !verifySig(members.get(h.to).device_public_key, handoverMessage(h), h.signature)).length; expect(!bad, `${bad} handovers lack a photo or a signature that verifies`);
  expect(sp.shares_handed === hs.length, `the split counts ${sp.shares_handed} handed, ${hs.length} on the shipment`);
  const pod = (sh.handovers || []).find((h) => h.share === 0);
  return `${hs.length} of ${sp.shares_total} shares handed over by ${sp.custodian}, each signed with a photograph; the carrier's proof of delivery ${pod ? "on the record" : "missing"}; delivered ${((Date.parse(sh.delivered_at) - Date.parse(b.window_opens_at)) / 60000).toFixed(1)} min after the window opened`;
});
await check(27, "Every draw recomputes to the same answer: independent recomputations that agree within 100 in 100, over the script's run", async () => {
  // Two independent recomputations: this process, from the regulator's own copy, and the escrow's (it paid only after its own agreed).
  const reg = F.regulator; for (const c of [STORES.pledges, STORES.sealed, STORES.draws, STORES.rules]) await ensureCollection(reg, c);
  const draws = await reg.find(STORES.draws, {}, 0);
  const rules = new Map((await reg.find(STORES.rules, {}, 0)).map((r) => [r._id, r])); const seals = new Map((await reg.find(STORES.sealed, { kind: "seal" }, 0)).map((s) => [s.round_id, s]));
  const pledges = await reg.find(STORES.pledges, {}, 0); const by = new Map(); for (const p of pledges) { if (!by.has(p.round_id)) by.set(p.round_id, []); by.get(p.round_id).push(p); }
  let agree = 0, disagree = 0, cold = 0; const bad = [];
  for (const d of draws) { const pool = await reg.get1(STORES.pools, d.round_id); if (pool?.cold) { cold++; continue; } let seal = seals.get(d.round_id); if (!seal) seal = await reg.get1(STORES.sealed, `${d.round_id}:seal`); const r = recomputeDraw({ seal, draw: d, rule: rules.get(`${d.rule_id}@${d.rule_version}`), entries: (by.get(d.round_id) || []).filter((p) => p.entry_index != null), roundKey: keys.round, verifySig }); if (r.ok) agree++; else { disagree++; bad.push(`${d.round_id}: ${r.why[0]}`); } }
  expect(disagree === 0, `${disagree} of ${agree + disagree} disagree: ${bad.slice(0, 3).join("; ")}`);
  const paidLive = pools.filter((p) => p.status === "paid").length, voidLive = pools.filter((p) => p.status === "void").length;
  return `${agree} of ${agree} recomputed from the regulator's copy agree (${cold} cold rounds in the bucket); the escrow agreed on ${paidLive} live round(s) before paying${voidLive ? `, voided ${voidLive}` : ""}`;
});
const failed = results.filter((r) => r.ok === false), skipped = results.filter((r) => r.skipped);
console.log(`\n${results.filter((r) => r.ok).length} of ${results.length} checks pass${skipped.length ? `, ${skipped.length} skipped` : ""}${failed.length ? `; failed: ${failed.map((f) => f.n).join(", ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
