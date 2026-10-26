# Tasks

## 1. Engine

- [x] 1.1 In `scripts/engine.js`, before the `PF` export, add `OUTCOME_STAGES` (id, label, where, rules) exactly as proposal "Stop points", plus `firstStop(ev)` as design D1.
- [x] 1.2 Add `outcomes(before, after = before)` returning `{ total, stages[{…stage, before, now, avoided}], stoppedBefore, stoppedNow, avoided, atRisk, clean }` as design D2. Export it on `PF`.
- [x] 1.3 Add `avoidedCost(out, costs, which = 'avoided')` as design D3. Export it and `OUTCOME_STAGES` on `PF`.

## 2. App

- [x] 2.1 In `ingest()` in `scripts/app.js`, set `fileData.baseline` once (design D2).
- [x] 2.2 Add `outcomesPanel()` (design D4), cached on `fileData.oc`, with `update(rows)`. It contains:
  - a header: the counting headline "N of M bookings would have been stopped" and the fixed ring;
  - the route chart: Uploaded → four stop nodes, each with its count, label, rules, a bar split into still stopped and fixed, and a tag → Get through now;
  - the "Every booking, once" card: a waffle (one cell per booking, glyph and tooltip, flips on change), a legend with counts, and the "As uploaded" and "Now" stacked bars;
  - the cost card: low and high inputs, a range bar and value per stage, and counting totals "At stake as uploaded" and "Avoided by fixes so far", labelled an estimate;
  - a data table.
- [x] 2.3 In `renderFile()`, right after the notices, call `out.append(outcomesPanel().update(rows))`.
- [x] 2.4 In `scripts/shell.html`:
  - add the `.oc` styles with Night Route tokens (`--n-*`);
  - add Sora and JetBrains Mono to the Google Fonts link;
  - lay out the cards in 2 columns, and 1 below 900 px;
  - below 640 px, make the route a vertical timeline with horizontal bars;
  - add a reduced-motion block.

## 3. Docs and build

- [x] 3.1 Add section 8 "Outcomes" to `references/logic.md`.
- [x] 3.2 Run `python3 scripts/build.py` to rebuild `scripts/preflight.html`.

Verify:
- `cd scripts && node run.js` passes 100%.
- `node verify.js` output is identical to `main`.
- In the browser, the sample shows 12 of 25 stopped with the counts in design "Sample workbook", and the entrance plays once on scroll.
- Applying both HS fixes on TB-02 shows the ring at 1 / 12, flips TB-02's cell to ✓ and adds a green part to the customs-hold bar. A customs-hold cost of £400–£1,200 shows "Avoided by fixes so far: £400–£1,200".
- At 390 px the page has no sideways scroll.
