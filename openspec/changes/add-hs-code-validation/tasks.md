# Tasks

## 1. Tariff data in Supabase, exported to the app (design D1, D7)

- [x] 1.1 Connection setup. Create `preflight-shipment-checker/.env.local` with `DATABASE_MIGRATION_URL` copied from `~/ws/trip-together/.env.production.local` (the hosted Supabase session pooler, user `postgres.jyefwcjbsmekmdubykyo`, `aws-0-ap-southeast-1.pooler.supabase.com:5432`) and, if `psql` is not on `PATH`, `PSQL=/opt/homebrew/opt/libpq/bin/psql`. Add `.env.local` to `.gitignore`. Add `scripts/dbenv.py` (standard library only) that takes `DATABASE_MIGRATION_URL` from the environment when set (Vercel) and from `.env.local` otherwise, never prints it, and returns the URL and the `psql` path.
  - Verify: `git check-ignore .env.local` prints the path; `python3 -I scripts/dbenv.py --check` prints `connected: PostgreSQL <version> as postgres` (never the URL) and exits 0; with `DATABASE_MIGRATION_URL` set in the environment and no `.env.local`, it connects the same way.
- [x] 1.2 Migration `scripts/db/001_preflight_tariff.sql` with the tables, indexes, views and row-level security exactly as design D7 lists them (`tariff_snapshot`, `tariff_commodity`, `tariff_search_ref`; `v_current`, `v_leaf`, `v_h4`, `v_h6`, `v_cn8`, `v_l10`, `v_refs`). Re-runnable: `create schema if not exists`, `create table if not exists`, `create or replace view`.
  - Verify: apply it twice with `psql -v ON_ERROR_STOP=1 -f scripts/db/001_preflight_tariff.sql`, and both runs exit 0; `\dt preflight.*` lists 3 tables and `\dv preflight.*` lists 7 views; `select relrowsecurity from pg_class where relnamespace = 'preflight'::regnamespace and relkind = 'r'` gives `t` three times.
- [x] 1.3 Create `scripts/snapshot_tariff.py` (standard library plus `psql` through `dbenv.py`).
  - Request `https://data.api.trade.gov.uk/v1/datasets/uk-tariff-2021-01-01/versions/latest/tables/commodities-report/data?format=csv` without following the redirect. Read the version id (e.g. `v4.0.1639`) from the 302 `Location` header, then download that versioned URL. Parse it with `csv` (descriptions contain line breaks).
  - Exit non-zero with a clear message if the CSV header is not exactly `id, commodity__sid, commodity__code, commodity__suffix, commodity__description, commodity__validity_start, commodity__validity_end, parent__sid, parent__code, parent__suffix`.
  - Download `https://www.trade-tariff.service.gov.uk/uk/api/search_references` and keep `{title, referenced_class, goods_nomenclature_item_id, productline_suffix}` per entry.
  - Load as design D7 "Loading" says: write both as clean CSV (`#NA` → empty) to a temporary directory, then one `psql --single-transaction` script inserts the `tariff_snapshot` row (source, version, today as `snapshot_date`, licence `OGL v3.0`), `\copy`s both files, sets the row counts and moves `is_current` to this version. Refuse a version that is already loaded unless `--replace` is given.
  - `--dry-run` downloads and checks only and does not connect to the database.
  - `--if-new` resolves the DBT version with the redirect request only, and exits 0 without downloading when that version is already in `tariff_snapshot`; otherwise it loads it as above.
  - Verify: `python3 -I scripts/snapshot_tariff.py --dry-run` prints the resolved version and `25873` commodity rows and about 8,940 references; a real run then shows `select version, commodity_rows, ref_rows, is_current from preflight.tariff_snapshot` = (`v4.0.1639`, 25873, ~8940, true); running it again without `--replace` exits non-zero and changes nothing; `--if-new` then prints `v4.0.1639 already loaded` and exits 0 without downloading; `--commodities-file <path>` loads from a local CSV instead of downloading, and a run with a copy whose header has one column renamed exits non-zero and leaves `tariff_snapshot` unchanged.
