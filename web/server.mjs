// Backer app and web: the browser app, served by this small Node server,
// which also makes the build sheet's calls to the platform's node on the
// browser's behalf. The browser is the phone: it picks a backer, and this
// server signs as that backer's device with the demo-derived key (a real
// phone signs in its own keystore; DECISIONS.md, 12). No dependencies.
//   node web/server.mjs            (PORT 8080; FROM_HOST=1 to reach the fleet from the host)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { fleet, ready, now, STORES } from "../lib/api.mjs";
import { sign, sha256, pledgeMessage, commitmentMessage, voteMessage, handoverMessage, docMessage } from "../lib/crypto.mjs";
import { deviceKey, roleKey } from "../lib/keys.mjs";
import { Coalescer } from "../lib/coalesce.mjs";
import { MARKETS, MARKET_KIND } from "../lib/markets.mjs";
import { scenarioGrid } from "../lib/mechanisms.mjs";

const F = fleet(); const eu = F.platform.eu;
const PORT = Number(process.env.PORT || 8080);
const ROOT = resolve(new URL(".", import.meta.url).pathname);
const PUBLIC = join(ROOT, "public"), LIB = resolve(ROOT, "../lib");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
const counters = new Map(); // one coalescer per buy: joins landing together go to the node as one increment
const counterFor = (buyId) => { if (!counters.has(buyId)) counters.set(buyId, new Coalescer((sum) => eu.update(STORES.counts, { _id: buyId }, { $inc: sum }))); return counters.get(buyId); };
const byNewest = (k) => (a, b) => (String(a[k] || "") < String(b[k] || "") ? 1 : -1);
const IDEAS = ["a tool library", "a repair café", "a community fridge", "a rehearsal room", "a seed bank", "a bike workshop"];

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => { throw new HttpError(400, m); };
async function backer(id) { const b = await eu.get1(STORES.backers, id); if (!b) throw new HttpError(404, `no backer ${id}`); return b; }
// May this market run it? The gate is on opening; the app never shows a forbidden round to a backer in that market.
async function allowed(market, mechanism) { const [j] = await eu.find(STORES.jurisdictions, { market, $or: [{ mechanism }, { also_covers: mechanism }] }, 1); return j ? j.allowed : false; }

