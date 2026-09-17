// The node's job "Run the allocation" and the round's own stages, as a
// watcher on the platform's node (the sheet's "watch the node do it"):
//
//   opening  -> May this market run it?  -> Seal the seed and the rule -> open
//   open     -> Standing weights them, the tree grows and is anchored, standing contributions raise pledges
//   closes   -> Close and hash the entries -> Take the beacon, reveal the seed -> Run the frozen rule -> Publish the proof -> drawn
//
// The escrow (sims/escrow-and-payouts.mjs) reads the proof and pays. The
// sponsor's match is read from the sponsor's shared library at close.
import { fleet, ready, sleep, now, serial, STORES } from "../lib/api.mjs";
import { sha256, commitment, merkleTree, merklePath, leafHash, entriesHash, sign, docMessage, pledgeMessage, mandateMessage, verify } from "../lib/crypto.mjs";
import { roleKey, deviceKey } from "../lib/keys.mjs";
import { allocate, weightFor, scenarioGrid, bandFor } from "../lib/mechanisms.mjs";
import { beaconAfter } from "../lib/beacon.mjs";

const F = fleet();
const eu = F.platform.eu, sponsorLib = F.platform.sponsor;
const EVERY = Number(process.env.PIPELINE_EVERY_MS || 2000);
const STANDING_EVERY_MS = Number(process.env.STANDING_EVERY_MS || 45000); // a "payday" in the demo
const roundKey = roleKey("round");
const SECRET = process.env.DEMO_KEY_SEED || "demo-only-change-me";
const seedFor = (roundId) => sha256(`seed|${roundId}|${SECRET}`); // the platform's secret: sealed before opening, revealed after close
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let pass = 0;

async function gateAndSeal(pool) {
  const [j] = await eu.find(STORES.jurisdictions, { market: pool.market, $or: [{ mechanism: pool.mechanism }, { also_covers: pool.mechanism }] }, 1);
  if (!j || !j.allowed) { await eu.update(STORES.pools, { _id: pool._id }, { $set: { status: "refused", refused_because: `${pool.market} does not allow a ${pool.mechanism.replace(/_/g, " ")} (${j ? j.may_be_called : "no rule for this market"})`, updated_at: now() } }); log(`${pool._id}: refused, ${pool.market} does not allow ${pool.mechanism}`); return; }
  const rule = await eu.get1(STORES.rules, `${pool.rule_id}@${pool.rule_version}`);
  if (!rule) { log(`${pool._id}: no rule ${pool.rule_id}@${pool.rule_version}`); return; }
  const seed = seedFor(pool._id);
  const seal = { _id: `${pool._id}:seal`, round_id: pool._id, kind: "seal", seed_hash: commitment(seed, rule.rule_id, rule.version), rule_id: rule.rule_id, rule_version: rule.version, sealed_at: now(), entries: 0, root: null, seed: null, signed_by: "round" };
  seal.signature = sign(roundKey.privateKey, docMessage(seal));
  await eu.put(STORES.sealed, seal);
  const opens = Date.now(), closes = opens + (pool.window_s || 90) * 1000;
  const grid = rule.family === "weighted_random_draw" ? scenarioGrid(rule, [10000, 50000, 150000, 400000]) : null;
  await eu.update(STORES.pools, { _id: pool._id }, { $set: { status: "open", opens_at: new Date(opens).toISOString(), closes_at: new Date(closes).toISOString(), seal_id: seal._id, may_be_called: j.may_be_called, disclosures: j.disclosures, who_may_enter: j.who_may_enter, scenario_grid: grid, updated_at: now() } });
  await publishToSponsor(pool, { status: "open" });
  log(`${pool._id}: allowed in ${pool.market} as a ${j.may_be_called}; sealed ${seal.seed_hash.slice(0, 12)}… before any entry; open ${(pool.window_s || 90)} s`);
}

