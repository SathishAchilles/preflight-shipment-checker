# Proposal

## Why

R-01 today only counts digits. A code like `999999` or `850700` passes even though no such HS subheading exists, so the shipment would still be held at customs. Sellers also get no explanation of what a valid code means. A short or broken code gets a generic "look it up" message even when the tariff could say exactly what was meant (for example `90111` → `090111`, "Coffee, not roasted").

## What Changes

- **Hold the tariff data in Supabase (user decision, 26 Oct 2026, "Option A").** A developer script downloads the UK tariff commodity list from the Department for Business and Trade Data API (`uk-tariff-2021-01-01` → `commodities-report`) and HMRC's search references, and loads both, versioned, into a `preflight` schema in the hosted Supabase project already used by trip-together (`jyefwcjbsmekmdubykyo`, ap-southeast-1). The database is the source of truth: the declarable-code rules, heading descriptions and path descriptions are SQL views over the loaded rows.
- **Export a compact HS index from the database.** A second script reads those views and writes `assets/hs_index.json`, which is inlined into `preflight.html` at build time. A copy is committed as the fallback.
- **Deploy on Vercel and run the scripts there (user decision, 26 Oct 2026).** A new Vercel project `preflight-shipment-checker` (team curious-minds3, region `sin1`, next to the database) is linked to `github.com/ana21india/preflight-shipment-checker`. Every build loads a new tariff version into Supabase only when DBT has published one, exports the index from Supabase, runs `build.py` and publishes `preflight.html` as the site's `index.html`. The app never connects to the database or to any tariff API at runtime, needs no key and is not rate-limited. The build and the tests use the committed JSON, so they work without the database. The page itself is used online (SheetJS loads from cdnjs).
- Add an **HS existence check** against that index, for codes that pass R-01's digit count:
  - The first 6 digits must be a real HS subheading in the UK tariff. If not, add an **Advisory** with the reason and the fix. It does not change the booking's status, because the rulebook only tests R-01's digit count.
  - An 8- or 10-digit code whose first 6 digits are valid but whose full code is not a UK commodity code gets an **Advisory**, which does not change the status.
- **Enrich R-01's fix text from the index** (R-01 stays Red exactly as today):
  - **5-digit number cells:** if `0` + the code exists, show "did you mean 0xxxxx — <description>".
  - **4-digit headings:** if the heading exists, name its subheading, or the subheadings when there are only a few.
  - **7- and 9-digit number cells:** these are usually 8- or 10-digit codes that lost a leading zero. The code is still checked **as entered**. The engine raises one issue saying so and recommends the zero-padded code (e.g. number `901110000` reads as microscopes `901110`; recommended `0901110000`, coffee).
- **No automatic correction (user decision, 26 Oct 2026).** The engine always validates the HS code exactly as entered. Formatting is read but no digit is changed: number-cell `.0` is dropped, and dots, spaces and an "HS" prefix are removed. Every corrected or suggested code (leading-zero fixes, 4-digit heading picks, description-based suggestions) is shown on the form only as a **recommendation**, with a "Use this code" button. It changes the booking only when the user clicks that button, and the booking is then marked as edited. In chat, the user has to answer "yes".
- **Name the matched code.** A valid code's description is shown (e.g. `691200` — "Ceramic tableware, kitchenware… other than of porcelain or china"), and every result states the snapshot version and date.
- **Suggest an HS code from the product description** (whiteboard item 1). When an item's code is blank, too short or contains letters, the engine proposes a code from the description using fixed rules (no LLM, no embeddings, no network):
  - sources, in order: the curated `HS_HINTS` table, HMRC's published search references (a second pull by the snapshot script, held in Supabase with the tariff, `search_references`, 8,940 entries), then the tariff's own subheading descriptions;
  - a material check (cotton, wool, ceramic, porcelain, glass, plastic and so on) separates subheadings that differ only by material;
  - the answer is one HS-6 code when one clearly wins, otherwise the heading plus its candidate subheadings, otherwise nothing;
  - every suggestion names the words that matched and its source, is labelled "suggested — verify", is never written into the booking automatically, and never changes R-01's status.
