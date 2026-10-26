# Design

## Context

- `scripts/engine.js` already holds the pure rule engine that runs in both Node and the browser.
  - `normHS()` (line ~150) returns `{ blank, raw, digits, hasLetters, numericCell }`.
  - R-01 (lines ~546–556) checks digit count, and its fix text uses `hsHint()`, which matches about 75 description regexes.
  - Over-long codes get an advisory at line ~657.
- `evaluate()` returns `{ checks, dataIssues, advisories, status, … }`. Any Red rule or data issue makes the status Red; otherwise any Amber makes it "Check".
- The repo's non-negotiables (SKILL.md) say rule IDs and severities come only from the fixed rulebook. Extra checks must be labelled "Data" or "Advisory", and the engine must never throw.
- The app ships as one self-contained `preflight.html`. `scripts/build.py` inlines `engine.js`, `chat.js`, `tests.js`, `app.js` and the sample workbook into `shell.html` placeholders (`{{ENGINE}}` etc.).
- **Source data (checked live on 25 Oct 2026, re-checked 26 Oct 2026):**
  - URL: `https://data.api.trade.gov.uk/v1/datasets/uk-tariff-2021-01-01/versions/latest/tables/commodities-report/data?format=csv`. It redirects with 302 to a versioned URL (`v4.0.1638` on 25 Oct, **`v4.0.1639` on 26 Oct**), is about 3.4 MB, and needs no auth.
  - Some descriptions contain line breaks, so the file has 30,631 physical lines for 25,873 rows; it must be read with a CSV parser.
  - Columns: `id, commodity__sid, commodity__code, commodity__suffix, commodity__description, commodity__validity_start, commodity__validity_end, parent__sid, parent__code, parent__suffix`.
  - "No end date" is written as `#NA`.
  - 25,873 rows, of which 25,793 are current. No row has a future start date.
  - 412 descriptions contain HTML such as `<br>`, and some contain `|`.

## Goals / Non-Goals

**Goals:**
- Supabase holds every loaded snapshot and is the source of truth for the HS data and the rules that derive the index (D7).
- Build-time export plus a pure lookup. Same input gives the same output, with no database or tariff API access at runtime. The app is used online; offline operation is not a goal.
- Keep `node run.js` at 100% and `node verify.js` at 20/20 with no changes to expected results.

**Non-Goals:**
- Checking whether a code the seller already gave fits its description.
- Any LLM, embedding or fuzzy-ranking service (suggestions use fixed rules only, D6).
- Cross-checking R-06 against HS prefixes.
- EU CN/TARIC validation for DE/FR/NL.
- Duty rates.
- Automatic or scheduled snapshot refresh.

## Decisions

### D1. Supabase holds the snapshot; the app gets an exported copy (Option A)
Pipeline, run by every Vercel build (`scripts/vercel_build.sh`) and runnable by a developer the same way:

```
DBT commodities-report ─┐                                   ┌─ views (D2/D3 rules in SQL)
                        ├─▶ snapshot_tariff.py ─▶ Supabase ─┤
HMRC search_references ─┘    (load, versioned)  preflight.* └─▶ export_hs_index.py ─▶ assets/hs_index.json
                                                                   (self-check)          │ committed
                                                                                         ▼
                                                     build.py inlines it ─▶ preflight.html (no DB at runtime)
```

1. `scripts/snapshot_tariff.py` (Python standard library plus the `psql` client):
   - follows `versions/latest` without following the redirect, and records the resolved version id from the 302 `Location` and today's date as the snapshot date;
   - downloads `commodities-report` as CSV and checks the header exactly;
   - downloads HMRC's search references once from `https://www.trade-tariff.service.gov.uk/uk/api/search_references` (no auth; checked live on 26 Oct 2026: HTTP 200, 2.7 MB, 8,940 entries of `{title, referenced_class, goods_nomenclature_item_id, productline_suffix}`);
   - loads both into the `preflight` schema as one new snapshot version, in a single transaction (D7). A version already loaded is refused unless `--replace` is given.
   - `--dry-run` downloads and checks only, and touches no database.
