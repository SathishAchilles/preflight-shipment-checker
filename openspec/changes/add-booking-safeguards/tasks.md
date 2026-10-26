# Tasks

## 1. Booking integrity (date and duplicate IDs)

- [x] 1.1 In `scripts/engine.js` `parseSheets()` (~line 360), change the duplicate key to `clean(b.id).toUpperCase()`. Verify: new tests in group "File parsing":
  - ` tb-05 ` after `TB-05` → Red "used more than once" naming the first row;
  - three `TB-05` rows → the 2nd and 3rd each get exactly one duplicate issue;
  - `TB05` and `TB-05` → no duplicate issue;
  - the existing test "Duplicate Booking ID → Red on the second row" still passes.
- [x] 1.2 In `scripts/app.js` report (R-10 area, ~line 117), add "Checked against today, <DD-MM-YYYY> (this device's date)" using `ev.today`. Do not change the R-10 logic. Verify: open the app, load the sample, and the line shows today's date; `cd scripts && node run.js` still passes 100%.

## 2. Price disclaimer

- [x] 2.1 Add `PRICE_NOTE = 'Indicative rate per pallet for the destination country. Actual prices vary by collection and delivery city, fuel surcharge and date — confirm with the carrier.'` to `engine.js` and export it on `PF`.
- [x] 2.2 Render `PF.PRICE_NOTE` as a `p.note` in `app.js`:
  - under the carrier comparison table (~line 96);
  - under the chosen-carrier line in chat summaries (~line 204);
  - under the Rules-tab rate card (~line 374).

  Verify: all three places show the sentence after `python3 build.py`.
- [x] 2.3 In `scripts/chat.js`, append `PF.PRICE_NOTE` to the first reply that states a carrier price, then set `st.priceNoteShown = true`. Verify: a chat test sends two turns that both mention the carrier price; only the first reply contains "Indicative rate".

## 3. Pallet weight plan

- [x] 3.1 Add `palletPlan(b, chosenCarrier)` to `engine.js` exactly as design D3 describes, and export it. Verify: tests in a new group "Pallet plan":
  - Germany at 900 kg → A 2 pallets, 450 kg each, £360; B 2, 450, £440; C 3, 300, £1,020;
  - France, Carrier A, 4 pallets, 600 kg → `fewer = { from: 4, to: 2, saving: 340 }`;
  - gross blank, goods 400 kg, 2 pallets → weight 450 and `estimated: true`;
  - 30 cartons of 12 kg + 10 cartons of 6 kg on 2 pallets → each pallet has 210 kg;
  - two calls give deep-equal results.
- [x] 3.2 In `evaluate()` next to the existing advisories (~line 655), push the fewer-pallets Advisory when `plan.fewer` is set: "By weight, <to> pallets are enough on <carrier> (<kg> each), saving <£> — check volume and stacking height before changing." Include `plan` in the returned object. Verify: the France test above produces exactly that advisory and the status is unchanged; `node verify.js` still matches all existing expected rows.
- [x] 3.3 In `app.js`, render a "Pallet plan" table after the carrier comparison: carrier, pallets, kg per pallet, cost, and a "Use N pallets on <carrier>" button (`ctx.apply({ patch: { pallets, carrierOverride }, say: 'make it N pallets on <carrier>' })`). Add a collapsible carton split. Label it "estimated from item weights" when `estimated`, and always add "Balances weight only — check volume and stacking height." Verify: clicking a button changes the pallet count only after the click, the row is marked edited, and "Reset edits" restores it.

## 4. Dangerous goods grey area (design D1)

- [x] 4.0 Check every UN number marked † in design "D1 catalogue" against ADR 2025 Table A (UNECE text or https://dgg.bam.de). Correct the catalogue if one differs. Verify: the catalogue has no † marks left.
- [x] 4.1 Add `DG_ADR` to `engine.js` with exactly the entries in design "D1 catalogue" (class, category, regex, UN list, `unless`, `safe` regex). Extend `scanDG()` to return `adr: [...]`:
  - the same negation rules apply;
  - each entry's `safe` regex is removed from the text before matching;
  - tier 2 is skipped only for an item that already has a tier-1 **definite** hit.

  **Gate before committing the table:** run it over every item description in `assets/Preflight_Test_Cases.xlsx` and in `scripts/tests.js` fixtures, and print every tier-2 hit. There must be no hit on the existing 20 bookings unless the hit is correct. Fix false positives through `safe`.
- [x] 4.2 In `evaluate()` next to the existing advisories (~line 655), push one advisory per item with a tier-2 hit, using the wording in design D1 (text plus fix in one string). Do not use `amber()`/`red()` and do not touch R-06. Verify: a new test group "DG grey area" checks one positive per catalogue class (status unchanged), every catalogue false-positive phrase gives no hit, and R-06 results for all existing tests are unchanged.
- [x] 4.3 Document tier 2 in `references/logic.md` (R-06 section: "R-06 covers the three rulebook categories; other ADR classes add an Advisory that does not change the status") and in the Rules tab text (`app.js` ~line 364 area). Verify: both mention "ADR" and "Advisory".

## 5. Planted bugs and coverage

- [x] 5.1 In `scripts/make_testdata.py`, add bookings TB-21 to TB-25 with Expected-results rows:
  - TB-21: party poppers, ADR class 1 → Green with a "Possible dangerous goods (ADR class 1)" Advisory;
  - TB-22: pool chlorine tablets, class 5.1 → Green with a "Possible dangerous goods (ADR class 5.1)" Advisory;
  - TB-23: "spirit level" and "matchbox car" → Green, no DG hit;
  - TB-24: France, Carrier A, 4 pallets, 600 kg → Green with the fewer-pallets Advisory;
  - TB-25: Booking ID ` tb-05 ` → Red duplicate of TB-05.

  Regenerate `assets/Preflight_Test_Cases.xlsx`. Verify: `cd scripts && node verify.js` matches all 25 bookings plus the TB-99 notice.
- [x] 5.2 Add the coverage matrix (design D5) to `references/test-scenarios.md`. Verify: every rule R-01 … R-10, every new check, and every HS check from change `add-hs-code-validation` has at least one booking listed.
- [x] 5.3 Run `cd scripts && node run.js && node verify.js && python3 build.py`. Verify: 100% of tests pass, every expected row matches, and the build succeeds.

---

**Haiku validation:** each task names its exact file, approximate line, wording, thresholds and the test or observable result that proves it, so a smaller model can carry it out step by step without further design decisions.
