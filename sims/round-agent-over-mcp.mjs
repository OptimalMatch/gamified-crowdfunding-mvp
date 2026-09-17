// Round agent over MCP: reads the last hundred rounds, the fill rates and
// the supplier quotes, and drafts the next round: the mechanism, the
// threshold and the window. A person opens it, because opening is a
// commitment. The build sheet's calls are its tools. With ANTHROPIC_API_KEY
// in .env the drafting is Claude's over the Messages API (no SDK, fetch
// only); without a key the same tools run under a rule, so the demo does
// not need a key. Claude Code itself can sit on the node through the
// engine's own MCP server: see .mcp.json.
//   docker compose run --rm round-agent-over-mcp-sim [--market IE] [--category repair]
import { fleet, ready, now, STORES } from "../lib/api.mjs";
import { MARKET_KIND } from "../lib/markets.mjs";
const F = fleet(); const eu = F.platform.eu, supplierLib = F.platform.supplier;
const args = process.argv.slice(2); const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "round agent:", ...a);

// The tools: the build sheet's calls for this application (rounds, proofs, suppliers).
const TOOLS = {
  last_rounds: { description: "The last hundred rounds: mechanism, category, market, what they gathered, entries, and the outcome.", input_schema: { type: "object", properties: { market: { type: "string" } } }, run: async ({ market }) => { const pools = (await eu.find(STORES.pools, market ? { market } : {}, 0)).sort((a, b) => (a.closes_at < b.closes_at ? 1 : -1)).slice(0, 100); return pools.map((p) => ({ round_id: p._id, mechanism: p.mechanism, category: p.category, market: p.market, gathered_cents: p.gathered_cents, matched_cents: p.matched_cents, entries: p.entries, status: p.status, band_winners: p.band?.winners ?? null })); } },
  fill_rates: { description: "Per mechanism and per category: rounds, average gathered, average entries, share paid out.", input_schema: { type: "object", properties: {} }, run: async () => { const pools = await eu.find(STORES.pools, {}, 0); const by = (f) => { const m = {}; for (const p of pools) { const k = f(p); m[k] ||= { rounds: 0, gathered: 0, entries: 0, paid: 0 }; m[k].rounds++; m[k].gathered += p.gathered_cents || 0; m[k].entries += p.entries || 0; if (p.status === "paid") m[k].paid++; } for (const k in m) { m[k].avg_gathered_cents = Math.round(m[k].gathered / m[k].rounds); m[k].avg_entries = Math.round(m[k].entries / m[k].rounds); m[k].paid_share = +(m[k].paid / m[k].rounds).toFixed(2); delete m[k].gathered; delete m[k].entries; } return m; }; return { by_mechanism: by((p) => p.mechanism), by_category: by((p) => p.category) }; } },
  proofs_that_disagreed: { description: "Rounds whose proof did not recompute, or were voided.", input_schema: { type: "object", properties: {} }, run: async () => (await eu.find(STORES.pools, { status: "void" }, 0)).map((p) => ({ round_id: p._id, why: p.void_because })) },
  supplier_quotes: { description: "The supplier's published ladders: for each item, the price at 100 and at 400 backers, and when the quote lapses.", input_schema: { type: "object", properties: { limit: { type: "integer" } } }, run: async ({ limit = 20 }) => { const rows = await supplierLib.find(STORES.tiers, { version: 10, at_backers: { $in: [100, 400] } }, 0); const items = {}; for (const r of rows) { items[r.item] ||= { item: r.item, item_index: r.item_index, valid_until: r.valid_until }; items[r.item][`at_${r.at_backers}_cents`] = r.price_cents; } return Object.values(items).sort((a, b) => a.item_index - b.item_index).slice(0, limit); } },
  market_rules: { description: "What a market may run: which mechanisms are allowed there, what must be disclosed, what a round may be called.", input_schema: { type: "object", properties: { market: { type: "string" } }, required: ["market"] }, run: async ({ market }) => (await eu.find(STORES.jurisdictions, { market }, 0)).map((j) => ({ mechanism: j.mechanism, allowed: j.allowed, may_be_called: j.may_be_called, disclosures: j.disclosures })) },
  draft_round: { description: "Write the draft of the next round: mechanism, category, market, threshold in cents (for a threshold rule), window in seconds, title, and the rationale. A person opens it afterwards.", input_schema: { type: "object", properties: { mechanism: { type: "string" }, category: { type: "string" }, market: { type: "string" }, threshold_cents: { type: "integer" }, window_s: { type: "integer" }, title: { type: "string" }, rationale: { type: "string" } }, required: ["mechanism", "category", "market", "window_s", "title", "rationale"] }, run: async (d) => {
    const rules = (await eu.find(STORES.rules, { family: d.mechanism }, 0)).sort((a, b) => b.version - a.version || (a.rule_id < b.rule_id ? -1 : 1)); const rule = rules[0]; if (!rule) return { error: `no rule of family ${d.mechanism}` };
    const [j] = await eu.find(STORES.jurisdictions, { market: d.market, $or: [{ mechanism: d.mechanism }, { also_covers: d.mechanism }] }, 1); if (!j?.allowed) return { error: `${d.market} does not allow ${d.mechanism}` };
    const id = `r-draft-${Date.now().toString(36)}`;
    const pool = { _id: id, round_id: id, title: d.title, category: d.category, market: d.market, rule_id: rule.rule_id, rule_version: rule.version, mechanism: d.mechanism, status: "drafted", window_s: d.window_s, threshold_cents: d.threshold_cents || rule.params.threshold_cents || null, gathered_cents: 0, matched_cents: 0, entries: 0, ideas: ["threshold", "weighted_random_draw", "dutch_auction"].includes(d.mechanism) ? [] : ["a tool library", "a repair café", "a community fridge", "a rehearsal room"], band: null, cold: false, opened_by: "the agent's draft", rationale: d.rationale, drafted_at: now(), updated_at: now() };
    await eu.put(STORES.pools, pool); return { drafted: id, rule: `${rule.rule_id}@${rule.version}` }; } },
};
// Without a key: the same tools, under a rule. The mechanism with the best paid share in a category the crowd backs most, in a market that allows it.
async function byRule(market, category) {
  const rates = await TOOLS.fill_rates.run({}); const rules = await TOOLS.market_rules.run({ market });
  const allowed = new Set(rules.filter((r) => r.allowed).map((r) => r.mechanism).concat(rules.some((r) => r.mechanism === "threshold" && r.allowed) ? ["first_past_the_post"] : []));
  const best = Object.entries(rates.by_mechanism).filter(([m]) => allowed.has(m)).sort((a, b) => b[1].paid_share - a[1].paid_share || b[1].avg_gathered_cents - a[1].avg_gathered_cents)[0];
  const cat = category || Object.entries(rates.by_category).sort((a, b) => b[1].avg_entries - a[1].avg_entries)[0][0];
  const quotes = await TOOLS.supplier_quotes.run({ limit: 5 });
  const threshold = Math.round((best[1].avg_gathered_cents * 1.1) / 1000) * 1000;
  return TOOLS.draft_round.run({ mechanism: best[0], category: cat, market, threshold_cents: threshold, window_s: 120, title: `${quotes[0]?.item || "the next thing"} for ${cat}, in ${market}`, rationale: `${best[0]} paid out in ${Math.round(best[1].paid_share * 100)}% of ${best[1].rounds} rounds and gathered ${best[1].avg_gathered_cents} on average; ${cat} draws the most entries (${rates.by_category[cat].avg_entries} a round); ${market} allows it (${MARKET_KIND(market)}); threshold set 10% above the average gathered.` });
}
// With a key: Claude over the Messages API, the tools above as its tools.
async function byClaude(market, category) {
  const model = process.env.ROUND_AGENT_MODEL || "claude-sonnet-5";
  const tools = Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, input_schema: t.input_schema }));
  const messages = [{ role: "user", content: `You are the round agent of a gamified crowdfunding platform. Read the last hundred rounds, the fill rates, the supplier quotes and the market rules for ${market}${category ? ` (category ${category})` : ""}, then draft the next round with draft_round: choose the mechanism the evidence supports (the draw only where the market allows it), a threshold if the rule has one, a window in seconds (60 to 300 for this demo), a title and a rationale in two sentences. Draft exactly one round, then stop and say what you drafted in one paragraph.` }];
  for (let turn = 0; turn < 8; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, max_tokens: 1500, tools, messages }) });
    const msg = await res.json(); if (msg.error) throw new Error(msg.error.message);
    messages.push({ role: "assistant", content: msg.content });
    const uses = msg.content.filter((c) => c.type === "tool_use");
    for (const c of msg.content) if (c.type === "text" && c.text.trim()) log(c.text.trim());
    if (!uses.length || msg.stop_reason === "end_turn") return;
    const results = [];
    for (const u of uses) { log(`tool ${u.name}(${JSON.stringify(u.input)})`); const out = await TOOLS[u.name].run(u.input); results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 12000) }); }
    messages.push({ role: "user", content: results });
  }
}
await ready(eu);
const market = opt("market", "IE"), category = opt("category", null);
if (process.env.ANTHROPIC_API_KEY) { log(`drafting with ${process.env.ROUND_AGENT_MODEL || "claude-sonnet-5"} over the Messages API, tools: ${Object.keys(TOOLS).join(", ")}`); await byClaude(market, category); }
else { log("no ANTHROPIC_API_KEY: drafting by rule with the same tools"); const r = await byRule(market, category); log(JSON.stringify(r)); }
const drafts = await eu.find(STORES.pools, { status: "drafted" }, 0);
for (const d of drafts.slice(-3)) log(`draft ${d._id}: ${d.mechanism} for ${d.category} in ${d.market}, window ${d.window_s} s${d.threshold_cents ? `, threshold ${d.threshold_cents}` : ""}. ${d.rationale}`);
log("a person opens it: the web app's Rounds page lists the drafts, or backer-app-and-web.mjs open-round");
