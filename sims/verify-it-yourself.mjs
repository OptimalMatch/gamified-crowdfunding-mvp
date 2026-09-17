// Verify it yourself: TypeScript in the build sheet, plain JavaScript here
// (DECISIONS.md, 6). Two checks, both open source (lib/verify.mjs), run
// against the regulator's own node, which holds its own copy of every
// proof: recompute the whole allocation from the published proof, and
// check a receipt's path against the root.
//
//   node sims/verify-it-yourself.mjs                 every draw this node holds, once
//   node sims/verify-it-yourself.mjs r-0042          one round
//   node sims/verify-it-yourself.mjs --follow        keep going: verify each new proof as it lands
//   node sims/verify-it-yourself.mjs --receipt p-r-0042-003
import { fleet, ready, sleep, STORES } from "../lib/api.mjs";
import { recomputeDraw, verifyReceipt } from "../lib/verify.mjs";

const F = fleet();
const node = process.env.VERIFY_NODE === "platform" ? F.platform.eu : F.regulator;
const args = process.argv.slice(2);
const follow = args.includes("--follow");
const receiptId = args.includes("--receipt") ? args[args.indexOf("--receipt") + 1] : null;
const only = args.find((a) => /^r-/.test(a));

let roundKey = null;
async function loadKeys() { const k = await node.get1(STORES.keys, "role:round"); roundKey = k?.public_key || null; }

// One pass loads everything once: a thousand rounds is four finds, not four thousand.
export async function loadAll() {
  const [seals, draws, rules, pools, pledges] = await Promise.all([node.find(STORES.sealed, { kind: "seal" }, 0), node.find(STORES.draws, {}, 0), node.find(STORES.rules, {}, 0), node.find(STORES.pools, {}, 0), node.find(STORES.pledges, {}, 0)]);
  const by = (xs, f) => { const m = new Map(); for (const x of xs) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
  return { seals: new Map(seals.map((x) => [x.round_id, x])), draws, rules: new Map(rules.map((x) => [x._id, x])), pools: new Map(pools.map((x) => [x._id, x])), pledges: by(pledges, (p) => p.round_id) };
}
export async function verifyRound(roundId, all = null) {
  if (!all) all = await loadAll();
  const seal = all.seals.get(roundId);
  const draw = all.draws.find((d) => d.round_id === roundId);
  const rule = draw ? all.rules.get(`${draw.rule_id}@${draw.rule_version}`) : null;
  const pool = all.pools.get(roundId);
  let entries = all.pledges.get(roundId) || [];
  if (pool?.cold && entries.length === 0 && draw) {
    // Older than a year: the entries live in the round-history bucket, not the hot store.
    return { round_id: roundId, ok: null, why: ["cold round: entries are in the round-history bucket (bin/archive.mjs), not the hot store"] };
  }
  const r = recomputeDraw({ seal, draw, rule, entries, roundKey });
  return { round_id: roundId, ...r, entries: entries.length, mechanism: draw?.result?.mechanism };
}

async function main() {
  await ready(node); await loadKeys();
  if (receiptId) {
    const p = await node.get1(STORES.pledges, receiptId); if (!p) throw new Error(`no pledge ${receiptId}`);
    const [draw] = await node.find(STORES.draws, { round_id: p.round_id }, 1);
    const roots = await node.find(STORES.sealed, { round_id: p.round_id, kind: "root" }, 0);
    const root = draw?.entry_root || roots.sort((a, b) => (a.sealed_at < b.sealed_at ? 1 : -1))[0]?.root;
    const r = verifyReceipt({ pledge: p, root });
    console.log(`${receiptId}: ${r.ok ? "in the set that was drawn" : "NOT verified"} (leaf ${p.leaf_hash?.slice(0, 12)}…, root ${root?.slice(0, 12)}…, path ${p.tree_path?.length} steps)${r.why.length ? ": " + r.why.join("; ") : ""}`);
    process.exit(r.ok ? 0 : 1);
  }
  const seen = new Set();
  do {
    const all = await loadAll();
    const draws = only ? all.draws.filter((d) => d.round_id === only) : all.draws;
    let ok = 0, bad = 0, cold = 0;
    for (const d of draws) {
      if (seen.has(d._id)) continue; seen.add(d._id);
      const r = await verifyRound(d.round_id, all);
      if (r.ok === null) { cold++; continue; }
      if (r.ok) ok++; else bad++;
      if (!r.ok || only || follow) console.log(`${r.round_id} ${r.mechanism || ""}: ${r.ok ? "recomputes to the published result" : "DOES NOT recompute"} (${r.entries} entries)${r.why.length ? ": " + r.why.join("; ") : ""}`);
    }
    if (ok + bad + cold) console.log(`${new Date().toISOString()} verified ${ok + bad} draw(s): ${ok} agree, ${bad} disagree, ${cold} in the cold tier`);
    if (follow) await sleep(Number(process.env.VERIFY_EVERY_MS || 10000));
  } while (follow);
}
if (process.argv[1] && process.argv[1].endsWith("verify-it-yourself.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
