// Set Metabase up over its API: the admin, the PostgreSQL wire of the
// platform's node, and the build sheet's four dashboard questions on one
// dashboard. Idempotent enough to run twice.
//   docker compose run --rm tools node bin/metabase.mjs      (FROM_HOST=1 from the host)
import { fleet } from "../lib/api.mjs";
const FROM_HOST = process.env.FROM_HOST === "1";
const MB = process.env.METABASE_URL || fleet().metabase;
const ADMIN = { email: process.env.MB_EMAIL || "demo@example.com", password: process.env.MB_PASSWORD || "Demo-only-1234", first_name: "Demo", last_name: "Admin" };
const PG = { host: FROM_HOST ? "host.docker.internal" : "platform", port: FROM_HOST ? 15533 : 5433, user: process.env.SQLD_USER || "demo", password: process.env.SQLD_PASSWORD || "demo-only-change-me" };
// A collection over the SQL wire is a view named after it: one row per
// document version with the fields in a JSON doc column, and a counter
// field's deltas in the _cd column (folded into one row by compaction).
// Each query takes the latest version per _id and sums the counters.
const latest = (c, counters = []) => `(SELECT _id, arg_max(doc, _ts) AS doc${counters.map((f) => `, coalesce(sum(CAST(json_extract_string(_cd, '$.${f}') AS DOUBLE)), 0) AS ${f}`).join("")} FROM ${c} WHERE NOT _deleted GROUP BY _id)`;
const j = (f, type = "VARCHAR") => `CAST(json_extract_string(doc, '$.${f}') AS ${type})`;
export const QUESTIONS = [
  { name: "Fill rates by mechanism", display: "table", sql: `SELECT ${j("mechanism")} AS mechanism, count(*) AS rounds, round(avg(gathered_cents) / 100, 2) AS avg_gathered_eur, round(avg(entries), 1) AS avg_entries, sum(CASE WHEN ${j("status")} = 'paid' THEN 1 ELSE 0 END) AS paid, sum(CASE WHEN ${j("status")} = 'void' THEN 1 ELSE 0 END) AS void FROM ${latest("pools", ["gathered_cents", "entries"])} GROUP BY 1 ORDER BY rounds DESC` },
  { name: "How a weighted draw distributed against how it was meant to", display: "table", sql: `SELECT ${j("round_id")} AS round_id, ${j("entry_count", "INTEGER")} AS entries, ${j("result.band.winners", "INTEGER")} AS winners_meant, json_array_length(json_extract(doc, '$.result.winners')) AS winners_drawn, round(${j("result.pool_cents", "DOUBLE")} / 100, 2) AS pool_eur, ${j("beacon.source")} AS beacon FROM ${latest("draws")} WHERE ${j("result.mechanism")} = 'weighted_random_draw' ORDER BY ${j("drawn_at")} DESC LIMIT 200` },
  { name: "Which categories attract the crowd", display: "bar", sql: `SELECT ${j("category")} AS category, count(*) AS rounds, sum(entries) AS entries, round(sum(gathered_cents) / 100) AS gathered_eur, round(sum(matched_cents) / 100) AS matched_eur FROM ${latest("pools", ["gathered_cents", "entries", "matched_cents"])} GROUP BY 1 ORDER BY gathered_eur DESC` },
  { name: "How long a group buy takes to reach its next tier", display: "table", sql: `SELECT ${j("tier_reached", "INTEGER")} AS tier_reached, count(*) AS buys, round(avg(date_diff('minute', CAST(${j("window_opens_at")} AS TIMESTAMP), CAST(coalesce(${j("closed_at")}, ${j("window_closes_at")}) AS TIMESTAMP))), 1) AS minutes_to_close, round(avg(${j("count", "DOUBLE")}), 0) AS avg_backers, round(avg(${j("unit_price_cents", "DOUBLE")}) / 100, 2) AS avg_unit_price_eur FROM ${latest("group_buys")} WHERE ${j("tier_reached")} IS NOT NULL GROUP BY 1 ORDER BY 1` },
];
let session = null;
async function api(method, path, body) {
  const res = await fetch(MB + path, { method, headers: { "content-type": "application/json", ...(session ? { "X-Metabase-Session": session } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 300)}`);
  return data;
}
async function waitHealthy() { for (let i = 0; i < 120; i++) { try { const h = await api("GET", "/api/health"); if (h.status === "ok") return; } catch {} await new Promise((r) => setTimeout(r, 3000)); } throw new Error("Metabase did not come up"); }
if (process.argv[1] && process.argv[1].endsWith("metabase.mjs")) {
  await waitHealthy();
  const props = await api("GET", "/api/session/properties");
  if (props["setup-token"]) { const r = await api("POST", "/api/setup", { token: props["setup-token"], user: { ...ADMIN, site_name: "Gamified crowdfunding" }, prefs: { site_name: "Gamified crowdfunding", allow_tracking: false } }); session = r.id; console.log("set up; admin", ADMIN.email); }
  else { session = (await api("POST", "/api/session", { username: ADMIN.email, password: ADMIN.password })).id; console.log("signed in as", ADMIN.email); }
  const name = "Platform node (platform-eu)";
  let db = ((await api("GET", "/api/database")).data || []).find((x) => x.name === name);
  if (!db) { db = await api("POST", "/api/database", { engine: "postgres", name, details: { host: PG.host, port: PG.port, dbname: "p2pfs", user: PG.user, password: PG.password, ssl: false, "tunnel-enabled": false }, is_full_sync: true }); console.log("database:", name, "id", db.id); } else console.log("database exists:", name, "id", db.id);
  const cards = (await api("GET", "/api/card")) || []; const made = [];
  for (const q of QUESTIONS) {
    let card = cards.find((c) => c.name === q.name); const dataset_query = { type: "native", native: { query: q.sql }, database: db.id };
    if (!card) { card = await api("POST", "/api/card", { name: q.name, display: q.display, visualization_settings: {}, dataset_query }); console.log("question:", q.name); }
    else if (card.dataset_query?.native?.query !== q.sql) { card = await api("PUT", `/api/card/${card.id}`, { dataset_query }); console.log("question updated:", q.name); }
    made.push(card);
  }
  const title = "Round dashboards";
  let dash = ((await api("GET", "/api/dashboard")) || []).find((d) => d.name === title);
  if (!dash) { dash = await api("POST", "/api/dashboard", { name: title, description: "Fill rates by mechanism, how a weighted draw actually distributed, which categories attract the crowd, how long a buy takes to reach its next tier." }); try { await api("PUT", `/api/dashboard/${dash.id}`, { dashcards: made.map((c, i) => ({ id: -(i + 1), card_id: c.id, row: Math.floor(i / 2) * 6, col: (i % 2) * 12, size_x: 12, size_y: 6 })) }); console.log("dashboard:", title, "with", made.length, "questions"); } catch (e) { console.log("dashboard made; adding cards needs the UI on this Metabase version:", e.message.slice(0, 120)); } }
  else console.log("dashboard exists:", title);
  console.log(`open ${FROM_HOST ? "http://127.0.0.1:13200" : MB} and sign in as ${ADMIN.email} / ${ADMIN.password}`);
}
