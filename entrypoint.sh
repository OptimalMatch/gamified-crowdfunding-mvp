#!/bin/sh
# One container, one design node, one engine process per library it joins
# (the engine runs one node per library; see DECISIONS.md, 3).
#
#   NODE_NAME   this node's name, e.g. platform
#   LIBRARIES   lib:syncport:dhtport:apiport[;lib:...]   the libraries it joins
#   BOOTSTRAP   lib=host:dhtport[;lib=...]               the first member of each library's DHT
#   PEERS       lib=host:syncport[;lib=...]              a member to sync with once at start
#   PIPELINES   lib[;lib]                                libraries whose pipelines this node serves
#   SQLD        lib:pgport                               serve the PostgreSQL wire for one library (SQLD_USER, SQLD_PASSWORD)
#
# Each library lives in /data/<lib>; the first start runs `unidatum init`.
set -eu
: "${NODE_NAME:?NODE_NAME is required}"
: "${LIBRARIES:?LIBRARIES is required}"
lookup() { # lookup "$MAP" key -> value or ""
  echo "$1" | tr ';' '\n' | while IFS='=' read -r k v; do [ "$k" = "$2" ] && echo "$v"; done | head -1
}
pids=""
for entry in $(echo "$LIBRARIES" | tr ';' ' '); do
  lib=$(echo "$entry" | cut -d: -f1); sync=$(echo "$entry" | cut -d: -f2); dht=$(echo "$entry" | cut -d: -f3); api=$(echo "$entry" | cut -d: -f4)
  dir="/data/$lib"; mkdir -p "$dir"; cd "$dir"
  if [ ! -d .p2pfs ]; then
    unidatum init --library "$lib" --node-name "$NODE_NAME" >/dev/null
    echo "$NODE_NAME: initialised $lib in $dir"
  fi
  boot=$(lookup "${BOOTSTRAP:-}" "$lib")
  # --seed-open: serve blob bytes to any peer of the library, not only peers this
  # node has synced with; on one private network every container is a member.
  # --rendezvous off: no invite rendezvous on one machine.
  set -- ui --port "$sync" --dht-port "$dht" --ui-port "$api" --bind "" --no-mdns --sql --sync-every "${SYNC_EVERY:-5}" --seed-open --rendezvous off
  [ -n "$boot" ] && set -- "$@" --bootstrap "$boot"
  unidatum "$@" 2>&1 | sed -u "s/^/[$lib] /" &
  pids="$pids $!"
  echo "$NODE_NAME: $lib serving on $sync (api $api)${boot:+, bootstrap $boot}"
done
# Make the first member of each library a known peer, so syncing starts now.
sleep 4
for entry in $(echo "$LIBRARIES" | tr ';' ' '); do
  lib=$(echo "$entry" | cut -d: -f1)
  peer=$(lookup "${PEERS:-}" "$lib")
  [ -z "$peer" ] && continue
  cd "/data/$lib"
  n=0; until unidatum sync "$peer" >/dev/null 2>&1 || [ $n -ge 20 ]; do n=$((n+1)); sleep 3; done
  echo "$NODE_NAME: $lib synced with $peer ($n retries)"
done
# Serve the SQL wire for the dashboards from one library, if asked: SQLD=lib:pgport
if [ -n "${SQLD:-}" ]; then
  lib=$(echo "$SQLD" | cut -d: -f1); pg=$(echo "$SQLD" | cut -d: -f2)
  cd "/data/$lib"
  unidatum sql-serve --bind 0.0.0.0 --pg-port "$pg" --flight-port 0 --mysql-port 0 --oracle-port 0 --tds-port 0 --user "${SQLD_USER:-demo}" --password "${SQLD_PASSWORD:?SQLD_PASSWORD is required for the SQL wire}" 2>&1 | sed -u "s/^/[$lib sqld] /" &
  pids="$pids $!"
  echo "$NODE_NAME: SQL wire for $lib on $pg"
fi
# Serve this library's pipelines (the curation jobs), if asked.
for lib in $(echo "${PIPELINES:-}" | tr ';' ' '); do
  cd "/data/$lib"
  unidatum pipeline serve --every "${PIPELINE_EVERY:-30s}" --batch "${PIPELINE_BATCH:-2000}" 2>&1 | sed -u "s/^/[$lib pipelines] /" &
  pids="$pids $!"
  echo "$NODE_NAME: serving pipelines of $lib"
done
wait
