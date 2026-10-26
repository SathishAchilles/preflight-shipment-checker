# Spec Delta

## Purpose

Booking-level checks that do not depend on items: every booking ID is unique within an upload, and the ready-to-ship date is compared with the day the app is used.

## ADDED Requirements

### Requirement: Ready date is compared with the day the app is used
R-10 SHALL compare the ready-to-ship date with the current date on the user's device at the time of the check (the "testing date"), not with any fixed date. A date before that day SHALL fail R-10 (Amber); that day or later SHALL pass. The report SHALL state the date it compared against.

#### Scenario: Date in the past
- **WHEN** the app is used on 26-10-2026 and a booking's ready date is 25-10-2026
- **THEN** R-10 fails (Amber) and the report says "checked against today, 26-10-2026"

#### Scenario: Today passes
- **WHEN** the app is used on 26-10-2026 and the ready date is 26-10-2026
- **THEN** R-10 passes, with the existing note about same-day carrier cut-off

#### Scenario: Automated tests pin the date
- **WHEN** the automated tests or `verify.js` run
- **THEN** they pass an explicit test date, and the Tests tab says which date it fixed, so the results do not change from day to day

### Requirement: Booking IDs are unique within an upload
The system SHALL treat booking IDs as equal when they match after trimming surrounding spaces and ignoring letter case. Every booking after the first with the same ID SHALL get a Red "Booking ID" data issue naming the row of the first one.

#### Scenario: Exact duplicate
- **WHEN** two rows both have Booking ID `TB-05`
- **THEN** the second row has a Red data issue saying the ID is used more than once and naming the first row

#### Scenario: Case and spacing differences
- **WHEN** rows have Booking IDs `TB-05` and ` tb-05 `
- **THEN** the second is reported as a duplicate of the first

#### Scenario: Three copies
- **WHEN** three rows share Booking ID `TB-05`
- **THEN** the second and third rows each get one duplicate issue naming the first row

#### Scenario: Similar but different IDs
- **WHEN** rows have Booking IDs `TB-05` and `TB05`
- **THEN** no duplicate issue is raised
