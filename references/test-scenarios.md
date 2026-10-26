# Test scenarios (today fixed at 25-10-2026)

Base booking: Manchester → Frankfurt warehouse, 3 pallets, 90 cartons, £5,400, 620 kg, appointment Yes, Cheapest; 1,080 ceramic mugs × £5, 12/carton, 90 cartons, 0.5 kg, HS 691200, UK → **Green, Carrier A £540**.

## A. File-format exceptions
| # | Scenario | Expected |
|---|---|---|
| A1 | Grey example row BK-001 left in file | Skipped, Info notice (toggle to include) |
| A2 | No title row; header on row 1 | Parsed normally |
| A3 | Columns in a different order | Mapped by header name |
| A4 | Item Booking ID " bk-9 " vs "BK-9" | Matched |
| A5 | Item row for unknown booking TB-99 | Amber notice listing row & SKU; not checked |
| A6 | Duplicate Booking ID | Red data issue on second row |
| A7 | Blank rows between bookings | Ignored |
| A8 | CSV upload with "05-11-2026" | Kept as 5 Nov (not 11 May) |
| A9 | Bookings and Items as two separate files | Combined |
| A10 | Missing column (e.g. Currency) | Amber notice; treated blank (GBP default) |

## B. Value/format exceptions
| # | Scenario | Expected |
|---|---|---|
| B1 | Declared "£5,400" as text | Parsed 5400 → pass |
| B2 | Pallets "three" | Red: isn't a number |
| B3 | Pallets 2.5 | Red: must be whole |
| B4 | Pallets 0 | Red data; R-05 cannot run |
| B5 | Units per carton 0 | Red data + R-03 fail |
| B6 | Currency EUR | Red |
| B7 | Booking with no items | Red; item rules "couldn't run" |
| B8 | Paris + Germany | Red mismatch; France rates used once fixed |
| B9 | Munich | Red: no route |
| B10 | Origin "UK" for item | Read as United Kingdom → pass |
| B11 | Appointment "yes " | Yes → pass |
| B12 | Priority blank | Balanced (Carrier B) + Amber note |

## C. Rule boundaries
| # | Scenario | Expected |
|---|---|---|
| C1 | HS blank | R-01 Red, suggests 691200 |
| C2 | HS 6912 | Red |
| C3 | HS "6912.00" / "6912 00" | Pass |
| C4 | HS numeric 30211 | Red + leading-zero hint |
| C5 | HS text "030211" | Pass |
| C6 | HS "69A200" | Red |
| C7 | HS 12 digits | Pass + advisory |
| C8 | Declared 5454 (+1.00%) / 5346 (−1.00%) | Pass |
| C9 | Declared 5454.01 / 5345 | Red |
| C10 | Declared excludes one item's line | Red, names the item |
| C11 | Declared 540 vs 5400 | Red, "factor of 10" |
| C12 | 12 × 80 ≠ 1080 | R-03 Red; fixes qty 960 or cartons 90 |
| C13 | qty 1000, 12/carton | Red; "isn't whole" hint |
| C14 | Booking cartons 95 vs 90 | R-04 Red |
| C15 | Exactly 500 kg/pallet on A | Pass |
| C16 | Cheapest, 550 kg/pallet | Red; fix 1 = switch to B £660, fix 2 = A on 4 pallets £720 |
| C17 | Fastest, 450 kg/pallet | Red vs C (400); fixes: re-pack C onto 4 / switch B |
| C18 | 800 kg/pallet | Over every carrier; best fix B on 4 pallets £880 |
| C19 | Override Carrier B at 550 kg | Pass |
| C20 | Gross 500 < net 540 | R-07 Amber |
| C21 | Gross = net 540 | Pass + "looks like net weight" |
| C22 | Warehouse + No / blank | R-08 Amber |
| C23 | Business address + No | R-08 N/A |
| C24 | Blank origin | R-09 Amber |
| C25 | Ready yesterday | R-10 Amber; ETA from today |
| C26 | Ready today | Pass |
| C27 | Ready "31-02-2026" | Red data; R-10 cannot run |
| C28 | Ready Saturday | Collection Monday |
| C29 | Several planted errors at once | Each listed: 2 Red + 2 Amber |

## C+. HS code suggestions (when HS is empty)
| # | Item name | Expected |
|---|---|---|
| H1 | Ceramic coffee mug / Porcelain plate | 691200 / 691110 |
| H2 | Organic cotton T-shirt / Soy wax candle | 610910 / 340600 |
| H3 | Cotton tea towel vs Cotton bath towel | 630291 vs 630260 (specific first) |
| H4 | Green tea vs Black tea | 090210 vs 090240 |
| H5 | Enamelled cast iron casserole / Cast iron skillet | 732392 / 732391 |
| H6 | Widget assembly kit (unknown) | No guess; Trade Tariff link |
| H7 | Blank HS with a suggestion available | Still R-01 Red until accepted |
| H8 | Chat: HS question | Shows usual code + "Use 340600" chip |
| H9 | Chat: "don't know", later "use 340600" | Suggestion note, then HS set |

## D. Dangerous goods (R-06)
| Description | Expected |
|---|---|
| Lithium-ion power bank / Vape pen / 18650 cells | Red |
| Aerosol hairspray / Dry shampoo / WD-40 | Red |
| Eau de parfum / Nail polish / Hand sanitiser | Red |
| SKU "PB-LI-ION", description "Portable charger" | Red (SKU scanned) |
| Bluetooth speaker / Reed diffuser / paint | Amber "confirm" |
| Wall clock, batteries not included / Battery-free timer | Pass |
| Non-aerosol hair spray / Alcohol-free hand cream | Pass |
| Silicone phone case / Empty spray bottle / Lighter weight tote / Scented soy candle | Pass |

