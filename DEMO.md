# The demo

The MVP sheet's section 5, corrected by what was built. Everything runs on
one machine with docker-compose; the engine's release archive is fetched
from the OptimalMatch/peer-to-peer-db releases (`bin/fetch-engine.sh`).

## Bring it up

```bash
cp .env.example .env                      # pin the release; the demo secrets
bin/fetch-engine.sh                       # the engine archive, never in git
docker compose up -d --build platform sponsor-acme supplier-northlight regulator closed-rounds-and-proofs metabase
docker compose run --rm -e SEED_SCHEMA_ONLY=1 seed   # one document per store, so the stores exist
bin/declare-stores.sh                     # counters, per-field merges and indexes, on the platform's node, before any value lands
docker compose run --rm seed              # 20 stores, 1,000 documents each, 10,000 tier rows, every history round a real one
docker compose up -d                      # the watchers, the escrow, the supplier's and the sponsor's sims, the verifier, the web app
docker compose run --rm tools node bin/metabase.mjs   # the dashboards
```

Or all of it, with the three processes and the checks: `bin/demo-up.sh`.

Where things are from the host: the platform's node on 17600 (platform-eu,
where the crowd's stores live), 17601 (the sponsor's shared library) and
17602 (the supplier's); the sponsor's own node on 17610, the supplier's on
17620, the regulator's on 17630. Each is a web UI and an HTTP API. The
backer app and web is on **http://127.0.0.1:18180**. Metabase is on 13200
(demo@example.com, Demo-only-1234); the PostgreSQL wire on 15533, user
`demo`; MinIO's console on 19101 (demo / demo-only-change-me).

`A` below is `docker compose run --rm backer-app-and-web-sim`. Every step
the sheet marks "watch the node do it" is one of the three watchers;
`docker compose logs -f round-pipeline group-buy-pipeline vote-pipeline
escrow-and-payouts-sim` shows them all.

## 1. A round, and a draw anybody can recheck

| step | who | what to run | then look at |
|---|---|---|---|
| The agent drafts the next round | Round agent over MCP | `docker compose run --rm round-agent-over-mcp-sim --market IE` | the draft on the web app's Rounds page, with its rationale; `pools` on http://127.0.0.1:17600, status `drafted` |
| 1. A round is opened | the operator | `A open-round --mechanism weighted_random_draw --market IE --window 90`, or **Open it** on the Rounds page (a draft, or a fresh one) | `pools`: status `opening`; the round's page |
| 2. May this market run it? | the node | `docker compose logs round-pipeline` | `rules_by_jurisdiction` for IE: a prize draw, allowed with disclosures; the round's page says what it may be called. Open one with `--market US` to see it refused and never shown |
| 3. Seal the seed and the rule | the round | the same log: "sealed … before any entry" | `sealed_commitments`, `<round>:seal`: the hash of the seed and the rule by version, signed, and no entries yet |
| 4. Pledges arrive | the crowd | `A pledges-arrive --n 60`, and **Pledge** on the round's page as any backer | `pledges`: each signed by its backer's device; the round's page fills |
| 5. Standing weights them | the platform | the round pipeline's log: "root … over N entries (N weighted)" | a pledge's `weight` and `multiplier`, from the backer's streak and tier; your weight as a number on My wallet. Standing contributions raise theirs on their paydays (every 45 s) under the mandate's signature, up to the ceiling |
| The tree grows, and is anchored | the round | the same log | `sealed_commitments`, kind `root`: the root republished as the crowd grows; the round's page lists them. **Check my receipt** on the page walks your path to the root |
| The sponsor matches | the sponsor's node | `docker compose logs sponsor-sim` | `sponsor_matches` on the sponsor's library (17610); the sponsor's page shows only totals and categories |
| 6. Close, and hash the entries | the round | the log at the clock: "closed with N entries, hash …" | `sealed_commitments`, kind `close`: the entry set's hash and root; the list cannot grow after this |
| 7. Take the beacon, reveal the seed | the draw pipeline | the same log: "beacon drand-mainnet round …" | kind `reveal`: the seed, which hashes with the rule to the seal. A mismatch voids the round |
| 8. Run the frozen rule | the draw pipeline | the same log | `allocation_rules`, the rule by version the seal named |
| 9. Publish the proof, then pay | the round, then escrow | `docker compose logs escrow-and-payouts-sim`: "proof recomputes; N ledger entries" | `draws`: everything needed to redo it. `money_ledger`: hold, release, payout, refund, in sequence, signed, all after the proof. The wallets on My wallet |
| check | anyone | `docker compose run --rm tools node sims/verify-it-yourself.mjs`, and **Recompute the draw yourself** on the round's page | every draw recomputes from the regulator's own copy; the receipt check in the browser |
| Anything argued | the panel | `A dispute --claim draw`, or **Argue it** on the round's page | `disputes`: argued against the proof and the ledger entries by id; the panel's answer is a slide: "the proof recomputes to the published result" |

## 2. Four thousand people buy one thing

| step | who | what to run | then look at |
|---|---|---|---|
| 1. A window opens | the schedule | `A open-window --item 21 --close-on tier --close-tier 3200 --window 240 --vote-window 120`, or **Open it** on Buying together | `group_buys`: the item, both closing rules, the default destination and the quorum, all written before it opens; then the buy pipeline copies the supplier's signed ladder onto it |
| 2. Four thousand join at once | the crowd | `A four-thousand-join-at-once --n 4000` (1,000 backers and 3,000 newcomers, 200 phones in flight), and **Join** on the buy's page | `commitments_counted`: the counter climbing on the buy's page; `commitments`: one signed receipt per join |
| 3. Hold each commitment | the escrow | the escrow's log: "held N commitment(s)" | `money_ledger`, kind `hold`; nothing is taken while the price moves |
| 4. Read the published tier | the buy | `docker compose logs group-buy-pipeline`: "tier 1600 reached: 2400 units at …" | `tier_published` on the supplier's node (17620): the ladder, signed, with its validity; the buy's page highlights the step reached |
| 5. Close on the clock, or on the tier? | the window | the same log: "closed on the tier (3200 reached)" | `group_buys`: `closed_because`; a join after the close is turned away by the app and refunded in full by the escrow |
| 6. Place the order | the platform | the same log: "ordered 4800 x … at … (tier 3200, quote v10)" | `purchase_orders`: the tier reached, the supplier's signed quote row by signature; the same document on the supplier's library |
| 7. Take what was held | the escrow | the escrow's log: "took … at … each, refunded … the way it came, paid supplier-northlight …" | `money_ledger`: `take` per commitment at the final price, `refund` of the difference, `payout` to the supplier; My wallet shows what you paid and what came back |
| 8. The supplier reads its own order | the supplier | `docker compose logs supplier-sim` | `purchase_orders` on the supplier's node: `supplier_ack_at`, then `shipped_units` and `left_dock_at`; the platform's copy picks them up (the buy's page, "the supplier's copy") |
| 9. Refund the difference | the escrow | step 7's log line | the `refund` entries; everybody pays the price the whole crowd earned |

## 3. Where the crowd decides it goes

| step | who | what to run | then look at |
|---|---|---|---|
| 1. The order is placed | the group buy | nothing: process 2 placed it without an address | `purchase_orders`: `address: null`; `docker compose logs vote-pipeline`: "the vote is open until …" |
| 2. Anybody proposes one | a backer in the buy | `A anybody-proposes-one --n 4 --voters 300`, or **Propose** on the buy's page | `destinations_proposed`: a school, a shelter, a repair café, a member's garage, each with a reason |
| 3. Price the freight and the split | the fulfilment lead | the vote pipeline's log: "priced: freight …, split by … /share" | each destination's `freight_cents`, `split_fee_per_share_cents` and `on_ballot_cents`; the ballot on the buy's page |
| 4. Rank them, weighted | the crowd | the same command cast 300 ballots; **Cast my ballot** on the buy's page | `destination_votes`: ranks, signed by the device; the weight is what the backer put in |
| 5. Did it clear the bar? | the vote pipeline | the log at the clock: "N of M voted (quorum met)" or "short of quorum: the default address" | `destination_tallies`: voters, weight, the runoff rounds, `quorum_met`, `fell_to_default` |
| 6. The tally becomes an address and a model | the vote pipeline | the same log line | `shipments`: the address it chose; `pallet_splits`: the model, its fee per share, the custodian. The buy's page, "Where it went" |
| 7. Book the truck | the fulfilment lead | the log, once the supplier's goods left the dock: "truck booked with …" | `shipments`: carrier, `booked_at`, `left_dock_at`; then `delivered_at` and the carrier's proof of delivery, a signed handover with a photograph |
| 8. Custody, share by share | the captain, the hub or our depot | `A custody-share-by-share --n 25`, or **Take my share** on the buy's page | `shipments.handovers`: each a signed write with a photo hash; `pallet_splits.shares_handed` |
| 9. Anything argued is argued on the record | the panel | `A dispute --claim short`, or **Argue it** on the buy's page | `disputes`: argued against the order, the tally and the shipment by id |
| Closed rounds and proofs | the platform | `docker compose run --rm tools node bin/archive.mjs` | the `round-history` bucket on http://127.0.0.1:19101: one bundle per paid round with its proof, its entries, its ledger and its shipments |

## The checks

```bash
docker compose run --rm tools node checks/run.mjs
```

Twenty-seven checks, one per line of the MVP sheet's section 6: seventeen
counts (what was seeded plus what the script wrote), nine reads after a
step, and every draw recomputing from the regulator's copy.

## Slides

Steps the design leaves to a person or proposes for an agent without a
card, shown as the slides they would be:

- **The panel's answer.** A dispute is answered against the proof and the
  signed ledger: "the proof recomputes to the published result", "the
  shipment document shows the count both sides signed", "the tally is on
  the record with every ballot's weight". The seed's history has a
  thousand of them answered; the live ones stay open.
- **Referrals.** A referral pays wallet credit, never entries, and vests on
  the newcomer's first completed round, capped per referrer per season. My
  wallet shows the credit; the vesting is a rule the escrow would run.
- **The cold tier.** After a year a round's entries leave the hot store
  for the bucket; the round's page says so and the verifier reads the
  bundle.
