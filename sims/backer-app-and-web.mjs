// Backer app and web: the calls the build sheet lists, in flow order, as a
// script (the browser app in web/ makes the same calls). Kotlin and Swift in
// the sheet, Node.js here (DECISIONS.md, 6). One command per demo step:
//
//   open-round [--mechanism weighted_random_draw] [--market IE] [--window 90] [--title ...]   the operator opens a round: a mechanism chosen, a clock
//   pledges-arrive [round] [--n 40]                  backers pledge, each signed by their own device
//   open-window [--item 3] [--close-on tier|clock] [--window 60]                              the schedule opens a group buy
//   four-thousand-join-at-once [buy] [--n 4000]      four thousand join in the same minute, onto the additive counter
//   anybody-proposes-one [buy] [--n 4]               backers propose destinations with a reason, then rank them, weighted
//   custody-share-by-share [buy]                     each handover a signed write with a photograph
//   dispute [round|buy] [--claim draw|short|vote]    somebody argues, on the record
import { fleet, ready, sleep, now, STORES } from "../lib/api.mjs";
import { sign, sha256, pledgeMessage, commitmentMessage, voteMessage, handoverMessage } from "../lib/crypto.mjs";
import { deviceKey } from "../lib/keys.mjs";
import { MARKET_KIND } from "../lib/markets.mjs";
import { Coalescer } from "../lib/coalesce.mjs";

const F = fleet(); const eu = F.platform.eu;
const args = process.argv.slice(2); const cmd = args[0];
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const positional = args.slice(1).find((a) => !a.startsWith("--") && !args.includes(`--${args[args.indexOf(a) - 1]?.slice(2)}`) && args[args.indexOf(a) - 1]?.startsWith("--") === false) || args.slice(1).find((a) => !a.startsWith("--") && !/^\d+$/.test(a) && !["tier", "clock", "draw", "short", "vote"].includes(a) && !["weighted_random_draw", "threshold", "ranked_choice", "quadratic", "dutch_auction", "first_past_the_post"].includes(a));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let s = Date.now() % 100000; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const IDEAS = ["a tool library", "a repair café", "a community fridge", "a rehearsal room", "a seed bank", "a bike workshop"];

// Concurrency: n calls in flight at once, like n phones, each retrying a dropped connection the way a phone does.
async function inFlight(items, n, fn) { let i = 0; const errs = []; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; let last; for (let t = 0; t < 4; t++) { try { await fn(it); last = null; break; } catch (e) { last = e; await sleep(50 * (t + 1) * (1 + Math.random())); } } if (last) errs.push(last.message); } })); return errs; }

