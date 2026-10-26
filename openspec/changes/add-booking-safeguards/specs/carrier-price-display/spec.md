# Spec Delta

## Purpose

How carrier prices are presented to the seller, including the statement that the rate card is indicative.

## ADDED Requirements

### Requirement: Indicative price disclaimer
Wherever a carrier price or total cost is shown (report carrier line, carrier comparison table, Rules tab rate card, chat carrier reply, confirmation summary), the system SHALL show the disclaimer "Indicative rate per pallet for the destination country. Actual prices vary by collection and delivery city, fuel surcharge and date — confirm with the carrier."

#### Scenario: Report shows the disclaimer
- **WHEN** a booking report shows the recommended carrier and its cost
- **THEN** the disclaimer is visible in the same section as the price

#### Scenario: Chat shows the disclaimer once
- **WHEN** the chat states a carrier price for the first time in a conversation
- **THEN** the reply includes the disclaimer, and later replies in the same conversation do not repeat it

### Requirement: Prices are not adjusted per city
The system SHALL keep using the per-country rate card for recommendations and costs. It SHALL NOT change a price based on the collection or delivery city.

#### Scenario: Same country, different city
- **WHEN** two bookings to Germany go to Berlin and Munich with the same pallets
- **THEN** both show the same carrier prices, each with the disclaimer