2. `scripts/export_hs_index.py` asks Postgres for the whole index as one JSON document built from the views of the current snapshot, checks the counts and sample codes, and writes `assets/hs_index.json` minified.
3. `build.py` inlines the JSON unchanged. A copy is committed, so `node run.js`, `node verify.js` and a local build never need the database or the network, and the deployed page never does.
4. **Vercel build** (`scripts/vercel_build.sh`, D8): `snapshot_tariff.py --if-new` (resolve the DBT version with one redirect request; download and load only when that version is not in `tariff_snapshot`) → `export_hs_index.py` → `build.py` → copy `scripts/preflight.html` to `dist/index.html`.

- *Rejected:* live calls to the HMRC Trade Tariff API, because of the rate-limit cut to about 50/min by 30 Nov 2026, OAuth credentials, and outage risk.
- *Rejected:* the browser querying Supabase at runtime (Option B): a hosted static page cannot reach `localhost`, it breaks the "no backend" rule in `SKILL.md`, and the HTML would carry a key.
- *Rejected:* `build.py` reading the database directly. Export stays a separate, checked step, and the committed copy keeps local builds and tests reproducible.
- *Rejected:* a Python Postgres driver (`psycopg`). It is not installed, and `psql` is already available, so the scripts stay standard-library only.
- *Rejected:* a daily refresh job, because the user decided on a one-time snapshot for this use case.
- *Rejected:* Parquet, which would need a non-stdlib reader.

### D2. Existence is derived from declarable leaves only
A row is current when `commodity__validity_end` is `#NA` or empty.

A **leaf** is a current row with suffix `80` whose `(code, "80")` is not any current row's `(parent__code, parent__suffix)`.

The index sets are:
- `hs6 = { leaf.code[:6] }`, which has 5,717 entries;
- `cn8 = { leaf.code[:8] }`, which has 9,888 entries;
- `l10 = { leaf.code }`, which has 16,684 distinct entries (from 16,688 leaf rows: 4 codes appear twice among the leaves; counted on `v4.0.1639`). The sorted arrays hold distinct codes only.

The rule handles every shape seen:
- a heading with no 6-digit split (`691200`, `330300`);
- a split subheading (`850760`, `610910`);
- a `-10` grouping row above its `-80` leaf (`090111`);
- a declarable heading (`090300`).

*Rejected:* "any current suffix-80 row with `code[:6] == hs6`". Measured on the snapshot, it accepts 6,775 codes, 1,058 of them false, including chapter and heading rows such as `010000` and `850700`.

### D3. Index format
```
{ "meta": { "source": "DBT uk-tariff-2021-01-01 commodities-report", "version": "v4.0.1639",
            "snapshotDate": "2026-10-26", "licence": "OGL v3.0", "store": "supabase preflight schema",
            "counts": {…} },
  "h4":  { "6912": "Ceramic tableware, …" },            // 1,234 headings
  "h6":  { "691200": "", "610910": "> Of cotton" },      // 5,717; path relative to its h4 heading
  "cn8": ["69120023", …],                                // sorted
  "l10": ["6912002310", …],                              // sorted
  "refs": [["mugs, of ceramic other than porcelain or china", "6912", "H"], …] }
                                    // [title, code prefix, H|S|C]; Chapter rows dropped
```
Without `refs` the prototype is about 1.41 MB minified; `refs` stored as `[title, prefix, class]` adds roughly 0.4 MB. `build.py` asserts that the inlined index is ≤ 2.0 MB and that `meta.counts` matches the array lengths.

- **`refs` prefix:** a Heading row keeps 4 digits; a Subheading or Commodity row keeps its code with trailing `0`s removed, cut to at most 6 digits (so `6115940000-10` "socks" becomes `611594`, and `6109100010` becomes `610910`). Rows whose prefix matches no `h6` entry are dropped at snapshot time.

