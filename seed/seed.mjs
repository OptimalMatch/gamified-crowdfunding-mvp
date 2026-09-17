// The seed: the stores of the build sheet at the MVP sheet's scale (section
// 2: 1,000 documents per store, 10,000 tier rows), with the fields the sheet
// lists and who sets them, on the nodes that own them. Deterministic, so a
// re-seed gives the same data. Runs once, from inside the compose network
// (docker compose run --rm seed) or from the host with FROM_HOST=1.
//
// What it writes, and where:
//   platform-eu (the platform's node): backers, standing contributions, pools,
//     pledges, allocation rules, sealed commitments, draws, group buys,
//     commitments and their counts, purchase orders, destinations, votes and
//     tallies, shipments, pallet splits, rules by jurisdiction, the money
//     ledger, disputes, the public keys, and a manifest of these counts
//   supplier-northlight-shared (the supplier's node): tier_published, signed by the supplier
//   sponsor-acme-shared (the sponsor's node): the sponsor's terms per season, and what it may see
//
// Every round in the history is a real one: its seal, its entry tree, its
// draw and its proof recompute (checks/run.mjs, 27), so the web app's
// "recompute it yourself" works on the history as well as on the live rounds.
import { fleet, ready, now, STORES } from "../lib/api.mjs";
import { sha256, commitment, merkleTree, merklePath, leafHash, sign, pledgeMessage, mandateMessage, ledgerMessage, hashDoc, canonical } from "../lib/crypto.mjs";
import { deviceKey, roleKey, keyDocs } from "../lib/keys.mjs";
import { allocate, weightFor, scenarioGrid, FAMILIES } from "../lib/mechanisms.mjs";
import { MARKETS, MARKET_KIND, HOME_MARKETS } from "../lib/markets.mjs";

const F = fleet();
const N = Number(process.env.SEED_DOCS || 1000);
const TIER_ROWS = Number(process.env.SEED_TIER_ROWS || 10000);
let s = 20260916; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const iso = (t) => new Date(t).toISOString();
const pad = (n, w = 4) => String(n).padStart(w, "0");
const DAY = 86400000, HOUR = 3600000;
const T0 = Date.now();
const YEAR_AGO = T0 - 365 * DAY;

const CATEGORIES = ["community", "repair", "tools", "food", "music", "climate", "learning", "sport", "care", "makers"];
const IDEAS = ["a tool library", "a repair café", "a community fridge", "a rehearsal room", "a seed bank", "a bike workshop", "a youth studio", "a warm room", "a maker space", "a night bus"];
const ITEMS = ["cordless drill", "e-bike battery", "solar lantern", "air purifier", "sewing machine", "espresso machine", "heat pump dryer", "3D printer", "school laptop", "hearing aid", "wheelchair", "water filter", "tent", "chainsaw", "welding kit", "thermal camera", "soldering station", "loom", "kiln", "mixing desk"];
const PLACES = [["school", "St Brigid's NS"], ["shelter", "Merchants Quay"], ["repair-cafe", "Repair Café Stoneybatter"], ["member", "a member's address"], ["hub", "Dublin 7 locker hub"], ["school", "Gaelscoil na Cille"], ["shelter", "Simon Community"], ["repair-cafe", "Cork Repair Café"], ["hub", "Galway parcel hub"], ["member", "the captain's garage"]];
const SPLIT_MODELS = [["captain", 0], ["hub", 150], ["partner", 250], ["depot", 400]];
const CARRIERS = ["DPD", "An Post", "Fastway", "Pallex"];
const roundKey = roleKey("round"), escrowKey = roleKey("escrow"), supplierKey = roleKey("supplier-northlight"), fulfilmentKey = roleKey("fulfilment"), panelKey = roleKey("panel");
const beaconFor = (roundId, closesAt) => ({ source: "seeded-history", round: Math.floor(closesAt / 30000), value: sha256(`beacon|${roundId}|${closesAt}`), at: iso(closesAt + 30000) });

async function putAll(node, store, docs) { for (let i = 0; i < docs.length; i += 500) await node.put(store, docs.slice(i, i + 500)); console.log(`${store}: ${docs.length} on ${node.name}`); return docs.length; }

