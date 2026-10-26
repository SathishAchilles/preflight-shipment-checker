# Spec Delta

## Purpose

Makes every value the system changed on its own visible, reviewable by a person, and recorded. The seller sees what they entered next to what Preflight used, can accept or change it, and every system and user change is kept in an exportable audit trail.

## ADDED Requirements

### Requirement: Automatic corrections are recorded
When the system uses a value that differs from what was entered, other than surrounding spaces, it SHALL record one correction. The record SHALL hold the scope (booking or item), the field, the SKU for item fields, the value as entered, the value used, the kind (`format`, `alias`, `date`, `default` or `derived`) and a plain-language reason. Recording SHALL be deterministic: the same input gives the same corrections in the same order.

#### Scenario: Format edge cases in one booking
- **WHEN** booking TB-16 is checked (HS `6912.00`, origin `UK`, ready date stored as a real Excel date, appointment `yes`)
- **THEN** corrections are recorded for HS `6912.00` → `691200` (format), country of origin `UK` → `United Kingdom` (alias), ready date → `24-11-2026` (date) and appointment `yes` → `Yes` (format)

#### Scenario: Values that need no correction
- **WHEN** a value is entered exactly as used (e.g. HS text `090240`, ready date `18-11-2026`, pallets `2`)
- **THEN** no correction is recorded for it

#### Scenario: Number with symbols
- **WHEN** the declared value is entered as `£5,400`
- **THEN** a format correction `£5,400` → `5400` is recorded

#### Scenario: Default filled in
- **WHEN** the currency is blank
- **THEN** a default correction blank → `GBP` is recorded

#### Scenario: Chat worked out a value
- **WHEN** in chat the seller gives quantity 1080 and 12 per carton but no cartons, and no total declared value
- **THEN** derived corrections are recorded for the item's cartons (`90`), the booking's total cartons and the declared value, each saying it was worked out and from what

### Requirement: Corrections never change the booking status
Corrections and their review state SHALL NOT change Red/Amber/Green or any rulebook result. The status SHALL be the same as if the corrections were not recorded.

#### Scenario: TB-16 stays Green
- **WHEN** booking TB-16 has four unreviewed corrections
- **THEN** its status is Green, matching the Expected results sheet

### Requirement: Old and new values are shown for review
Each booking report with at least one correction SHALL show an "Automatic corrections — please review" table with one row per correction. Each row SHALL show the field, what was entered, what was used and why, plus an **Accept** action and a **Change…** action. The table SHALL also offer **Accept all** for the booking. The file results table SHALL show how many corrections are still to review for each booking.

#### Scenario: Review table
- **WHEN** the user opens TB-16 in the file report
- **THEN** a review table lists four rows, e.g. "Country of origin (BWL-01) · You entered: UK · We used: United Kingdom · Why: recognised country name", each with Accept and Change…, and the file table shows "4 to review" for TB-16

#### Scenario: Nothing to review
- **WHEN** a booking has no corrections
- **THEN** no review table is shown and the "To review" count is empty

### Requirement: Human decisions are applied only by the user
**Accept** SHALL mark the correction reviewed and keep the value used. **Change…** SHALL let the user enter a value, apply it as the user's own edit to that field, re-check the booking, mark it edited, and mark the correction reviewed. The system SHALL NOT mark a correction reviewed, or change a value, without the user's action.

#### Scenario: Accept
- **WHEN** the user clicks Accept on TB-16's country-of-origin correction
- **THEN** that row shows "Accepted", the "To review" count drops to 3, and the booking's values and status do not change

#### Scenario: Change
- **WHEN** the user clicks Change… on a destination type `Amazon` → `Warehouse` correction and enters `Business address`
- **THEN** the booking is re-checked with Business address, it is marked edited, R-08 becomes not applicable, and the correction shows "Changed by you: Business address"

#### Scenario: Accept all
- **WHEN** the user clicks Accept all on TB-16
- **THEN** all four corrections show "Accepted" and the count is empty

### Requirement: Chat review
In chat, once the booking is complete, the system SHALL list the automatic corrections and derived values that are not yet reviewed, offer a "Looks right" chip that accepts them all, and accept "change <field> to <value>" replies as the user's correction.

#### Scenario: Looks right
- **WHEN** the seller's booking is complete with derived cartons and declared value, and the seller taps "Looks right"
- **THEN** those corrections are marked accepted, and no booking value changes

### Requirement: Audit trail of system and user changes
The system SHALL keep an ordered audit trail for the session. Each event SHALL hold the time, booking ID, field (and SKU), value before, value after, who made it (`system` or `you`) and the action: `auto-corrected`, `accepted`, `changed`, `fix applied` or `fixes undone`. User one-click fixes (including HS "Use <code>", pallet plan and carrier choices) and "Undo my fixes" SHALL be logged. The trail SHALL be shown in an "Audit trail" panel and exported as a "Corrections" sheet in the downloaded report.

#### Scenario: Fix and undo are logged
- **WHEN** the user clicks "Use 2 pallets on Carrier B" on a booking and then "Undo my fixes"
- **THEN** the audit trail shows a `fix applied` event (pallets 3 → 2, carrier → Carrier B, by you), then a `fixes undone` event, in that order

#### Scenario: Export
- **WHEN** the user downloads the report after reviewing TB-16
- **THEN** the workbook has a Corrections sheet with TB-16's four `auto-corrected` events and the user's `accepted` events, each with before, after, by and time

#### Scenario: Re-running a check does not duplicate events
- **WHEN** the same booking is re-checked without any change
- **THEN** no new `auto-corrected` events are added for it