- Not changed in this change: the R-06 dangerous-goods scan (see change `add-booking-safeguards`) and checking whether an existing code fits its description.

## Capabilities

### New Capabilities

- `hs-code-suggestion`: proposing an HS code, or a short list of candidates, from an item's product description, deterministically from the bundled snapshot, with the matched words and source shown.
- `hs-code-validation`: validating an item's HS code against a bundled, dated UK tariff snapshot that is held in Supabase and exported into the app. It covers code normalisation, the R-01 digit rule, existence of the HS subheading and of the UK 8/10-digit code, leading-zero and short-code recovery hints, and how results are labelled and explained.

### Modified Capabilities

None. The project has no existing specs.

## Impact

- **Code:**
  - `scripts/engine.js`: index lookup, the existence check, R-01 fix-text enrichment and new data-issue/advisory entries.
  - `scripts/app.js`: shows the code description and snapshot stamp in the item table and report.
  - `scripts/build.py`: inlines the index.
  - `scripts/run.js` and `scripts/verify.js`: load the index in Node.
  - `scripts/tests.js`: new tests.
  - `references/logic.md` and `references/test-scenarios.md`: rule documentation.
- **New files:**
  - `scripts/db/001_preflight_tariff.sql`: the `preflight` schema, its tables and views. Re-runnable.
  - `scripts/snapshot_tariff.py`, run by a developer. It makes two pulls, the DBT commodities report and HMRC's `search_references` list, and loads them into Supabase as a new snapshot version.
  - `scripts/export_hs_index.py`: reads the views of the current snapshot and writes `assets/hs_index.json`, with a self-check of the counts.
  - `assets/hs_index.json`, the committed export (validation sets, descriptions and search references; size budget 2.0 MB).
  - `.env.local` (gitignored): `DATABASE_MIGRATION_URL` for the hosted Supabase session pooler, copied from `~/ws/trip-together/.env.production.local`. On Vercel the same variable is a sensitive project environment variable.
  - `vercel.json` and `scripts/vercel_build.sh`: install `psql` with `dnf`, then snapshot (if new) → export → build → `dist/index.html`.
- **Dependencies:** none at runtime. The two scripts use only the Python standard library plus the `psql` client (`/opt/homebrew/opt/libpq/bin/psql`, or `PSQL` set in `.env.local`). The database is needed only by the Vercel build (or a developer run); the app never connects to it.
- **Data:** UK tariff snapshot `v4.0.1639` (26 Oct 2026) and HMRC search references fetched the same day, both under the Open Government Licence v3.0. Attribution is shown in the app.
- **Expected results:** every 6+ digit code in `assets/Preflight_Test_Cases.xlsx` exists in the snapshot, so `node verify.js` must still match 20/20.

## Decisions to confirm

- **Online use (decided 26 Oct 2026):** the case only requires that "the link must work for us without your help or a login"; it does not ask for offline use. The app is used online. SheetJS stays on cdnjs, and the bundled snapshot exists to make results deterministic and free of rate limits, not to support offline use.
- **Severity of "code not in the UK tariff" (decided 26 Oct 2026):** Advisory. The fixed rulebook only checks the digit count (R-01), and judges test against the rulebook only.
- **Data store (decided 26 Oct 2026):** Supabase holds the tariff data; the app gets an exported copy at build time (Option A). Querying the database live from the browser (Option B) was rejected: the hosted static page cannot reach a database on `localhost`, it would break the "no backend" rule in `SKILL.md`, and it would put a key in the HTML.
- **Which Supabase (decided 26 Oct 2026):** trip-together's hosted project, in its own `preflight` schema with row-level security and no policies; trip-together's `trip_together` schema is not touched. The local Docker stack was the first choice but was unreachable, and the Vercel build needs a database it can reach.
- **Where the scripts run (decided 26 Oct 2026):** in the Vercel build. A refresh happens only when a deploy finds a new DBT version; there is still no scheduled job.

---

**Haiku validation:** the proposal, spec scenarios, design decisions and tasks name exact codes, files, data rules and verification commands, so a smaller model can implement this change without further design decisions.