- [x] 1.4 Check the views against the D2/D3 rules on the loaded data (no Python re-implementation; these are SQL checks):
  - `select count(*) from preflight.v_h6` = 5717, `v_cn8` = 9888, `v_l10` = 16684 (±1% if the data has moved);
  - `691200`, `090111`, `850760`, `330300`, `610910` are in `v_h6`; `999999`, `850700`, `010000` are not;
  - exactly 15 `v_l10` codes start `691200`, including `6912002191` (the suffix-aware parent test);
  - `v_h4` for `6904` is "Ceramic building bricks…", not "II. OTHER CERAMIC PRODUCTS";
  - `v_h6` for `610910` is "T-shirts, singlets and other vests, knitted or crocheted > Of cotton", and for `691200` is the heading description only;
  - `v_refs` maps "socks" rows to `611594`/`611595` prefixes and contains no Chapter rows.
  - Verify: save these as `scripts/db/check_views.sql`; `psql -v ON_ERROR_STOP=1 -f scripts/db/check_views.sql` exits 0 (each check raises an exception on a mismatch).
- [x] 1.5 Create `scripts/export_hs_index.py`: one `psql -XAt` query builds the whole index as a JSON value from the views (D3 format, `meta` from `v_current` plus `store: "supabase preflight schema"`, arrays sorted by code); the script runs the D7 self-checks and writes `assets/hs_index.json` minified only when all pass.
  - Verify: the run prints the counts and `OK`; running it twice gives the same `shasum`; with the stack stopped it exits non-zero and leaves the existing file untouched.
- [x] 1.6 Export once and commit `assets/hs_index.json`. Verify: the file exists, is ≤ 2.0 MB, `refs` has between 8,000 and 8,940 entries, and `python3 -I -c "import json;d=json.load(open('assets/hs_index.json'));print(d['meta'])"` shows `v4.0.1639`, `2026-10-26` and `store`.
- [x] 1.7 Document in `SKILL.md` (Files table and Workflow): `.env.local`, the migration, the refresh (`snapshot_tariff.py` then `export_hs_index.py`), and that the app, the build and the tests need only the committed JSON. Note in `references/logic.md` §1 that the HS data is held in Supabase and the app uses a bundled export with no database or network at runtime. Verify: both files mention `snapshot_tariff.py`, `export_hs_index.py`, `preflight` schema and `assets/hs_index.json`.

## 2. Engine: index lookups (no behaviour change yet)

- [x] 2.1 In `scripts/engine.js`, add `setHsIndex(idx)`. It builds a Set for `h6` and a Map for `h4`/`h6` descriptions once, and keeps the sorted `cn8`/`l10` arrays.
  - Add `hsLookup(digits)` returning `{ known, hs6, desc, full: 'ok'|'unknown'|'n/a' }`. It uses binary search on `cn8` for 8 digits and on `l10` for 10 digits; other lengths give `n/a`.
  - Add `hsHeading(h4)` returning `{ known, desc, subs: [hs6…] }`.
  - With no index loaded, every function returns `{ known: null }` and never throws.
  - In the browser, call `setHsIndex(window.HS_INDEX)` automatically when it is defined. Export the three functions on `PF`.
  - `hsLookup` and `hsHeading` are read-only; callers never write their results back into the item.
  - Verify: new tests in `scripts/tests.js` (group "HS index") cover:
    - lookups for `691200`, `090111`, `850760`, `330300` and `610910` are known;
    - lookups for `999999` and `850700` are unknown;
    - `6912002310` gives full `ok`, and `6912001000` gives full `unknown`;
    - `hsHeading('6912').subs` is `['691200']`, and `hsHeading('6115').subs.length` is 9;
    - with no index, the result is `{known:null}`.
- [x] 2.2 Load the index in Node: `scripts/run.js` and `scripts/verify.js` call `PF.setHsIndex(require('../assets/hs_index.json'))` before running. Verify: `cd scripts && node run.js` passes 100%, including the new group.

## 3. Engine: R-01 hints, existence issue, full-code advisory

