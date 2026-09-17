# Checks

One file per check in the MVP sheet, section 6. Turn each into a test; the build is done when `./checks/run.sh` passes.

1. backers, wallets and standing: count equals what was seeded plus what the script wrote
2. standing contributions: count equals what was seeded plus what the script wrote
3. pools, one per round: count equals what was seeded plus what the script wrote
4. pledges, signed: count equals what was seeded plus what the script wrote
5. allocation rules: count equals what was seeded plus what the script wrote
6. sealed commitments and roots: count equals what was seeded plus what the script wrote
7. draws and their proofs: count equals what was seeded plus what the script wrote
8. group buys: count equals what was seeded plus what the script wrote
9. tier_published: count equals what was seeded plus what the script wrote
10. commitments, counted: count equals what was seeded plus what the script wrote
11. purchase orders: count equals what was seeded plus what the script wrote
12. destinations proposed: count equals what was seeded plus what the script wrote
13. shipments: count equals what was seeded plus what the script wrote
14. how the pallet is broken up: count equals what was seeded plus what the script wrote
15. rules by jurisdiction: count equals what was seeded plus what the script wrote
16. the money ledger: count equals what was seeded plus what the script wrote
17. disputes and appeals: count equals what was seeded plus what the script wrote
18. after Seal the seed and the rule: sealed commitments and roots before any entry
19. after Publish the proof, then pay: draws and their proofs everything to redo it
20. after Publish the proof, then pay: metric1 measured per round
21. after Four thousand join at once: commitments, counted every join adds
22. after Place the order: purchase orders at the tier reached
23. after Take what was held: metric1 measured per buy
24. after Rank them, weighted: The crowd decides where ranked and weighted
25. after The tally becomes an address and a model: shipments the address it chose
26. after Custody, share by share: metric1 measured per buy
27. Every draw recomputes to the same answer: independent recomputations that agree within 100 in 100, over the script's run
