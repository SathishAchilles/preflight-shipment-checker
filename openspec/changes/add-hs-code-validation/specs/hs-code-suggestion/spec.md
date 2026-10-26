# Spec Delta

## Purpose

Proposes an HS code, or a short list of candidates, from an item's product description when the seller has not given a usable code. Suggestions are deterministic, come only from the bundled tariff snapshot and fixed rules, and always show why they were made.

## ADDED Requirements

### Requirement: Suggestions are deterministic and need no API
The system SHALL compute HS code suggestions only from the bundled snapshot (tariff descriptions and HMRC search references) and fixed rules in the engine. It SHALL NOT call any network service, language model or embedding model, and the same description and snapshot SHALL always give the same suggestion in the same order.

#### Scenario: Same description twice
- **WHEN** the description "Organic cotton T-shirt" is checked twice
- **THEN** both runs return the same suggested code, wording, matched words and order

#### Scenario: No index loaded
- **WHEN** no tariff index is loaded
- **THEN** the system falls back to the existing curated hint text and does not throw

### Requirement: Suggestions only for items without a usable code
The system SHALL produce a suggestion only for items whose HS code fails R-01 (blank, contains letters, or fewer than 6 digits). Items with a code that passes R-01 SHALL NOT receive a suggestion.

#### Scenario: Blank code gets a suggestion
- **WHEN** item TSH-01 "Organic cotton T-shirt" has no HS code
- **THEN** R-01 fails (Red) and its fix text suggests `610910` (T-shirts … knitted or crocheted > Of cotton)

#### Scenario: Valid code gets no suggestion
- **WHEN** an item has HS code `691200` and description "Ceramic mug"
- **THEN** no suggestion is shown for that item

### Requirement: Suggestions never change the booking or its status
A suggestion SHALL be labelled "suggested — verify on trade-tariff.service.gov.uk". It SHALL NOT be written into the item's HS code and SHALL NOT change R-01 or any booking status unless the user explicitly accepts it with the "Use this code" action. A heading-level or list answer SHALL offer one action per candidate code, and never a single default.

#### Scenario: Suggestion leaves R-01 Red
- **WHEN** item MUG-01 "Ceramic mug, 350 ml" has no HS code and a suggestion of `691200` is shown
- **THEN** the item's HS code is still blank, R-01 still fails and the booking status is still Red

### Requirement: Suggestion sources and explanation
The system SHALL try sources in a fixed order: the curated hint table, then HMRC search references matched on their head phrase, then tariff subheading wording. Each suggestion SHALL name the words in the description that matched and the source used.

#### Scenario: Search reference match is explained
- **WHEN** the description is "Perfume 50 ml" and the code is blank
- **THEN** the suggestion is `330300` (Perfumes and toilet waters), the matched word "perfume" is shown, and the source is shown as an HMRC search reference

#### Scenario: Raw word overlap cannot outrank a reference match
- **WHEN** the description is "Ceramic mug, 350 ml" and the code is blank
- **THEN** the suggestion is from heading 6912 (`691200`), not from an unrelated chapter that merely shares the word "ceramic"

### Requirement: Material decides between sibling subheadings
When candidate subheadings differ by material, the system SHALL prefer the candidate whose wording names the material in the description, and SHALL demote candidates that name only a different material. Materials after "other than" SHALL be treated as excluded.

#### Scenario: Cotton socks
- **WHEN** item SCK-01 "Cotton socks, 3-pack" has the 4-digit code `6115`
- **THEN** R-01 fails (Red) and the suggestion is `611595` (… Of cotton), not `611594` (… Of wool or fine animal hair)

#### Scenario: Ceramic is not porcelain
- **WHEN** the description is "Ceramic mug" and the code is blank
- **THEN** the suggestion is `691200` (other than porcelain or china), not `691110` (porcelain or china)

### Requirement: Answer level reflects confidence
The system SHALL give a single HS-6 code only when its score is at least 1.5 times the next candidate. Otherwise, when the leading candidates share a 4-digit heading, it SHALL name the heading and list its candidate subheadings without picking one. Otherwise it SHALL list at most three candidates, or say that no suggestion was found. Ties SHALL be broken by code in ascending order.

#### Scenario: Heading with several choices
- **WHEN** the description is "Black tea, 250 g" and the code is blank
- **THEN** the suggestion names heading 0902 (Tea) and lists its subheadings, including `090230` and `090240`, without choosing one

#### Scenario: Nothing matches
- **WHEN** the description is "Misc stock" and the code is blank
- **THEN** the fix text says no code could be suggested from the description and points to trade-tariff.service.gov.uk

### Requirement: Chat asks one material question when needed
In chat, when the only thing separating the leading candidates is material, the system SHALL ask one question, "What is it mainly made of?", and SHALL re-rank using the answer.

#### Scenario: T-shirt without material
- **WHEN** the seller says "200 t-shirts to Berlin" with no HS code and no material
- **THEN** the chat asks what the T-shirts are mainly made of, and after "cotton" suggests `610910`
