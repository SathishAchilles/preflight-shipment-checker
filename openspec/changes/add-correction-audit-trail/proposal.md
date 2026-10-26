# Proposal

## Why

Preflight quietly rewrites what the seller entered before it runs the rules. For example:
- `UK` is read as `United Kingdom`;
- HS `6912.00` is read as `691200`;
- an Excel date becomes `24-11-2026`;
- `£5,400` becomes `5400`;
- `yes` becomes `Yes`;
- in chat, missing cartons and the declared value are worked out.

These corrections are usually right, but the seller never sees the before and after, and nothing records them. A wrong guess (e.g. `Amazon` read as a Warehouse when it was an office) would go unnoticed. Customs paperwork needs a person to stand behind every value.

## What Changes

- **Record every automatic correction** [R]. The engine lists each value it used that differs from what was entered. Each entry has the field (and SKU for item fields), the original value, the value used, the kind of correction and a plain reason. Kinds:
  - `format`: HS dots or `.0`, `£`/commas/units on numbers, letter case;
  - `alias`: country, city, destination type, priority and yes/no synonyms;
  - `date`: any date not typed as DD-MM-YYYY;
  - `default`: a blank origin country or currency filled in;
  - `derived`: values the chat worked out (cartons, quantity, units per carton, total cartons, declared value).
- **Show old and new side by side and ask for review** [R]. Each booking report gets an "Automatic corrections — please review" table: *You entered*, *We used*, *Why*. Each row has two actions:
  - **Accept**: keeps the corrected value;
  - **Change…**: the user types the right value, which is applied as their own edit and re-checked.

  There is also **Accept all** per booking. In chat, the corrections are listed after the booking is complete, with a "Looks right" chip and "change <field> to …" replies.
- **Review is an Advisory** [R, user decision 26 Oct 2026]. Pending reviews never change Red/Amber/Green; only the ten rulebook rules and data issues do. The file table shows a separate "To review" count, and the confirmation summary says how many corrections were not reviewed.
- **Audit trail** [R]. Every event is logged in order, with time, booking, field, before, after, by (`system` or `you`) and action:
  - system auto-corrections;
  - the user's accept and change decisions;
  - the user's one-click fixes (including HS "Use <code>" and pallet plan);
  - "Undo my fixes".

  The trail is shown in an "Audit trail" panel and exported as a **Corrections** sheet in the downloaded report, next to Summary and Issues.
- **No new automatic corrections** [D]. Recommendations (HS codes, pallet plans, carrier switches) stay click-to-apply exactly as today. This change only makes existing corrections visible and reviewable.
- Out of scope: server-side storage or sign-in (the app has no backend or login), and multi-user review.

## Capabilities

### New Capabilities

- `correction-audit-trail`: recording the engine's automatic corrections, presenting them for human review with old and new values, logging every system and user change in order, and exporting that log.

### Modified Capabilities

None. There are no archived specs yet. The related capabilities `hs-code-validation` and `booking-integrity` are still in active changes, and their requirements are not changed.

## Impact

- **Code:**
  - `scripts/engine.js`: `normaliseBooking()` builds `b.corrections`; `evaluate()` returns it; `toRaw()` derivation flags are read.
  - `scripts/chat.js`: passes `derived` flags from `toRaw()`, adds the review chip and change replies.
  - `scripts/app.js`: review table, Accept / Change / Accept all, audit-trail panel, "To review" column, Corrections sheet in the export.
  - `scripts/tests.js`, `references/logic.md`, `references/test-scenarios.md`.
- **Dependencies:** none. The audit log lives in browser memory for the session and is exported on download. Nothing is sent anywhere.
- **Expected results:** no status changes. TB-16 (format edge cases, Green) is the planted booking that shows corrections. Every expected row must still match.
- **Branch:** `feat/add-correction-audit-trail`, created in its own worktree from `2e7980f` (the deployed `main` on the `deploy` remote, which includes the HS and safeguards changes).

---

**Haiku validation:** the proposal names every correction kind, the exact UI actions, the status rule and the files affected, so a smaller model can implement it without further design decisions.
