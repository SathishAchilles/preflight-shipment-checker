# Spec Delta

## Purpose

Screens item descriptions for dangerous goods on UK→DE/FR/NL road shipments. The rulebook's R-06 categories (lithium batteries, aerosols, flammable liquids) stay a Red rule. Every other ADR class found in ordinary goods is reported as an Advisory that explains the class, the typical UN numbers and the exception that would make the item safe to ship.

## ADDED Requirements

### Requirement: R-06 is unchanged
The system SHALL keep R-06's categories, wording and severity exactly as the fixed rulebook defines them: lithium batteries, aerosols and flammable liquids, Red when broken.

#### Scenario: Existing R-06 results
- **WHEN** the existing test suite and sample workbook are checked
- **THEN** every R-06 result (fail, check, pass) is the same as before this change

### Requirement: Other ADR classes add an Advisory
For each item whose description matches an entry of the dangerous-goods catalogue outside the R-06 categories (ADR classes 1, 2, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 6.2, 7, 8 and 9 other than lithium), the system SHALL add one Advisory per item. It SHALL name the SKU, the description, the ADR class and category, the matched words and typical UN numbers, and SHALL state when the item is not dangerous and that otherwise it needs an ADR-capable carrier and the supplier's safety data sheet. The Advisory SHALL NOT change the booking's status.

#### Scenario: Party poppers
- **WHEN** an item's description is "Party poppers, box of 50" in an otherwise clean booking
- **THEN** one Advisory says it may be ADR class 1 (fireworks and pyrotechnics), matched "party poppers", and the booking status stays Green

#### Scenario: Pool chlorine
- **WHEN** an item's description is "Pool chlorine tablets 5 kg"
- **THEN** one Advisory says it may be ADR class 5.1 (oxidisers), with typical UN numbers

#### Scenario: Car battery
- **WHEN** an item's description is "12V car battery"
- **THEN** R-06 shows its existing "may contain a lithium battery" check, and one Advisory also says it may be ADR class 8 (lead-acid) and that new, secured, short-circuit-protected batteries are not subject

### Requirement: No extra message on a Red R-06 item
When an item already fails R-06 (a definite hit), the system SHALL NOT also add an ADR-class Advisory for that item. When R-06 only has a possible hit, the ADR-class Advisory SHALL still be added if it matches, because it is more specific.

#### Scenario: Lithium e-bike
- **WHEN** an item's description is "Lithium e-bike"
- **THEN** R-06 fails (Red) for the item and no extra dangerous-goods Advisory is added

### Requirement: Known safe phrases do not trigger
The system SHALL ignore the catalogue's safe phrases before matching, and SHALL apply the existing negation rules ("no", "free of", "not included", …). Magnets, candles, water-based or acrylic paint, and wine or beer SHALL NOT be flagged.

#### Scenario: Spirit level and matchbox car
- **WHEN** a booking has items "Spirit level 60 cm" and "Matchbox car set"
- **THEN** no dangerous-goods Advisory and no R-06 hit is raised

#### Scenario: Charcoal grey
- **WHEN** an item's description is "Charcoal grey wool scarf"
- **THEN** no dangerous-goods Advisory is raised

#### Scenario: Negated hazard
- **WHEN** an item's description is "Chlorine-free pool float"
- **THEN** no dangerous-goods Advisory is raised

### Requirement: Screening is deterministic
The system SHALL screen with a fixed keyword catalogue in the engine, with no network, language model or embedding calls, and SHALL give the same results for the same descriptions every time.

#### Scenario: Repeat check
- **WHEN** the same booking is checked twice
- **THEN** the dangerous-goods advisories are identical in text and order
