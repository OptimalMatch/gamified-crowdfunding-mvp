// The stores of the build sheet, section 3, with their fields and who sets
// each one, and the engine declarations each needs: an additive counter
// where the design says "additive counters on the count", a per-field merge
// where it says "merge field-level", nothing where it says "append only"
// (a document that is written once and never updated needs no policy).
// bin/declare-stores.sh reads this list; DECISIONS.md explains the choices.
import { STORES } from "./api.mjs";
export const DECLARATIONS = [
  // store, merge policy, counter fields, indexes
  { store: STORES.backers, merge: "field", counters: ["wallet_cents", "referral_credit_cents"], indexes: ["market", "tier"] },
  { store: STORES.standing, merge: "field", counters: [], indexes: ["backer_id", "cadence"] },
  { store: STORES.pools, merge: "field", counters: ["gathered_cents", "entries"], indexes: ["market", "closes_at", "status"] },
  { store: STORES.pledges, merge: "field", counters: [], indexes: ["round_id", "backer_id"] },
  { store: STORES.rules, merge: "field", counters: [], indexes: ["rule_id", "family"] },
  { store: STORES.sealed, merge: "none", counters: [], indexes: ["round_id", "sealed_at"] },
  { store: STORES.draws, merge: "none", counters: [], indexes: ["round_id"] },
  { store: STORES.buys, merge: "field", counters: [], indexes: ["item", "window_opens_at", "status"] },
  { store: STORES.tiers, merge: "field", counters: [], indexes: ["supplier_id", "item", "version"] },
  { store: STORES.commitments, merge: "field", counters: [], indexes: ["buy_id", "backer_id"] },
  { store: STORES.counts, merge: "field", counters: ["count", "units", "held_cents"], indexes: ["item"] },
  { store: STORES.orders, merge: "field", counters: [], indexes: ["buy_id", "supplier_id"] },
  { store: STORES.destinations, merge: "field", counters: [], indexes: ["buy_id"] },
  { store: STORES.votes, merge: "field", counters: [], indexes: ["buy_id"] },
  { store: STORES.tallies, merge: "field", counters: [], indexes: ["buy_id"] },
  { store: STORES.shipments, merge: "field", counters: [], indexes: ["order_id", "buy_id"] },
  { store: STORES.splits, merge: "field", counters: ["shares_handed"], indexes: ["buy_id"] },
  { store: STORES.jurisdictions, merge: "field", counters: [], indexes: ["market", "mechanism"] },
  { store: STORES.ledger, merge: "none", counters: [], indexes: ["round_id", "buy_id", "sequence"] },
  { store: STORES.disputes, merge: "field", counters: [], indexes: ["round_id", "buy_id", "status"] },
  { store: STORES.keys, merge: "field", counters: [], indexes: ["holder"] },
];
if (process.argv[1] && process.argv[1].endsWith("stores.mjs")) {
  // Print the shell lines bin/declare-stores.sh runs inside the platform's container.
  for (const d of DECLARATIONS) {
    if (d.counters.length) console.log(`unidatum doc counter ${d.store} ${d.counters.join(" ")}`);
    else if (d.merge === "field") console.log(`unidatum doc merge ${d.store}`);
    for (const i of d.indexes) console.log(`unidatum doc index ${d.store} ${i}`);
  }
}
