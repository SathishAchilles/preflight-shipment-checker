# Spec Delta

## ADDED Requirements

### Requirement: Country-specific bans and permits
The system SHALL warn when an item description matches goods that are banned in, or need a certificate or permit for, the booking's destination country (Germany, France or the Netherlands). It SHALL use only the entries in `references/road-freight-rules.md`.

#### Scenario: Banned in one country only
- **WHEN** a booking to the Netherlands contains “butterfly knives”
- **THEN** a ⚠ warning “Banned in the Netherlands” is shown, and the same item to France shows none

#### Scenario: Look-alike
- **WHEN** an item is “Butter knife set” or “Ivory-coloured cushion”
- **THEN** no ban or permit warning is shown

### Requirement: Road limits from ADR
For items R-06 clearly matches, and for spirits and lighters, the system SHALL state the ADR 2025 limit at which the goods could still move by road with a specialist carrier. It SHALL say the limit is exceeded only when a value stated in the description, or the goods weight per carton, exceeds it.

#### Scenario: Battery over 100 Wh
- **WHEN** an item is “Laptop battery 120Wh”
- **THEN** the warning says it is over the 100 Wh limit of special provision 188

#### Scenario: mAh only
- **WHEN** an item is “Power bank 10,000mAh”
- **THEN** the warning gives about 37 Wh as a hint and asks for the Wh rating on the case

### Requirement: Status unchanged
Warnings SHALL NOT change any booking's Red, Amber or Green status.

#### Scenario: Sample workbook
- **WHEN** the sample workbook is checked
- **THEN** every booking keeps its expected result
