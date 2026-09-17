// A library per sponsor: the sponsor's own node on the library it shares
// with the platform alone. It reads what the platform publishes there
// (totals, categories, outcomes; never a backer) and writes its match for
// rounds in the categories its terms name. Its money is held in escrow like
// any pledge and released on the same proof signal as the crowd's.
import { fleet, ready, sleep, now, ensureCollection, STORES } from "../lib/api.mjs";
const F = fleet(); const me = F.sponsor;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "sponsor-acme:", ...a);
async function main() {
  await ready(me);
  const seen = new Set();
  for (;;) {
    try {
      for (const c of ["rounds_published", "round_outcomes"]) await ensureCollection(me, c);
      const terms = (await me.find(STORES.sponsorTerms, {}, 0)).sort((a, b) => (a.season < b.season ? 1 : -1))[0];
      const open = await me.find("rounds_published", { status: "open" }, 0);
      for (const r of open) {
        if (!terms || !terms.categories.includes(r.category)) continue;
        const have = await me.find("sponsor_matches", { round_id: r.round_id }, 1);
        if (have.length) continue;
        await me.put("sponsor_matches", { _id: `match:${r.round_id}`, round_id: r.round_id, sponsor_id: terms.sponsor_id, season: terms.season, ratio: terms.match.ratio, cap_cents: terms.match.cap_cents, offered_at: now(), disclosed: true });
        log(`matches ${r.round_id} (${r.category}) at ${terms.match.ratio} up to ${terms.match.cap_cents}, disclosed`);
      }
      for (const o of await me.find("round_outcomes", {}, 0)) { if (seen.has(o._id)) continue; seen.add(o._id); if (o.match_cents) log(`${o.round_id}: ${o.outcome}, the crowd ${o.gathered_cents}, our match ${o.match_cents}, released on the proof`); }
    } catch (e) { log("pass failed:", e.message.slice(0, 160)); }
    await sleep(3000);
  }
}
main();