// Standing weights them, and the tree grows and is anchored as it does.
async function weightAndAnchor(pool, closing = false) {
  const closesAt = Date.parse(pool.closes_at);
  let pledges = (await eu.find(STORES.pledges, { round_id: pool._id }, 0)).filter((p) => Date.parse(p.pledged_at) <= closesAt);
  const unweighted = pledges.filter((p) => p.weight == null);
  for (const p of unweighted) {
    const b = await eu.get1(STORES.backers, p.backer_id);
    const weight = weightFor(b); const multiplier = { streak_weeks: b?.streak_weeks || 0, tier: b?.tier || 0 };
    await serial(p._id, () => eu.update(STORES.pledges, { _id: p._id }, { $set: { weight, multiplier, weighted_at: now() } }));
    p.weight = weight; p.multiplier = multiplier;
  }
  pledges.sort((a, b) => (a.pledged_at < b.pledged_at ? -1 : a.pledged_at > b.pledged_at ? 1 : a.pledge_id < b.pledge_id ? -1 : 1));
  const leaves = pledges.map(leafHash); const tree = merkleTree(leaves);
  let changed = 0;
  for (let i = 0; i < pledges.length; i++) {
    const p = pledges[i]; const path = merklePath(tree, i);
    if (p.entry_index !== i || p.leaf_hash !== leaves[i] || JSON.stringify(p.tree_path) !== JSON.stringify(path)) {
      await serial(p._id, () => eu.update(STORES.pledges, { _id: p._id }, { $set: { entry_index: i, leaf_hash: leaves[i], tree_path: path, root_at_entry: merkleTree(leaves.slice(0, i + 1)).root } })); changed++;
    }
  }
  const roots = await eu.find(STORES.sealed, { round_id: pool._id, kind: closing ? "close" : "root" }, 0);
  const last = roots.sort((a, b) => (a.sealed_at < b.sealed_at ? 1 : -1))[0];
  if (closing || !last || last.root !== tree.root) {
    const n = roots.length + 1;
    const doc = { _id: `${pool._id}:${closing ? "close" : "root"}:${String(n).padStart(4, "0")}`, round_id: pool._id, kind: closing ? "close" : "root", root: tree.root, entries: pledges.length, entries_hash: closing ? entriesHash(leaves) : null, rule_id: pool.rule_id, rule_version: pool.rule_version, sealed_at: now(), signed_by: "round" };
    doc.signature = sign(roundKey.privateKey, docMessage(doc));
    await eu.put(STORES.sealed, doc);
    if (!closing) log(`${pool._id}: root ${tree.root.slice(0, 12)}… over ${pledges.length} entries (${unweighted.length} weighted, ${changed} paths written)`);
  }
  // The band the pool reached, from the scenario grid.
  const rule = await eu.get1(STORES.rules, `${pool.rule_id}@${pool.rule_version}`);
  if (rule?.family === "weighted_random_draw") { const band = bandFor(rule, (pool.gathered_cents || 0) + (pool.matched_cents || 0)); if (JSON.stringify(band) !== JSON.stringify(pool.band)) await eu.update(STORES.pools, { _id: pool._id }, { $set: { band } }); }
  return { pledges, leaves, tree, rule };
}

async function closeAndDraw(pool) {
  const { pledges, leaves, tree, rule } = await weightAndAnchor(pool, true);
  await eu.update(STORES.pools, { _id: pool._id }, { $set: { status: "closed", closed_at: now(), entry_count: pledges.length, updated_at: now() } });
  log(`${pool._id}: closed with ${pledges.length} entries, hash ${entriesHash(leaves).slice(0, 12)}…, root ${tree.root.slice(0, 12)}…`);
  // The sponsor's match, read from its shared library: raises the pool, never the weights.
  let match = 0;
  try { const m = (await sponsorLib.find("sponsor_matches", { round_id: pool._id }, 1))[0]; if (m) { const gathered = pledges.reduce((a, p) => a + p.amount_cents, 0); match = Math.min(m.cap_cents, Math.round(gathered * m.ratio)); await eu.update(STORES.pools, { _id: pool._id }, { $inc: { matched_cents: match } }); log(`${pool._id}: matched ${match} by ${m.sponsor_id} (ratio ${m.ratio}, cap ${m.cap_cents})`); } } catch (e) { log(`${pool._id}: sponsor library unreadable: ${e.message.slice(0, 80)}`); }
  // Take the beacon, reveal the seed.
  const beacon = await beaconAfter(Date.parse(pool.closes_at), tree.root);
  const seed = seedFor(pool._id);
  const seal = await eu.get1(STORES.sealed, `${pool._id}:seal`);
  const reveal = { _id: `${pool._id}:reveal`, round_id: pool._id, kind: "reveal", seed, seed_hash: seal.seed_hash, rule_id: seal.rule_id, rule_version: seal.rule_version, sealed_at: now(), signed_by: "round" };
  reveal.signature = sign(roundKey.privateKey, docMessage(reveal));
  await eu.put(STORES.sealed, reveal);
  if (commitment(seed, seal.rule_id, seal.rule_version) !== seal.seed_hash || rule.rule_id !== seal.rule_id || rule.version !== seal.rule_version) {
    await eu.update(STORES.pools, { _id: pool._id }, { $set: { status: "void", void_because: "the revealed seed and rule do not match the sealed commitment", updated_at: now() } });
    log(`${pool._id}: VOID, the reveal does not match the seal`); return;
  }
  // Run the frozen rule, publish the proof.
  const result = allocate(rule, pledges, seed, beacon.value, { match_cents: match });
  const draw = { _id: `d-${pool._id}`, draw_id: `d-${pool._id}`, round_id: pool._id, seed, seed_hash: seal.seed_hash, beacon, entry_root: tree.root, entry_count: pledges.length, entries_hash: entriesHash(leaves), rule_id: rule.rule_id, rule_version: rule.version, match_cents: match, result, drawn_at: now(), signed_by: "round" };
  draw.signature = sign(roundKey.privateKey, docMessage(draw));
  await eu.put(STORES.draws, draw);
  await eu.update(STORES.pools, { _id: pool._id }, { $set: { status: "drawn", draw_id: draw._id, drawn_at: draw.drawn_at, band: result.band || pool.band || null, updated_at: now() } });
  await publishToSponsor(pool, { status: "drawn", outcome: result.funded.length ? "funded" : "refunded", winners: result.winners.length, match_cents: match });
  log(`${pool._id}: drawn by ${rule.family} with beacon ${beacon.source} round ${beacon.round}: ${result.notes}; proof d-${pool._id} published before any money moves`);
}