## E. Carrier choice
| Priority | Expected |
|---|---|
| Cheapest | A on every route (NL 3 pallets = £480) |
| Fastest | C |
| Most reliable | C |
| Balanced | B on every route |
| Priority changed after override | Override cleared |

## F. Conversation exceptions
| # | Input | Expected |
|---|---|---|
| F1 | Everything in one message | Complete, Green, nothing asked; cartons 90 & value £5,400 calculated |
| F2 | "I need to ship some candles to Paris" | Item + destination captured; asks origin |
| F3 | Bare answers "Leeds", "500", "4", "20", "0.3", "340600", "India" | Each fills the pending field |
| F4 | "don't know" for HS | Accepted; R-01 Red at end with suggested code |
| F5 | "add a pallet" / "remove a pallet" / "make it 2 pallets" | Pallets change; checks re-run with diff |
| F6 | "gross weight is 1300kg" on 2 pallets | R-05 Red; "add another pallet" → passes |
| F7 | "actually send it to Rotterdam" | Country & prices change |
| F8 | "switch to carrier B" / "use the recommended carrier" | Override set / cleared |
| F9 | "Shipping 3 pallets to Munich" / "from Bristol" / "to Spain" | Helpful redirect note |
| F10 | Two products in one sentence | Two items with own price, packing, origin |
| F11 | "make it 1200 mugs" | Updates existing item; cartons re-derived 100 |
| F12 | "declared value is £6,000" | Stated value checked → R-02 Red |
| F13 | Lithium item + "confirm" | Blocked, red issues listed |
| F14 | Clean + "confirm" | Reference PF-###### and next steps |
| F15 | "remove the candles" | Item removed |
| F16 | Shop / business address | Appointment question skipped |
| F17 | "no appointment yet" | R-08 Amber |
| F18 | "500g each", "1.2 tonnes" | 0.5 kg; 1,200 kg |
| F19 | "next Monday", "tomorrow", "in 3 days", "5 Nov" | Correct dates |
| F20 | "ready 20 October" (past) | Kept and flagged R-10 |
| F21 | "1080 ceramic mugs, 350 ml" | 350 ml not a quantity |
| F22 | "start over" | Reset |

## G. End-to-end workbook (assets/Preflight_Test_Cases.xlsx)
TB-01 clean · TB-02 R-01 · TB-03 R-02 · TB-04 R-03 · TB-05 R-04 · TB-06 R-05 cheapest · TB-07 R-05 fastest · TB-08 R-06 · TB-09 R-06 confirm · TB-10 R-07 · TB-11 R-08 · TB-12 R-09 · TB-13 R-10 · TB-14 business address green · TB-15 six errors · TB-16 format edge cases green · TB-17 boundaries green · TB-18 city/country mismatch · TB-19 no items · TB-20 over every carrier · TB-21 party poppers (ADR 1 advisory, Green) · TB-22 pool chlorine (ADR 5.1 advisory, Green) · TB-23 spirit level + matchbox car (no DG, Green) · TB-24 4 pallets for 600 kg (fewer-pallets advisory, Green) · TB-25 “ tb-05 ” duplicate ID (Red) · TB-99 orphan item. Expected: 25/25 match plus the TB-99 notice (valid until 16-11-2026).

## H. Coverage matrix (planted bookings per check)
Every rule and extra check has at least one planted booking in `assets/Preflight_Test_Cases.xlsx`; unit tests in `scripts/tests.js` cover the edge cases.

| Check | Severity | Planted booking(s) |
|---|---|---|
| R-01 HS code ≥ 6 digits | Red | TB-02 (blank, 4-digit `6115`), TB-15 (blank); TB-16 (`6912.00`, text `090240` pass) |
| R-02 Declared value ±1% | Red | TB-03, TB-15; TB-17 (exactly +1%, pass) |
| R-03 Units × cartons = quantity | Red | TB-04 |
| R-04 Booking cartons = item cartons | Red | TB-05, TB-15 |
| R-05 Weight per pallet ≤ carrier max | Red | TB-06 (cheapest), TB-07 (fastest), TB-20 (over every carrier); TB-17 (exactly 500 kg, pass) |
| R-06 Lithium, aerosols, flammable liquids | Red / check | TB-08 (Red), TB-09 (check) |
| R-07 Gross ≥ goods weight | Amber | TB-10 |
| R-08 Warehouse appointment | Amber | TB-11, TB-15; TB-14 (business address, n/a) |
| R-09 Country of origin | Amber | TB-12, TB-15 |
| R-10 Ready date not in the past | Amber | TB-13, TB-15 |
| Data: city/country mismatch | Red | TB-18 |
| Data: no item lines | Red | TB-19, TB-25 |
| Data: duplicate Booking ID (case/space-insensitive) | Red | TB-25 (` tb-05 ` repeats TB-05) |
| Notice: orphan item row | Notice | TB-99 |
| Advisory: possible dangerous goods (ADR classes outside R-06) | Advisory | TB-21 (class 1), TB-22 (class 5.1); TB-23 look-alikes (none) |
| Advisory: fewer pallets by weight | Advisory | TB-24 (4 → 2 pallets, saving £340); also TB-15 |
| Price disclaimer | Display | every booking with a carrier |
| HS existence, leading-zero and suggestion checks (change `add-hs-code-validation`) | Advisory / R-01 fix text | TB-02 (TSH-01 blank → suggestion; SCK-01 `6115` → heading hint), TB-15 (MUG-01 blank → suggestion), TB-16 (`090240` text keeps its zero). Codes that are not in the tariff (`999999`) and 9-digit number cells are unit-tested only; that change adds planted bookings for them. |
