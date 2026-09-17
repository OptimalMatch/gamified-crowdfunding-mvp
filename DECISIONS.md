# Decisions

The kit's prompt says to ask the MVP sheet's open questions once before
starting. These are the answers this build runs on, and why.

1. **Release: v2.372.0**, the newest in the OptimalMatch/peer-to-peer-db
   releases. `bin/fetch-engine.sh` downloads the archive with the GitHub
   CLI and checks its SHA-256; the Dockerfile copies it at build time. The
   archive and the binaries are never in git (`.gitignore`). Pinned in
   `.env` as `UNIDATUM_VERSION=v2.372.0`.
2. **Ports.** Inside a container each node keeps the engine's own layout:
   sync port 47800, DHT 47801, HTTP API 7480 for the first library; 47810,
   47811, 7481 for the second; 47820, 47821, 7482 for the third. `DHT_PORT`
   in the sheet is therefore 47801. Host ports start at 17600 because
   another demo on this machine holds 17480 to 17541: platform 17600 to
   17602, sponsor 17610, supplier 17620, regulator 17630, the SQL wire
   15533, Metabase 13200, MinIO 19100 and 19101, the web app 18180.
3. **One node per library.** The engine runs one node process per library,
   so the platform's container runs three: `platform-eu` (the region
   node's own library, where the crowd's stores live), `sponsor-acme-shared`
   and `supplier-northlight-shared`. The sponsor's and the supplier's
   containers run one each, on the library they share with the platform
   alone. The regulator's container is a second node of `platform-eu`, so
   "Verify it yourself" recomputes from its own copy. One sponsor and one
   supplier stand for the 900 and 3,000 of the design.
4. **Discovery.** No rendezvous and no public DHT on one machine: every
   node starts with `--no-mdns --rendezvous off` and a `--bootstrap` at the
   first member of its library, and the entrypoint runs one `unidatum
   sync` to that member after start so the peer is known from the first
   minute (then every 5 s).
5. **Scale** as the sheet says: 1,000 documents per store, 10,000 tier
   rows. Where a store's count had to mean something: allocation rules are
   40 kinds with 25 versions each (the rule by version is what a round
   freezes); rules by jurisdiction are 200 markets with 5 mechanism
   documents each, first past the post sharing the threshold document
   (neither is a random allocation, so neither is regulated anywhere);
   every round in the history is a real one with its seal, its entry tree,
   its draw and a proof that recomputes; the last 200 rounds keep their
   pledges in the hot store and the rest are marked cold, with their
   entries in the round-history bucket.
6. **Simulators in Node.js**, not Kotlin, TypeScript and Go as the sheet's
   application facts say. The demo needs one runtime the seed, the
   simulators, the checks and the web server can share, and the engine's
   HTTP API needs nothing beyond `fetch`. The calls are exactly the build
   sheet's, in flow order; a Kotlin, Swift or Go client would make the
   same calls. "Verify it yourself" is plain JavaScript that runs unchanged
   in Node and in the browser.
7. **The node's jobs as watchers.** The sheet says "watch the node do it
   (a pipeline or watcher)". The engine's pipelines are DuckDB steps over
   documents and cannot hash a tree, sign a document or fetch a beacon,
   so the round, the buy and the vote are three watchers over the
   platform's node (`sims/*-pipeline.mjs`), one pass every 2 s. The
   engine's pipeline daemon still runs on the platform's node for
   curation.
8. **The fields the sheet left undrawn** (its questions 3 to 11) are in
   `seed/seed.mjs`, one comment per store, and in `lib/stores.mjs` with
   the declaration each store needs. The ones that matter most: a pledge
   carries its `entry_index`, `leaf_hash`, `tree_path` and `root_at_entry`;
   a proof carries `seed`, `seed_hash`, `beacon`, `entry_root`,
   `entries_hash`, `entry_count`, `rule_id`, `rule_version`, `match_cents`
   and `result`; a group buy carries the `ladder` it opened on, its
   `close_on` rule and `close_tier`, and the `default_destination` and
   `quorum` written before the window opens.
9. **Merge policies as the sheet lists them.** An additive counter where
   the sheet says additive counters (the commitment count and units, the
   pool's gathered total and entry count, the wallet, the shares handed),
   a per-field merge where it says merge field-level, nothing where it
   says append only (a document written once). Declared by the engine's
   CLI after the seed (`bin/declare-stores.sh`), because a collection must
   exist before it is declared.
10. **The beacon is drand.** The League of Entropy's mainnet, 30 s rounds,
    the first round that appeared after the close. When drand is
    unreachable the proof carries a fallback derived from the close time
    and the entry root and says so in `beacon.source`: not unpredictable,
    and never silent about it.
11. **The node's door.** Every caller on one machine is one private
    address (the web app's container, the simulators, the host through the
    docker gateway), and the engine bans an address that holds more than
    64 connections or opens more than 120 a minute. The entrypoint writes
    an access policy that allow-lists the private ranges (which lifts the
    rate limit) and raises the connection cap to 4,096.
12. **The browser is the phone.** The web app picks a backer, and the web
    server signs as that backer's device with a key derived from one demo
    secret (`DEMO_KEY_SEED`) and the backer's id, the same derivation the
    seed and the simulators use, so nothing needs a key store. A real
    phone keeps its key in its keystore and the server never sees it. The
    recompute and the receipt check run in the browser regardless.
13. **Agents.** The design has an agent card (Round agent over MCP), so it
    is built: with `ANTHROPIC_API_KEY` in `.env` it drafts with Claude
    over the Messages API using the build sheet's calls as tools; without
    a key the same tools run under a rule, so the demo needs no key. The
    model and the key stay in `.env`, out of the compose file. Steps the
    process view marks proposed and unowned (fraud holds, the panel's
    answers) stay slides in `DEMO.md`.
14. **Windows in seconds.** A round's week is 90 to 120 s here, a buy's
    window 4 minutes, a vote 2 minutes, a payday 45 s, the road 20 s.
    Every clock is still published before it starts.