- **Heading rows are pinned to suffix 80.** 34 heading-level codes have two current rows. For example, `6904000000` has suffix `10` "II. OTHER CERAMIC PRODUCTS" (a sub-chapter title) and suffix `80` "Ceramic building bricks…". `h4` takes the suffix-80 row only, and the path walk stops at `hs4 + "000000"` suffix 80.
- **`h6` is stored relative to its heading** (found 26 Oct 2026, when the corrected paths pushed the export to 2,015,261 bytes, over budget): `""` means the code is the heading itself, `"> …"` is the rest of the path below the heading. `setHsIndex` joins it back onto `h4`, so every lookup and the item table still show the full description, and `v_h6` in the database keeps the full text.
- **Path description for `h6`:** start at the current suffix-80 row whose code is `hs6 + "0000"` (the subheading itself), or the lowest suffix when there is none. Starting at a lower suffix would end the path at a grouping row such as "Other" (found on 611594: "… > Other" instead of "… > Other > Of wool or fine animal hair"). Walk its parents up to the heading, joining with ` > `. Strip HTML tags, turn `|` into spaces and collapse whitespace.
  - Example: `610910` gives "T-shirts, singlets and other vests, knitted or crocheted > Of cotton".
  - When the hs6 row is the heading itself (`691200`), use only the heading description.
- *Rejected:* storing all 25k rows with parent links, which is about 3× larger and not needed for validation.

### D4. Engine integration
- The engine gets the index without touching the network or the file system:
  - in the browser through a global set by an inlined `<script>` (`{{HSINDEX}}` placeholder in `shell.html`);
  - in Node through `PF.setHsIndex(require('../assets/hs_index.json'))` in `run.js` and `verify.js`.
- The new lookup functions are `hsLookup(digits)` and `hsHeading(h4)`. They do Set/Map lookups built once from the index, never throw, and return `{ known: null }` when no index is loaded. With no index, existence checks report "not checked" and add no issue, so the engine stays usable without it.
- **R-01 status logic is not touched.** Only its per-item detail and fix strings gain index-based text:
  - **5-digit number cells:** the hint names `"0"+digits` when it is in `h6`. The existing generic wording stays as the fallback, so test C4 still matches `/leading zero/`.
  - **4-digit codes:** use `h4` for the heading description and count the `h6` keys that start with it.
- **No automatic correction (user decision, 26 Oct 2026).** The engine never substitutes a code. Lookups always use `n.hs.digits` as entered. Corrections and suggestions are carried as **recommendations** `{ code, desc, why }` on the item (`n.hsRec`) and rendered as action buttons. The app already has the mechanism:
  - `fixActions()` builds buttons (`app.js` ~lines 45–51);
  - `ctx.apply({ itemPatch: { i, hs } })` writes per-item overrides (`app.js` ~line 315, `overrides[b].items[i]`);
  - `evalAll()` re-evaluates and marks the row `edited` (~line 286).

  In chat, `chatCtx.apply` sends the action's `say` text (e.g. "HS code for MUG-01 is 0901110000"), so the seller sees and confirms it as a normal turn.
- **7- and 9-digit number cells:** checked on the data, number `901110000` (from coffee `0901110000`) reads as HS `901110`, stereoscopic microscopes, which exists. `902400000` (tea) reads as `902400`, which does not. No HS or UK code has 7 or 9 digits.
  - When `numericCell` is set, the length is 7 or 9, and `'0'+digits` has a known first 6, `normaliseBooking()` sets the recommendation `'0'+digits` on `n.hsRec` (with `why: 'leading zero'`), and `evaluate()` adds **one** Advisory: "reads as <as-entered description>; the spreadsheet probably dropped a leading zero".
  - The Advisory takes the place of the plain existence Advisory for that item, so there is never a duplicate.
  - It is an Advisory, so the status does not change, like the existence check below.
  - Text cells never get this recommendation.
  - *Rejected:* validating the zero-padded code silently, because the user ruled out auto-correction.
