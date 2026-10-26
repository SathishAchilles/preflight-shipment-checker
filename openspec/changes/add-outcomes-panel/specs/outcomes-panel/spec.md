# Spec Delta

## Purpose

Shows, for an uploaded file, how many bookings would most likely have been stopped and where, and lets the user estimate the cost of those stops from their own figures. Reporting only.

## ADDED Requirements

### Requirement: First stop per booking
The system SHALL place each booking with a Red rule failure or a Red data issue at exactly one stop: bounced back as filed (Red data issue), refused at collection (R-05, R-06), customs hold (R-01, R-02) or rejected at delivery (R-03, R-04), choosing the earliest in that order.

#### Scenario: Several Red rules
- **WHEN** a booking fails R-01 and R-04
- **THEN** it is counted once, as a customs hold

#### Scenario: Red data issue
- **WHEN** a booking's destination city is not in its destination country and its HS code is short
- **THEN** it is counted as bounced back as filed

### Requirement: Amber is not a stop
The system SHALL count bookings whose worst result is Amber as "need a look" and SHALL NOT include them in any stop or cost.

#### Scenario: Appointment missing
- **WHEN** a booking fails only R-08
- **THEN** it is counted under "need a look" and in no stage

### Requirement: Avoided stops
The system SHALL count a booking as avoided only when it was stopped as uploaded and is not stopped after the fixes applied in the session.

#### Scenario: Partly fixed
- **WHEN** a booking had two short HS codes and only one has been fixed
- **THEN** it is still stopped and not avoided

### Requirement: User-supplied cost estimate
The system SHALL estimate cost only from low and high £ figures the user enters per stage, SHALL show no default figures, and SHALL label the result as an estimate kept separate from carrier prices.

#### Scenario: No figures entered
- **WHEN** no cost has been entered
- **THEN** no £ total is shown and the panel asks for the user's figures

#### Scenario: Range
- **WHEN** a customs hold costs £400–£1,200 and one customs-hold booking has been fixed
- **THEN** "Avoided by fixes so far" shows £400–£1,200

### Requirement: Status unchanged
The outcomes SHALL NOT change any booking's Red, Amber or Green status.

#### Scenario: Sample workbook
- **WHEN** the sample workbook is checked
- **THEN** every booking keeps its expected result