// What a sponsor may see: totals, categories and outcomes, never a backer.
async function publishToSponsor(pool, extra) {
  try { await sponsorLib.put("rounds_published", { _id: pool._id, round_id: pool._id, category: pool.category, market: pool.market, mechanism: pool.mechanism, closes_at: pool.closes_at, gathered_cents: pool.gathered_cents || 0, entries: pool.entries || 0, ...extra, published_at: now() }); } catch (e) { log(`sponsor library: ${e.message.slice(0, 80)}`); }
}

// Standing contributions raise a pledge each payday, under the mandate's signature, up to its ceiling.
async function standingRaises(openPools) {
  if (!openPools.length) return;
  const due = (await eu.find(STORES.standing, { status: "active", next_due: { $lte: now() } }, 25));
  for (const m of due) {
    const target = openPools.find((p) => (m.backs.startsWith("category:") ? p.category === m.backs.slice(9) : p.title?.includes(m.backs.slice(6)))) || null;
    const nextDue = new Date(Date.now() + STANDING_EVERY_MS).toISOString();
    if (!target || Date.parse(m.until) < Date.now()) { await eu.update(STORES.standing, { _id: m._id }, { $set: { next_due: nextDue, last_skipped: !target ? "no open round it backs" : "past its end date" } }); continue; }
    if ((m.spent_cents || 0) + m.amount_cents > m.ceiling_cents) { await eu.update(STORES.standing, { _id: m._id }, { $set: { next_due: nextDue, last_skipped: "at its ceiling", status: "at-ceiling" } }); log(`${m._id}: at its ceiling (${m.ceiling_cents}), no pledge`); continue; }
    const b = await eu.get1(STORES.backers, m.backer_id);
    if (!verify(b.device_public_key, mandateMessage(m), m.signature)) { log(`${m._id}: mandate signature does not verify, skipped`); continue; }
    const pledge_id = `p-${target._id}-${m._id}-${Date.now().toString(36)}`;
    const p = { _id: pledge_id, pledge_id, round_id: target._id, backer_id: m.backer_id, amount_cents: m.amount_cents, idea: target.ideas?.length ? target.ideas[0] : null, mandate_id: m._id, mandate_signature: m.signature, device_public_key: roundKey.publicKey, signed_by: `the platform, under mandate ${m._id}`, pledged_at: now() };
    p.signature = sign(roundKey.privateKey, pledgeMessage(p));
    await eu.put(STORES.pledges, p);
    await eu.update(STORES.pools, { _id: target._id }, { $inc: { gathered_cents: p.amount_cents, entries: 1 } });
    await eu.update(STORES.standing, { _id: m._id }, { $set: { next_due: nextDue, last_raised: pledge_id, last_skipped: null }, $inc: { spent_cents: m.amount_cents } });
    log(`${m._id}: raised ${p.amount_cents} into ${target._id} on its ${m.cadence} (spent ${(m.spent_cents || 0) + m.amount_cents} of ${m.ceiling_cents})`);
  }
}

async function main() {
  await ready(eu); await ready(sponsorLib);
  log("round pipeline: watching pools on", eu.name);
  for (;;) {
    pass++;
    try {
      for (const p of await eu.find(STORES.pools, { status: "opening" }, 0)) await gateAndSeal(p);
      const open = await eu.find(STORES.pools, { status: "open" }, 0);
      for (const p of open) { if (Date.parse(p.closes_at) <= Date.now()) await closeAndDraw(p); else { await weightAndAnchor(p); await publishToSponsor(p, { status: "open" }); } }
      await standingRaises(open.filter((p) => Date.parse(p.closes_at) > Date.now() + 5000));
      if (open.length || pass % 30 === 0) for (const c of [STORES.pledges, STORES.pools, STORES.sealed, STORES.backers]) { try { await eu.post("/api/doc/compact", { collection: c }); } catch {} }
    } catch (e) { log("pass failed:", e.message.slice(0, 200)); }
    await sleep(EVERY);
  }
}
main();
