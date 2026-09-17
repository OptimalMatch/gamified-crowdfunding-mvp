# Gaps

Where the design assumed something the engine (v2.372.0) does differently,
and what this build did about it. The kit's prompt asked for this file.

1. **One node per library.** The design draws a node that joins several
   libraries. The engine runs one node process per library, so the
   platform's container runs three processes in sibling directories
   (`DECISIONS.md`, 3). Nothing lost; more processes than cards.
2. **Two updates in flight on one document lose one of them.** A document
   update is read-modify-write on the node, with no serialisation between
   concurrent callers: fifty concurrent `$inc` calls on an undeclared
   field left the field at 2. A writer that may touch the same document
   twice at once serialises itself (`serial` in `lib/api.mjs`), and the
   pipelines never share a document with the counter's writer.
3. **The node's door bans a busy address.** More than 64 open connections
   or 120 new ones a minute from one address and the node refuses it for
   ten minutes; with docker's userland proxy every host-side caller is the
   gateway address. The entrypoint writes `.p2pfs/access.json` allowing
   the private ranges (`DECISIONS.md`, 11).
4. **The additive counter loses increments from concurrent callers on one
   node.** Declared with `unidatum doc counter`, the counter is exact
   across nodes (200 increments from two peered nodes read 200 on both)
   but not from concurrent callers on one node: 500 increments from five
   callers read 497, from fifty read 478, 1,000 from two hundred read 885
   and then 752 three seconds later. Filed as
   OptimalMatch/peer-to-peer-db#1088. The join path (the web server, the
   phone simulator) coalesces increments landing in the same 50 ms into
   one `$inc` (`lib/coalesce.mjs`), which is a queue the design says a
   join should never stand in; the counter stays additive across nodes
   and the receipts (one signed commitment document per join, written
   without contention at about 900 a second) are the count of record.
   The tier reached is written on the buy, never on the counter document.
5. **A reader must hold every member.** A collection is read only when
   every member is local; a member another node just wrote may not be
   here yet ("needs every member local", or "read_parquet needs at least
   one file" on a node that holds the manifest and nothing else). The
   client replicates the collection and retries once (`lib/api.mjs`).
6. **Counters are a separate column in SQL.** Over the SQL wire a counter
   field is not in the `doc` JSON but in `_cd`, one delta per version
   until compaction folds them. The dashboard queries take the latest
   `doc` per `_id` and sum `_cd` (`bin/metabase.mjs`).
7. **JSON, not parquet, in the bucket.** The build sheet lands closed
   rounds as parquet attached as a store. The engine creates tables from
   parquet by CLI, not over HTTP, so `bin/archive.mjs` lands one JSON
   bundle per round in MinIO's `round-history` bucket; the verifier reads
   the same shape. The cold tier after a year is an object lifecycle rule
   on the bucket, not set in the demo.
8. **No change feed over HTTP.** The engine pushes documents to peer
   subscribers over its own wire, not to HTTP clients, so the watchers
   poll the node every 2 s and the browser refreshes on a timer.
9. **The signer of a version is not exposed over the API.** Every op is
   signed by the node that made it and verified by every node that merges
   it, but a document does not carry its node's signature. Where the
   design wants a signature a stranger can check, the document carries
   one of its own (Ed25519, `lib/crypto.mjs`): the seal, the roots, the
   proof and the tally by the platform's roles, the tier rows by the
   supplier, every ledger entry by the escrow, and every pledge,
   commitment, ballot and handover by the backer's device. The public
   keys are in the `keys` collection.
10. **No sort in the document API.** `find` takes a filter and a limit;
    the client sorts.
11. **Joins land at tens a second, not thousands.** A node takes about
    900 puts a second on an idle collection, but with the watchers, the
    escrow's holds and a reader over the same collection, four thousand
    joins take about two minutes on this machine. The counter does not
    wait behind anything; the node does.
12. **Reads under a large find are occasionally short.** Once in a run a
    find over a thousand-document collection on the regulator returned
    999 documents; the checks replicate first and look a missing document
    up by id before calling it missing.
13. **Simulators in Node.js.** The build sheet's facts say Kotlin, Swift,
    TypeScript and Go for the applications (`DECISIONS.md`, 6).
