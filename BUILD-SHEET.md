```
BUILD SHEET: Gamified crowdfunding: a draw anybody can recompute, and a crowd that ships

1. Nodes
  - A library per sponsor: nodes about 900 sponsors, sites their marketing and CSR teams, library one shared with the platform (A company that will match what the crowd raises, cover a shortfall, subsidise a tier or pay the distribution. Its terms, its cap and what it may see live in a library it shares with the platform alone.)
      holds: the sponsor's terms (Document collection), documents one per sponsor, per season, merge field-level: sponsor, platform, indexes sponsor unique; season
      holds: what a sponsor may see (Document collection), documents one per sponsor, merge field-level: legal, the sponsor, indexes sponsor unique
  - A library per supplier: nodes about 3,000 suppliers, sites their systems and their docks, library one shared with the platform (Each supplier joins a library shared with the platform alone, holding its tiers, the orders placed against them and what it shipped. One document per order that both sides write to.)

2. Libraries
  (name them inside each node: open the card and add a Library joined)

3. Stores
  - backers, wallets and standing: documents about 6 million, merge field-level: the backer, the platform, indexes backer unique; market, tier (Who is in, what they hold in the wallet, which market they pledge from, and the streaks and tiers the game awarded them. The market matters: what a round may do differs by country.)
      the wallet, set by the backer, and escrow
      which market they are in, set by residency, at signup
      streaks and tiers, set by the game, on every pledge
      signed with: A referral pays in credit, by default
      signed with: It vests on what the newcomer does
      signed with: Your odds are a number you can read
  - standing contributions: documents about 2 million, merge field-level: the backer, the bank, indexes mandate unique; backer, cadence (Ten pounds after every payday, into a category or a cause, until a date or until stopped. Signed once with its cadence and its ceiling, so a pledge that fires while the backer is asleep still traces to a signature they made.)
      how much, how often, set by the backer, once
      what it backs, set by the backer
      the ceiling, set by the backer, and the market
      until when, set by the backer
      the signature, set by the backer's own device
      signed with: The mandate is signed, and the pledges refer to it
      signed with: A ceiling, because of the draw
      signed with: Stopping it is one write
      signed with: A payday that did not land
  - pools, one per round: documents about 50,000 rounds, merge field-level: every pledge, indexes round unique; market, closes (The money a round has gathered and the rule it will be allocated under, both written before pledging opens. The rule cannot move once the first pledge lands, which is what makes the round a promise.)
      the mechanism, frozen, set by the round, at opening
      what it has gathered, set by every pledge and match
      which band that reaches, set by the scenario grid
      signed with: The ballot is fixed when it opens
  - pledges, signed: documents about 90 million a year, merge field-level: the backer, indexes pledge unique; round, backer (One document per pledge, signed by the backer's own device, carrying its place in the entry tree and the path to the root. Joining at minute one and minute fifty-nine leave the same kind of receipt.)
  - allocation rules: documents about 40 kinds, merge field-level: legal, the designer, indexes rule unique; market (Threshold, first past the post, ranked choice, quadratic, dutch auction, and the weighted random draw. Each is a document with its parameters, chosen when the round opens and frozen the moment it does.)
      signed with: A grid of odds, and never of winners
      signed with: Joining can widen the round
      signed with: The mechanism is data
  - sealed commitments and roots: documents one per round, then hourly, merge append only, per round, indexes round unique; sealed at (A hash of the seed and the rule before pledging opens, then the entry tree's root republished as the crowd grows. The first says the draw existed beforehand; the rest say when each entry joined it.)
      the hash of the seed, set by the round, before opening
      the rule, by version, set by the round
      when it was sealed, set by the write itself
      the seed itself, set by the draw, afterwards
      signed with: Commit first, reveal after
      signed with: The tree grows, and is anchored as it does
      signed with: The rule is frozen with it
  - draws and their proofs: documents about 50,000 a year, merge append only, per draw, indexes draw unique; round (The seed revealed, the beacon value, the entry tree's root, the rule by version and the result. Everything a stranger needs to run the draw again, and everything a backer needs to prove their own entry was in it.)
  - group buys: documents about 30,000 a year, merge field-level: the crowd, the buyer, indexes buy unique; item, window (A thing the crowd wants at a price that only exists in quantity. The buy holds the item, the window, the tiers and how close the count is to the next break.)
  - tier_published: rows about 2 million, partitioned by supplier, item, cadence before each window (The ladder, agreed with the supplier before the crowd forms: at each size, how many units and at what price each. Signed, with a validity window, so a buy opens on a number somebody already stood behind.)
      at this many backers, set by the negotiation
      this many units, set by the negotiation
      at this price each, set by the supplier
      valid until, set by the supplier
      the supplier's signature, set by the supplier's own node
      signed with: Negotiated before the crowd exists
      signed with: Crowd size to units, and the units can outrun it
      signed with: The same shape as the scenario grid
      signed with: A ladder that expires
  - commitments, counted: documents about 30,000 counts, merge additive counters on the count, indexes buy unique; item (How many are committed right now. Four thousand people join in the same minute when a window opens, and an additive counter takes all of it without any of them waiting behind the others.)
      how many are committed, set by every backer who joins
      which tier that reaches, set by tier_published
      what each has put in, set by the pledge
      signed with: Four thousand in the same minute
      signed with: The tier is reached, not granted
  - purchase orders: documents about 30,000 a year, merge field-level: platform, supplier, indexes order unique; buy, supplier (When the window closes the system places the order itself, at the tier the count actually reached, against the quote the supplier published. No haggling after the fact, because the price was a published version.)
  - destinations proposed: documents about 200,000 a year, merge field-level: whoever proposed, indexes destination unique; buy (Where the crowd could send it: a school, a shelter, a repair café, a member's address, a hub for onward split. Anybody in the buy may propose one, with a reason and a cost to reach it.)
  - shipments: documents about 30,000 a year, merge field-level: carrier, receiver, indexes shipment unique; order (What left the supplier, on whose truck, to the address the vote chose, and who signed for it. A photograph at the door closes the round for everybody who paid into it.)
  - how the pallet is broken up: documents about 30,000 a year, merge field-level: the crowd, the captain, indexes split unique; buy (One drop and the crowd sorts it, a hub people collect from, or the platform breaking bulk and posting every share for a fee. The model is chosen with the destination, priced beside it, and names who is holding the goods.)
      signed with: The model is on the ballot, priced
      signed with: Somebody is always holding it
      signed with: Our fee is a line, not a margin
  - rules by jurisdiction: documents about 200, merge field-level: legal, per market, indexes market unique; mechanism (A paid entry into a random allocation is a lottery in many countries and regulated in most of the rest. This says which mechanisms a market may run, what has to be disclosed and what a round may call itself.)
      which mechanisms are allowed, set by legal, per market
      what must be disclosed, set by legal
      what it may be called, set by legal
      who may enter, set by legal
      signed with: A paid random draw is a lottery
      signed with: The gate is on opening
  - the money ledger: documents about 200 million a year, merge append only, per entry, indexes entry unique; round, sequence (Every pledge, hold, release, payout and refund, in sequence and signed. The same shape a regulator asks for, and the thing a backer's own statement is rendered from.)
      what moved, set by the escrow
      in what order, set by the write
      signed by, set by the node that wrote it
      signed with: A statement is a rendering
  - disputes and appeals: documents about 20,000 a year, merge field-level: backer, the panel, indexes dispute unique; round (Somebody says the draw was wrong, the goods were short, or the destination vote was gamed. Each is answered against the published proof and the signed ledger rather than against a memory.)

4. Jobs
  - Run the allocation (Takes the frozen rule, the sealed seed, the beacon's public value and every entry as it stood at close, and produces the allocation. Deterministic: the same inputs give the same answer to anyone who runs it.)
      1. Close the entries
      2. Take the beacon's value
      3. Reveal the seed
      4. Run the frozen rule
      5. Publish the proof
  - The crowd decides where (Ranked choice over the proposed destinations, weighted by what each backer put in, closing on a published clock. The result is a document, not a thread, and the freight cost of each option is on the ballot.)
      1. Anybody in the buy proposes
      2. Price the freight to each
      3. Rank them, weighted
      4. It becomes an address

5. Applications
  - Backer app and web: language Kotlin, Swift, TypeScript, api the region's node, users about 6 million backers (Browse the round, pledge, watch the counter climb, vote on where it ships, and afterwards recompute the draw yourself from the numbers the round published.)
  - Verify it yourself: language TypeScript, and a CLI, api the proof, and your receipt, users anyone, including a regulator (Two checks, both open source. Recompute the whole allocation from the published proof, and check your own receipt's path against the root to prove your entry was in the set that was drawn.)
  - Escrow and payouts: language Go, beside the region node, api banks and card networks, users backers and 3,000 suppliers (Holds every pledge from the moment it is made until the round resolves, then pays the supplier, refunds what was left over, and does neither until the draw's proof is published.)
      signs with: Money moves after the proof
      signs with: Refunds go back the way they came
  - Round dashboards: tool Power BI, wire PostgreSQL wire, mode distributed SQL (Fill rates by mechanism, how a weighted draw actually distributed against how it was meant to, which categories attract the crowd, and how long a group buy takes to reach its next tier.)
  - Round agent over MCP: agent Claude Code, tools rounds, proofs, suppliers, transport MCP (Reads the last hundred rounds, the fill rates and the supplier quotes, and drafts the next round: the mechanism, the threshold and the window. A person opens it, because opening is a commitment.)

6. Sources, storage and places
  - Closed rounds and proofs: bucket round-history, size tens of terabytes, tier cold after a year (Every closed round with its proof, its ledger and its shipment, landed as parquet and attached as a store, so a draw from four years ago can still be recomputed by anybody who cares to.)

7. How it flows
  1. Round agent over MCP -> allocation rules: drafts the next round
  1. allocation rules -> pools, one per round: the mechanism, frozen
  1. rules by jurisdiction -> allocation rules: what this market may run
  2. pools, one per round -> sealed commitments and roots: seal the seed first
  3. Backer app and web -> pledges, signed: somebody backs it
  3. standing contributions -> pledges, signed: raises one each payday
  3. standing contributions -> Escrow and payouts: collected on the cadence
  3. pledges, signed -> pools, one per round: into the round
  3. A library per sponsor -> pools, one per round: matched, capped, disclosed
  4. pools, one per round -> Run the allocation: at close
  4. sealed commitments and roots -> Run the allocation: the seed, revealed
  4. The randomness beacon -> Run the allocation: a value nobody picked
  5. Run the allocation -> draws and their proofs: everything needed to redo it
  6. draws and their proofs -> Verify it yourself: anyone can recompute
  6. draws and their proofs -> Escrow and payouts: money moves after the proof
  7. Run the allocation -> group buys: a funded thing to buy
  7. When a window opens and closes -> group buys: when it closes
  7. A library per supplier -> group buys: the ladder, agreed first
  8. group buys -> purchase orders: the order, at the tier reached
  8. purchase orders -> A library per supplier: into their library
  9. group buys -> destinations proposed: where could it go
  9. destinations proposed -> The crowd decides where: ranked, and weighted
  9. how the pallet is broken up -> The crowd decides where: priced onto the same ballot
  10. The crowd decides where -> shipments: the address it chose
  10. purchase orders -> shipments: what left the dock
  10. shipments -> Carriers and freight: booked on a truck
  10. how the pallet is broken up -> shipments: one drop, or many
  11. Escrow and payouts -> purchase orders: pays the supplier
  11. Escrow and payouts -> the money ledger: every movement, signed
  11. how the pallet is broken up -> Escrow and payouts: the fee, if we do it
  11. A library per sponsor -> Escrow and payouts: the match, held like any pledge

8. Processes
  - A round, and a draw anybody can recheck: owner the round integrity lead, cases about 50,000 rounds a year, cycle time a week, then seconds (Open it: a mechanism chosen and frozen, a seed sealed before anybody may pledge, entries gathering for a week, a public beacon nobody could pick, a deterministic draw, and a proof published before a penny moves.)
      - A round is opened (Event): source the operator, or the agent's draft, rate about 50,000 a year, carries mechanism, threshold, clock [runs on pools, one per round, allocation rules]
      - Every draw recomputes to the same answer (Service level): measure independent recomputations that agree, target 100 in 100, on a miss the round is void, and says so [runs on draws and their proofs, Verify it yourself]
      - May this market run it? (Decision gate): rule the jurisdiction's own document, approver the law collection, at opening, limit a forbidden mechanism is never shown [runs on rules by jurisdiction, allocation rules, Backer app and web] (A paid random draw is a lottery in many countries. The gate is at opening, so a backer in a market that forbids it never sees the round at all.)
      - Seal the seed and the rule (Stage): who the round, system sealed commitments, touch time before opening [runs on sealed commitments and roots, pools, one per round] (A hash of the seed and the rule by version, signed and published. The numbers behind the draw now exist and nobody has seen an entry.)
      - Pledges arrive (Stage): who the crowd, system pledges, signed per device, touch time a week [runs on pledges, signed, backers, wallets and standing, Backer app and web] (Each names the round, the amount and the idea it favours, and each is signed by the backer's own device.)
      - Standing weights them (Stage): who the platform, system streaks, tiers, multipliers, touch time on every pledge [runs on backers, wallets and standing, pledges, signed] (Awards are writes on the backer, so the weight an entry carries is a number a backer can read rather than a feeling the interface gives them.)
      - Close, and hash the entries (Stage): who the round, system the entry set, touch time on the clock [runs on pools, one per round, pledges, signed, Run the allocation] (The set is hashed at close and the hash goes into the proof, so the list cannot grow afterwards.)
      - Take the beacon, reveal the seed (Stage): who the draw pipeline, system the beacon, the commitment, touch time seconds [runs on The randomness beacon, sealed commitments and roots, Run the allocation] (A public value that appeared after the close, mixed with a seed checked against the hash published before opening. A mismatch voids the round.)
      - Run the frozen rule (Stage): who the draw pipeline, system the rule, by version, touch time seconds [runs on Run the allocation, allocation rules] (Deterministic over the hashed entry set. The same inputs give the same allocation on anybody's laptop.)
      - Publish the proof, then pay (Stage): who the round, then escrow, system proofs, then the ledger, touch time instant [runs on draws and their proofs, Verify it yourself, Escrow and payouts, the money ledger] (Seed, beacon, entry hash, rule version and result. The escrow reads the proof before it moves a penny, which is the ordering the whole guarantee rests on.)
        1. A round is opened -> May this market run it?: opened
        2. May this market run it? -> Seal the seed and the rule: allowed here
        3. Seal the seed and the rule -> Pledges arrive: sealed
        4. Pledges arrive -> Standing weights them: pledged
        5. Standing weights them -> Close, and hash the entries: weighted
        6. Close, and hash the entries -> Take the beacon, reveal the seed: closed
        7. Take the beacon, reveal the seed -> Run the frozen rule: revealed
        8. Run the frozen rule -> Publish the proof, then pay: drawn
  - Four thousand people buy one thing: owner the group buy lead, cases about 30,000 buys a year, cycle time minutes to a fortnight (Open it: a window opening on a published clock, four thousand commitments landing in the same minute onto an additive counter, a tier the supplier itself published being reached, and the system placing the order at the price the count actually earned.)
      - A window opens (Event): source the schedule, announced, rate about 30,000 a year, carries item, tiers, clock [runs on When a window opens and closes, group buys]
      - Four thousand join at once (Stage): who the crowd, system an additive counter, touch time the same minute [runs on commitments, counted, group buys, Backer app and web] (The most concurrent moment the platform has. Every join adds and none of them waits behind another, which is the shape a flash sale breaks on elsewhere.)
      - Hold each commitment (Stage): who the escrow, system wallets and cards, touch time per join [runs on Escrow and payouts, pledges, signed, the money ledger] (Held rather than taken, because the price is still moving while the count climbs.)
      - Read the published tier (Stage): who the buy, system tier_published, touch time as the count moves [runs on tier_published, A library per supplier, commitments, counted] (Price by quantity, published by the supplier as a signed commit with its own start and end. What the crowd is quoted is the supplier's own number.)
      - Close on the clock, or on the tier? (Decision gate): rule whichever the window declared, approver the schedule, published, limit a window that is quietly extended is voi [runs on When a window opens and closes, group buys] (Both kinds are written before the window opens, because a deadline that can move while people are deciding is not a deadline.)
      - Place the order (Stage): who the platform, system purchase orders, touch time at close [runs on purchase orders, A library per supplier, tier_published] (At the tier the count actually reached, against the quote the supplier published. Nothing is renegotiated afterwards, because the price was a version.)
      - Take what was held (Stage): who the escrow, system holds, at the final tier, touch time instant [runs on Escrow and payouts, the money ledger, pledges, signed] (Everybody pays the price the whole crowd earned, which is usually below what they agreed to pay when they joined.)
      - The supplier reads its own order (Stage): who the supplier, system its shared library, touch time on the next sync [runs on A library per supplier, purchase orders] (One document per order that both sides write to, so a short shipment is a field they agree on rather than two systems disagreeing.)
      - Refund the difference (Stage): who the escrow, system back the way it came, touch time minutes [runs on Escrow and payouts, the money ledger, pledges, signed]
        1. A window opens -> Four thousand join at once: opened
        2. Four thousand join at once -> Hold each commitment: joined
        3. Four thousand join at once -> Read the published tier: the count climbs
        4. Read the published tier -> Close on the clock, or on the tier?: a tier is reached
        5. Close on the clock, or on the tier? -> Place the order: closed
        6. Place the order -> Take what was held: ordered
        7. Take what was held -> The supplier reads its own order: paid
        7. Take what was held -> Refund the difference: overpaid
  - Where the crowd decides it goes: owner the fulfilment lead, cases about 30,000 buys a year, cycle time a few days (Open it: anybody in the buy proposing a destination with a reason, the freight and the distribution model priced onto the ballot beside it, a ranked vote weighted by what people put in, and a tally that becomes an address, a way of breaking the pallet up and a named person holding it.)
      - The order is placed (Event): source the group buy, rate about 30,000 a year, carries a pallet, and no address yet [runs on purchase orders, group buys]
      - Anybody proposes one (Stage): who a backer in the buy, system destinations proposed, touch time while the window runs [runs on destinations proposed, Backer app and web, backers, wallets and standing] (A school, a shelter, a repair café, a member's address, a hub to split from. With a reason attached, because the reason is what the vote is actually about.)
      - Price the freight and the split (Stage): who the fulfilment lead, system carrier quotes, and the models, touch time per destination [runs on Carriers and freight, destinations proposed, how the pallet is broken up] (Each option carries what it costs to reach and what it costs to break up: one drop with a captain, a hub with a collection window, or our depot picking and posting every share for a fee.)
      - Rank them, weighted (Stage): who the crowd, system ranked choice, touch time on a published clock [runs on The crowd decides where, destinations proposed, backers, wallets and standing] (Weighted by what each backer put in, closing on a clock published when the vote opened.)
      - Did it clear the bar? (Decision gate): rule a quorum of the buy's backers, approver the vote pipeline, limit short of quorum, the default address [runs on The crowd decides where, group buys] (A default written when the buy opened catches the case where the crowd stops paying attention, so a pallet is never sitting in a warehouse waiting for a thread to conclude.)
      - The tally becomes an address and a model (Stage): who the vote pipeline, system shipments, and the split, touch time instant [runs on shipments, The crowd decides where, how the pallet is broken up] (The result carries the tally, the destination, how the pallet is to be broken up and who takes custody when it lands, so a year later why it went there is read rather than remembered.)
      - Book the truck (Stage): who the fulfilment lead, system carriers and freight, touch time the same day [runs on Carriers and freight, shipments]
      - Custody, share by share (Stage): who the captain, the hub or our depot, system the split document, touch time as each is handed over [runs on how the pallet is broken up, shipments, Backer app and web] (Each handover is a signed write with a photograph, so the gap between the carrier's proof of delivery and a backer holding their share is covered. For a crowd that never meets, that is the only ending there is.)
      - Anything argued is argued on the record (Stage): who the panel, system disputes, against the proof, touch time when raised [runs on disputes and appeals, Closed rounds and proofs, The crowd decides where] (The tally, the freight quotes and the signed ledger are all still there, so an appeal is answered from documents.)
        1. The order is placed -> Anybody proposes one: needs an address
        2. Anybody proposes one -> Price the freight and the split: proposed
        3. Price the freight and the split -> Rank them, weighted: on the ballot
        4. Rank them, weighted -> Did it clear the bar?: voted
        5. Did it clear the bar? -> The tally becomes an address and a model: carried
        6. The tally becomes an address and a model -> Book the truck: an address
        7. Book the truck -> Custody, share by share: on the road
        8. Custody, share by share -> Anything argued is argued on the record: if anybody objects
  - What a draw must publish, and where it may run (Policy): sets the boundary of a round, owned by the integrity lead, and legal, version signed per market, per mechanism [runs on sealed commitments and roots, draws and their proofs, rules by jurisdiction, Escrow and payouts, Verify it yourself] (A round seals a hash of its seed and the rule by version before pledging opens, and publishes the seed, the beacon value, the hashed entry set, the rule version and the result when it closes. Escrow reads that proof before it moves money. Which mechanisms a market may run, what has to be disclosed and who may enter are documents per jurisdiction, read when a round is created, so a backer is never)
  - Every draw recomputes to the same answer (Process measure): formula independent recomputations that agree, target 100 in 100, cadence every round, by anyone [runs on draws and their proofs, Verify it yourself, Run the allocation, sealed commitments and roots, disputes and appeals] (A weighted lottery that only its operator can evaluate asks the crowd for trust. One a stranger can rerun on a laptop from the published proof asks for arithmetic instead, and arithmetic is a much smaller thing to ask of somebody who has just put money in.)

  Where agents help
    24 steps say who does them: 6 a person; 18 a rule, automatic
    - A round, and a draw anybody can recheck: May this market run it?, a rule, automatic [runs on rules by jurisdiction, allocation rules, Backer app and web]
    - A round, and a draw anybody can recheck: Seal the seed and the rule, a rule, automatic [runs on sealed commitments and roots, pools, one per round]
    - A round, and a draw anybody can recheck: Standing weights them, a rule, automatic [runs on backers, wallets and standing, pledges, signed]
    - A round, and a draw anybody can recheck: Close, and hash the entries, a rule, automatic [runs on pools, one per round, pledges, signed, Run the allocation]
    - A round, and a draw anybody can recheck: Take the beacon, reveal the seed, a rule, automatic [runs on The randomness beacon, sealed commitments and roots, Run the allocation]
    - A round, and a draw anybody can recheck: Run the frozen rule, a rule, automatic [runs on Run the allocation, allocation rules]
    - A round, and a draw anybody can recheck: Publish the proof, then pay, a rule, automatic [runs on draws and their proofs, Verify it yourself, Escrow and payouts, the money ledger]
    - Four thousand people buy one thing: Hold each commitment, a rule, automatic [runs on Escrow and payouts, pledges, signed, the money ledger]
    - Four thousand people buy one thing: Read the published tier, a rule, automatic [runs on tier_published, A library per supplier, commitments, counted]
    - Four thousand people buy one thing: Close on the clock, or on the tier?, a rule, automatic [runs on When a window opens and closes, group buys]
    - Four thousand people buy one thing: Place the order, a rule, automatic [runs on purchase orders, A library per supplier, tier_published]
    - Four thousand people buy one thing: Take what was held, a rule, automatic [runs on Escrow and payouts, the money ledger, pledges, signed]
    - Four thousand people buy one thing: The supplier reads its own order, a rule, automatic [runs on A library per supplier, purchase orders]
    - Four thousand people buy one thing: Refund the difference, a rule, automatic [runs on Escrow and payouts, the money ledger, pledges, signed]
    - Where the crowd decides it goes: Price the freight and the split, a rule, automatic [runs on Carriers and freight, destinations proposed, how the pallet is broken up]
    - Where the crowd decides it goes: Did it clear the bar?, a rule, automatic [runs on The crowd decides where, group buys]
    - Where the crowd decides it goes: The tally becomes an address and a model, a rule, automatic [runs on shipments, The crowd decides where, how the pallet is broken up]
    - Where the crowd decides it goes: Book the truck, a rule, automatic [runs on Carriers and freight, shipments]

9. Architecture by process
  26 of 30 cards carry a process step
  - Backer app and web (Application): May this market run it? (A round, and a draw anybody can recheck); Pledges arrive (A round, and a draw anybody can recheck); Four thousand people buy one thing (Process); Four thousand join at once (Four thousand people buy one thing); Where the crowd decides it goes (Process); Anybody proposes one (Where the crowd decides it goes); Custody, share by share (Where the crowd decides it goes)
  - backers, wallets and standing (Document collection): Pledges arrive (A round, and a draw anybody can recheck); Standing weights them (A round, and a draw anybody can recheck); Where the crowd decides it goes (Process); Anybody proposes one (Where the crowd decides it goes); Rank them, weighted (Where the crowd decides it goes)
  - pools, one per round (Document collection): A round, and a draw anybody can recheck (Process); A round is opened (A round, and a draw anybody can recheck); Seal the seed and the rule (A round, and a draw anybody can recheck); Close, and hash the entries (A round, and a draw anybody can recheck)
  - pledges, signed (Document collection): A round, and a draw anybody can recheck (Process); Pledges arrive (A round, and a draw anybody can recheck); Standing weights them (A round, and a draw anybody can recheck); Close, and hash the entries (A round, and a draw anybody can recheck); Four thousand people buy one thing (Process); Hold each commitment (Four thousand people buy one thing); Take what was held (Four thousand people buy one thing); Refund the difference (Four thousand people buy one thing)
  - allocation rules (Document collection): A round, and a draw anybody can recheck (Process); A round is opened (A round, and a draw anybody can recheck); May this market run it? (A round, and a draw anybody can recheck); Run the frozen rule (A round, and a draw anybody can recheck)
  - sealed commitments and roots (Document collection): What a draw must publish, and where it may run (Process); A round, and a draw anybody can recheck (Process); Seal the seed and the rule (A round, and a draw anybody can recheck), writes before any entry; Take the beacon, reveal the seed (A round, and a draw anybody can recheck); Every draw recomputes to the same answer (Process)
  - Run the allocation (Pipeline): A round, and a draw anybody can recheck (Process); Close, and hash the entries (A round, and a draw anybody can recheck); Take the beacon, reveal the seed (A round, and a draw anybody can recheck); Run the frozen rule (A round, and a draw anybody can recheck); Every draw recomputes to the same answer (Process)
  - The randomness beacon (Subsystem): A round, and a draw anybody can recheck (Process); Take the beacon, reveal the seed (A round, and a draw anybody can recheck)
  - draws and their proofs (Document collection): What a draw must publish, and where it may run (Process); A round, and a draw anybody can recheck (Process); Publish the proof, then pay (A round, and a draw anybody can recheck), writes everything to redo it; Every draw recomputes to the same answer (A round, and a draw anybody can recheck); Every draw recomputes to the same answer (Process)
  - Verify it yourself (Application): What a draw must publish, and where it may run (Process); A round, and a draw anybody can recheck (Process); Publish the proof, then pay (A round, and a draw anybody can recheck); Every draw recomputes to the same answer (A round, and a draw anybody can recheck); Every draw recomputes to the same answer (Process)
  - group buys (Document collection): Four thousand people buy one thing (Process); A window opens (Four thousand people buy one thing); Four thousand join at once (Four thousand people buy one thing); Close on the clock, or on the tier? (Four thousand people buy one thing); The order is placed (Where the crowd decides it goes); Did it clear the bar? (Where the crowd decides it goes)
  - tier_published (SQL table): Four thousand people buy one thing (Process); Read the published tier (Four thousand people buy one thing); Place the order (Four thousand people buy one thing)
  - commitments, counted (Document collection): Four thousand people buy one thing (Process); Four thousand join at once (Four thousand people buy one thing), writes every join adds; Read the published tier (Four thousand people buy one thing)
  - When a window opens and closes (Schedule): Four thousand people buy one thing (Process); A window opens (Four thousand people buy one thing); Close on the clock, or on the tier? (Four thousand people buy one thing)
  - A library per supplier (Node fleet): Four thousand people buy one thing (Process); Read the published tier (Four thousand people buy one thing); Place the order (Four thousand people buy one thing); The supplier reads its own order (Four thousand people buy one thing)
  - purchase orders (Document collection): Four thousand people buy one thing (Process); Place the order (Four thousand people buy one thing), writes at the tier reached; The supplier reads its own order (Four thousand people buy one thing); Where the crowd decides it goes (Process); The order is placed (Where the crowd decides it goes)
  - destinations proposed (Document collection): Where the crowd decides it goes (Process); Anybody proposes one (Where the crowd decides it goes); Price the freight and the split (Where the crowd decides it goes); Rank them, weighted (Where the crowd decides it goes)
  - The crowd decides where (Pipeline): Where the crowd decides it goes (Process); Rank them, weighted (Where the crowd decides it goes), writes ranked and weighted; Did it clear the bar? (Where the crowd decides it goes); The tally becomes an address and a model (Where the crowd decides it goes); Anything argued is argued on the record (Where the crowd decides it goes)
  - shipments (Document collection): Where the crowd decides it goes (Process); The tally becomes an address and a model (Where the crowd decides it goes), writes the address it chose; Book the truck (Where the crowd decides it goes); Custody, share by share (Where the crowd decides it goes)
  - Carriers and freight (Subsystem): Where the crowd decides it goes (Process); Price the freight and the split (Where the crowd decides it goes); Book the truck (Where the crowd decides it goes)
  - Escrow and payouts (Application): What a draw must publish, and where it may run (Process); A round, and a draw anybody can recheck (Process); Publish the proof, then pay (A round, and a draw anybody can recheck); Four thousand people buy one thing (Process); Hold each commitment (Four thousand people buy one thing); Take what was held (Four thousand people buy one thing); Refund the difference (Four thousand people buy one thing); Where the crowd decides it goes (Process)
  - how the pallet is broken up (Document collection): Where the crowd decides it goes (Process); Price the freight and the split (Where the crowd decides it goes); The tally becomes an address and a model (Where the crowd decides it goes); Custody, share by share (Where the crowd decides it goes)
  - rules by jurisdiction (Document collection): What a draw must publish, and where it may run (Process); A round, and a draw anybody can recheck (Process); May this market run it? (A round, and a draw anybody can recheck)
  - the money ledger (Document collection): Publish the proof, then pay (A round, and a draw anybody can recheck); Four thousand people buy one thing (Process); Hold each commitment (Four thousand people buy one thing); Take what was held (Four thousand people buy one thing); Refund the difference (Four thousand people buy one thing)
  - disputes and appeals (Document collection): Where the crowd decides it goes (Process); Anything argued is argued on the record (Where the crowd decides it goes); Every draw recomputes to the same answer (Process)
  - Closed rounds and proofs (S3 / object store): Anything argued is argued on the record (Where the crowd decides it goes)
  No process step runs on: standing contributions, A library per sponsor, Round dashboards, Round agent over MCP

10. Build environment
  Install: unidatum (the engine, one per host); unidatum-sqld (the PostgreSQL wire wire for the dashboards)
  Keys:
    - A referral pays in credit, by default
    - It vests on what the newcomer does
    - Your odds are a number you can read
    - The mandate is signed, and the pledges refer to it
    - A ceiling, because of the draw
    - Stopping it is one write
    - A payday that did not land
    - The ballot is fixed when it opens
    - Sponsor money changes what is on offer, never who wins
    - A sponsored round says so, before the pledge
    - The match is held like any pledge
    - A grid of odds, and never of winners
    - Joining can widen the round
    - The mechanism is data
    - Commit first, reveal after
    - The tree grows, and is anchored as it does
    - The rule is frozen with it
    - A whole-set hash proves the wrong thing
    - Each entry carries its own path
    - Deterministic is the whole product
    - Negotiated before the crowd exists
    - Crowd size to units, and the units can outrun it
    - The same shape as the scenario grid
    - A ladder that expires
    - Four thousand in the same minute
    - The tier is reached, not granted
    - A decision, rather than a thread
    - Money moves after the proof
    - Refunds go back the way they came
    - The model is on the ballot, priced
    - Somebody is always holding it
    - Our fee is a line, not a margin
    - A paid random draw is a lottery
    - The gate is on opening
    - A statement is a rendering
  Sources and storage to have in place:
    - Closed rounds and proofs (S3 / object store): bucket round-history, size tens of terabytes, tier cold after a year
  Scale to generate test data for:
    - backers, wallets and standing: about 6 million documents
    - standing contributions: about 2 million documents
    - pools, one per round: about 50,000 rounds documents
    - pledges, signed: about 90 million a year documents
    - allocation rules: about 40 kinds documents
    - sealed commitments and roots: one per round, then hourly documents
    - Run the allocation: about 50,000 rounds a year
    - draws and their proofs: about 50,000 a year documents
    - group buys: about 30,000 a year documents
    - tier_published: about 2 million rows
    - commitments, counted: about 30,000 counts documents
    - purchase orders: about 30,000 a year documents
    - destinations proposed: about 200,000 a year documents
    - The crowd decides where: about 30,000 buys a year
    - shipments: about 30,000 a year documents
    - how the pallet is broken up: about 30,000 a year documents
    - rules by jurisdiction: about 200 documents
    - the money ledger: about 200 million a year documents
    - disputes and appeals: about 20,000 a year documents

11. Rules and where they run
  Policy What a draw must publish, and where it may run: sets the boundary of a round, owned by the integrity lead, and legal, version signed per market, per mechanism [held in sealed commitments and roots, draws and their proofs, rules by jurisdiction, Escrow and payouts, Verify it yourself]
  - A round, and a draw anybody can recheck: May this market run it?, a rule, automatic (rule: the jurisdiction's own document; approver: the law collection, at opening; limit: a forbidden mechanism is never shown) [reads What a draw must publish, and where it may run] -> a watcher on the node that holds rules by jurisdiction
  - A round, and a draw anybody can recheck: Seal the seed and the rule, a rule, automatic -> a watcher on the node that holds sealed commitments and roots
  - A round, and a draw anybody can recheck: Standing weights them, a rule, automatic -> a watcher on the node that holds backers, wallets and standing
  - A round, and a draw anybody can recheck: Close, and hash the entries, a rule, automatic -> a pipeline or watcher on Run the allocation
  - A round, and a draw anybody can recheck: Take the beacon, reveal the seed, a rule, automatic -> a pipeline or watcher on Run the allocation
  - A round, and a draw anybody can recheck: Run the frozen rule, a rule, automatic -> a pipeline or watcher on Run the allocation
  - A round, and a draw anybody can recheck: Publish the proof, then pay, a rule, automatic -> a watcher on the node that holds draws and their proofs
  - Four thousand people buy one thing: Hold each commitment, a rule, automatic [reads What a draw must publish, and where it may run] -> a watcher on the node that holds pledges, signed
  - Four thousand people buy one thing: Read the published tier, a rule, automatic -> a pipeline or watcher on A library per supplier
  - Four thousand people buy one thing: Close on the clock, or on the tier?, a rule, automatic (rule: whichever the window declared; approver: the schedule, published; limit: a window that is quietly extended is voi) -> a watcher on the node that holds group buys
  - Four thousand people buy one thing: Place the order, a rule, automatic -> a pipeline or watcher on A library per supplier
  - Four thousand people buy one thing: Take what was held, a rule, automatic -> a watcher on the node that holds the money ledger
  - Four thousand people buy one thing: The supplier reads its own order, a rule, automatic -> a pipeline or watcher on A library per supplier
  - Four thousand people buy one thing: Refund the difference, a rule, automatic -> a watcher on the node that holds the money ledger
  - Where the crowd decides it goes: Price the freight and the split, a rule, automatic -> a watcher on the node that holds destinations proposed
  - Where the crowd decides it goes: Did it clear the bar?, a rule, automatic (rule: a quorum of the buy's backers; approver: the vote pipeline; limit: short of quorum, the default address) -> a pipeline or watcher on The crowd decides where
  - Where the crowd decides it goes: The tally becomes an address and a model, a rule, automatic -> a pipeline or watcher on The crowd decides where
  - Where the crowd decides it goes: Book the truck, a rule, automatic -> a watcher on the node that holds shipments

Still to decide
  - A library per sponsor: which libraries it joins
  - A library per sponsor: host machine and storage
  - A library per supplier: which libraries it joins
  - A library per supplier: host machine and storage
  - pledges, signed: its fields
  - allocation rules: its fields
  - draws and their proofs: its fields
  - group buys: its fields
  - purchase orders: its fields
  - destinations proposed: its fields
  - shipments: its fields
  - how the pallet is broken up: its fields
  - disputes and appeals: its fields
  - Backer app and web: the calls it makes
  - Verify it yourself: the calls it makes
  - Escrow and payouts: the calls it makes
  - Round dashboards: the calls it makes
  - Round agent over MCP: the calls it makes
  - the host machine for every node
  - the engine version to pin, and where the binaries and data directories live on each host
  - how each key is generated, stored and rotated
```
