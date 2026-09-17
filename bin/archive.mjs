// Closed rounds and proofs: every paid round with its proof, its ledger and
// (for a buy it funded) its shipment, landed in the round-history bucket
// so a draw from four years ago can still be recomputed by anybody who
// cares to. One object per round, JSON here (the build sheet says parquet,
// GAPS.md 7). Cold rounds keep only this copy of their entries.
//   docker compose run --rm tools node bin/archive.mjs            every paid round not yet archived
//   node bin/archive.mjs r-0042                                    one round
import { fleet, ready, STORES } from "../lib/api.mjs";
import { roundHistory, BUCKET } from "../lib/s3.mjs";
const F = fleet(); const eu = F.platform.eu; const s3 = roundHistory();
const only = process.argv[2];
export async function bundle(roundId) {
  const pool = await eu.get1(STORES.pools, roundId); if (!pool) return null;
  const [sealed, draw, rule, pledges, ledger] = await Promise.all([eu.find(STORES.sealed, { round_id: roundId }, 0), pool.draw_id ? eu.get1(STORES.draws, pool.draw_id) : null, eu.get1(STORES.rules, `${pool.rule_id}@${pool.rule_version}`), eu.find(STORES.pledges, { round_id: roundId }, 0), eu.find(STORES.ledger, { round_id: roundId }, 0)]);
  const buys = await eu.find(STORES.buys, { funded_by_round: roundId }, 0);
  const shipments = buys.length ? await eu.find(STORES.shipments, { buy_id: { $in: buys.map((b) => b._id) } }, 0) : [];
  return { round: pool, seal: sealed.find((s) => s.kind === "seal") || null, roots: sealed.filter((s) => s.kind !== "seal" && s.kind !== "reveal"), reveal: sealed.find((s) => s.kind === "reveal") || null, draw, rule, entries: pledges.sort((a, b) => (a.entry_index ?? 0) - (b.entry_index ?? 0)), ledger: ledger.sort((a, b) => a.sequence - b.sequence), shipments, archived_at: new Date().toISOString() };
}
if (process.argv[1] && process.argv[1].endsWith("archive.mjs")) {
  await ready(eu);
  console.log(`bucket ${BUCKET}: ${await s3.ensureBucket(BUCKET)}`);
  const have = new Set((await s3.list(BUCKET, "rounds/")).map((k) => k.replace(/^rounds\/|\.json$/g, "")));
  const pools = only ? [await eu.get1(STORES.pools, only)] : await eu.find(STORES.pools, { status: "paid" }, 0);
  let n = 0;
  for (const p of pools) { if (!p || (!only && have.has(p._id))) continue; const b = await bundle(p._id); await s3.put(BUCKET, `rounds/${p._id}.json`, b); n++; if (n % 100 === 0) console.log(`${n} archived…`); }
  console.log(`${n} round(s) landed in ${BUCKET}/rounds/ (${have.size} were there already); console at http://127.0.0.1:19101`);
}