const routes = {
  "GET /app/config": async () => {
    const backers = (await eu.find(STORES.backers, {}, 0)).sort((a, b) => (a._id < b._id ? -1 : 1));
    const keys = await eu.find(STORES.keys, {}, 0);
    return { backers: backers.slice(0, 60).map((b) => ({ id: b._id, name: b.name, market: b.market })), total_backers: backers.length, markets: MARKETS.map((m) => ({ code: m, kind: MARKET_KIND(m) })), keys: Object.fromEntries(keys.map((k) => [k.holder, k.public_key])), node: eu.url, ideas: IDEAS };
  },
  "GET /app/rounds": async (q) => {
    const market = q.market || "IE";
    const pools = (await eu.find(STORES.pools, {}, 0)).sort(byNewest("opens_at"));
    const gates = {}; for (const p of pools) if (!(p.mechanism in gates)) gates[p.mechanism] = await allowed(market, p.mechanism);
    const visible = pools.filter((p) => gates[p.mechanism] && p.status !== "refused" && p.status !== "drafted");
    return { market, live: visible.filter((p) => !p.cold && !/^r-\d{4}$/.test(p._id)), recent: visible.filter((p) => /^r-\d{4}$/.test(p._id) && !p.cold).slice(0, 40), cold: visible.filter((p) => p.cold).length, hidden: pools.length - visible.length, drafts: pools.filter((p) => p.status === "drafted").map((p) => ({ _id: p._id, title: p.title, mechanism: p.mechanism, market: p.market, opened_by: p.opened_by, rationale: p.rationale })) };
  },
  "GET /app/round": async (q) => {
    const pool = await eu.get1(STORES.pools, q.id); if (!pool) throw new HttpError(404, "no such round");
    const [sealed, draw, rule, pledges, ledger] = await Promise.all([eu.find(STORES.sealed, { round_id: pool._id }, 0), pool.draw_id ? eu.get1(STORES.draws, pool.draw_id) : null, eu.get1(STORES.rules, `${pool.rule_id}@${pool.rule_version}`), eu.find(STORES.pledges, { round_id: pool._id }, 0), eu.find(STORES.ledger, { round_id: pool._id }, 0)]);
    let match = null; try { match = (await F.platform.sponsor.find("sponsor_matches", { round_id: pool._id }, 1))[0] || null; } catch {}
    const grid = pool.scenario_grid || (rule?.family === "weighted_random_draw" ? scenarioGrid(rule, [10000, 50000, 150000, 400000]) : null);
    return { pool, seal: sealed.find((s) => s.kind === "seal") || null, roots: sealed.filter((s) => s.kind === "root" || s.kind === "close").sort(byNewest("sealed_at")), reveal: sealed.find((s) => s.kind === "reveal") || null, draw, rule, pledges: pledges.sort((a, b) => (a.entry_index ?? 1e9) - (b.entry_index ?? 1e9)), ledger: ledger.sort((a, b) => a.sequence - b.sequence), match, grid, roundKey: (await eu.get1(STORES.keys, "role:round"))?.public_key };
  },
  "POST /app/pledge": async (q, body) => {
    const pool = await eu.get1(STORES.pools, body.round_id); if (!pool || pool.status !== "open") bad("this round is not open");
    if (Date.parse(pool.closes_at) <= Date.now()) bad("this round has closed");
    const b = await backer(body.backer_id);
    if (!(await allowed(b.market, pool.mechanism))) bad(`${b.market} does not allow this mechanism`);
    const amount = Math.round(Number(body.amount_cents)); if (!(amount >= 100 && amount <= 100000)) bad("an amount between 1.00 and 1,000.00");
    const pledge_id = `p-${pool._id}-${b._id}-${Date.now().toString(36)}`;
    const p = { _id: pledge_id, pledge_id, round_id: pool._id, backer_id: b._id, amount_cents: amount, idea: body.idea || null, ranks: Array.isArray(body.ranks) && body.ranks.length ? body.ranks : null, bid_cents: body.bid_cents ? Math.round(Number(body.bid_cents)) : null, mandate_id: null, device_public_key: b.device_public_key, signed_by: "the backer's device (the browser)", pledged_at: now() };
    p.signature = sign(deviceKey(b._id).privateKey, pledgeMessage(p));
    await eu.put(STORES.pledges, p);
    await eu.update(STORES.pools, { _id: pool._id }, { $inc: { gathered_cents: amount, entries: 1 } });
    return { pledge: p };
  },
  "GET /app/buys": async () => {
    const buys = (await eu.find(STORES.buys, {}, 0)).sort(byNewest("window_opens_at"));
    const live = buys.filter((b) => !/^gb-\d{4}$/.test(b._id));
    const counts = new Map((await eu.find(STORES.counts, { _id: { $in: live.map((b) => b._id) } }, 0)).map((c) => [c._id, c]));
    return { live: live.map((b) => ({ ...b, counter: counts.get(b._id) || null })), recent: buys.filter((b) => /^gb-\d{4}$/.test(b._id)).slice(0, 30), total: buys.length };
  },
  "GET /app/buy": async (q) => {
    const buy = await eu.get1(STORES.buys, q.id); if (!buy) throw new HttpError(404, "no such buy");
    const [counter, order, destinations, votes, tally, shipment, split, ledger, mine] = await Promise.all([eu.get1(STORES.counts, buy._id), eu.get1(STORES.orders, `po-${buy._id}`), eu.find(STORES.destinations, { buy_id: buy._id }, 0), eu.count(STORES.votes, { buy_id: buy._id }), eu.get1(STORES.tallies, `tally:${buy._id}`), eu.get1(STORES.shipments, `sh-${buy._id}`), eu.get1(STORES.splits, `split:${buy._id}`), eu.find(STORES.ledger, { buy_id: buy._id }, 0), q.backer ? eu.get1(STORES.commitments, `c-${buy._id}-${q.backer}`) : null]);
    const myVote = q.backer ? await eu.get1(STORES.votes, `vote:${buy._id}:${q.backer}`) : null;
    let theirs = null; try { theirs = await F.platform.supplier.get1(STORES.supplierOrders, `po-${buy._id}`); } catch {}
    const summary = { holds: 0, takes: 0, refunds: 0, payouts: 0, fees: 0, entries: ledger.length };
    for (const e of ledger) { if (e.kind === "hold") summary.holds += e.amount_cents; if (e.kind === "take") summary.takes += e.amount_cents; if (e.kind === "refund") summary.refunds += e.amount_cents; if (e.kind === "payout") summary.payouts += e.amount_cents; if (e.kind === "fee") summary.fees += e.amount_cents; }
    return { buy, counter, order, supplier_copy: theirs, destinations, votes, tally, shipment: shipment ? { ...shipment, handovers: (shipment.handovers || []).slice(-30), handover_count: (shipment.handovers || []).length } : null, split, ledger: summary, mine, myVote, supplierKey: (await eu.get1(STORES.keys, "role:supplier-northlight"))?.public_key };
  },
  "POST /app/join": async (q, body) => {
    const buy = await eu.get1(STORES.buys, body.buy_id); if (!buy || buy.status !== "open") bad("this window is not open");
    const b = await backer(body.backer_id);
    const units = Math.max(1, Math.min(5, Math.round(Number(body.units || 1))));
    const id = `c-${buy._id}-${b._id}`; if (await eu.get1(STORES.commitments, id)) bad("you are already in this buy");
    const c = { _id: id, commitment_id: id, buy_id: buy._id, backer_id: b._id, units, put_cents: buy.max_price_cents, status: "joined", device_public_key: b.device_public_key, joined_at: now() };
    c.signature = sign(deviceKey(b._id).privateKey, commitmentMessage(c));
    await eu.put(STORES.commitments, c);
    await counterFor(buy._id).add({ count: 1, units, held_cents: c.put_cents * units });
    return { commitment: c };
  },
  "POST /app/propose": async (q, body) => {
    const buy = await eu.get1(STORES.buys, body.buy_id); if (!buy || buy.status !== "voting") bad("this buy is not taking proposals");
    const b = await backer(body.backer_id);
    if (!(await eu.get1(STORES.commitments, `c-${buy._id}-${b._id}`))) bad("only somebody in the buy may propose");
    const n = (await eu.count(STORES.destinations, { buy_id: buy._id })) + 1;
    const d = { _id: `dest-${buy._id}-${n}`, destination_id: `dest-${buy._id}-${n}`, buy_id: buy._id, proposed_by: b._id, kind: body.kind || "member", name: String(body.name || "").slice(0, 80) || bad("a name"), address: String(body.address || "").slice(0, 120) || bad("an address"), reason: String(body.reason || "").slice(0, 200) || bad("a reason: the reason is what the vote is about"), split_model: ["captain", "hub", "partner", "depot"].includes(body.split_model) ? body.split_model : "hub", proposed_at: now() };
    await eu.put(STORES.destinations, d); return { destination: d };
  },
  "POST /app/vote": async (q, body) => {
    const buy = await eu.get1(STORES.buys, body.buy_id); if (!buy || buy.status !== "voting") bad("the vote is not open");
    if (Date.parse(buy.vote_closes_at) <= Date.now()) bad("the vote closed on its clock");
    const b = await backer(body.backer_id);
    const c = await eu.get1(STORES.commitments, `c-${buy._id}-${b._id}`); if (!c) bad("only somebody in the buy may vote");
    const ranks = (body.ranks || []).filter((r, i, a) => typeof r === "string" && a.indexOf(r) === i); if (!ranks.length) bad("rank at least one destination");
    const v = { _id: `vote:${buy._id}:${b._id}`, buy_id: buy._id, backer_id: b._id, ranks, weight_cents: c.put_cents * c.units, cast_at: now() };
    v.signature = sign(deviceKey(b._id).privateKey, voteMessage(v));
    await eu.put(STORES.votes, v); return { vote: v };
  },
  "POST /app/handover": async (q, body) => {
    const buy = await eu.get1(STORES.buys, body.buy_id); if (!buy || buy.status !== "delivered") bad("nothing has been delivered yet");
    const b = await backer(body.backer_id);
    const c = await eu.get1(STORES.commitments, `c-${buy._id}-${b._id}`); if (!c) bad("only somebody in the buy takes a share");
    const sh = await eu.get1(STORES.shipments, `sh-${buy._id}`); const split = await eu.get1(STORES.splits, `split:${buy._id}`);
    if ((sh.handovers || []).some((h) => h.to === b._id && h.share > 0)) bad("you already hold your share");
    const share = (split.shares_handed || 0) + 1;
    const h = { shipment_id: sh._id, share, from: split.custodian, to: b._id, photo_hash: sha256(`photo|${buy._id}|${share}|${body.photo || ""}|${Date.now()}`), at: now() };
    h.signature = sign(deviceKey(b._id).privateKey, handoverMessage(h));
    await eu.update(STORES.shipments, { _id: sh._id }, { $push: { handovers: h }, $set: { last_handover_at: now() } });
    await eu.update(STORES.splits, { _id: split._id }, { $inc: { shares_handed: 1 } });
    return { handover: h };
  },
  "GET /app/me": async (q) => {
    const b = await backer(q.id);
    const [mandates, pledges, commitments, ledger] = await Promise.all([eu.find(STORES.standing, { backer_id: b._id }, 0), eu.find(STORES.pledges, { backer_id: b._id }, 0), eu.find(STORES.commitments, { backer_id: b._id }, 0), eu.find(STORES.ledger, { $or: [{ from: `wallet:${b._id}` }, { to: `wallet:${b._id}` }] }, 0)]);
    const pools = new Map((await eu.find(STORES.pools, { _id: { $in: [...new Set(pledges.map((p) => p.round_id))] } }, 0)).map((p) => [p._id, p]));
    return { backer: b, weight: Math.round((1 + Math.min(b.streak_weeks || 0, 12) * 0.05 + (b.tier || 0) * 0.1) * 100) / 100, mandates, pledges: pledges.sort(byNewest("pledged_at")).slice(0, 40).map((p) => ({ ...p, round: pools.get(p.round_id) ? { title: pools.get(p.round_id).title, status: pools.get(p.round_id).status, draw_id: pools.get(p.round_id).draw_id } : null })), commitments: commitments.sort(byNewest("joined_at")).slice(0, 20), statement: ledger.sort((a, b) => a.sequence - b.sequence).slice(-60) };
  },
  "GET /app/sponsor": async () => {
    const s = F.platform.sponsor;
    const [terms, view, published, matches, outcomes] = await Promise.all([s.find(STORES.sponsorTerms, {}, 0), s.find(STORES.sponsorView, {}, 0), s.find("rounds_published", {}, 0), s.find("sponsor_matches", {}, 0), s.find("round_outcomes", {}, 0)]);
    return { terms: terms[0] || null, view: view[0] || null, published: published.sort(byNewest("published_at")).slice(0, 30), matches: matches.sort(byNewest("offered_at")).slice(0, 30), outcomes: outcomes.sort(byNewest("paid_at")).slice(0, 30), library: "sponsor-acme-shared, read from the platform's side" };
  },
  "GET /app/ledger": async (q) => { const filter = q.round ? { round_id: q.round } : q.buy ? { buy_id: q.buy } : {}; const rows = (await eu.find(STORES.ledger, filter, 0)).sort((a, b) => b.sequence - a.sequence).slice(0, Number(q.limit || 100)); return { entries: rows, escrowKey: (await eu.get1(STORES.keys, "role:escrow"))?.public_key }; },
  "GET /app/disputes": async () => ({ disputes: (await eu.find(STORES.disputes, {}, 0)).sort(byNewest("raised_at")).slice(0, 40) }),
  "POST /app/dispute": async (q, body) => {
    const b = await backer(body.backer_id); const id = `dsp-web-${Date.now().toString(36)}`;
    let doc;
    if (body.round_id) { const pool = await eu.get1(STORES.pools, body.round_id); if (!pool) bad("no such round"); const ledger = await eu.find(STORES.ledger, { round_id: pool._id }, 0); doc = { _id: id, dispute_id: id, kind: "draw", round_id: pool._id, buy_id: null, backer_id: b._id, claim: String(body.claim || "the draw was wrong").slice(0, 200), argued_against: { proof: pool.draw_id, seal: pool.seal_id, ledger: ledger.map((l) => l.entry_id) }, status: "open", answer: null, raised_at: now(), answered_at: null, panel: "the panel" }; }
    else { const buy = await eu.get1(STORES.buys, body.buy_id); if (!buy) bad("no such buy"); doc = { _id: id, dispute_id: id, kind: body.kind === "vote" ? "vote" : "short", round_id: null, buy_id: buy._id, backer_id: b._id, claim: String(body.claim || "the goods were short").slice(0, 200), argued_against: { order: `po-${buy._id}`, tally: `tally:${buy._id}`, shipment: `sh-${buy._id}` }, status: "open", answer: null, raised_at: now(), answered_at: null, panel: "the panel" }; }
    await eu.put(STORES.disputes, doc); return { dispute: doc };
  },
  // The operator: opening is a commitment, so a person does it.
  "POST /app/open-round": async (q, body) => {
    const mechanism = body.mechanism || "weighted_random_draw"; const market = MARKETS.includes(body.market) ? body.market : "IE";
    const rules = (await eu.find(STORES.rules, { family: mechanism }, 0)).sort((a, b) => b.version - a.version || (a.rule_id < b.rule_id ? -1 : 1)); const rule = rules[0]; if (!rule) bad("no rule of that family");
    const id = body.draft_id || `r-web-${Date.now().toString(36)}`;
    const draft = body.draft_id ? await eu.get1(STORES.pools, body.draft_id) : null;
    const pool = { _id: id, round_id: id, title: String(body.title || draft?.title || `${IDEAS[Math.floor(Math.random() * IDEAS.length)]} in ${market}`).slice(0, 80), category: body.category || draft?.category || "repair", market, rule_id: rule.rule_id, rule_version: rule.version, mechanism, status: "opening", window_s: Math.max(30, Math.min(3600, Number(body.window_s || draft?.window_s || 120))), threshold_cents: rule.params.threshold_cents || null, gathered_cents: 0, matched_cents: 0, entries: 0, ideas: ["threshold", "weighted_random_draw", "dutch_auction"].includes(mechanism) ? [] : IDEAS.slice(0, 4), band: null, cold: false, opened_by: draft ? `the operator, from the agent's draft` : "the operator", rationale: draft?.rationale || null, opened_at: now(), updated_at: now() };
    await eu.put(STORES.pools, pool); return { pool };
  },
  "POST /app/open-window": async (q, body) => {
    const itemIndex = Math.max(0, Math.min(99, Number(body.item_index ?? Math.floor(Math.random() * 100))));
    const ladder = (await F.platform.supplier.find(STORES.tiers, { item_index: itemIndex, version: 10 }, 0)).sort((a, b) => a.step - b.step); if (!ladder.length) bad("no ladder for that item");
    const id = `gb-web-${Date.now().toString(36)}`; const window_s = Math.max(30, Math.min(3600, Number(body.window_s || 120)));
    const buy = { _id: id, buy_id: id, item: ladder[0].item, item_index: itemIndex, supplier_id: "supplier-northlight", tier_version: 10, ladder: [], window_opens_at: now(), window_closes_at: new Date(Date.now() + window_s * 1000).toISOString(), close_on: body.close_on === "clock" ? "clock" : "tier", close_tier: body.close_on === "clock" ? null : Number(body.close_tier || 200), status: "scheduled", count: 0, tier_reached: null, max_price_cents: ladder[0].price_cents, default_destination: { kind: "hub", name: "Dublin 7 locker hub", address: "Unit 4, Manor St, Dublin 7" }, quorum: Number(body.quorum ?? 0.05), vote_window_s: Math.max(30, Number(body.vote_window_s || 120)), funded_by_round: body.round_id || null, opened_by: "the schedule, announced by the operator", updated_at: now() };
    await eu.put(STORES.buys, buy);
    await eu.put(STORES.counts, { _id: id, buy_id: id, item: buy.item, count: 0, units: 0, held_cents: 0, tier_reached: null, updated_at: now() });
    return { buy };
  },
  "GET /app/items": async () => { const rows = await F.platform.supplier.find(STORES.tiers, { version: 10, step: 1 }, 0); return { items: rows.sort((a, b) => a.item_index - b.item_index).map((r) => ({ item_index: r.item_index, item: r.item, price_cents: r.price_cents })) }; },
  "GET /app/status": async () => { const s = await eu.status(); const peers = await eu.peers(); return { node: s.nodeName, library: s.library, engine: s.engineVersion, peers: peers.map((p) => p.name), files: s.files }; },
};

