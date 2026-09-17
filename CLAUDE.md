# Build the MVP of "Gamified crowdfunding: a draw anybody can recompute, and a crowd that ships"

You are building a working demo of a design made in the Unidatum Design studio. Everything you need is in this folder. Read this file, then `README.md`, then `MVP-SHEET.md` in full, then `design.json`. Keep `BUILD-SHEET.md` open for the fields, keys, jobs and calls; the MVP sheet points at it.

## The engine

Unidatum is a peer-to-peer data engine: one static binary per host, no runtime dependencies, no cloud. Nodes that share a library name find each other and sync a signed op log; on top sit MongoDB-style document collections (put, find, get, count, the full filter operator set, field-level merge), SQL tables over parquet queried with DuckDB across the peers, and files by merkle root. Each node serves an HTTP API on port 7480 (`/api/doc/find`, `/api/doc/put`, `/api/doc/get`, `/api/doc/count`, `/api/sql`, `/api/tables`, `/api/files`) and, with `--sql`, a PostgreSQL wire through `unidatum sql-serve`. Client libraries for twenty languages ship with it.

The release archive is in this folder: look for `unidatum-*-linux-*.tar.gz` or `.zip`. Unpack it first and read its `README.md` and `docs/` before writing any code; the CLI (`unidatum init --library <name> --node-name <name>`, `unidatum serve --port 7480 [--sql] [--bootstrap host:port] [--no-mdns]`, `unidatum invite`, `unidatum join <link>`, `unidatum sql-serve --pg-port 5433`) and the HTTP API are documented there, and that documentation wins over anything in the sheets. If the archive is not here, stop and ask for it.

## Order of work

Build `MVP-SHEET.md` section by section, in order, one git commit per section, with a short note in the commit message of what the sheet said and what you did:

1. **Ask once.** Before anything, ask these questions in one message and wait for the answers:
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
2. **Image.** A Dockerfile that unpacks the archive and puts `unidatum` and its sidecars on the path.
3. **Services** (section 1) and **libraries** (section 3): `docker-compose.yml` from the draft in this folder, every node initialised with its library and bootstrapped off the first node. Bring it up and prove the nodes see each other before going on.
4. **Stores, keys and jobs** (section 4 of the MVP sheet, sections 3 and 4 of the build sheet): the collections and tables with their fields and indexes, the keys, the pipelines and the publish jobs with their schedules.
5. **Seed** (section 4): the seed container and its generator, at the counts the sheet gives.
6. **Simulators and dashboards** (section 1): one script per application making exactly the calls the build sheet lists, in flow order; the dashboards' queries made in Metabase over the SQL wire.
7. **Demo script** (section 5): a `DEMO.md` in the repo that walks each process step by step, naming the command to run and what to look at, taken from the sheet and corrected by what you built.
8. **Checks** (section 6): one test per file in `checks/`, run by one command; the build is done when they all pass.

## Rules

- The sheets say what to build; the engine's own documentation says how. Where the design assumes something the engine lacks (a query, an index, a merge rule), do not invent it: build the nearest thing the engine offers, write down the gap in `GAPS.md`, and carry on.
- Keep secrets out of files: the compose file reads them from `.env`, and `.env` is in `.gitignore`.
- Do not scale the demo up or down from the sheet without asking.
- Steps the process view marks as an agent's, or as proposed, are out of scope unless an agent card exists in the design; write them into `DEMO.md` as the slides they would be.
- When a section is done, say so in one line with what to run to see it.

## The design in one paragraph

Gamified crowdfunding: a draw anybody can recompute, and a crowd that ships The processes it runs: A round, and a draw anybody can recheck, Four thousand people buy one thing, Where the crowd decides it goes.
