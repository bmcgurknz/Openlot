#!/usr/bin/env bash
# End-to-end OpenLot lifecycle against a demo-mode instance.
# Start the server first:  DEMO_MODE=true npm run dev
set -euo pipefail
BASE="${BASE:-http://localhost:4400}"
P=316
j() { python3 -m json.tool; }

echo "== health =="
curl -s "$BASE/api/health" | j

echo "== create a lot =="
LOT=$(curl -s -X POST "$BASE/api/projects/$P/lots" -H 'content-type: application/json' \
  -d '{"workType":"KF","description":"Road 2 kerb Ch 0000-0120 LHS","specReference":"ITP-KF-01","costCode":"06-110","quantity":120,"uom":"lm"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "created $LOT"

echo "== try to conform straight away (fails: must be work_complete first) =="
curl -s -X POST "$BASE/api/projects/$P/lots/$LOT/transition" -H 'content-type: application/json' -d '{"to":"conformed"}' | j

echo "== mark work complete, then see the real blockers =="
curl -s -X POST "$BASE/api/projects/$P/lots/$LOT/transition" -H 'content-type: application/json' -d '{"to":"work_complete"}' > /dev/null
curl -s "$BASE/api/projects/$P/lots/$LOT/evaluation" | j

echo "== in real life an inspection titled '$LOT - ...' would arrive by webhook;"
echo "   in demo, simulate evidence by using the seeded LOT-EW-0014 instead =="

echo "== pass LOT-EW-0014's outstanding test and conform it =="
TEST_ID=$(curl -s "$BASE/api/projects/$P/lots/LOT-EW-0014" | python3 -c 'import sys,json;print(json.load(sys.stdin)["tests"][0]["id"])')
curl -s -X PATCH "$BASE/api/tests/$TEST_ID" -H 'content-type: application/json' -d '{"status":"passed"}' > /dev/null
curl -s -X POST "$BASE/api/projects/$P/lots/LOT-EW-0014/transition" -H 'content-type: application/json' -d '{"to":"conformed"}' | j

echo "== create a claim period and run the gate =="
CLAIM=$(curl -s -X POST "$BASE/api/projects/$P/claims" -H 'content-type: application/json' \
  -d '{"label":"PC-14 2026-07","periodStart":"2026-07-01","periodEnd":"2026-07-31"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s "$BASE/api/projects/$P/claims/$CLAIM/claimable" | j

echo "== add the conformed lot; then prove double-claim prevention with LOT-EW-0012 (already in PC-13) =="
curl -s -X POST "$BASE/api/projects/$P/claims/$CLAIM/lots" -H 'content-type: application/json' -d '{"lotId":"LOT-EW-0014"}' | j
curl -s -X POST "$BASE/api/projects/$P/claims/$CLAIM/lots" -H 'content-type: application/json' -d '{"lotId":"LOT-EW-0012"}' | j

echo "== extract =="
curl -s "$BASE/api/projects/$P/claims/$CLAIM/extract.csv"
echo "HTML report: $BASE/api/projects/$P/claims/$CLAIM/extract.html"
