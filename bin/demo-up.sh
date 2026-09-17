#!/bin/sh
# The demo from nothing: DEMO.md's "Bring it up", then the three processes
# in order, then the checks. Idempotent: run it again after
# `docker compose down -v`. About ten minutes, most of it the four
# thousand joins and the windows' clocks.
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
bin/fetch-engine.sh
docker compose up -d --build platform sponsor-acme supplier-northlight regulator closed-rounds-and-proofs metabase
echo "--- nodes up; waiting for them to peer"; sleep 20
docker compose run --rm seed
bin/declare-stores.sh
docker compose up -d
echo "--- the watchers, the simulators and the web app are up: http://127.0.0.1:18180"
docker compose run --rm tools node bin/metabase.mjs &
A="docker compose run --rm backer-app-and-web-sim"
echo "--- 1. A round, and a draw anybody can recheck"
docker compose run --rm round-agent-over-mcp-sim --market IE
$A open-round --mechanism weighted_random_draw --market IE --window 90
sleep 8
$A pledges-arrive --n 60
echo "--- pledging for 90 s; standing contributions raise theirs on their paydays"; sleep 100
docker compose run --rm tools node sims/verify-it-yourself.mjs
echo "--- 2. Four thousand people buy one thing"
$A open-window --item 21 --close-on tier --close-tier 3200 --window 240 --vote-window 120
sleep 6
$A four-thousand-join-at-once --n 4000
echo "--- the order, the settlement and the supplier's acknowledgement"; sleep 45
echo "--- 3. Where the crowd decides it goes"
$A anybody-proposes-one --n 4 --voters 300
echo "--- the vote closes on its clock, the truck is booked, the pallet lands"; sleep 130
$A custody-share-by-share --n 25
$A dispute --claim draw
$A dispute --claim short
docker compose run --rm tools node bin/archive.mjs
wait
echo "--- the checks"
docker compose run --rm tools node checks/run.mjs