async function serveStatic(pathname, res) {
  let file; if (pathname === "/" || pathname === "") file = join(PUBLIC, "index.html"); else if (pathname.startsWith("/lib/")) file = join(LIB, pathname.slice(5)); else file = join(PUBLIC, pathname);
  if (!file.startsWith(PUBLIC) && !file.startsWith(LIB)) { res.writeHead(403); return res.end(); }
  try { await stat(file); const body = await readFile(file); res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-cache" }); res.end(body); }
  catch { if (!extname(pathname)) { const body = await readFile(join(PUBLIC, "index.html")); res.writeHead(200, { "content-type": MIME[".html"] }); res.end(body); } else { res.writeHead(404); res.end("not found"); } }
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"); const q = Object.fromEntries(url.searchParams);
  const m = url.pathname.match(/^\/app\/([a-z-]+)(?:\/([^/]+))?$/);
  if (!m) return serveStatic(url.pathname, res);
  const key = `${req.method} /app/${m[1]}`; if (m[2]) q.id = decodeURIComponent(m[2]);
  const handler = routes[key];
  if (!handler) { res.writeHead(404, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: `no route ${key}` })); }
  try {
    let body = {}; if (req.method === "POST") { let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 65536) throw new HttpError(413, "too large"); } body = raw ? JSON.parse(raw) : {}; }
    const out = await handler(q, body);
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(out));
  } catch (e) { res.writeHead(e.status || 500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: e.message })); if (!e.status) console.error(key, e.message); }
});
await ready(eu);
server.listen(PORT, () => console.log(`backer web on http://0.0.0.0:${PORT}, calls go to ${eu.url}`));
