---
name: shipment-preflight-checker
description: Build, extend or run "CargoPass" — a conversational cross-border shipment booking tool and pre-flight error checker (UK → Germany/France/Netherlands pallet freight). Use this skill whenever the user mentions shipment booking, commercial invoice checks, HS code validation, declared value vs item totals, carton/pallet reconciliation, pallet weight limits, dangerous goods screening, carrier recommendation by priority (cheapest/fastest/most reliable/balanced), the Ops Hackathon Case 2, or uploading Bookings/Items sheets to find planted mistakes — even if they don't say "CargoPass".
---

# Shipment CargoPass Checker

A single self-contained HTML app (no backend, no login) that:
1. **Books by chat** — parses plain-language shipment descriptions, asks only for missing fields, handles mid-conversation edits ("add a pallet").
2. **Checks a file** — reads the judges' Bookings + Items sheets, applies rulebook R-01…R-10 plus data-quality checks.
3. For every booking: what is wrong, severity (Red/Amber), how to fix (with one-click fixes), recommended carrier + reason, plain confirmation, "what happens next".

## Files
| Path | Role |
|---|---|
| `scripts/engine.js` | Pure rule engine: normalisers, file parsing, R-01…R-10, data issues, carrier ranking, ETA, confirmation text. Node + browser. |
| `scripts/chat.js` | Deterministic language parser + slot filling + change tracking (`turn(state, text, today)`). |
| `scripts/tests.js` | 111 automated tests (shared by Node and the in-app Test tab). |
| `scripts/app.js`, `scripts/shell.html` | UI (chat, file upload, report, export, rules, tests). |
| `scripts/build.py` | Inlines everything + sample workbook (base64) into `preflight.html`. |
| `scripts/make_testdata.py` | Builds the 20-booking test workbook from the official template. |
| `scripts/run.js`, `scripts/verify.js` | Run unit tests; run engine on the test workbook. |
| `assets/Preflight_Test_Cases.xlsx` | 20 planted-error bookings + "Expected results" sheet. |
| `references/logic.md` | **Full decision logic for every rule, parser and recommendation.** Read before changing behaviour. |
| `references/test-scenarios.md` | Exceptional / edge-case scenarios with expected outcomes. |
| `assets/hs_index.json` | HS index exported from Supabase (UK tariff snapshot, version and date in `meta`). Inlined into `preflight.html`; committed as the fallback. |
| `scripts/db/001_preflight_tariff.sql`, `scripts/db/check_views.sql` | `preflight` schema in Supabase (snapshot, commodity and search-reference tables; D2/D3 views; RLS, no policies) and checks of its views. |
| `scripts/snapshot_tariff.py` | Downloads the DBT tariff and HMRC search references and loads them into Supabase as one snapshot version (`--dry-run`, `--if-new`, `--replace`). |
| `scripts/export_hs_index.py` | Writes `assets/hs_index.json` from the current snapshot's views, after self-checks. |
| `scripts/dbenv.py` | `psql` connection from `DATABASE_MIGRATION_URL` (environment or gitignored `.env.local`); `--check`, `--apply file.sql`. Never prints the URL. |

## Workflow
1. `cd scripts && npm i xlsx@0.18.5` (Node verification only).
2. Change logic in `engine.js` / `chat.js`; add a test in `tests.js` for every new behaviour.
3. `node run.js` → must be 100% pass. `node verify.js` → all 25 bookings (plus the TB-99 orphan notice) match "Expected results". It needs the `xlsx` npm package (`npm i xlsx@0.18.5` outside the repo, then `NODE_PATH=…/node_modules node verify.js`).
4. HS tariff data (only when refreshing it): put `DATABASE_MIGRATION_URL` (hosted Supabase session pooler, from `~/ws/trip-together/.env.production.local`) and `PSQL` in `.env.local`; `python3 -I scripts/dbenv.py --apply scripts/db/001_preflight_tariff.sql` once; then `python3 -I scripts/snapshot_tariff.py --if-new` and `python3 -I scripts/export_hs_index.py`. The app, the build and the tests need only the committed `assets/hs_index.json`, never the database.
5. `python3 build.py` → `preflight.html`. Host anywhere static (Netlify drag-and-drop works); turn off visitor login.
6. Deployed on Vercel: **https://cargopass-uk.vercel.app** (also https://preflight-shipment-checker-five.vercel.app) (project `preflight-shipment-checker`, team curious-minds3, Git-linked to `github.com/SathishAchilles/preflight-shipment-checker`, the copy of this repo used for deploys; push `main` there for production, any other branch for a preview). Each build runs `sh scripts/vercel_build.sh` (`vercel.json` installs `psql` with `dnf`): `snapshot_tariff.py --if-new` → `export_hs_index.py` → `build.py` → `dist/index.html`. `DATABASE_MIGRATION_URL` is a sensitive project variable. A failed database step stops the build; `HS_ALLOW_STALE=1` deploys with the committed export.

## Non-negotiables
- Never crash on bad input: every field normalises to value / blank / invalid and becomes a data issue, never an exception.
- Read dates **day-first** (DD-MM-YYYY); never guess impossible dates.
- R-05 is judged against the carrier the seller's priority picks (or their override) — always offer priced fixes.
- Every issue must say what, how serious, how to fix — in plain words.
- Rule IDs and severities come only from the fixed rulebook; extra checks are labelled "Data" or "Advisory".
