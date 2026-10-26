# Tasks

- [x] 1. Research banned and permit goods for DE/FR/NL and ADR 2025 limits. Re-check the key claims against primary text and record them in `references/road-freight-rules.md`.
- [x] 2. In `scripts/engine.js`:
  - add `ROAD_GOODS`, `ROAD_SAFE`, `roadMatch()`, the parsers (`parseVolumeMl`, `parseAbv`, `parseWh`, `parseMah`), `roadLimits()` and `roadWarnings()`;
  - call `roadWarnings(b)` in `evaluate()` and return `warnings`;
  - add the ISPM 15 next step to `confirmation()`.
- [x] 3. In `scripts/app.js`:
  - add `warningsEl()` (⚠ section) to the report;
  - add the ⚠ line to `miniVerdict()`;
  - add the ⚠ chip and the Advisory filter count to `renderFile()`;
  - add warning rows to the Issues sheet in `exportResults()`.

  Add the `.warn*` styles in `scripts/shell.html`.
- [x] 4. Add the tests in group “Road warnings”: a positive case per entry, every look-alike as a negative case, the country-specific cases and each limit.
- [x] 5. Run `python3 scripts/build.py`.

Verify:
- `node run.js` passes 100%.
- `node verify.js` output is identical to `main`.
- On the sample workbook, the only warnings are on TB-08 (PB-01 lithium, DSH-02 aerosol).
- In chat, butterfly knives to Amsterdam show “⚠ 1 road-freight warning — Banned in the Netherlands”.
