# Tasks

## 1. Engine: record corrections (design D1, D2)

- [x] 1.1 In `scripts/engine.js` `normaliseBooking()`, add `b.corrections = []` and the `corr()` helper exactly as design D1. Call it after each normalisation listed in the D1 table: cities, countries, origin-country default, destType, priority, appointment, ready date, numeric fields (booking and item), currency default, item HS and item country of origin. Do not change any normaliser's result.
  - Verify (new test group "Corrections"):
    - TB-16's shape (HS `'6912.00'`, coo `'UK'`, ready as an Excel serial for 24-11-2026, appointment `'yes'`) gives exactly 4 corrections with kinds `format`, `alias`, `date`, `format` and used values `691200`, `United Kingdom`, `24-11-2026`, `Yes`;
    - HS text `'090240'`, ready `'18-11-2026'` and pallets `2` give none;
    - declared `'£5,400'` gives a `format` correction to `5400`;
    - a blank currency gives a `default` correction to `GBP`;
    - the same input twice gives deep-equal `corrections`.
- [x] 1.2 In `evaluate()`, return `corrections: b.corrections` and do not count them in `reds` or `ambers`. Export nothing new besides what is returned. Verify:
  - `cd scripts && node run.js` passes 100%;
  - the expected-results comparison (`node verify.js`, plus a check that every status matches the Expected results sheet) shows all bookings matching, and TB-16 is Green with 4 corrections.
- [x] 1.3 In `scripts/chat.js` `toRaw()`, add `derived: { cartons: !b.cartonsStated, declared: !b.declaredStated }` and pass each item's `derived` flags. In `normaliseBooking()`, record `derived` corrections with `entered: ''` and a "Worked out: …" reason. Verify: the chat test FULL message (1,080 mugs, 12 per carton, no cartons or value) produces derived corrections for item cartons `90`, total cartons `90` and declared value `5400`.

## 2. File mode: review table and "To review" count (design D3)

- [x] 2.1 In `scripts/app.js`, add `const reviews = {}` next to `overrides`. In the report, render "Automatic corrections — please review": a table with Field (+SKU) | You entered | We used | Why | actions, plus **Accept**, **Change…** and **Accept all**. Accept updates `reviews` and re-renders without re-evaluating.
  - Verify in the browser: TB-16 shows 4 rows; Accept on one row shows "Accepted" and the count drops to 3; Accept all clears it.
- [x] 2.2 **Change…** shows an inline input pre-filled with the used value. On submit, call `ctx.apply` with `patch` (booking field) or `itemPatch: { i, f: { field: value } }` (item field), then set `reviews[...]` to `changed`.
  - Verify: change TB-16's delivery appointment (`yes` → `Yes`) to `No`; the row is tagged edited, R-08 fails (Amber) and the correction row shows "Changed by you: No". (TB-16 has no destination-type correction, so the appointment row is used.)
- [x] 2.3 Add a "To review" column to the file results table and the exported Summary sheet (unreviewed correction count per booking, blank when 0). Clear `reviews[i]` in "Undo my fixes" and when a new file is loaded.
  - Verify: the sample workbook shows "4" only on TB-16 (plus any other bookings with corrections), and Undo restores the count.

## 3. Audit trail and export (design D4)

- [x] 3.1 Add `const audit = []` and `logEvent(e)` in `app.js`.
  - Log `auto-corrected` events when corrections are first seen, de-duplicated by a `Set` of `booking|id|entered|used`.
  - Log `accepted` / `changed` from the review actions.
  - Log `fix applied` inside the file-mode `ctx.apply`, one event per patched field, with the before value read from the current evaluated booking.
  - Log `fixes undone` from "Undo my fixes".
  - Verify in the browser:
    - load the sample → TB-16's 4 `auto-corrected` events appear once;
    - re-render → no duplicates;
    - "Use 1 pallet on Carrier B" on TB-01, then Undo → `fix applied` then `fixes undone`, in order.
- [x] 3.2 Render an "Audit trail" `<details>` panel under the file results (newest first) with the note "Download the report to keep this record", and a per-booking list in each report. Verify: both lists show the events above.
- [x] 3.3 In the report download (~lines 375–377), add a `Corrections` sheet: Time | Booking | SKU | Field | Before | After | By | Action, oldest first. Verify: the downloaded workbook has Summary, Issues and Corrections, and the Corrections rows match the panel.

## 4. Chat review (design D3, D5)

- [x] 4.1 In `scripts/chat.js`:
  - add `st.reviewed = {}` to `newState()`;
  - when `reply.status` is set, attach `reply.corrections` (unreviewed only, from the evaluation);
  - add a "looks right" intent to `parseMessage` that marks every listed correction `accepted`.

  Verify (chat tests): FULL gives `reply.corrections` with the derived values; "looks right" then gives no `reply.corrections` and no booking value changes.
- [x] 4.2 In `app.js` `send()`, render `reply.corrections` as "You entered → We used (why)" lines with a "Looks right" chip. Chat changes ("change cartons to 80") are logged as `changed` by you. Verify in the browser with the "Everything in one go" starter.
- [x] 4.3 In `engine.js` `confirmation()`, add "N automatic corrections not yet reviewed — check them before booking." when N > 0. The engine counts all corrections; the UI passes the number already reviewed. Verify: the TB-16 summary shows the line until Accept all.

## 5. Docs and full run

- [x] 5.1 Document the corrections table (kinds, what is recorded, review is Advisory) in `references/logic.md`, and add TB-16's corrections and the audit/undo scenario to `references/test-scenarios.md`. Verify: both files mention "audit trail" and "Accept all".
- [x] 5.2 Run `cd scripts && node run.js`, the expected-results comparison and `python3 build.py`. Verify: 100% of tests pass, every expected row matches, the build succeeds, and the browser checks from tasks 2–4 pass on the built `preflight.html`.

---

**Haiku validation:** each task names its file, approximate line, data shape, UI wording and the test or browser check that proves it, so a smaller model can implement it step by step without further design decisions.