- **Existence check (Advisory; decided 26 Oct 2026):** the fixed rulebook says its ten rules "are the only rules judges will test against", and R-01 checks only the digit count. A status change here would turn a booking the judges expect to be Green into "Check".
  - The check runs in `evaluate()` next to the existing HS advisories (~line 657). `advisories` is rebuilt on every `evaluate()` call, so re-evaluating never duplicates it.
  - It only covers items whose code passes the R-01 digit rule. Each item whose first 6 digits are not in `h6` gets one advisory naming the SKU and code.
  - *Rejected:* an Amber data issue raised in `normaliseBooking()`. It would add a status the rulebook does not define.
  - If the first 4 digits are a known heading, the fix text names it and its subheading count.
  - Otherwise it says the heading is not in the tariff and points to trade-tariff.service.gov.uk.
- **Full-code check:** runs only when the code has exactly 8 or 10 digits and its first 6 digits are valid. It checks `cn8` or `l10` with a binary search over the sorted arrays and adds an `advisories` entry on a miss. Codes with more than 10 digits keep only their existing advisory, so test "12-digit → advisories.length === 1" still holds.

### D5. UI
- **Item table** (`app.js` ~line 125): the HS cell shows the code plus a small description line from `h6`, or "not in UK tariff" styled `bad`.
- **Report footer and Rules tab:** add one line, "HS codes checked against UK tariff snapshot v4.0.1639 (26-10-2026), DBT data, OGL v3.0".
- **Chat live panel:** unchanged except that the same description appears once a code is entered.

### D6. HS code suggestion from the product description (whiteboard item 1)
Runs only for items whose code fails R-01 (blank, letters, or fewer than 6 digits, as entered). Pure function `hsSuggest(description)` in `engine.js`, built on the index loaded by `setHsIndex`. No randomness, no clock, no network.

1. **Normalise the description:** lower-case; `t shirt`, `tee`, `tshirt` → `t-shirt`; drop numbers and units (`350 ml`, `3-pack`, `10000mAh`); drop stop words (`a, an, the, of, and, or, for, with, set, pack, organic, new, …`); simple plural stemming (`mugs`→`mug`, `boxes`→`box`, `batteries`→`battery`).
2. **Collect candidates from three sources, strongest first:**
   - **S1, curated:** the existing `HS_HINTS` regex table (first match wins). Its code is accepted only if it is in `h6`. Entries marked generic are skipped by `hsSuggest` (user decision 26 Oct 2026): today only the bare `tea` → `090240` entry, because black tea in packs of 3 kg or less is `090230`, so the honest answer for "Black tea, 250 g" is heading 0902 with its subheadings. `hsHint` itself is unchanged and stays the no-index fallback.
   - **S2, search references:** each ref title is split into a **head** (text before the first `,` or ` - `) and **qualifiers** (the rest). A ref matches when every head token is in the description. Candidates are all `h6` codes under the ref's prefix. Score = 3 × head tokens + 1 × qualifier tokens also in the description.
   - **S3, tariff wording:** token overlap between the description and each `h6` path description, weighted by inverse document frequency computed once at `setHsIndex`. Used only when S1 and S2 find nothing, and capped so it never outranks an S2 hit.
3. **Material check:** fixed list `cotton, wool, synthetic, polyester, nylon, silk, leather, porcelain, china, ceramic, stoneware, glass, plastic, steel, iron, aluminium, wood, paper`. Words after "other than" in a description or ref are treated as excluded materials. If the item names a material, candidates whose subheading wording names that material are multiplied by 1.5; candidates that name a different material only are multiplied by 0.3.
4. **Pick the answer level:**
   - one HS-6 code when its score is at least 1.5 × the runner-up → "Suggested HS code 610910 — T-shirts … > Of cotton (matched: cotton, t-shirt; source: HMRC search reference)";
   - otherwise, when the top candidates share a 4-digit heading → "Heading 0902 Tea — choose one of 090210, 090220, 090230, 090240";
   - otherwise up to 3 candidates; nothing when no source matched.
   - Ties break by code ascending, so output is stable.
