#!/bin/sh
# Vercel build (design D8): load a new tariff version into Supabase if DBT has one,
# export the HS index from Supabase, build preflight.html and publish it as dist/index.html.
# HS_ALLOW_STALE=1 deploys with the committed assets/hs_index.json when the database step fails.
set -eu
cd "$(dirname "$0")/.."

if python3 -I scripts/snapshot_tariff.py --if-new && python3 -I scripts/export_hs_index.py; then
  :
elif [ "${HS_ALLOW_STALE:-}" = "1" ]; then
  echo "WARNING: HS tariff step failed; HS_ALLOW_STALE=1, so building with the committed assets/hs_index.json." >&2
else
  echo "HS tariff step failed; the previous deployment stays live. Set HS_ALLOW_STALE=1 to deploy with the committed export." >&2
  exit 1
fi

(cd scripts && python3 build.py >/dev/null)
mkdir -p dist
cp scripts/preflight.html dist/index.html
echo "built dist/index.html ($(wc -c < dist/index.html | tr -d ' ') bytes)"