async function main() {
  await ready(F.platform.eu); await ready(F.platform.sponsor); await ready(F.platform.supplier); await ready(F.supplier); await ready(F.sponsor);
  const counts = {};

  // 1. Backers, wallets and standing: market set at signup, streaks and tiers by the game, the device's public key by the device.
  const backers = [];
  for (let i = 1; i <= N; i++) {
    const id = `b-${pad(i)}`; const streak = rnd() < 0.3 ? 0 : int(1, 20); const completed = int(0, 40);
    backers.push({ _id: id, backer_id: id, name: `Backer ${i}`, market: pick(HOME_MARKETS), wallet_cents: int(0, 20000), referral_credit_cents: rnd() < 0.2 ? int(100, 1500) : 0, streak_weeks: streak, tier: Math.min(5, Math.floor(completed / 8)), rounds_completed: completed, device_public_key: deviceKey(id).publicKey, referred_by: rnd() < 0.25 ? `b-${pad(int(1, N))}` : null, joined_at: iso(T0 - int(10, 700) * DAY) });
  }
  counts[STORES.backers] = await putAll(F.platform.eu, STORES.backers, backers);
  // Multipliers are numbers a backer can read: written on the backer with the streak and the tier.
  for (const b of backers) b.weight = weightFor(b);

  // 2. Standing contributions: signed once with cadence and ceiling, by the backer's device.
  const standing = [];
  for (let i = 1; i <= N; i++) {
    const b = backers[i - 1]; const m = { _id: `m-${pad(i)}`, mandate_id: `m-${pad(i)}`, backer_id: b.backer_id, amount_cents: pick([500, 1000, 1000, 2000, 2500, 5000]), cadence: pick(["weekly", "monthly", "payday"]), backs: rnd() < 0.7 ? `category:${pick(CATEGORIES)}` : `cause:${pick(IDEAS)}`, ceiling_cents: pick([5000, 10000, 20000, 50000]), until: iso(T0 + int(30, 400) * DAY), status: rnd() < 0.9 ? "active" : "stopped", spent_cents: 0, next_due: iso(T0 + int(0, 30) * DAY), signed_at: b.joined_at };
    m.signature = sign(deviceKey(b.backer_id).privateKey, mandateMessage(m)); standing.push(m);
  }
  counts[STORES.standing] = await putAll(F.platform.eu, STORES.standing, standing);

  // 3. Allocation rules: 40 kinds as documents, each with 25 versions (the rule by version is what a round freezes).
  const rules = []; const KINDS = 40, VERSIONS = N / KINDS;
  for (let k = 0; k < KINDS; k++) {
    const family = FAMILIES[k % FAMILIES.length]; const rule_id = `${family}-${pad(Math.floor(k / FAMILIES.length) + 1, 2)}`;
    for (let v = 1; v <= VERSIONS; v++) {
      const params = family === "threshold" ? { threshold_cents: 50000 * (1 + (k % 5)) + v * 1000 }
        : family === "first_past_the_post" ? { places: 1 + (k % 3) }
        : family === "ranked_choice" ? { places: 1 }
        : family === "quadratic" ? { match_cents: 100000 * (1 + (k % 4)) }
        : family === "dutch_auction" ? { units: 20 * (1 + (k % 5)), floor_cents: 500 + v * 10 }
        : { typical_entry_cents: 1000, bands: [{ from_cents: 0, winners: 1, share: 0.5 }, { from_cents: 50000 + v * 1000, winners: 2, share: 0.5 }, { from_cents: 150000 + v * 1000, winners: 4, share: 0.5 }, { from_cents: 400000, winners: 8, share: 0.45 }] };
      rules.push({ _id: `${rule_id}@${v}`, rule_id, version: v, family, name: `${family.replace(/_/g, " ")} ${pad(Math.floor(k / FAMILIES.length) + 1, 2)}`, params, set_by: v === VERSIONS ? "the designer" : "legal", frozen: true, created_at: iso(T0 - (VERSIONS - v) * 20 * DAY) });
    }
  }
  counts[STORES.rules] = await putAll(F.platform.eu, STORES.rules, rules);
  const latest = (rule_id) => rules.filter((r) => r.rule_id === rule_id).sort((a, b) => b.version - a.version)[0];
  const ruleIds = [...new Set(rules.map((r) => r.rule_id))];

  // 4. Rules by jurisdiction: 200 markets x 5 mechanism documents. First past the post shares the threshold document
  // (both are unregulated everywhere, see DECISIONS.md).
  const jur = [];
  for (const market of MARKETS) for (const mechanism of ["threshold", "ranked_choice", "quadratic", "dutch_auction", "weighted_random_draw"]) {
    const kind = MARKET_KIND(market); const random = mechanism === "weighted_random_draw";
    jur.push({ _id: `${market}:${mechanism}`, market, mechanism, also_covers: mechanism === "threshold" ? ["first_past_the_post"] : [], allowed: random ? kind !== "lottery" : true, disclosures: random ? (kind === "regulated" ? ["odds per entry", "the scenario grid", "the sealed commitment", "the proof"] : ["the proof"]) : ["the rule by version"], may_be_called: random ? (kind === "regulated" ? "prize draw" : kind === "lottery" ? "not offered" : "draw") : "round", who_may_enter: { min_age: random ? 18 : 16, residents_only: kind === "regulated" }, set_by: "legal", version: 3, updated_at: iso(T0 - int(10, 300) * DAY) });
  }
  counts[STORES.jurisdictions] = await putAll(F.platform.eu, STORES.jurisdictions, jur);
  const allowedIn = (market, family) => jur.find((j) => j.market === market && (j.mechanism === family || j.also_covers.includes(family)))?.allowed ?? false;

  // 5. Pools, one per round: 1,000 rounds of history, each a real round with its seal, its pledges (the recent 200; older ones are in the cold tier), its draw and its proof.
  const pools = [], sealed = [], pledges = [], draws = [], ledger = [];
  let ledgerSeq = 0;
  const ledgerEntry = (roundId, kind, amount, from, to, ref, at) => { const e = { _id: `L-${pad(++ledgerSeq, 6)}`, entry_id: `L-${pad(ledgerSeq, 6)}`, round_id: roundId, buy_id: null, sequence: ledgerSeq, kind, amount_cents: amount, from, to, ref, at: iso(at), signed_by: "escrow" }; e.signature = sign(escrowKey.privateKey, ledgerMessage(e)); return e; };
  for (let i = 1; i <= N; i++) {
    const round_id = `r-${pad(i)}`; const market = pick(HOME_MARKETS);
    let rule = latest(pick(ruleIds)); if (!allowedIn(market, rule.family)) rule = latest("threshold-01");
    const opens = T0 - (N - i + 12) * 0.7 * DAY - int(0, 12) * HOUR; const closes = opens + 7 * DAY; // the last closed four days ago
    const seed = sha256(`seed|${round_id}|${SEED_SECRET()}`); const seedHash = commitment(seed, rule.rule_id, rule.version);
    const recent = closes > YEAR_AGO && i > N - 200; // the last 200 rounds keep their pledges in the hot store
    const k = recent ? 5 : int(3, 40); const entries = [];
    for (let e = 0; e < k; e++) {
      const b = backers[int(0, N - 1)]; const pledge_id = `p-${round_id}-${pad(e + 1, 3)}`;
      const p = { _id: pledge_id, pledge_id, round_id, backer_id: b.backer_id, amount_cents: pick([500, 1000, 1000, 2000, 5000, 10000]), idea: rule.family === "threshold" || rule.family === "weighted_random_draw" || rule.family === "dutch_auction" ? null : pick(IDEAS), ranks: rule.family === "ranked_choice" ? [...IDEAS].sort(() => rnd() - 0.5).slice(0, 3) : null, bid_cents: rule.family === "dutch_auction" ? int(600, 3000) : null, mandate_id: rnd() < 0.3 ? standing[int(0, N - 1)].mandate_id : null, weight: b.weight, multiplier: { streak_weeks: b.streak_weeks, tier: b.tier }, device_public_key: b.device_public_key, pledged_at: iso(opens + rnd() * 7 * DAY) };
      p.signature = sign(deviceKey(b.backer_id).privateKey, pledgeMessage(p)); entries.push(p);
    }
    entries.sort((a, b) => (a.pledged_at < b.pledged_at ? -1 : 1));
    const leaves = entries.map(leafHash); const tree = merkleTree(leaves);
    entries.forEach((p, idx) => { p.entry_index = idx; p.leaf_hash = leaves[idx]; p.tree_path = merklePath(tree, idx); p.root_at_entry = merkleTree(leaves.slice(0, idx + 1)).root; });
    const gathered = entries.reduce((a, p) => a + p.amount_cents, 0);
    const beacon = beaconFor(round_id, closes);
    const result = allocate(rule, entries, seed, beacon.value);
    const grid = rule.family === "weighted_random_draw" ? scenarioGrid(rule, [10000, 50000, 150000, 400000]) : null;
    const seal = { _id: `${round_id}:seal`, round_id, kind: "seal", seed_hash: seedHash, rule_id: rule.rule_id, rule_version: rule.version, sealed_at: iso(opens - HOUR), entries: 0, root: null, seed: null, signed_by: "round" }; seal.signature = sign(roundKey.privateKey, canonical({ ...seal, signature: undefined }));
    sealed.push(seal);
    const draw = { _id: `d-${round_id}`, draw_id: `d-${round_id}`, round_id, seed, seed_hash: seedHash, beacon, entry_root: tree.root, entry_count: entries.length, entries_hash: sha256(leaves.join("|")), rule_id: rule.rule_id, rule_version: rule.version, result, drawn_at: iso(closes + 45000), signed_by: "round" }; draw.signature = sign(roundKey.privateKey, canonical({ ...draw, signature: undefined }));
    draws.push(draw);
    pools.push({ _id: round_id, round_id, title: `${pick(IDEAS)} in ${market}`, category: pick(CATEGORIES), market, rule_id: rule.rule_id, rule_version: rule.version, mechanism: rule.family, status: "paid", opens_at: iso(opens), closes_at: iso(closes), threshold_cents: rule.params.threshold_cents || null, gathered_cents: gathered, matched_cents: 0, entries: entries.length, band: rule.family === "weighted_random_draw" ? result.band : null, scenario_grid: grid, ideas: rule.family === "threshold" || rule.family === "weighted_random_draw" || rule.family === "dutch_auction" ? [] : IDEAS.slice(0, 4), seal_id: seal._id, draw_id: draw._id, cold: !recent, opened_by: "the operator", updated_at: iso(closes + 60000) });
    if (recent) { pledges.push(...entries); }
  }
  counts[STORES.pools] = await putAll(F.platform.eu, STORES.pools, pools);
  counts[STORES.sealed] = await putAll(F.platform.eu, STORES.sealed, sealed);
  counts[STORES.pledges] = await putAll(F.platform.eu, STORES.pledges, pledges.slice(0, N));
  counts[STORES.draws] = await putAll(F.platform.eu, STORES.draws, draws);

  // 6. The money ledger: every pledge, hold, release, payout and refund of the recent rounds, in sequence, signed by the escrow (1,000 entries).
  const recentRounds = pools.slice(-200);
  for (const r of recentRounds) {
    const rp = pledges.filter((p) => p.round_id === r.round_id); const d = draws.find((x) => x.round_id === r.round_id); const closes = Date.parse(r.closes_at);
    for (const p of rp.slice(0, 2)) ledger.push(ledgerEntry(r.round_id, "hold", p.amount_cents, `wallet:${p.backer_id}`, "escrow", p.pledge_id, Date.parse(p.pledged_at)));
    ledger.push(ledgerEntry(r.round_id, "release", r.gathered_cents, "escrow", d.result.funded.length ? `payout:${r.round_id}` : "refunds", d.draw_id, closes + 60000));
    if (d.result.refunds.length) ledger.push(ledgerEntry(r.round_id, "refund", d.result.refunds.length * 1000, "escrow", "wallets", d.draw_id, closes + 90000));
    else ledger.push(ledgerEntry(r.round_id, "payout", r.gathered_cents, "escrow", `supplier:${r.round_id}`, d.draw_id, closes + 120000));
    if (ledger.length >= N) break;
  }
  while (ledger.length < N) { const r = pick(recentRounds); ledger.push(ledgerEntry(r.round_id, "fee", 250, "escrow", "platform", r.draw_id, Date.parse(r.closes_at) + 130000)); }
  counts[STORES.ledger] = await putAll(F.platform.eu, STORES.ledger, ledger.slice(0, N));

  // 7. tier_published, on the supplier's own node: 100 items x 10 versions x 10 steps = 10,000 signed rows.
  const tiers = []; const ITEM_COUNT = 100;
  for (let it = 0; it < ITEM_COUNT; it++) {
    const item = `${ITEMS[it % ITEMS.length]} ${pad(Math.floor(it / ITEMS.length) + 1, 2)}`; const base = int(2000, 60000);
    for (let v = 1; v <= 10; v++) for (let step = 1; step <= 10; step++) {
      const at = [1, 10, 25, 50, 100, 200, 400, 800, 1600, 3200][step - 1]; const units = step >= 7 ? Math.round(at * 1.5) : at;
      const row = { _id: `northlight:${it}:${v}:${step}`, supplier_id: "supplier-northlight", item, item_index: it, version: v, step, at_backers: at, units, price_cents: Math.round(base * (1 - 0.04 * (step - 1)) * (1 - 0.005 * (10 - v))), valid_from: iso(T0 - (10 - v) * 30 * DAY), valid_until: iso(T0 + (v === 10 ? 60 : v - 10 + 1) * 30 * DAY), set_by: "the negotiation, then the supplier" };
      row.signature = sign(supplierKey.privateKey, hashDoc({ ...row, signature: undefined })); tiers.push(row);
    }
  }
  counts[STORES.tiers] = await putAll(F.supplier, STORES.tiers, tiers.slice(0, TIER_ROWS));
  const ladder = (it) => tiers.filter((t) => t.item_index === it && t.version === 10);

  // 8. Group buys, commitments, counts, purchase orders, destinations, votes, tallies, shipments, splits: 1,000 buys of history.
  const buys = [], commitments = [], countsDocs = [], orders = [], destinations = [], votes = [], tallies = [], shipments = [], splits = [];
  for (let i = 1; i <= N; i++) {
    const buy_id = `gb-${pad(i)}`; const it = int(0, ITEM_COUNT - 1); const lad = ladder(it); const item = lad[0].item;
    const opens = T0 - (N - i + 40) * 0.6 * DAY; const closeOn = pick(["clock", "tier"]); const closes = opens + (closeOn === "clock" ? int(2, 14) * DAY : 3 * DAY);
    const joined = int(8, 900); const reached = [...lad].reverse().find((t) => joined >= t.at_backers) || lad[0];
    const dest = pick(PLACES); const model = pick(SPLIT_MODELS);
    buys.push({ _id: buy_id, buy_id, item, item_index: it, supplier_id: "supplier-northlight", tier_version: 10, ladder: lad.map((t) => ({ at_backers: t.at_backers, units: t.units, price_cents: t.price_cents })), window_opens_at: iso(opens), window_closes_at: iso(closes), close_on: closeOn, close_tier: closeOn === "tier" ? lad[int(2, 5)].at_backers : null, status: "delivered", count: joined, tier_reached: reached.at_backers, units: reached.units, unit_price_cents: reached.price_cents, max_price_cents: lad[0].price_cents, default_destination: { kind: dest[0], name: dest[1] }, quorum: 0.2, vote_closes_at: iso(closes + 2 * DAY), funded_by_round: rnd() < 0.5 ? `r-${pad(int(1, N))}` : null, updated_at: iso(closes + 5 * DAY) });
    const b = backers[int(0, N - 1)];
    const c = { _id: `c-${buy_id}-${pad(1, 3)}`, commitment_id: `c-${buy_id}-001`, buy_id, backer_id: b.backer_id, units: 1, put_cents: lad[0].price_cents, taken_cents: reached.price_cents, refunded_cents: lad[0].price_cents - reached.price_cents, status: "refunded", device_public_key: b.device_public_key, joined_at: iso(opens + rnd() * 60000) };
    c.signature = sign(deviceKey(b.backer_id).privateKey, canonical({ commitment_id: c.commitment_id, buy_id, backer_id: c.backer_id, units: 1, put_cents: c.put_cents, joined_at: c.joined_at })); commitments.push(c);
    countsDocs.push({ _id: buy_id, buy_id, item, count: joined, units: joined, held_cents: joined * lad[0].price_cents, tier_reached: reached.at_backers, updated_at: iso(closes) });
    const order = { _id: `po-${buy_id}`, order_id: `po-${buy_id}`, buy_id, supplier_id: "supplier-northlight", item, tier_reached: reached.at_backers, units: reached.units, unit_price_cents: reached.price_cents, total_cents: reached.units * reached.price_cents, quote_version: 10, quote_signature: reached.signature, placed_at: iso(closes + 1000), status: "shipped", supplier_ack_at: iso(closes + HOUR), shipped_units: rnd() < 0.05 ? reached.units - int(1, 3) : reached.units, paid_at: iso(closes + 2 * HOUR) };
    orders.push(order);
    const d = { _id: `dest-${buy_id}-1`, destination_id: `dest-${buy_id}-1`, buy_id, proposed_by: b.backer_id, kind: dest[0], name: dest[1], address: `${int(1, 200)} ${pick(["Manor St", "Main St", "Quay St", "Church Rd", "Mill Lane"])}, ${pick(["Dublin 7", "Cork", "Galway", "Limerick", "Sligo"])}`, reason: pick(["they asked for it", "the nearest school", "it splits well from here", "a member will hand it out", "the shelter needs them this winter"]), freight_cents: int(2000, 25000), split_model: model[0], split_fee_per_share_cents: model[1], proposed_at: iso(closes + HOUR) };
    destinations.push(d);
    const v = { _id: `vote:${buy_id}:${b.backer_id}`, buy_id, backer_id: b.backer_id, ranks: [d.destination_id], weight_cents: c.put_cents, cast_at: iso(closes + 2 * HOUR) }; v.signature = sign(deviceKey(b.backer_id).privateKey, canonical({ buy_id, backer_id: b.backer_id, ranks: v.ranks, cast_at: v.cast_at })); votes.push(v);
    tallies.push({ _id: `tally:${buy_id}`, buy_id, voters: 1, weight_cents: c.put_cents, quorum_met: true, rounds: [{ [d.destination_id]: c.put_cents }], winner: d.destination_id, address: d.address, destination: { kind: d.kind, name: d.name }, split_model: model[0], custodian: model[0] === "captain" ? b.backer_id : model[0] === "depot" ? "our depot" : d.name, closed_at: iso(closes + 2 * DAY), signed_by: "fulfilment" });
    const sh = { _id: `sh-${buy_id}`, shipment_id: `sh-${buy_id}`, order_id: order.order_id, buy_id, destination_id: d.destination_id, address: d.address, carrier: pick(CARRIERS), booked_at: iso(closes + 2 * DAY + HOUR), left_dock_at: iso(closes + 3 * DAY), delivered_at: iso(closes + 5 * DAY), pod_photo_hash: sha256(`pod|${buy_id}`), custodian: tallies[tallies.length - 1].custodian, handovers: [{ share: 1, from: "carrier", to: tallies[tallies.length - 1].custodian, photo_hash: sha256(`photo|${buy_id}|1`), at: iso(closes + 5 * DAY), signature: sign(fulfilmentKey.privateKey, `handover|${buy_id}|1`) }], status: "delivered" };
    shipments.push(sh);
    splits.push({ _id: `split:${buy_id}`, split_id: `split:${buy_id}`, buy_id, model: model[0], fee_per_share_cents: model[1], custodian: sh.custodian, shares_total: reached.units, shares_handed: reached.units, chosen_at: tallies[tallies.length - 1].closed_at });
  }
  counts[STORES.buys] = await putAll(F.platform.eu, STORES.buys, buys);
  counts[STORES.commitments] = await putAll(F.platform.eu, STORES.commitments, commitments);
  counts[STORES.counts] = await putAll(F.platform.eu, STORES.counts, countsDocs);
  counts[STORES.orders] = await putAll(F.platform.eu, STORES.orders, orders);
  counts[STORES.destinations] = await putAll(F.platform.eu, STORES.destinations, destinations);
  counts[STORES.votes] = await putAll(F.platform.eu, STORES.votes, votes);
  counts[STORES.tallies] = await putAll(F.platform.eu, STORES.tallies, tallies);
  counts[STORES.shipments] = await putAll(F.platform.eu, STORES.shipments, shipments);
  counts[STORES.splits] = await putAll(F.platform.eu, STORES.splits, splits);
  // The supplier's copy: one document per order that both sides write to, on the shared library (the last 200, the rest are in the cold tier).
  await putAll(F.platform.supplier, STORES.supplierOrders, orders.slice(-200));

  // 9. Disputes and appeals: argued against the published proof and the signed ledger.
  const disputes = [];
  for (let i = 1; i <= N; i++) {
    const kind = pick(["draw", "short", "vote"]); const r = pick(recentRounds); const gb = pick(buys); const b = backers[int(0, N - 1)];
    const answered = rnd() < 0.9;
    disputes.push({ _id: `dsp-${pad(i)}`, dispute_id: `dsp-${pad(i)}`, kind, round_id: kind === "draw" ? r.round_id : null, buy_id: kind !== "draw" ? gb.buy_id : null, backer_id: b.backer_id, claim: kind === "draw" ? "the draw was wrong" : kind === "short" ? "the goods were short" : "the destination vote was gamed", argued_against: kind === "draw" ? { proof: r.draw_id, ledger: ledger.filter((l) => l.round_id === r.round_id).map((l) => l.entry_id) } : { order: `po-${gb.buy_id}`, tally: `tally:${gb.buy_id}`, shipment: `sh-${gb.buy_id}` }, status: answered ? pick(["dismissed", "dismissed", "dismissed", "upheld"]) : "open", answer: answered ? (kind === "draw" ? "the proof recomputes to the published result" : kind === "short" ? "the shipment document shows the count both sides signed" : "the tally is on the record with every ballot's weight") : null, raised_at: iso(T0 - int(1, 300) * DAY), answered_at: answered ? iso(T0 - int(0, 200) * DAY) : null, panel: "the panel" });
  }
  counts[STORES.disputes] = await putAll(F.platform.eu, STORES.disputes, disputes);

  // 10. Keys: the public halves of every role, for verifiers.
  await putAll(F.platform.eu, STORES.keys, keyDocs());

  // 11. The sponsor's library: its terms per season and what it may see. It sees totals, categories and outcomes, never a backer.
  await putAll(F.sponsor, STORES.sponsorTerms, [{ _id: "acme:2026-autumn", sponsor_id: "sponsor-acme", season: "2026-autumn", match: { kind: "match", ratio: 0.5, cap_cents: 5000000 }, categories: ["repair", "climate", "tools"], pays_distribution: true, subsidises_tier: null, set_by: "the sponsor", signed_at: iso(T0 - 20 * DAY) }]);
  await putAll(F.sponsor, STORES.sponsorView, [{ _id: "acme", sponsor_id: "sponsor-acme", may_see: ["totals per round", "categories", "outcomes", "its own match and its release"], may_not_see: ["backer identities", "individual pledges", "entry weights"], set_by: "legal, and the sponsor" }]);

  // 12. The manifest: what was seeded, per store, so the checks know the baseline.
  await F.platform.eu.put("seed_manifest", { _id: "seed", seeded_at: now(), counts, tiers_on_supplier: Math.min(tiers.length, TIER_ROWS), supplier_orders_shared: 200, recent_rounds: recentRounds.map((r) => r.round_id).slice(0, 5), secret_hint: "device keys derive from DEMO_KEY_SEED" });
  console.log(`seeded in ${((Date.now() - T0) / 1000).toFixed(0)} s:`, counts);
}
function SEED_SECRET() { return process.env.DEMO_KEY_SEED || "demo-only-change-me"; }
main().catch((e) => { console.error(e); process.exit(1); });
