# Spec Delta

## Purpose

Uses the shipment weight to recommend how many pallets to use with each carrier, how heavy each pallet is, what it costs, and how cartons could be split across pallets. All of it is a recommendation the user may accept.

## ADDED Requirements

### Requirement: Weight input
The system SHALL use the booking's total gross weight as the planning weight. When the gross weight is missing but every item has a unit weight and quantity, it SHALL use the goods weight plus 25 kg per pallet (at least one pallet) and label the plan as an estimate.

#### Scenario: Gross weight given
- **WHEN** a booking has a gross weight of 900 kg
- **THEN** the pallet plan uses 900 kg and is not labelled an estimate

#### Scenario: Gross weight missing
- **WHEN** the gross weight is blank, the goods weigh 400 kg and the booking says 2 pallets
- **THEN** the plan uses 450 kg and is labelled "estimated from item weights"

### Requirement: Pallet plan per carrier
For every carrier service on the destination route, the system SHALL show the fewest pallets the weight allows (`ceil(weight ÷ max kg per pallet)`, at least 1), the weight per pallet when split evenly, and the total cost (price per pallet × pallets).

#### Scenario: Plan for Germany
- **WHEN** a booking to Germany weighs 900 kg
- **THEN** the plan shows Carrier A 2 pallets at 450 kg each for £360, Carrier B 2 pallets at 450 kg each for £440, and Carrier C 3 pallets at 300 kg each for £1,020

### Requirement: Fewer pallets recommendation
When the booking uses more pallets than the chosen carrier needs by weight, the system SHALL add an Advisory naming the smaller count and the saving, and saying that volume and stacking height must be checked. It SHALL NOT change the booking's status.

#### Scenario: Too many pallets for the weight
- **WHEN** a booking to France on Carrier A has 4 pallets and weighs 600 kg
- **THEN** an Advisory says 2 pallets are enough by weight, saving £340, and to check volume and stacking height, and the status is unchanged

#### Scenario: Pallet count already minimal
- **WHEN** a booking's pallet count equals the minimum by weight for its chosen carrier
- **THEN** no fewer-pallets Advisory is shown

### Requirement: Carton-to-pallet split by weight
When every item has units per carton, cartons and unit weight, the system SHALL split the cartons across the recommended pallets by weight: cartons sorted by weight (heaviest first, then SKU), each placed on the currently lightest pallet (lowest pallet number on ties). It SHALL show each pallet's cartons per SKU and goods weight, and SHALL say the split balances weight only.

#### Scenario: Deterministic split
- **WHEN** the same booking is planned twice
- **THEN** both splits are identical

#### Scenario: Balanced weights
- **WHEN** 30 cartons of 12 kg and 10 cartons of 6 kg go on 2 pallets
- **THEN** each pallet carries 210 kg of goods

### Requirement: Recommendations need the user's action
The pallet plan SHALL NOT change the booking's pallet count or carrier by itself. Each plan row SHALL offer a "Use N pallets on <carrier>" action that changes the booking only when clicked, then re-checks it and marks it as edited.

#### Scenario: Plan is not applied automatically
- **WHEN** a pallet plan recommends 2 pallets for a booking that says 4
- **THEN** the booking still says 4 pallets until the user clicks the action
