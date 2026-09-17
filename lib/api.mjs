// The engine's HTTP API, the calls the build sheet lists, over fetch only.
// A node is a URL such as http://platform:7480 (the platform's own library)
// or http://127.0.0.1:17600 from the host.
export class Node {
  constructor(url, name = url) { this.url = url.replace(/\/$/, ""); this.name = name; }
  async post(path, body, retried = false) {
    const res = await fetch(this.url + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok || data.error) {
      // A collection is read or written only when every member is local; a
      // member another node just wrote may not be here yet. Replicate and retry once.
      if (!retried && body && body.collection && /needs every member local/.test(String(data.error || text))) { await ensureCollection(this, body.collection); return this.post(path, body, true); }
      throw new Error(`${this.name} ${path}: ${res.status} ${data.error || text.slice(0, 200)}`);
    }
    return data;
  }
  async get(path) { const res = await fetch(this.url + path); if (!res.ok) throw new Error(`${this.name} ${path}: ${res.status}`); return res.json(); }
  // /api/doc/put: one document or a list; a put replaces the whole document by _id. Returns the ids.
  async put(collection, docs) { return (await this.post("/api/doc/put", Array.isArray(docs) ? { collection, documents: docs } : { collection, document: docs })).ids || []; }
  // /api/doc/find with the Mongo filter operator set; limit 0 is no limit.
  async find(collection, filter = {}, limit = 0, sort = null) { const body = { collection, filter }; if (limit) body.limit = limit; if (sort) body.sort = sort; return (await this.post("/api/doc/find", body)).documents || []; }
  async get1(collection, id) { return (await this.find(collection, { _id: String(id) }, 1))[0] || null; }
  async count(collection, filter = {}) { return (await this.post("/api/doc/count", { collection, filter })).count || 0; }
  // /api/doc/update: Mongo-style update operators ($set, $inc, $push...), multi and upsert as options.
  // Two updates in flight on one document lose one of them (GAPS.md, 2): a writer serialises its own updates.
  async update(collection, filter, update, opts = {}) { return this.post("/api/doc/update", { collection, filter, update, ...opts }); }
  async delete(collection, filter) { return this.post("/api/doc/delete", { collection, filter }); }
  // /api/sql over the node's tables and collections (a collection's fields live in the doc column as JSON, one row per version).
  async sql(query) { return (await this.post("/api/sql", { query })).rows || []; }
  async tables() { return this.get("/api/tables"); }
  async status() { return this.get("/api/status"); }
  async peers() { return this.get("/api/peers"); }
  async files() { return this.get("/api/files"); }
  async log() { return (await this.get("/api/log")).lines || []; }
}
// Wait until a node answers, for scripts that start with the fleet.
export async function ready(node, tries = 90) {
  for (let i = 0; i < tries; i++) { try { await node.status(); return true; } catch { await sleep(2000); } }
  throw new Error(`${node.name} did not answer`);
}
// Fetch every member of ONE collection this node is missing, by asking the
// node to replicate it: the engine walks the collection's manifest.
export async function ensureCollection(node, collection) {
  try { await node.post("/api/table/replicate", { table: collection }); } catch { return 0; }
  for (let i = 0; i < 40; i++) {
    const files = await node.files();
    if (!files.some((f) => !f.local && f.name && !f.name.includes(".cursors."))) break;
    await sleep(500);
  }
  return 1;
}
// A node writes a collection only when every member is local. Prefix ""
// fetches everything the node lacks.
export async function ensureLocal(node, prefix = "") {
  const files = await node.files();
  const missing = files.filter((f) => !f.local && f.name && f.name.startsWith(prefix) && !f.name.includes(".cursors."));
  for (const f of missing) { try { await node.post("/api/fetch", { hash: f.hash }); } catch {} }
  if (missing.length) for (let i = 0; i < 20; i++) { const again = (await node.files()).filter((f) => !f.local && f.name && f.name.startsWith(prefix) && !f.name.includes(".cursors.")); if (!again.length) break; await sleep(500); }
  return missing.length;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const now = () => new Date().toISOString();

// A queue per document: the engine's update is read-modify-write, so a
// writer that may touch the same document twice at once serialises itself.
const queues = new Map();
export function serial(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(key, next.catch(() => {}));
  return next;
}

// The fleet, by name, from inside the compose network or from the host.
export function fleet(fromHost = process.env.FROM_HOST === "1") {
  const u = (host, port, hostPort) => new Node(fromHost ? `http://127.0.0.1:${hostPort}` : `http://${host}:${port}`, `${host}:${port}`);
  return {
    // The platform's region node: its own library and the two shared ones, from its side.
    platform: { eu: u("platform", 7480, 17600), sponsor: u("platform", 7481, 17601), supplier: u("platform", 7482, 17602) },
    // The sponsor's and the supplier's own nodes on the libraries they share with the platform.
    sponsor: u("sponsor-acme", 7480, 17610),
    supplier: u("supplier-northlight", 7480, 17620),
    // Anyone, including a regulator: a second node of platform-eu that recomputes from its own copy.
    regulator: u("regulator", 7480, 17630),
    minio: fromHost ? "http://127.0.0.1:19100" : "http://closed-rounds-and-proofs:9000",
    metabase: fromHost ? "http://127.0.0.1:13200" : "http://metabase:3000",
  };
}
// The stores of the build sheet, section 3, as collection names.
export const STORES = {
  backers: "backers",                       // backers, wallets and standing
  standing: "standing_contributions",       // standing contributions
  pools: "pools",                           // pools, one per round
  pledges: "pledges",                       // pledges, signed
  rules: "allocation_rules",                // allocation rules
  sealed: "sealed_commitments",             // sealed commitments and roots (append only, per round)
  draws: "draws",                           // draws and their proofs (append only, per draw)
  buys: "group_buys",                       // group buys
  tiers: "tier_published",                  // tier_published (rows; here a collection, see GAPS.md)
  commitments: "commitments",               // commitments, counted: one document per join, the count is the count
  counts: "commitments_counted",            // the running count per buy, materialised by the buy pipeline
  orders: "purchase_orders",                // purchase orders
  destinations: "destinations_proposed",    // destinations proposed
  votes: "destination_votes",               // the ranked ballots, one per backer per buy
  tallies: "destination_tallies",           // The crowd decides where: the tally document
  shipments: "shipments",                   // shipments
  splits: "pallet_splits",                  // how the pallet is broken up
  jurisdictions: "rules_by_jurisdiction",   // rules by jurisdiction
  ledger: "money_ledger",                   // the money ledger (append only, per entry)
  disputes: "disputes",                     // disputes and appeals
  keys: "keys",                             // public keys of the platform's writers (escrow, the round, the backers' devices)
  sponsorTerms: "sponsor_terms",            // on the sponsor's shared library: the sponsor's terms per season
  sponsorView: "sponsor_view",              // on the sponsor's shared library: what a sponsor may see
  supplierOrders: "purchase_orders",        // on the supplier's shared library: one document per order both sides write to
};
