# Preflight — decision logic

## 1. Architecture
- **Pure engine** (`engine.js`) → normalise → evaluate → recommend → confirm. Same code runs in Node tests and the browser, so tests prove what judges see.
- **Chat** (`chat.js`) only produces a booking object; it reuses the same engine for checks.
- **No AI model, no server.** Deterministic, instant, works on any static host, explainable.
- **HS tariff data** is held in Supabase (`preflight` schema: every UK tariff snapshot loaded by `snapshot_tariff.py`, plus HMRC search references). `export_hs_index.py` turns the current snapshot into `assets/hs_index.json`, which the build inlines. At runtime the app never touches the database or any tariff API; every HS result is checked against the bundled snapshot, whose version and date are shown in the report.

## 2. Reading uploaded files
1. Each sheet → array of rows (SheetJS, `raw:true`; CSV read as text so `05-11-2026` isn't turned into 11 May).
2. **Sheet detection:** by headers first (Booking ID + SKU/Unit price = Items; Booking ID + Seller/Pallets = Bookings), then by sheet name. Supports one workbook or two files.
3. **Header row:** first row in the top 15 containing "Booking ID" (works with or without the title row).
4. **Column mapping by normalised header name** (lower-case, letters/digits only) with aliases → column order doesn't matter. Missing columns → Amber notice, values treated blank.
5. **Skip blank rows.** Skip the grey template example row (BK-001 Northfield Goods / MUG-01) only if it is the first data row *and* matches the template exactly (toggle in UI).
6. **Item → booking match:** trimmed, upper-cased IDs. Unmatched item rows → "orphan" notice listing ID, row, SKU. Duplicate Booking IDs → Red data issue.
7. If an "Expected results" sheet exists, the app compares statuses (test harness).

## 3. Normalisation (never throws)
| Field | Logic |
|---|---|
| Numbers | Strip £, GBP, kg, commas, spaces. Blank → missing; non-numeric → "isn't a number"; ≤0 → invalid; counts (pallets, cartons, qty, units/carton) must be whole. |
| Dates | Excel serial → date; ISO `YYYY-MM-DD`; `DD-MM-YYYY`, `/` or `.`, 2-digit year → 20xx; "5 Nov 2026", "Nov 5 2026". Round-trip validated; `31-02` or US `11-31` rejected. |
| Countries | Aliases: UK/GB/England → United Kingdom; Holland/NL → Netherlands; PRC → China; Türkiye → Turkey. |
| Cities | Must be on route lists; city decides country; city/country mismatch → Red. |
| Priority / destination type / Yes-No | Keyword mapping ("cheap", "fulfilment centre", "yes "). Unknown priority → Balanced + Amber note. Blank appointment for a warehouse → treated as No. |
| HS code | Number → integer string; text keeps leading zeros; "HS" prefix removed; dots/spaces removed before counting digits; letters flagged. |

## 4. Rulebook
| Rule | Pass condition / edge handling | Fix text |
|---|---|---|
| R-01 HS (Red) | ≥6 digits, no letters, checked **as entered** (formatting such as dots, spaces, `.0` and an "HS" prefix is removed; digits are never added, removed or changed). 5-digit *numeric* cell → "Excel dropped the leading zero", and when `0`+code is in the tariff snapshot the fix recommends it with its description (90111 → 090111 Coffee, not roasted). 4-digit heading → the fix names the heading and recommends its subheading when it has only one (6912 → 691200), or says how many it has (6115: 9), or that the heading is not in the tariff. >10 digits → advisory only. Recommendations are carried on the item (`hsRec`) and applied only by a "Use" click. | Suggested code from the item name, recommendation only (`hsSuggest`, design D6): (1) curated patterns (specific before general: tea towel 630291 before towel 630260; generic "tea" skipped; a pattern naming a different material than the item is skipped), (2) HMRC search references matched on their head phrase, (3) tariff wording when nothing else matched. Cotton/wool/porcelain… pick between sibling subheadings. One code when it clearly wins, else the heading and its candidates (Black tea → 0902: 090210…090240), else nothing. Chat asks once what the item is mainly made of when only material separates the candidates. Never auto-applied; shown in the fix text, a one-click "Use 691200" button, the invoice table and the live sheet. No match → link to the UK Trade Tariff. |
| R-02 Value (Red) | `|declared − Σqty×price| / Σ ≤ 1%` (inclusive). | Set declared to Σ; if gap = one item's line → "item left out / counted twice"; ×10 gap → "misplaced zero". |
| R-03 Packing (Red) | Per item `units/carton × cartons = qty` exactly. | Offer qty = upc×cartons, or cartons = qty÷upc only if whole. |
| R-04 Cartons (Red) | Booking cartons = Σ item cartons. | Set to Σ; name the item whose cartons equal the gap. |
| R-05 Pallet weight (Red) | gross÷pallets ≤ max of the **chosen** carrier (priority pick, or seller override); equal passes. | Price every escape: switch carrier as-is, re-pack chosen carrier onto ⌈gross÷max⌉ pallets, or re-pack + switch; order by seller priority. Over 750 kg = over every carrier. |
| R-06 DG (Red) | Keyword scan of description + SKU. **Definite** (lithium, Li-ion, power bank, vape, aerosol, hairspray, perfume, nail polish, petrol, acetone, methanol, hand sanitiser…) → Red. **Possible** (battery, Bluetooth speaker, phone, device tablets such as iPad/Android tablet, "spray", paint, reed diffuser, spirits) → Amber "confirm". Plain "tablets" (medicine, pool chlorine) and "fuel tablets" are not R-06 hits. Negations ignored: "batteries not included", "battery-free", "non-aerosol", "alcohol-free". Accessories excluded (phone case, spray bottle, "lighter weight"). R-06 covers the three rulebook categories only; other ADR classes add an Advisory that does not change the status (see below). Note: by road, spirits ≤70% ABV in containers ≤250 L are not ADR-regulated (special provision 145); R-06 still lists them as "possible" because the rulebook says "flammable liquids". | Remove item; these road services carry no ADR dangerous goods. |
| R-07 Gross (Amber) | gross ≥ Σ unit weight×qty (equal passes, advisory "looks like net weight"). | Re-weigh; expect net + ≈25 kg/pallet. |
| R-08 Appointment (Amber) | Warehouse ⇒ Yes. Business address ⇒ N/A. Not booked stays Amber. | Book slot for the ETA date. While not booked, the delivery estimate is transit days **+ 2 buffer days** to get a slot (Carrier A: 5 + 2), then moved to the next working day. |
| R-09 Origin (Amber) | Every item has country of origin. | Add where made (not shipped from). |
| R-10 Date (Amber) | ready ≥ today (today passes, this device's date at the time of the check; the report says which date). Tests pin 25-10-2026 so results are repeatable. | Update to today or later; ETA counted from today. |

**Statuses:** pass / fail / check (needs confirmation) / cannot (data missing) / na. **Overall:** any Red (rule or data) → Red "Hold"; else any Amber → "Check"; else Green "Cleared".

**Possible dangerous goods (Advisory, not rulebook):** `DG_ADR` in `engine.js` scans the same text for ADR classes 1, 2 (incl. toxic gases), 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 6.2, 7, 8 and 9 (fireworks, gas cartridges, extinguishers, matches, charcoal, pool chlorine, filler hardener, pesticides, smoke alarms, car batteries, drain cleaner, mercury thermometers, sodium-ion batteries, fuelled engines, dry ice, airbags…). One advisory per item names the class, matched words, typical UN numbers and the exemption that would make it unregulated. Known look-alikes are removed first (`DG_SAFE`: spirit level, matchbox, charcoal grey, optical smoke alarm, flared jeans, 3% hydrogen peroxide…). Skipped when R-06 already fails for the item. Never changes Red/Amber/Green — the rulebook is the only thing judges test.

**Pallet plan (Advisory):** for each carrier on the route, the fewest pallets the weight allows (⌈weight ÷ max kg⌉), kg per pallet and cost; planning weight is the gross weight, or goods + 25 kg/pallet labelled as an estimate. If the booking uses more pallets than its chosen carrier needs, an advisory names the smaller count and the saving ("check volume and stacking height"). Cartons are split by weight, heaviest first onto the lightest pallet. Every option is a "Use N pallets" button; nothing changes without a click.

**Prices:** every price is shown with "Indicative rate per pallet for the destination country. Actual prices vary by collection and delivery city, fuel surcharge and date — confirm with the carrier." (`PF.PRICE_NOTE`; once per chat).

**HS tariff advisories (UK tariff snapshot; never change the status):** for codes that pass R-01 — first 6 digits not an HS subheading (999999; 850700 names heading 8507 and its 7 subheadings); 8 or 10 digits whose HS-6 is valid but the full code is not a current UK commodity code (6912001000); a 7- or 9-digit *numeric* cell is checked as entered and, when `0`+code is in the tariff, one advisory says what it reads as now and recommends the padded code (901110000 reads as microscopes → 0901110000 coffee). With no index loaded none of these run.

**Automatic corrections and audit trail (review only, never a status change):** `normaliseBooking()` records every value it used that differs from what was entered (`b.corrections`, returned by `evaluate()` as `corrections`). Kinds: `format` (HS dots/`.0`, £/commas/units, letter case), `alias` (country, city, destination type, priority, yes/no synonyms), `date` (anything not typed DD-MM-YYYY, e.g. an Excel date cell), `default` (blank origin country → United Kingdom, blank currency → GBP) and `derived` (chat worked-out cartons, quantity, units per carton, total cartons, declared value). Recommendations (HS codes, pallet plan, carrier) are not corrections — they still need a click. Each booking report shows "Automatic corrections — please review" (You entered / We used / Why) with **Accept**, **Change…** and **Accept all**; the file table has a "To review" count; chat lists them once the booking is complete with a "Looks right" chip. The audit trail logs `auto-corrected` (system), `accepted`, `changed`, `fix applied` and `fixes undone` (you) in order, de-duplicated across re-checks; it lives in the browser for the session and is exported as the **Corrections** sheet of the results download.

**Data-quality checks (labelled "Data"):** missing required fields, non-numeric, zero/negative, fractional counts, unknown city/country/route, city–country mismatch, non-GBP, no items, duplicate Booking ID (matched after trimming spaces and ignoring case), duplicate SKU, missing SKU/description, orphan items.

## 5. Carrier recommendation
Cost = price per pallet × pallets (route by destination country).
- **Cheapest:** cost ↑, then transit ↑, on-time ↓.
- **Fastest:** transit ↑, then on-time ↓, cost ↑.
- **Most reliable:** on-time ↓, then transit ↑, cost ↑.
- **Balanced:** start at cheapest; step to a faster option only if `% transit saved ≥ % cost added`. A→B: +22–25% cost for −40% time ✔; B→C: +55–60% cost for −33% ✘ → **B on all routes**. Reason text shows the maths.
- Seller can override ("switch to carrier B"); changing priority clears the override.
- If chosen fails R-05 → report shows "over limit", recommended fix with button; file table shows `A → B · £660`.

## 6. Timeline & confirmation
Collection = ready date (today if past), moved to Monday if weekend; delivery = collection + transit calendar days, moved off weekends. Confirmation: plain sentence of what/where/carrier/cost/ETA + ordered next steps (fix reds → carrier booking → commercial invoice & export declaration → label cartons/pallets → ready at origin → appointment matching ETA → EU import clearance & tracking). Confirm is blocked while Red; Amber confirms with warning; reference `PF-######`.

## 7. Conversation engine
- **Masking pipeline:** each recognised span is blanked so numbers aren't reused: carrier override → dates → declared value → total cartons → pallets (deltas before absolutes) → explicit gross weight → item mentions → per-item details → leftover kg → cities/type/appointment/priority/seller.
- **Item mentions:** `<qty> <noun phrase>`; ignore units (kg, ml, pallets, days, months…), numbers after £/HS/SKU, decimals. "pallets of t-shirts", "Cushions — 600", "ship candles to Paris" also create items.
- **Per-item zones:** text between one mention and the next belongs to that item (price, units/carton, "N cartons of M", unit weight "each"/grams, HS, "made in X").
- **Existing item match** by word stems (mugs ↔ ceramic mugs) → update, not duplicate. Changing qty clears *derived* cartons and re-derives.
- **Derivation:** any 2 of qty / units per carton / cartons → the third (only if whole). Booking cartons & declared value = item sums unless stated.
- **HS suggestion in chat:** the HS question names the usual code and offers a "Use 340600" chip; after "don't know" the code is suggested again and "use 340600" accepts it at any point.
- **Pending question:** bare answers ("500", "Leeds", "yes", "don't know") fill the asked field. "Don't know" HS/origin is accepted then flagged.
- **Questions order:** destination → origin → items (lists all missing per item) → pallets → gross (shows net goods weight) → ready date → destination type → appointment (warehouse only) → priority → seller name.
- **Intents:** reset, confirm, summary ("what's wrong?"), help. Unserved cities (Munich, Bristol, Spain) → redirect note.
- **After complete:** every change re-runs checks and lists the diff ("R-05 now passes"). One-click fixes in chat send the equivalent sentence, so chat history stays truthful.
- **Live panel:** booking sheet with "needed"/"calc" markers; while incomplete, unasked fields show "waiting", not false Reds.

## 8. Outcomes (file tab, reporting only)
- **First stop per booking** (`outcomes()` in `engine.js`). Each Red booking counts once, at the earliest of:
  - **bounced back as filed**: any Red data issue;
  - **refused at collection**: R-05, R-06;
  - **customs hold**: R-01, R-02;
  - **rejected at delivery**: R-03, R-04.

  Only `fail` on a Red rule is a stop. `check`, `cannot` and Amber fails count as "need a look", with no £.
- **Before / now / avoided.** "Before" is the booking as uploaded (`fileData.baseline`, evaluated once at ingest). "Now" includes the fixes applied in this session. "Avoided" means stopped before and not now; a partly fixed booking is still stopped.
- **Cost estimate** (`avoidedCost()`). The user enters low and high £ per stopped booking for each stage. There are no defaults. Each stage contributes n × low to n × high, and blank or invalid stages are left out. The panel shows "At stake as uploaded" (every stop) and "Avoided by fixes so far". It is always labelled an estimate and is never added to carrier prices. Figures are kept in `localStorage['pf-outcome-costs']`.
- **Never changes Red/Amber/Green.** Sample workbook: 12 of 25 stopped (3 / 4 / 3 / 2), 5 need a look, 8 clean.
