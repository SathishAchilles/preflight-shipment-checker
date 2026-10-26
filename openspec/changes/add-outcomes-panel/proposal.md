# Proposal

## Why

The file report says what is wrong with each booking, but not what that would have cost the seller. In the 26 Oct 2026 dashboard brainstorm, outcomes were split into three tiers, and the user chose tiers 2 and 3:
1. Measured savings from carrier prices (already shown per booking; not part of this change).
2. **Failures prevented**: how many bookings would most likely have been stopped, and where. These are counts, with no money attached. [R]
3. **Estimated avoided cost**: those counts multiplied by the user's own cost per stop. [R]

The brief and the call with Matt give no cost for a customs hold or a refused pallet. Any £ figure is therefore an assumption: it must come from the user, be shown as a range and be labelled an estimate. Items marked [R] come from the user; [D] items are design choices.

## What Changes

- **Stop points** [D]: each Red booking is placed at the first point on its journey where it would most likely be stopped. Wording is taken from `docs/shipping-documents-checklist.md`; only "customs hold" is a term from the brief, so every stage says "likely".
  - Bounced back as filed: any Red data issue.
  - Refused at collection: R-05, R-06.
  - Customs hold at the border: R-01, R-02.
  - Rejected at delivery: R-03, R-04.
- **Counting** [D]: each booking counts once, at its earliest stop. Amber fails and `check` statuses count as "need a look", not as stops, with no £. `cannot` statuses are never stops.
- **Avoided** [D]: a booking stopped as uploaded that is no longer stopped after the fixes applied in this session. Partly fixed bookings still count as stopped.
- **Cost estimate** [R]: low and high £ per stopped booking for each stage. Blank by default, with no invented figures. Saved in this browser only. The panel shows "At stake as uploaded" and "Avoided by fixes so far", each as a range.
- **Panel** [D]: an "Outcomes" section at the top of the *Check a file* results.
- **Unchanged**: Red, Amber and Green still come only from the rulebook. The outcomes never change a status.

## Impact

- **Code:**
  - `scripts/engine.js`: `OUTCOME_STAGES`, `outcomes()`, `avoidedCost()`.
  - `scripts/app.js`: `outcomesEl()`, baseline evaluation at ingest.
  - `scripts/shell.html`: panel styles.
  - `scripts/tests.js`: new group "Outcomes".
  - `scripts/preflight.html`: rebuilt.
- **Docs:** `references/logic.md` section 8.
- **Dependencies:** none.
- **Expected results:** unchanged. `node verify.js` output is identical to `main`.

## Out of scope

- Tier 1 (measured carrier savings) on the dashboard.
- Outcomes in the exported .xlsx.
- Costs for Amber risks such as a missed warehouse slot (R-08).
- Outcomes in chat mode.

---

**Haiku validation:** each change names its exact file, function, stage mapping, wording and expected counts on the sample workbook, so a smaller model can implement it step by step without further design decisions.