- [x] 3.1 R-01 5-digit hint (spec "Leading-zero recommendation for 5-digit number cells"). In the R-01 detail/fix strings only (`engine.js` ~lines 551–556), when `numericCell && digits.length === 5` and `'0'+digits` is known:
  - recommend it with its description (push to `n.hsRec`), and keep the words "leading zero" and "store the code as text";
  - otherwise keep today's text.
  - Do not change the R-01 status logic.

  Verify: tests show that number `90111` gives R-01 `fail`, with fix text containing `090111` and "Coffee, not roasted"; number `30211` still matches `/leading zero/` (existing test C4); and number `99999` gives the generic text.
- [x] 3.0 Recommendation carrier (spec "HS codes are never corrected automatically"). In `normaliseBooking()`, give each item `n.hsRec = []`, a list of `{ code, desc, why }`. No engine function may assign to `n.hs.digits` or `n.hs.raw` from a lookup. Verify: a test runs every HS test case and asserts `n.hs.digits` equals the input's digits after formatting removal (dots, spaces, `.0`, "HS" prefix), never padded, trimmed or replaced.
- [x] 3.1b Leading-zero recommendation for 7/9-digit number cells (spec "Leading-zero recommendation for 7 and 9 digit number cells"). In `normaliseBooking()` after `normHS`, when `numericCell` is set, `digits.length` is 7 or 9, and `hsLookup('0'+digits).known` is true:
  - push `{ code: '0'+digits, desc, why: 'leading zero dropped by the spreadsheet' }` to `n.hsRec`;
  - in `evaluate()`, add one Advisory whose text names what the code reads as now (or "not in the UK tariff"), recommends the padded code with its description, and says "store codes as text";
  - skip the plain existence Advisory (task 3.3) for that item so there is never a second one.
  - Validation and descriptions keep using the digits as entered.

  Verify: tests show:
  - number `901110000` gives R-01 `pass`, no data issue, the same status as without the check, exactly one HS Advisory mentioning "microscopes" and recommending `0901110000`, `hs.digits === '901110000'`, and `hsRec[0].code === '0901110000'`;
  - number `902400000` gives exactly one HS Advisory recommending `0902400000` and no data issue;
  - text `'901110000'` gives an empty `hsRec`.
- [x] 3.2 R-01 4-digit hint (spec "Heading hint"):
  - when the code has exactly 4 digits and `hsHeading` is known, add the heading description plus either "recommended 6-digit code: X" (one subheading, pushed to `n.hsRec`) or "it has N subheadings" (more than one; no single recommendation);
  - when the heading is unknown, say it is not in the UK tariff.

  Verify: tests show `6912` gives fix text containing `691200`, `6115` gives "9 subheadings", and `9999` gives "not in the UK tariff", all with R-01 `fail`.
- [x] 3.3 Existence Advisory (spec "HS subheading existence check"). In `evaluate()` next to the existing HS advisories (~line 657), for codes with no letters and ≥ 6 digits whose first 6 digits are unknown, push one advisory per item. Do not use `amber()` or `red()`.
  - The text names the SKU and code, plus the heading and its subheading count when the heading is known; otherwise it says the heading is not in the tariff and points to trade-tariff.service.gov.uk.
  - Skip this when no index is loaded.

  Verify: tests show `999999` gives exactly one HS Advisory, no data issue, and an unchanged booking status (Green for an otherwise clean booking); `850700` gives an Advisory mentioning 7 subheadings; items `691200` + `999999` give one Advisory naming only the second SKU; and calling `evaluate` twice on the same normalised booking gives the same advisories.
- [x] 3.4 Full-code advisory (spec "UK commodity code check"). In `evaluate()` next to the existing >10-digit advisory (~line 657), for exactly 8 or 10 digit codes whose first 6 digits are known and whose `full === 'unknown'`, push one advisory naming the valid HS-6 and the unknown full code.
  - Verify: tests show `6912002310` gives no advisory; `6912001000` gives one advisory with R-01 `pass` and no data issue; and the existing test "12-digit code → pass, with advisory" (`advisories.length === 1`) still passes.
- [x] 3.5 Run the full suites and update docs.
  - Verify: `cd scripts && node run.js` passes 100%, and `node verify.js` still matches all 20 bookings in the "Expected results" sheet with no status change.
  - Update the R-01 row and the "Data-quality checks" list in `references/logic.md` §4, and add rows for `90111`, `6912`, `6115`, `999999`, `850700` and `6912001000` to `references/test-scenarios.md` section C, with their expected outcomes.

