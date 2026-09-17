# Build "Gamified crowdfunding: a draw anybody can recompute, and a crowd that ships" for real

This is the second prompt: the deployment `BUILD-SHEET.md` describes, after the MVP in `CLAUDE.md` works. Read `CLAUDE.md` first for the engine and the rules; they apply here too.

The differences from the MVP: every node runs on its own host at the counts in the sheet, libraries are joined by invite link through a rendezvous where the sheet says so, keys are issued and kept per party, and the sources are the real systems. Build it from the sheet's sections in order: 10 (environment), 1 (nodes), 2 (libraries), 3 (stores), 4 (jobs), 5 (applications), 6 (sources), then 8 and 11 (the processes and their rules) with 9 as the map of what runs where.

Ask these once before starting:
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