async function openRound() {
  const mechanism = opt("mechanism", "weighted_random_draw"); const market = opt("market", "IE"); const window_s = Number(opt("window", 90));
  const rules = (await eu.find(STORES.rules, { family: mechanism }, 0)).sort((a, b) => b.version - a.version || (a.rule_id < b.rule_id ? -1 : 1));
  const rule = rules[0]; if (!rule) throw new Error(`no rule of family ${mechanism}`);
  const n = (await eu.count(STORES.pools)) + 1; const id = `r-live-${String(n).padStart(4, "0")}-${Date.now().toString(36).slice(-4)}`;
  const idea = pick(IDEAS);
  const pool = { _id: id, round_id: id, title: opt("title", `${idea} in ${market}`), category: opt("category", "repair"), market, rule_id: rule.rule_id, rule_version: rule.version, mechanism, status: "opening", window_s, threshold_cents: rule.params.threshold_cents || null, gathered_cents: 0, matched_cents: 0, entries: 0, ideas: ["threshold", "weighted_random_draw", "dutch_auction"].includes(mechanism) ? [] : IDEAS.slice(0, 4), band: null, cold: false, opened_by: opt("by", "the operator"), opened_at: now(), updated_at: now() };
  await eu.put(STORES.pools, pool);
  log(`opened ${id}: ${mechanism} (${rule.rule_id}@${rule.version}) in ${market}, ${window_s} s window; the node gates it and seals the seed next`);
  console.log(id);
}
async function pledgesArrive() {
  const n = Number(opt("n", 40));
  let pools = await eu.find(STORES.pools, { status: "open" }, 0);
  if (positional) pools = pools.filter((p) => p._id === positional);
  if (!pools.length) { for (let i = 0; i < 15 && !pools.length; i++) { await sleep(2000); pools = await eu.find(STORES.pools, { status: "open" }, 0); if (positional) pools = pools.filter((p) => p._id === positional); } }
  if (!pools.length) throw new Error("no open round: run open-round first");
  const backers = await eu.find(STORES.backers, {}, 0);
  for (const pool of pools) {
    // Only backers whose market may enter see the round: the gate is on opening, the app filters by market.
    const eligible = backers.filter((b) => b.market === pool.market || MARKET_KIND(b.market) !== "lottery" || pool.mechanism !== "weighted_random_draw");
    const chosen = Array.from({ length: n }, () => pick(eligible));
    const t0 = Date.now(); let k = 0;
    const errs = await inFlight(chosen, 20, async (b) => {
      const pledge_id = `p-${pool._id}-${b.backer_id}-${(k++).toString(36)}${Date.now().toString(36).slice(-3)}`;
      const p = { _id: pledge_id, pledge_id, round_id: pool._id, backer_id: b.backer_id, amount_cents: pick([500, 1000, 1000, 2000, 5000]), idea: pool.ideas?.length ? pick(pool.ideas) : null, ranks: pool.mechanism === "ranked_choice" ? [...pool.ideas].sort(() => rnd() - 0.5).slice(0, 3) : null, bid_cents: pool.mechanism === "dutch_auction" ? 600 + Math.floor(rnd() * 2400) : null, mandate_id: null, device_public_key: b.device_public_key, signed_by: "the backer's device", pledged_at: now() };
      p.signature = sign(deviceKey(b.backer_id).privateKey, pledgeMessage(p));
      await eu.put(STORES.pledges, p);
      await eu.update(STORES.pools, { _id: pool._id }, { $inc: { gathered_cents: p.amount_cents, entries: 1 } });
    });
    log(`${pool._id}: ${n - errs.length} pledges arrived in ${Date.now() - t0} ms, each signed by its backer's device${errs.length ? `; ${errs.length} failed: ${errs[0]}` : ""}`);
  }
}
async function openWindow() {
  const itemIndex = Number(opt("item", Math.floor(rnd() * 100))); const closeOn = opt("close-on", "tier"); const window_s = Number(opt("window", 60));
  const ladder = (await F.platform.supplier.find(STORES.tiers, { item_index: itemIndex, version: 10 }, 0)).sort((a, b) => a.step - b.step);
  if (!ladder.length) throw new Error(`no published ladder for item ${itemIndex}`);
  const n = (await eu.count(STORES.buys)) + 1; const id = `gb-live-${String(n).padStart(4, "0")}-${Date.now().toString(36).slice(-4)}`;
  const buy = { _id: id, buy_id: id, item: ladder[0].item, item_index: itemIndex, supplier_id: "supplier-northlight", tier_version: 10, ladder: ladder.map((t) => ({ at_backers: t.at_backers, units: t.units, price_cents: t.price_cents, valid_until: t.valid_until, signature: t.signature })), window_opens_at: now(), window_closes_at: new Date(Date.now() + window_s * 1000).toISOString(), close_on: closeOn, close_tier: closeOn === "tier" ? Number(opt("close-tier", 3200)) : null, status: "scheduled", count: 0, tier_reached: null, max_price_cents: ladder[0].price_cents, default_destination: { kind: "hub", name: "Dublin 7 locker hub", address: "Unit 4, Manor St, Dublin 7" }, quorum: Number(opt("quorum", 0.05)), vote_window_s: Number(opt("vote-window", 90)), funded_by_round: opt("round", null), opened_by: "the schedule, announced", updated_at: now() };
  await eu.put(STORES.buys, buy);
  await eu.put(STORES.counts, { _id: id, buy_id: id, item: buy.item, count: 0, units: 0, held_cents: 0, tier_reached: null, updated_at: now() });
  log(`window ${id} for "${buy.item}": ${ladder.length} tiers from ${ladder[0].price_cents} at ${ladder[0].at_backers} to ${ladder[ladder.length - 1].price_cents} at ${ladder[ladder.length - 1].at_backers}, closes ${closeOn === "tier" ? `at ${buy.close_tier} backers` : `on the clock in ${window_s} s`}${closeOn === "tier" ? ` or on the clock in ${window_s} s` : ""}`);
  console.log(id);
}
async function joinAtOnce() {
  const n = Number(opt("n", 4000));
  let buys = await eu.find(STORES.buys, { status: "open" }, 0); if (positional) buys = buys.filter((b) => b._id === positional);
  for (let i = 0; i < 15 && !buys.length; i++) { await sleep(2000); buys = await eu.find(STORES.buys, { status: "open" }, 0); if (positional) buys = buys.filter((b) => b._id === positional); }
  if (!buys.length) throw new Error("no open window: run open-window first");
  const buy = buys[0];
  const backers = await eu.find(STORES.backers, {}, 0);
  // Four thousand people: the seeded backers, and newcomers who sign up as they join (the app writes their backer document first).
  const people = Array.from({ length: n }, (_, i) => (i < backers.length ? backers[i] : null) || { backer_id: `b-new-${buy._id.slice(-4)}-${String(i - backers.length + 1).padStart(4, "0")}`, market: "IE", isNew: true });
  const newcomers = people.filter((p) => p.isNew).map((p) => ({ _id: p.backer_id, backer_id: p.backer_id, name: `Newcomer ${p.backer_id.slice(-4)}`, market: "IE", wallet_cents: 50000, referral_credit_cents: 0, streak_weeks: 0, tier: 0, rounds_completed: 0, device_public_key: deviceKey(p.backer_id).publicKey, referred_by: null, joined_at: now() }));
  for (let i = 0; i < newcomers.length; i += 500) await eu.put(STORES.backers, newcomers.slice(i, i + 500));
  if (newcomers.length) log(`${newcomers.length} newcomers signed up`);
  const t0 = Date.now(); let k = 0; let stopped = false;
  // The additive counter: every join adds. Increments landing in the same few
  // milliseconds are coalesced into one $inc on the way to the node (GAPS.md, 4).
  const counter = new Coalescer((sum) => eu.update(STORES.counts, { _id: buy._id }, { $inc: sum }));
  const errs = await inFlight(people, Number(opt("in-flight", 200)), async (b) => {
    if (stopped) return;
    const units = rnd() < 0.85 ? 1 : 2;
    const c = { _id: `c-${buy._id}-${b.backer_id}`, commitment_id: `c-${buy._id}-${b.backer_id}`, buy_id: buy._id, backer_id: b.backer_id, units, put_cents: buy.max_price_cents, status: "joined", device_public_key: deviceKey(b.backer_id).publicKey, joined_at: now() };
    c.signature = sign(deviceKey(b.backer_id).privateKey, commitmentMessage(c));
    await eu.put(STORES.commitments, c);
    await counter.add({ count: 1, units, held_cents: c.put_cents * units });
    k++;
    // A window that closed on its tier takes no more joins: the app checks every hundred.
    if (k % 100 === 0 && (await eu.get1(STORES.buys, buy._id))?.status !== "open") { stopped = true; log(`${buy._id}: the window closed after ${k} joins; the rest are turned away`); }
  });
  await counter.flush();
  const ms = Date.now() - t0;
  const count = await eu.get1(STORES.counts, buy._id);
  log(`${buy._id}: ${k} joined in ${(ms / 1000).toFixed(1)} s (${Math.round(k / (ms / 1000))} a second, ${opt("in-flight", 200)} in flight)${errs.length ? `; ${errs.length} failed: ${errs[0]}` : ""}; the counter reads ${count.count} (${count.units} units)`);
}
async function proposeAndVote() {
  const n = Number(opt("n", 4));
  let buys = await eu.find(STORES.buys, { status: "voting" }, 0); if (positional) buys = buys.filter((b) => b._id === positional);
  for (let i = 0; i < 30 && !buys.length; i++) { await sleep(2000); buys = await eu.find(STORES.buys, { status: "voting" }, 0); if (positional) buys = buys.filter((b) => b._id === positional); }
  if (!buys.length) throw new Error("no buy is voting: the order must be placed first");
  const buy = buys[0];
  const members = await eu.find(STORES.commitments, { buy_id: buy._id }, 0);
  const PLACES = [["school", "St Brigid's NS", "12 Manor St, Dublin 7", "the nearest school asked for them"], ["shelter", "Merchants Quay", "4 Merchants Quay, Dublin 8", "they need them this winter"], ["repair-cafe", "Repair Café Stoneybatter", "Aughrim St, Dublin 7", "it splits well from here and they fix what breaks"], ["member", "the captain's garage", "77 Church Rd, Dublin 3", "a member will hand them out"], ["hub", "Galway parcel hub", "Unit 2, Tuam Rd, Galway", "half the backers are in the west"]];
  const SPLITS = ["captain", "hub", "partner", "depot"];
  const proposed = [];
  for (let i = 0; i < Math.min(n, PLACES.length); i++) {
    const m = pick(members); const [kind, name, address, reason] = PLACES[i];
    const d = { _id: `dest-${buy._id}-${i + 1}`, destination_id: `dest-${buy._id}-${i + 1}`, buy_id: buy._id, proposed_by: m.backer_id, kind, name, address, reason, split_model: SPLITS[i % SPLITS.length], proposed_at: now() };
    await eu.put(STORES.destinations, d); proposed.push(d);
    log(`${m.backer_id} proposes ${name} (${kind}): "${reason}", split by ${d.split_model}`);
  }
  // The freight is priced by the fulfilment lead (the vote pipeline); the crowd ranks once it is on the ballot.
  for (let i = 0; i < 20; i++) { const priced = await eu.find(STORES.destinations, { buy_id: buy._id, freight_cents: { $exists: true } }, 0); if (priced.length >= proposed.length) break; await sleep(1500); }
  const voters = members.slice(0, Number(opt("voters", Math.min(members.length, 300))));
  const t0 = Date.now(); let k = 0;
  await inFlight(voters, 50, async (m) => {
    const favourite = proposed[Math.floor(rnd() * rnd() * proposed.length)]; // the first proposals draw more support
    const ranks = [favourite.destination_id, ...proposed.filter((d) => d !== favourite).sort(() => rnd() - 0.5).map((d) => d.destination_id)];
    const v = { _id: `vote:${buy._id}:${m.backer_id}`, buy_id: buy._id, backer_id: m.backer_id, ranks, weight_cents: m.put_cents * m.units, cast_at: now() };
    v.signature = sign(deviceKey(m.backer_id).privateKey, voteMessage(v));
    await eu.put(STORES.votes, v); k++;
  });
  log(`${k} ballots cast in ${Date.now() - t0} ms, ranked and weighted by what each put in; the vote closes ${buy.vote_closes_at}`);
}
async function custody() {
  // The live buy (the history's buys are delivered too): by id, or the newest one opened live.
  const liveBuys = async () => (await eu.find(STORES.buys, { status: { $in: ["shipped", "delivered"] }, _id: positional ? positional : { $regex: "-(live|web)-" } }, 0)).sort((a, b) => (a.window_opens_at < b.window_opens_at ? 1 : -1));
  let buys = await liveBuys();
  for (let i = 0; i < 40 && !buys.filter((b) => b.status === "delivered").length; i++) { await sleep(2000); buys = await liveBuys(); }
  const buy = buys.find((b) => b.status === "delivered") || buys[0]; if (!buy) throw new Error("nothing delivered yet");
  const sh = await eu.get1(STORES.shipments, `sh-${buy._id}`); const split = await eu.get1(STORES.splits, `split:${buy._id}`);
  const members = await eu.find(STORES.commitments, { buy_id: buy._id }, 0);
  const custodian = split.custodian; const shares = Math.min(split.shares_total, Number(opt("n", 25)));
  const handovers = [];
  for (let i = 0; i < shares; i++) {
    const m = members[i % members.length];
    const h = { shipment_id: sh._id, share: i + 1, from: custodian, to: m.backer_id, photo_hash: sha256(`photo|${buy._id}|${i + 1}|${Date.now()}`), at: now() };
    h.signature = sign(deviceKey(m.backer_id).privateKey, handoverMessage(h)); handovers.push(h);
  }
  await eu.update(STORES.shipments, { _id: sh._id }, { $push: { handovers: { $each: handovers } }, $set: { last_handover_at: now() } });
  await eu.update(STORES.splits, { _id: split._id }, { $inc: { shares_handed: handovers.length } });
  log(`${buy._id}: ${handovers.length} share(s) handed over by ${custodian}, each a signed write with a photograph (${split.shares_handed + handovers.length} of ${split.shares_total})`);
}
async function dispute() {
  const claim = opt("claim", "draw");
  const backers = await eu.find(STORES.backers, {}, 50); const b = pick(backers);
  const id = `dsp-live-${Date.now().toString(36)}`;
  let doc;
  if (claim === "draw") { const pool = positional ? await eu.get1(STORES.pools, positional) : ((await eu.find(STORES.pools, { status: "paid", _id: { $regex: "-(live|web)-" } }, 0)).pop() || (await eu.find(STORES.pools, { status: "paid", cold: false }, 0)).pop()); const ledger = await eu.find(STORES.ledger, { round_id: pool._id }, 0); doc = { _id: id, dispute_id: id, kind: "draw", round_id: pool._id, buy_id: null, backer_id: b.backer_id, claim: "the draw was wrong", argued_against: { proof: pool.draw_id, seal: pool.seal_id, ledger: ledger.map((l) => l.entry_id) }, status: "open", answer: null, raised_at: now(), answered_at: null, panel: "the panel" }; }
  else { const buy = positional ? await eu.get1(STORES.buys, positional) : ((await eu.find(STORES.buys, { status: "delivered", _id: { $regex: "-(live|web)-" } }, 0)).pop() || (await eu.find(STORES.buys, { status: "delivered" }, 0)).pop()); doc = { _id: id, dispute_id: id, kind: claim, round_id: null, buy_id: buy._id, backer_id: b.backer_id, claim: claim === "short" ? "the goods were short" : "the destination vote was gamed", argued_against: { order: `po-${buy._id}`, tally: `tally:${buy._id}`, shipment: `sh-${buy._id}` }, status: "open", answer: null, raised_at: now(), answered_at: null, panel: "the panel" }; }
  await eu.put(STORES.disputes, doc);
  log(`${id}: ${b.backer_id} says "${doc.claim}", argued against ${Object.entries(doc.argued_against).map(([k, v]) => `${k} ${Array.isArray(v) ? v.length + " entries" : v}`).join(", ")}; the panel answers from those documents`);
  console.log(id);
}
const COMMANDS = { "open-round": openRound, "pledges-arrive": pledgesArrive, "open-window": openWindow, "four-thousand-join-at-once": joinAtOnce, "anybody-proposes-one": proposeAndVote, "custody-share-by-share": custody, dispute };
if (!COMMANDS[cmd]) { console.error(`usage: backer-app-and-web.mjs <${Object.keys(COMMANDS).join("|")}> [id] [--options]`); process.exit(2); }
await ready(eu);
COMMANDS[cmd]().catch((e) => { console.error(e.message); process.exit(1); });