## 4. Build and UI

- [x] 4.1 `scripts/shell.html`: add `<script>window.HS_INDEX = {{HSINDEX}};</script>` before `{{ENGINE}}`. In `scripts/build.py`, read `../assets/hs_index.json`, assert it is ≤ 2.0 MB and contains no `</script`, and substitute `{{HSINDEX}}`. Verify: `cd scripts && python3 build.py` succeeds, and the printed size grows by about 1.8 MB.
- [x] 4.2 `scripts/app.js` item table (~line 125): under a valid code, show the `h6` description as a small secondary line; for an unknown 6+ digit code, show "not in UK tariff" with class `bad`.
  - Verify: open `preflight.html`, load the sample workbook, and check that TB-01 shows `691200` with "Ceramic tableware…" and that a code edited to `999999` shows "not in UK tariff".
- [x] 4.2b Recommendation actions (spec "HS codes are never corrected automatically"). In `fixActions()` (`app.js` ~lines 45–51), for the R-01 check and for HS advisories, add one button per `n.hsRec` entry and per `hsSuggest` code: label "Use <code> for <SKU>", `itemPatch: { i, hs: '<code>' }` (stored as text), `say: 'HS code for <SKU> is <code>'`. Nothing calls `ctx.apply` without a click. Verify:
  - load the sample workbook; TB-02 shows "Use 610910 for TSH-01" and TSH-01's code stays blank until clicked;
  - after clicking, the row is marked edited and R-01 passes for that item;
  - "Reset edits" (overrides cleared, ~line 278) restores the blank code;
  - in chat, the recommendation is only recorded after the seller says "yes" or types the code.
- [x] 4.3 Add the snapshot stamp line, "HS codes checked against UK tariff snapshot <version> (<DD-MM-YYYY>) — DBT data, Open Government Licence v3.0", to the booking report and the Rules tab, reading `meta` from the index.
  - Verify: the line is visible in both places with `v4.0.1639` and `26-10-2026` (the `meta` of the committed export).
- [ ] 4.4 No-API and determinism check (spec "Validation from a bundled tariff snapshot"). Open the hosted `preflight.html` with the DevTools Network tab open, then upload `assets/Preflight_Test_Cases.xlsx` twice and compare the reports. Verify: no request goes to `trade-tariff.service.gov.uk` or `data.api.trade.gov.uk` (the SheetJS request to cdnjs at page load is expected), and the HS results are identical across both runs.

## 5. HS code suggestion from the description (design D6)

- [ ] 5.1 In `scripts/engine.js`, add `hsTokens(text)` implementing D6 step 1: lower-case; `t shirt`/`tee`/`tshirt` → `t-shirt`; drop numbers with units; drop the stop-word list from D6; plural stemming (`ies`→`y`; `es` after s/x/z; trailing `s` except `ss`). Verify: tests show `hsTokens('Cotton socks, 3-pack')` is `['cotton','sock']` and `hsTokens('Ceramic mugs 350 ml')` is `['ceramic','mug']`.
- [ ] 5.2 In `setHsIndex`, precompute once: ref heads and qualifiers as token arrays, the candidate `h6` list per ref prefix, and an IDF map over the `h6` path descriptions. Verify: `setHsIndex` on the real index takes under 300 ms in `node run.js` (print the time once).
- [ ] 5.3 Add `hsSuggest(description)` returning `{ level: 'hs6'|'heading'|'list'|'none', codes: [...], heading, matched: [...], source: 'curated'|'reference'|'tariff' }`, following D6 steps 2–4 exactly: S1 `HS_HINTS` (code must be in `h6`), S2 ref head match (score 3 × head tokens + 1 × qualifier tokens), S3 IDF overlap only when S1 and S2 are empty, material ×1.5 / ×0.3, 1.5× margin for a single code, ties by code ascending. Add `HS_HINTS` entry `power ?banks?` → `850760`.
  - Verify (new test group "HS suggestion"):
    - "Organic cotton T-shirt" → hs6 `610910`;
    - "Ceramic mug, 350 ml" → hs6 `691200`;
    - "Cotton socks, 3-pack" → hs6 `611595`;
    - "Perfume 50 ml" → hs6 `330300`, source `reference`, matched includes `perfume`;
    - "Black tea, 250 g" → level `heading`, heading `0902`, codes include `090230` and `090240`;
    - "Misc stock" → level `none`;
    - the same call twice returns deep-equal results;
    - with no index loaded it returns `{ level: 'none' }` and never throws.