4b. **Refinements found on the live data during implementation (26 Oct 2026):**
   - `stock`, `misc`, `goods` and `products` are stop words: "Misc stock" otherwise matched the reference "stocks, fruit" (heading 0602).
   - Each unmatched qualifier word costs 0.1, so a bare reference ("tea" → 0902) beats a more specific one that does not fit ("tea, extracts, essences and concentrates" → 210120).
   - A bare material word as a reference head ("wool, mineral") scores 1 instead of 3, so "Wool socks" follows the "socks" reference, not slag wool (6806).
   - S1 skips a curated code whose wording names only a different material than the item ("Wool socks" does not get the cotton-socks hint 611595).
   - S3 needs at least half of the description's words to match ("Widget assembly kit" no longer matches chemical kits on "kit" alone).
   - The heading-level answer uses the candidates tied at the top score; the list answer uses those within 1.5× of it.
5. **Where it shows** (as a recommendation with one "Use <code>" action per candidate, never applied without a click or a chat "yes"): R-01 fix text (replacing the plain `hsHint` text when an index is loaded; `hsHint` stays the fallback with no index), the chat reply when the seller gives a product without a code, and the item table as a "suggested" line. A suggestion is never written into the booking, never changes any status and always says "verify on trade-tariff.service.gov.uk".
6. **Chat follow-up:** when the choice is between subheadings that differ only by material, the chat asks one question, "What is it mainly made of?", and re-runs step 3 with the answer.

Prototype on the live data (26 Oct 2026), before steps 1–3 were refined:
- "Organic cotton T-shirt" → `610910`; "Perfume 50 ml" → `330300`; "Scented soy candle" → `340600`; "Glass vase" → heading 7013.
- **Failures found by the prototype** and fixed by the rules above:
  - "Ceramic mug, 350 ml" ranked radioactive elements first through raw word overlap on "ceramic". The fix is the head/qualifier split (the "mugs" head selects 6912) and capping S3.
  - "Cotton socks" ranked `611594` (wool, from the "socks" ref) above `611595` (cotton). The fix is the material boost.
  - "Power bank" had no ref. This is covered by adding an S1 entry `850760`. The item is also an R-06 Red stop anyway.
- *Rejected:* the HMRC `/search` endpoint at runtime (needs network and is rate-limited); `classification_search` and any embeddings (not deterministic); fuzzy edit-distance matching (unstable rankings, hard to explain).

### D7. Database layout (Supabase, `preflight` schema)
**Where.** The hosted Supabase project used by trip-together (`jyefwcjbsmekmdubykyo`, ap-southeast-1), reached through Supavisor's session pooler (`aws-0-ap-southeast-1.pooler.supabase.com:5432`, user `postgres.jyefwcjbsmekmdubykyo`). The connection string is `DATABASE_MIGRATION_URL`: on Vercel a sensitive project environment variable, locally the gitignored `preflight-shipment-checker/.env.local` (copied from `~/ws/trip-together/.env.production.local`). `dbenv.py` uses the environment variable when set and `.env.local` otherwise, and never prints it. The scripts never read trip-together's files. The schema sits beside trip-together's `trip_together` schema in the same database and shares nothing with it.

**Migration** `scripts/db/001_preflight_tariff.sql`, re-runnable (`create … if not exists`, `create or replace view`):

