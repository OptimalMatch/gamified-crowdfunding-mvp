// Where the crowd decides it goes: the vote's stages as a watcher on the
// platform's node (the sheet's "watch the node do it"):
//
//   paid (the escrow has taken what was held), no address -> the vote opens on a published clock (anybody in the buy proposes)
//   a destination proposed   -> Price the freight and the split (the fulfilment lead's rule)
//   the clock                -> Rank them, weighted: ranked choice over the ballots, weighted by what each put in
//   the tally                -> Did it clear the bar? (quorum, else the default written when the buy opened)
//                            -> The tally becomes an address, a model and a custodian: the shipment and the split documents
//   the supplier ships       -> Book the truck; on the road; delivered (the carrier's proof of delivery)
import { fleet, ready, sleep, now, STORES } from "../lib/api.mjs";
import { sign, verify, docMessage, voteMessage, sha256 } from "../lib/crypto.mjs";
import { roleKey } from "../lib/keys.mjs";

const F = fleet(); const eu = F.platform.eu;
const EVERY = Number(process.env.PIPELINE_EVERY_MS || 2000);
const ROAD_MS = Number(process.env.ROAD_MS || 20000);
const fulfilmentKey = roleKey("fulfilment");
const CARRIERS = ["DPD", "An Post", "Fastway", "Pallex"];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Freight by kind and distance (a rule standing in for carrier quotes), and the cost to break the pallet up per model.
const SPLIT_FEES = { captain: 0, hub: 150, partner: 250, depot: 400 };
function priceFreight(d) {
  const far = /Galway|Cork|Limerick|Sligo/.test(d.address || "") ? 2.4 : 1;
  const base = { school: 9000, shelter: 8500, "repair-cafe": 8000, member: 12000, hub: 6000 }[d.kind] || 10000;
  return Math.round(base * far);
}
async function openVote(buy) {
  const closes = new Date(Date.now() + (buy.vote_window_s || 45) * 1000).toISOString();
  await eu.update(STORES.buys, { _id: buy._id }, { $set: { status: "voting", vote_opens_at: now(), vote_closes_at: closes, updated_at: now() } });
  log(`${buy._id}: the order is placed and has no address; the vote is open until ${closes} (quorum ${Math.round((buy.quorum || 0) * 100)}% of ${buy.count} backers, default ${buy.default_destination?.name})`);
}
async function priceProposals(buy) {
  for (const d of await eu.find(STORES.destinations, { buy_id: buy._id, freight_cents: { $exists: false } }, 0)) {
    const freight = priceFreight(d); const fee = SPLIT_FEES[d.split_model] ?? 250; const units = buy.units || buy.ladder?.[0]?.units || 1;
    await eu.update(STORES.destinations, { _id: d._id }, { $set: { freight_cents: freight, split_fee_per_share_cents: fee, split_cents: fee * units, on_ballot_cents: freight + fee * units, priced_at: now(), priced_by: "the fulfilment lead" } });
    log(`${buy._id}: ${d.name} (${d.kind}) priced: freight ${freight}, split by ${d.split_model} ${fee}/share = ${fee * units}; on the ballot`);
  }
}
// Instant runoff over ranked ballots, weighted by what each backer put in.
export function tally(ballots, candidates) {
  const alive = new Set(candidates); const rounds = [];
  while (alive.size > 1) {
    const t = {}; for (const c of alive) t[c] = 0;
    for (const b of ballots) { const first = b.ranks.find((r) => alive.has(r)); if (first) t[first] += b.weight; }
    rounds.push({ ...t });
    const total = Object.values(t).reduce((a, x) => a + x, 0);
    const sorted = Object.entries(t).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    if (sorted[0][1] * 2 > total) return { winner: sorted[0][0], rounds };
    alive.delete(sorted[sorted.length - 1][0]);
  }
  return { winner: [...alive][0] || null, rounds };
}
async function closeVote(buy) {
  const dests = await eu.find(STORES.destinations, { buy_id: buy._id }, 0);
  const votes = await eu.find(STORES.votes, { buy_id: buy._id }, 0);
  const members = new Map((await eu.find(STORES.commitments, { buy_id: buy._id }, 0)).map((c) => [c.backer_id, c]));
  const ballots = [];
  for (const v of votes) { const m = members.get(v.backer_id); if (!m) continue; if (!verify(m.device_public_key, voteMessage(v), v.signature)) continue; ballots.push({ ranks: v.ranks, weight: m.put_cents * m.units }); }
  const quorumMet = members.size > 0 && ballots.length / members.size >= (buy.quorum || 0) && dests.length > 0;
  let winner = null, rounds = [];
  if (quorumMet) ({ winner, rounds } = tally(ballots, dests.map((d) => d.destination_id)));
  const chosen = winner ? dests.find((d) => d.destination_id === winner) : null;
  const dest = chosen || { kind: buy.default_destination?.kind || "hub", name: buy.default_destination?.name || "the default", address: buy.default_destination?.address || "Unit 4, Manor St, Dublin 7", split_model: "hub", destination_id: null, freight_cents: 6000, split_fee_per_share_cents: 150 };
  const custodian = dest.split_model === "captain" ? dest.proposed_by : dest.split_model === "depot" ? "our depot" : dest.split_model === "partner" ? "the fulfilment partner" : dest.name;
  const t = { _id: `tally:${buy._id}`, buy_id: buy._id, voters: ballots.length, members: members.size, weight_cents: ballots.reduce((a, b) => a + b.weight, 0), quorum: buy.quorum || 0, quorum_met: quorumMet, rounds, winner, fell_to_default: !chosen, destination_id: dest.destination_id, destination: { kind: dest.kind, name: dest.name }, address: dest.address, split_model: dest.split_model, custodian, freight_cents: dest.freight_cents, split_fee_per_share_cents: dest.split_fee_per_share_cents, closed_at: now(), signed_by: "fulfilment" };
  t.signature = sign(fulfilmentKey.privateKey, docMessage(t));
  await eu.put(STORES.tallies, t);
  log(`${buy._id}: ${ballots.length} of ${members.size} voted (${quorumMet ? "quorum met" : "short of quorum: the default address"}); ${rounds.length} runoff round(s); it goes to ${dest.name}, ${dest.address}, split by ${dest.split_model}, ${custodian} holding it`);
  // The tally becomes an address and a model: the shipment and the split documents.
  const order = await eu.get1(STORES.orders, `po-${buy._id}`);
  const units = order?.units || buy.units || 1;
  await eu.put(STORES.shipments, { _id: `sh-${buy._id}`, shipment_id: `sh-${buy._id}`, order_id: order?._id || null, buy_id: buy._id, destination_id: dest.destination_id, address: dest.address, destination: { kind: dest.kind, name: dest.name }, tally_id: t._id, carrier: null, booked_at: null, left_dock_at: null, delivered_at: null, pod_photo_hash: null, custodian, handovers: [], status: "addressed" });
  await eu.put(STORES.splits, { _id: `split:${buy._id}`, split_id: `split:${buy._id}`, buy_id: buy._id, model: dest.split_model, fee_per_share_cents: dest.split_fee_per_share_cents, custodian, shares_total: units, shares_handed: 0, chosen_at: t.closed_at, chosen_by: chosen ? "the vote" : "the default written when the buy opened" });
  await eu.update(STORES.buys, { _id: buy._id }, { $set: { status: "addressed", address: dest.address, custodian, split_model: dest.split_model, voted_at: now(), updated_at: now() } });
  if (order) await eu.update(STORES.orders, { _id: order._id }, { $set: { address: dest.address } });
  try { await F.platform.supplier.update(STORES.supplierOrders, { _id: `po-${buy._id}` }, { $set: { address: dest.address, consignee: custodian } }); } catch {}
}
async function bookAndDeliver() {
  for (const sh of await eu.find(STORES.shipments, { status: "addressed" }, 0)) {
    const order = await eu.get1(STORES.orders, sh.order_id); if (!order?.left_dock_at) continue;
    const carrier = CARRIERS[sha256(sh._id).charCodeAt(0) % CARRIERS.length];
    await eu.update(STORES.shipments, { _id: sh._id }, { $set: { carrier, booked_at: now(), left_dock_at: order.left_dock_at, units: order.shipped_units, status: "on-the-road" } });
    await eu.update(STORES.buys, { _id: sh.buy_id }, { $set: { status: "shipped", updated_at: now() } });
    log(`${sh.buy_id}: truck booked with ${carrier} to ${sh.address}; ${order.shipped_units} units on the road`);
  }
  for (const sh of await eu.find(STORES.shipments, { status: "on-the-road" }, 0)) {
    if (Date.now() - Date.parse(sh.booked_at) < ROAD_MS) continue;
    const pod = { shipment_id: sh._id, share: 0, from: sh.carrier, to: sh.custodian, photo_hash: sha256(`pod|${sh._id}|${sh.booked_at}`), at: now() };
    pod.signature = sign(fulfilmentKey.privateKey, docMessage(pod));
    await eu.update(STORES.shipments, { _id: sh._id }, { $set: { delivered_at: now(), pod_photo_hash: pod.photo_hash, status: "delivered" }, $push: { handovers: pod } });
    await eu.update(STORES.buys, { _id: sh.buy_id }, { $set: { status: "delivered", delivered_at: now(), updated_at: now() } });
    log(`${sh.buy_id}: delivered to ${sh.address}; ${sh.custodian} signed for it with a photograph; shares hand over from here`);
  }
}
async function main() {
  await ready(eu);
  log("vote pipeline: watching group_buys, destinations and votes on", eu.name);
  for (;;) {
    try {
      for (const b of await eu.find(STORES.buys, { status: "paid" }, 0)) if (!b.address) await openVote(b);
      for (const b of await eu.find(STORES.buys, { status: "voting" }, 0)) { await priceProposals(b); if (Date.parse(b.vote_closes_at) <= Date.now()) await closeVote(b); }
      await bookAndDeliver();
    } catch (e) { log("pass failed:", e.message.slice(0, 200)); }
    await sleep(EVERY);
  }
}
if (process.argv[1] && process.argv[1].endsWith("vote-pipeline.mjs")) main();