- [ ] 5.4 (Recommendation only; never auto-applied, see task 4.2b.) Use `hsSuggest` in R-01's per-item fix text (`engine.js` ~lines 551–556) for blank, letter and under-6-digit codes, ahead of the 5-digit and 4-digit hints from tasks 3.1/3.2 only when those hints find nothing. Keep `hsHint` as the fallback with no index. Wording: "Suggested HS code 610910 — <description> (matched: cotton, t-shirt; source: HMRC search reference). Verify on trade-tariff.service.gov.uk." Do not change R-01 status logic and never write the code into the item. Verify: tests show TSH-01, MUG-01 and SCK-01 in `assets/Preflight_Test_Cases.xlsx` still give R-01 `fail` with the suggested codes above in the fix text, and `node verify.js` still matches 20/20.
- [ ] 5.5 In `scripts/chat.js` (where `hsHint` is used, ~lines 338, 339, 420), use `hsSuggest` for the reply. When the result is `heading` or `list` and the candidates differ only by a material word, ask once "What is it mainly made of?" and re-run with the answer appended to the description. Verify: a chat test "200 t-shirts to Berlin" asks the material question, and answering "cotton" gives `610910`.
- [ ] 5.6 In `scripts/app.js` item table (~line 125) and the hint uses at lines 52, 229 and 239, show the suggestion as a secondary line labelled "suggested — verify". Verify: load the sample workbook; TB-02 shows TSH-01 with "suggested 610910" and SCK-01 with "suggested 611595", and both codes stay blank / `6115` in the table.

## 6. Deploy on Vercel (design D8)

- [x] 6.1 `scripts/vercel_build.sh`: `set -eu`; run `snapshot_tariff.py --if-new` and `export_hs_index.py`; if either fails and `HS_ALLOW_STALE=1`, print a warning and keep the committed `assets/hs_index.json`, otherwise exit non-zero; then `cd scripts && python3 build.py`, and copy `scripts/preflight.html` to `dist/index.html`. `vercel.json` at the repo root: `regions: ["sin1"]`, `installCommand: "dnf install -y postgresql16"`, `buildCommand: "sh scripts/vercel_build.sh"`, `outputDirectory: "dist"`, `framework: null`. Add `dist/` to `.gitignore`.
  - Verify: locally, `sh scripts/vercel_build.sh` (with `PSQL` from `.env.local`) prints the version line, `already loaded` and the export counts, and writes `dist/index.html`; with `DATABASE_MIGRATION_URL` pointing at a closed port it exits non-zero, and with `HS_ALLOW_STALE=1` it succeeds and prints the warning.
- [ ] 6.2 Create the Vercel project `preflight-shipment-checker` in team curious-minds3, linked to `github.com/ana21india/preflight-shipment-checker` (production branch `main`), and add `DATABASE_MIGRATION_URL` as a sensitive variable for Production and Preview. Verify: the project shows the Git link and the variable (value hidden) in both environments; nothing else is configured.
- [ ] 6.3 Push the HS branch and check its preview deployment. Verify: the build log shows `dnf` installing `psql`, the DBT version line, `already loaded`, the export counts and `OK`; the preview URL opens the app, the report footer shows `v4.0.1639 (26-10-2026)`, and the browser makes no request to the database, trade-tariff or data.api.trade.gov.uk.
- [ ] 6.4 After review, merge to `main` and check the production deployment the same way. Verify: the production URL serves the same page as the preview, and `SKILL.md` names the production URL and the Vercel build steps.

---

**Haiku validation:** each task names its exact file, approximate line, data rule and verification command or observable result, so a smaller model can carry it out step by step without further design decisions.
