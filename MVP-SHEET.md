```
MVP SHEET: Gamified crowdfunding: a draw anybody can recompute, and a crowd that ships, on one machine with docker-compose

The build sheet says what the system is. This says how to run a demo of it on one machine: one container per node role, the same libraries, stores, jobs and processes, seeded data, a script that walks the processes, and the checks that show it worked.

1. Services
  (no nodes on the board yet)
  - sqld (unidatum sql-serve --pg-port 5433): the PostgreSQL wire wire for the dashboards
  - metabase: the dashboards, on the wire, with the build sheet's queries made in advance
  - backer-app-and-web-sim (Backer app and web): a script in Kotlin that makes the calls in the build sheet, in flow order
  - verify-it-yourself-sim (Verify it yourself): a script in TypeScript that makes the calls in the build sheet, in flow order
  - escrow-and-payouts-sim (Escrow and payouts): a script in Go that makes the calls in the build sheet, in flow order
  - round-agent-over-mcp-sim (Round agent over MCP): Claude Code over MCP against the node, with the build sheet's calls as its tools
  - closed-rounds-and-proofs: minio as the bucket
  - seed: a one-shot container that loads the data in section 4, then exits

2. Scale for the demo
  - backers, wallets and standing: about 6 million in the design; 1,000 documents seeded
  - standing contributions: about 2 million in the design; 1,000 documents seeded
  - pools, one per round: about 50,000 rounds in the design; 1,000 documents seeded
  - pledges, signed: about 90 million a year in the design; 1,000 documents seeded
  - allocation rules: about 40 kinds in the design; 1,000 documents seeded
  - sealed commitments and roots: one per round, then hourly in the design; 1,000 documents seeded
  - draws and their proofs: about 50,000 a year in the design; 1,000 documents seeded
  - group buys: about 30,000 a year in the design; 1,000 documents seeded
  - tier_published: about 2 million in the design; 10,000 rows seeded
  - commitments, counted: about 30,000 counts in the design; 1,000 documents seeded
  - purchase orders: about 30,000 a year in the design; 1,000 documents seeded
  - destinations proposed: about 200,000 a year in the design; 1,000 documents seeded
  - shipments: about 30,000 a year in the design; 1,000 documents seeded
  - how the pallet is broken up: about 30,000 a year in the design; 1,000 documents seeded
  - rules by jurisdiction: about 200 in the design; 1,000 documents seeded
  - the money ledger: about 200 million a year in the design; 1,000 documents seeded
  - disputes and appeals: about 20,000 a year in the design; 1,000 documents seeded
  - Run the allocation: about 50,000 rounds a year in the design, replayed at 1/100 of that
  - The crowd decides where: about 30,000 buys a year in the design, replayed at 1/100 of that

3. Libraries
  (name them inside each node: open the card and add a Library joined)

4. Stores, keys and jobs
  As in the build sheet, sections 3 and 4: the fields, who sets them, the keys and the jobs are the same at this scale.
  Seed data, made by the seed container:
  - backers, wallets and standing: 1,000 documents with the wallet, which market they are in, streaks and tiers
  - standing contributions: 1,000 documents with how much, how often, what it backs, the ceiling, until when, the signature
  - pools, one per round: 1,000 documents with the mechanism, frozen, what it has gathered, which band that reaches
  - pledges, signed: 1,000 documents (fields not drawn yet)
  - allocation rules: 1,000 documents (fields not drawn yet)
  - sealed commitments and roots: 1,000 documents with the hash of the seed, the rule, by version, when it was sealed, the seed itself
  - draws and their proofs: 1,000 documents (fields not drawn yet)
  - group buys: 1,000 documents (fields not drawn yet)
  - tier_published: 10,000 rows with at this many backers, this many units, at this price each, valid until, the supplier's signature
  - commitments, counted: 1,000 documents with how many are committed, which tier that reaches, what each has put in
  - purchase orders: 1,000 documents (fields not drawn yet)
  - destinations proposed: 1,000 documents (fields not drawn yet)
  - shipments: 1,000 documents (fields not drawn yet)
  - how the pallet is broken up: 1,000 documents (fields not drawn yet)
  - rules by jurisdiction: 1,000 documents with which mechanisms are allowed, what must be disclosed, what it may be called, who may enter
  - the money ledger: 1,000 documents with what moved, in what order, signed by
  - disputes and appeals: 1,000 documents (fields not drawn yet)

5. Demo script
  A round, and a draw anybody can recheck
    1. A round is opened: seed one pools, one per round document; then look at pools, one per round
    2. May this market run it?: watch the node do it (a pipeline or watcher); then look at rules by jurisdiction
    3. Seal the seed and the rule (the round): watch the node do it (a pipeline or watcher); then look at sealed commitments and roots (before any entry)
    4. Pledges arrive (the crowd): run backer-app-and-web-sim pledges-arrive; then look at pledges, signed
    5. Standing weights them (the platform): watch the node do it (a pipeline or watcher); then look at backers, wallets and standing
    6. Close, and hash the entries (the round): watch the node do it (a pipeline or watcher); then look at pools, one per round
    7. Take the beacon, reveal the seed (the draw pipeline): watch the node do it (a pipeline or watcher); then look at sealed commitments and roots
    8. Run the frozen rule (the draw pipeline): watch the node do it (a pipeline or watcher); then look at allocation rules
    9. Publish the proof, then pay (the round, then escrow): watch the node do it (a pipeline or watcher); then look at draws and their proofs (everything to redo it), metric1 (measured per round)
    check: Every draw recomputes to the same answer, independent recomputations that agree within 100 in 100
  Four thousand people buy one thing
    1. A window opens: seed one group buys document; then look at group buys
    2. Four thousand join at once (the crowd): run backer-app-and-web-sim four-thousand-join-at-on; then look at commitments, counted (every join adds)
    3. Hold each commitment (the escrow): watch the node do it (a pipeline or watcher); then look at pledges, signed
    4. Read the published tier (the buy): watch A library per supplier do it (a pipeline or watcher); then look at tier_published
    5. Close on the clock, or on the tier?: watch the node do it (a pipeline or watcher); then look at group buys
    6. Place the order (the platform): watch A library per supplier do it (a pipeline or watcher); then look at purchase orders (at the tier reached)
    7. Take what was held (the escrow): watch the node do it (a pipeline or watcher); then look at metric1 (measured per buy)
    8. The supplier reads its own order (the supplier): watch A library per supplier do it (a pipeline or watcher); then look at purchase orders
    9. Refund the difference (the escrow): watch the node do it (a pipeline or watcher); then look at the money ledger
  Where the crowd decides it goes
    1. The order is placed: seed one purchase orders document; then look at purchase orders
    2. Anybody proposes one (a backer in the buy): run backer-app-and-web-sim anybody-proposes-one; then look at destinations proposed
    3. Price the freight and the split (the fulfilment lead): watch the node do it (a pipeline or watcher); then look at destinations proposed
    4. Rank them, weighted (the crowd): write destinations proposed by hand (curl); then look at The crowd decides where (ranked and weighted)
    5. Did it clear the bar?: watch the node do it (a pipeline or watcher); then look at group buys
    6. The tally becomes an address and a model (the vote pipeline): watch the node do it (a pipeline or watcher); then look at shipments (the address it chose)
    7. Book the truck (the fulfilment lead): watch the node do it (a pipeline or watcher); then look at shipments
    8. Custody, share by share (the captain, the hub or our depot): run backer-app-and-web-sim custody-share-by-share; then look at metric1 (measured per buy)
    9. Anything argued is argued on the record (the panel): write disputes and appeals by hand (curl); then look at disputes and appeals

6. Checks
  - backers, wallets and standing: count equals what was seeded plus what the script wrote
  - standing contributions: count equals what was seeded plus what the script wrote
  - pools, one per round: count equals what was seeded plus what the script wrote
  - pledges, signed: count equals what was seeded plus what the script wrote
  - allocation rules: count equals what was seeded plus what the script wrote
  - sealed commitments and roots: count equals what was seeded plus what the script wrote
  - draws and their proofs: count equals what was seeded plus what the script wrote
  - group buys: count equals what was seeded plus what the script wrote
  - tier_published: count equals what was seeded plus what the script wrote
  - commitments, counted: count equals what was seeded plus what the script wrote
  - purchase orders: count equals what was seeded plus what the script wrote
  - destinations proposed: count equals what was seeded plus what the script wrote
  - shipments: count equals what was seeded plus what the script wrote
  - how the pallet is broken up: count equals what was seeded plus what the script wrote
  - rules by jurisdiction: count equals what was seeded plus what the script wrote
  - the money ledger: count equals what was seeded plus what the script wrote
  - disputes and appeals: count equals what was seeded plus what the script wrote
  - after Seal the seed and the rule: sealed commitments and roots before any entry
  - after Publish the proof, then pay: draws and their proofs everything to redo it
  - after Publish the proof, then pay: metric1 measured per round
  - after Four thousand join at once: commitments, counted every join adds
  - after Place the order: purchase orders at the tier reached
  - after Take what was held: metric1 measured per buy
  - after Rank them, weighted: The crowd decides where ranked and weighted
  - after The tally becomes an address and a model: shipments the address it chose
  - after Custody, share by share: metric1 measured per buy
  - Every draw recomputes to the same answer: independent recomputations that agree within 100 in 100, over the script's run

7. docker-compose.yml (draft)
  services:
    metabase:
      image: metabase/metabase
      ports: ["3000:3000"]
      networks: [demo]
    closed-rounds-and-proofs:
      image: minio/minio
      networks: [demo]
    backer-app-and-web-sim:
      build: ./sims/backer-app-and-web
      depends_on: [node]
      networks: [demo]
    verify-it-yourself-sim:
      build: ./sims/verify-it-yourself
      depends_on: [node]
      networks: [demo]
    escrow-and-payouts-sim:
      build: ./sims/escrow-and-payouts
      depends_on: [node]
      networks: [demo]
    round-agent-over-mcp-sim:
      build: ./sims/round-agent-over-mcp
      depends_on: [node]
      networks: [demo]
    seed:
      build: ./seed
      depends_on: [node]
      networks: [demo]
  volumes:
  networks:
    demo: {}

Still to decide for the MVP
  - UNIDATUM_VERSION: the release to pin, and an image built from its linux-amd64 archive
  - DHT_PORT: the port the first node's DHT listens on
  - pledges, signed: its fields, for the seed
  - allocation rules: its fields, for the seed
  - draws and their proofs: its fields, for the seed
  - group buys: its fields, for the seed
  - purchase orders: its fields, for the seed
  - destinations proposed: its fields, for the seed
  - shipments: its fields, for the seed
  - how the pallet is broken up: its fields, for the seed
  - disputes and appeals: its fields, for the seed
  - the agent's model and key, kept out of the compose file
```
