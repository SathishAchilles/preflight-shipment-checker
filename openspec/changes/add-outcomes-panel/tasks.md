# Tasks

## 1. Engine

- [x] 1.1 In `scripts/engine.js`, before the `PF` export, add `OUTCOME_STAGES` (id, label, where, rules) exactly as proposal "Stop points", plus `firstStop(ev)` as design D1.
- [x] 1.2 Add `outcomes(before, after = before)` returning `{ total, stages[{…stage, before, now, avoided}], stoppedBefore, stoppedNow, avoided, atRisk, clean }` as design D2. Export it on `PF`.
- [x] 1.3 Add `avoidedCost(out, costs, which = 'avoided')` as design D3. Export it and `OUTCOME_STAGES` on `PF`.

## 2. App

- [x] 2.1 In `ingest()` in `scripts/app.js`, set `fileData.baseline` once (design D2).
- [x] 2.2 Add `outcomesEl(rows)`:
  - a headline "N of M bookings would likely have been stopped as uploaded";
  - a sub-line with the fixed, still stopped, need-a-look and clean counts;
  - four stage cards: count, label, "Likely stopped …", rule IDs, booking IDs, and a "N still stopped" / "All fixed" tag;
  - the note "Each booking counts once… Reporting only";
  - a collapsible "Estimate the cost (your figures)" table: low and high inputs per stage, and the totals "At stake as uploaded" and "Avoided by fixes so far", labelled an estimate.
- [x] 2.3 Call `outcomesEl(rows)` in `renderFile()` right after the notices.
- [x] 2.4 In `scripts/shell.html`, add `.outcomes` / `.oc-*` styles using the existing colour tokens. Cards go in 4 columns, and 2 below 760 px. The cost table scrolls inside its box on narrow screens.

## 3. Docs and build

- [x] 3.1 Add section 8 "Outcomes" to `references/logic.md`.
- [x] 3.2 Run `python3 scripts/build.py` to rebuild `scripts/preflight.html`.

Verify:
- `cd scripts && node run.js` passes 100%.
- `node verify.js` output is identical to `main`.
- In the browser, the sample shows 12 of 25 stopped with the counts in design "Sample workbook".
- Applying both HS fixes on TB-02 makes it "1 fixed here", and a customs-hold cost of £400–£1,200 shows "Avoided by fixes so far: £400–£1,200".
- At 390 px the page has no sideways scroll.
