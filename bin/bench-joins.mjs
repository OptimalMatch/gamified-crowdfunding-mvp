// How fast one node takes joins: N puts of distinct documents, then N $inc
// updates on one counter document, each at K in flight. A join is one of each.
//   docker compose run --rm tools node bin/bench-joins.mjs [N] [K]
import { fleet, ready, STORES } from "../lib/api.mjs";
const F = fleet(); const eu = F.platform.eu; await ready(eu);
const N = Number(process.argv[2] || 500), K = Number(process.argv[3] || 200);
const run = async (label, fn) => { let i = 0; const t0 = Date.now(); let errs = 0; await Promise.all(Array.from({ length: K }, async () => { while (i < N) { const j = i++; try { await fn(j); } catch { errs++; } } })); const s = (Date.now() - t0) / 1000; console.log(`${label}: ${N} in ${s.toFixed(1)} s = ${Math.round(N / s)} a second, ${errs} errors`); };
const id = Date.now().toString(36);
await eu.put("bench_counts", { _id: `c-${id}`, count: 0 });
await run("puts", (j) => eu.put("bench_joins", { _id: `j-${id}-${j}`, buy_id: id, units: 1 }));
await run("incs", () => eu.update("bench_counts", { _id: `c-${id}` }, { $inc: { count: 1 } }));
await run("put+inc", (j) => eu.put("bench_joins", { _id: `k-${id}-${j}`, buy_id: id, units: 1 }).then(() => eu.update("bench_counts", { _id: `c-${id}` }, { $inc: { count: 1 } })));
console.log("counter reads", (await eu.get1("bench_counts", `c-${id}`)).count, "of", 2 * N);