| Object | Columns / rule |
|---|---|
| `preflight.tariff_snapshot` | `version text primary key`, `source text`, `snapshot_date date`, `licence text`, `commodity_rows int`, `ref_rows int`, `is_current boolean not null default false`, `loaded_at timestamptz default now()`. A unique partial index on `(is_current) where is_current` allows one current snapshot. |
| `preflight.tariff_commodity` | `version text references tariff_snapshot on delete cascade`, `row_id int` (the CSV `id`), `sid int`, `code char(10)`, `suffix char(2)`, `description text`, `validity_start date`, `validity_end date` (`#NA` → null), `parent_sid int`, `parent_code char(10)`, `parent_suffix char(2)`; primary key `(version, row_id)`; index on `(version, code, suffix)` and `(version, parent_code, parent_suffix)`. |
| `preflight.tariff_search_ref` | `version text references tariff_snapshot on delete cascade`, `title text`, `referenced_class text`, `code char(10)`, `suffix char(2)`. |
| `v_current` | the one `tariff_snapshot` row with `is_current`. |
| `v_leaf` | current rows of the current version (`validity_end is null`) with suffix `80` and no current child pointing at `(code, '80')` (D2). |
| `v_h4` | heading → description: suffix-80 rows whose code ends `000000` and whose positions 3–4 are not `00`, HTML stripped. |
| `v_h6` | HS-6 → path description: distinct `left(code, 6)` of `v_leaf`; the path is built by a recursive CTE from the shallowest `hs6 || '0000'` row up to the suffix-80 heading row, joined with ` > `; HTML stripped (`regexp_replace(d, '<[^>]*>', '', 'g')`), `|` → space, whitespace collapsed (D3). |
| `v_cn8`, `v_l10` | distinct `left(code, 8)` and `code` of `v_leaf`. |
| `v_refs` | search references with the D3 prefix rule; Chapter rows and rows whose prefix matches no `v_h6` entry dropped. |

Row-level security is enabled on the three tables with no policies, so PostgREST's `anon` and `authenticated` roles read nothing; the scripts connect as the database owner. The schema is not added to PostgREST's exposed schemas.

**Loading** (`snapshot_tariff.py`): the downloads are written as clean CSV files to a temporary directory, then one `psql -v ON_ERROR_STOP=1 --single-transaction -f load.sql` run inserts the `tariff_snapshot` row, `\copy`s both files in, fills the row counts, and moves `is_current` to the new version. Any failure rolls the whole load back, so a half-loaded snapshot is never current. Older versions stay in the database for comparison and can be dropped with `delete from preflight.tariff_snapshot where version = …`.

**Exporting** (`export_hs_index.py`): one `psql -XAt` query returns the index as a single JSON value (`json_build_object` over `v_current`, `v_h4`, `v_h6`, `v_cn8`, `v_l10`, `v_refs`, arrays ordered by code). The script then checks:
- `h6` ≈ 5,717, `cn8` ≈ 9,888, `l10` ≈ 16,684 (±1%);
- `691200`, `090111`, `850760`, `330300`, `610910` are in `h6`, and `999999`, `850700`, `010000` are not;
- exactly 15 `l10` entries start `691200`, including `6912002191`;
- `meta.counts` equals the array lengths, and the minified size is ≤ 2.0 MB.

On any failure it exits non-zero and leaves the old `assets/hs_index.json` untouched. The output is the same for the same snapshot, so re-exporting gives a byte-identical file.

- *Rejected:* computing the index in Python and storing only the result. The rules would then live outside the database, and the database would not be the source of truth.
- *Rejected:* an `hs_recommend()` SQL function next to the JS `hsSuggest()`. The same scoring would exist twice and could drift. The database holds the data suggestions use (`v_refs`, `v_h6`), and the scoring stays in `engine.js` only.
- *Rejected:* the local Docker Supabase. The Vercel build cannot reach `localhost`, and on 26 Oct 2026 the local stack was unreachable.
- *Rejected:* a new Supabase project. The user chose to reuse trip-together's project with a separate schema, the same pattern as Aangan.

