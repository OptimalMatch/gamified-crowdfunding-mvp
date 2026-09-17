#!/bin/sh
# Declare the stores' merge policies, counters and indexes on the platform's
# node, from lib/stores.mjs. The engine declares these by CLI in the library's
# directory, and a collection must exist before it is declared, so this runs
# after the seed. The declarations are signed ops and sync to every node.
#   bin/declare-stores.sh            (from the host, via docker compose exec)
set -eu
cd "$(dirname "$0")/.."
docker compose run --rm -T tools node lib/stores.mjs > /tmp/declare-stores.$$ 
n=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  out=$(docker compose exec -T -w /data/platform-eu platform sh -c "$line" 2>&1) || true
  case "$out" in *"already"*) ;; *) echo "$out";; esac
  n=$((n+1))
done < /tmp/declare-stores.$$
rm -f /tmp/declare-stores.$$
echo "$n declaration(s) applied on platform-eu"
