// The allocation rules as data: six families, each a pure function over the
// hashed entry set, the rule's parameters and (for the draw) the seed and
// the beacon. Deterministic: the same inputs give the same allocation on
// anybody's laptop, which is what "Verify it yourself" recomputes.
//
// An entry is { pledge_id, backer_id, amount_cents, weight, idea, rank? }.
// A result is { mechanism, winners: [{ pledge_id, backer_id, idea, amount_cents }],
//               funded: [ideas or the round itself], refunds: [pledge_id...], notes }.
import { drbg } from "./crypto.mjs";

export const FAMILIES = ["threshold", "first_past_the_post", "ranked_choice", "quadratic", "dutch_auction", "weighted_random_draw"];

// The scenario grid of a weighted draw: at each pool size, how many winners,
// what each takes and the odds per entry. Bands are part of the rule.
// bands: [{ from_cents, winners, share }] in ascending from_cents; share is
// the fraction of the pool the winners split (the rest funds the idea).
export function bandFor(rule, poolCents) {
  const bands = rule.params.bands || [{ from_cents: 0, winners: 1, share: 0.5 }];
  let b = bands[0];
  for (const x of bands) if (poolCents >= x.from_cents) b = x;
  return b;
}
export function scenarioGrid(rule, sizes) {
  return sizes.map((poolCents) => { const b = bandFor(rule, poolCents); const entries = Math.max(1, Math.round(poolCents / (rule.params.typical_entry_cents || 1000))); return { pool_cents: poolCents, winners: b.winners, each_cents: Math.floor((poolCents * b.share) / b.winners), odds_per_entry: b.winners / entries }; });
}

// Weighting: streaks and tiers are writes on the backer; the multiplier on
// each pledge is a number a backer can read.
export function weightFor(backer) {
  const streak = backer?.streak_weeks || 0, tier = backer?.tier || 0;
  return Math.round((1 + Math.min(streak, 12) * 0.05 + tier * 0.1) * 100) / 100;
}

const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
const byIdea = (entries) => { const m = new Map(); for (const e of entries) { const k = e.idea || "the round"; if (!m.has(k)) m.set(k, []); m.get(k).push(e); } return m; };

export function allocate(rule, entries, seed, beacon) {
  const pool = sum(entries, (e) => e.amount_cents);
  const family = rule.family;
  switch (family) {
    case "threshold": {
      const ok = pool >= rule.params.threshold_cents;
      return { mechanism: family, pool_cents: pool, funded: ok ? ["the round"] : [], winners: [], refunds: ok ? [] : entries.map((e) => e.pledge_id), notes: ok ? `cleared ${rule.params.threshold_cents}` : `short of ${rule.params.threshold_cents}: everybody refunded` };
    }
    case "first_past_the_post": {
      const totals = [...byIdea(entries)].map(([idea, es]) => ({ idea, total: sum(es, (e) => e.amount_cents * e.weight) })).sort((a, b) => b.total - a.total || (a.idea < b.idea ? -1 : 1));
      const top = totals.slice(0, rule.params.places || 1).map((t) => t.idea);
      return { mechanism: family, pool_cents: pool, funded: top, winners: [], refunds: [], notes: `the ${top.length} idea(s) with the most weighted backing take the pool`, standings: totals };
    }
    case "ranked_choice": {
      // Instant runoff over each backer's ranked ideas, weighted by amount x weight.
      const ballots = entries.filter((e) => Array.isArray(e.ranks) && e.ranks.length).map((e) => ({ ranks: e.ranks.slice(), w: e.amount_cents * e.weight }));
      const alive = new Set(ballots.flatMap((b) => b.ranks));
      const rounds = [];
      while (alive.size > 1) {
        const tally = {}; for (const a of alive) tally[a] = 0;
        for (const b of ballots) { const first = b.ranks.find((r) => alive.has(r)); if (first) tally[first] += b.w; }
        const total = sum(Object.values(tally), (x) => x);
        rounds.push({ ...tally });
        const [leader, lead] = Object.entries(tally).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
        if (lead * 2 > total) { alive.clear(); alive.add(leader); break; }
        const [loser] = Object.entries(tally).sort((a, b) => a[1] - b[1] || (a[0] > b[0] ? -1 : 1))[0];
        alive.delete(loser);
      }
      const winner = [...alive][0] || null;
      return { mechanism: family, pool_cents: pool, funded: winner ? [winner] : [], winners: [], refunds: [], notes: `instant runoff over ${rounds.length} round(s)`, rounds };
    }
    case "quadratic": {
      // Each idea's share of the matching pool is the square of the sum of square roots of its contributions.
      const groups = [...byIdea(entries)].map(([idea, es]) => ({ idea, backers: new Set(es.map((e) => e.backer_id)).size, direct: sum(es, (e) => e.amount_cents), qf: Math.pow(sum(es, (e) => Math.sqrt(e.amount_cents)), 2) }));
      const qfTotal = sum(groups, (g) => g.qf) || 1;
      const match = rule.params.match_cents || 0;
      const funded = groups.map((g) => ({ ...g, match_cents: Math.floor((match * g.qf) / qfTotal), total_cents: g.direct + Math.floor((match * g.qf) / qfTotal) })).sort((a, b) => b.total_cents - a.total_cents);
      return { mechanism: family, pool_cents: pool, funded: funded.map((g) => g.idea), winners: [], refunds: [], notes: `quadratic split of a ${match} match`, allocation: funded };
    }
    case "dutch_auction": {
      // The price falls from start to floor; units clear at the highest price at which the demand fills them.
      const units = rule.params.units || 100;
      const bids = entries.map((e) => ({ ...e, bid: e.bid_cents || e.amount_cents })).sort((a, b) => b.bid - a.bid || (a.pledge_id < b.pledge_id ? -1 : 1));
      const clearing = bids.length >= units ? Math.max(rule.params.floor_cents || 0, bids[units - 1].bid) : (rule.params.floor_cents || 0);
      const winners = bids.slice(0, units).map((b) => ({ pledge_id: b.pledge_id, backer_id: b.backer_id, idea: b.idea, amount_cents: clearing }));
      return { mechanism: family, pool_cents: pool, funded: ["the round"], winners, refunds: bids.slice(units).map((b) => b.pledge_id), notes: `${units} units clear at ${clearing}`, clearing_cents: clearing };
    }
    case "weighted_random_draw": {
      // The gamified one. Weighted sampling without replacement from the hashed
      // entry set, the winner count from the band the pool reached, the random
      // source from the sealed seed and the beacon.
      const band = bandFor(rule, pool);
      const rnd = drbg(seed, beacon);
      const remaining = entries.slice().sort((a, b) => (a.pledge_id < b.pledge_id ? -1 : 1));
      const winners = [];
      const prize = Math.floor((pool * band.share) / Math.max(1, band.winners));
      for (let i = 0; i < band.winners && remaining.length; i++) {
        const total = sum(remaining, (e) => e.weight);
        let r = rnd() * total, idx = 0;
        for (; idx < remaining.length - 1; idx++) { r -= remaining[idx].weight; if (r < 0) break; }
        const w = remaining.splice(idx, 1)[0];
        winners.push({ pledge_id: w.pledge_id, backer_id: w.backer_id, idea: w.idea, amount_cents: prize });
      }
      return { mechanism: family, pool_cents: pool, funded: ["the round"], winners, refunds: [], notes: `band from ${band.from_cents}: ${band.winners} winner(s) share ${Math.round(band.share * 100)}% of the pool`, band };
    }
    default:
      throw new Error(`unknown mechanism family ${family}`);
  }
}