### D8. Vercel deployment
- **Project:** `preflight-shipment-checker` in team curious-minds3, created new, Git-linked to `github.com/SathishAchilles/preflight-shipment-checker` (a copy of `ana21india/preflight-shipment-checker` under the user's account, user decision 26 Oct 2026: Vercel's GitHub App has no access to the ana21india account; the copy is the deploy source, and `ana21india` stays the `origin` remote); production branch `main`, other branches give preview deployments.
- **`vercel.json`:** `regions: ["sin1"]`, `installCommand: "dnf install -y postgresql16"` (the Amazon Linux 2023 build image installs packages with `dnf`), `buildCommand: "sh scripts/vercel_build.sh"`, `outputDirectory: "dist"`, no framework.
- **Environment:** `DATABASE_MIGRATION_URL` (sensitive) for Production and Preview. No variable is exposed to the browser.
- **Failure rule:** if the database is unreachable or a self-check fails, the build stops (non-zero) unless `HS_ALLOW_STALE=1` is set, in which case it uses the committed `assets/hs_index.json` and prints a warning. A deployment therefore never silently ships stale data.
- **What the build log shows:** the resolved DBT version, whether it was loaded or already present, the exported counts and the page size.
- *Rejected:* Vercel Cron plus a function to refresh. It needs a Postgres driver instead of `psql` and adds a scheduled job, which is a non-goal.

## Risks / Trade-offs

- [The snapshot ages and a code is end-dated after 26 Oct 2026] → The stamp is shown on every report. Refreshing is two commands (`snapshot_tariff.py`, then `export_hs_index.py`), documented in SKILL.md. HS 2028 does not take effect until 1 Jan 2028.
- [Supabase is unreachable during a Vercel build] → The build fails rather than shipping stale data; `HS_ALLOW_STALE=1` deploys with the committed export. The deployed page never depends on the database.
- [Writing into trip-together's production database] → Everything lives in the separate `preflight` schema with row-level security and no policies; `drop schema preflight cascade` removes it without touching `trip_together`. About 35,000 rows per snapshot version.
- [The database copy and the committed JSON drift apart] → `meta.version` names the snapshot the JSON came from, and the export is deterministic, so re-exporting and diffing shows any drift.
- [Credentials leak] → `.env.local` is gitignored, and the scripts never print the connection string. The app never holds a database credential.
- [UK-only data, while the destinations are EU] → The HS-6 level is identical internationally, so the existence check rests on HS-6 only. UK 8/10-digit misses are only advisories, and EU-specific codes are out of scope.
- [`preflight.html` grows by about 1.8 MB with search references] → It is still one static file. The build asserts the 2.0 MB budget, and parsing the JSON once takes milliseconds.
- [A suggestion is wrong] → It is only shown as "suggested — verify", names the matched words and source, and never fills the code or changes a status. The seller still has to enter the code, so R-01 stays Red until they do.
- [Judges plant a code that is real but obscure] → No false advisory is possible: the check accepts any HS-6 code that has a current UK leaf.
- [The DBT `latest` alias or schema changes before a re-snapshot] → The script checks the CSV header columns and exits non-zero with a clear message. The committed JSON keeps working.
- [Statuses drift from the rulebook] → HS existence results are Advisory only, so they never change Red/Amber/Green. Every 6+ digit code in the 20 test bookings also exists in the snapshot, so expected results stay the same. `verify.js` guards this.

## Migration Plan

This is additive.
1. Apply `scripts/db/001_preflight_tariff.sql` to the hosted Supabase.
2. Run `snapshot_tariff.py` to load `v4.0.1639`, then `export_hs_index.py`, and commit `assets/hs_index.json`.
3. Ship the engine and UI changes, then rebuild `preflight.html`.
4. Create the Vercel project, set `DATABASE_MIGRATION_URL`, push the branch and check the preview deployment, then merge to `main`.

To roll back the app, revert the commit; with no index the engine falls back to today's behaviour (D4). To roll back the database, `drop schema preflight cascade` removes everything this change added and touches no other schema.
