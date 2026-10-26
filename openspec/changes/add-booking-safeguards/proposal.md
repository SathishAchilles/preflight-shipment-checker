# Proposal

## Why

The team whiteboard (26 Oct 2026) listed checks judges expect beyond the HS work:
- items in a dangerous-goods "grey area";
- a price disclaimer;
- weight-based pallet recommendations;
- dates compared with the day the app is used;
- duplicate booking IDs;
- a bookings dump with planted bugs.

Today R-06 only knows the three rulebook categories (lithium batteries, aerosols, flammable liquids). Prices are shown as if they were final quotes. The pallet advice only appears once a carrier's limit is already broken. Items marked [R] below come from the whiteboard or the user; [D] items are design choices.

## What Changes

- **Dangerous goods "grey area" screening** [R, whiteboard item 2; user: "capture all possible dangerous goods in this market"]:
  - add a second, wider screening table covering every other ADR class that shows up in ordinary goods sent by UK→DE/FR/NL road, e.g. fireworks and party poppers, gas cartridges and lighters, matches and firelighters, pool chlorine and peroxides, pesticides, corrosive cleaners and wet batteries, mercury, dry ice, airbags, fuelled engines;
  - a hit adds an **Advisory**, "Possible dangerous goods (ADR class N)", which does not change the booking's status [user decision 26 Oct 2026: the fixed rulebook's R-06 names only three categories, and "these are the only rules judges will test against"];
  - R-06 stays Red and unchanged for its three categories;
  - each warning names the matched words, the ADR class, typical UN numbers and the exception that would make the item non-dangerous (e.g. spirits at 24% ABV or less), and lists known safe phrases (e.g. "battery-free", "spirit level", "matchbox car") that do not trigger it.
- **R-06 keyword fixes** [user decision 26 Oct 2026]: methanol added to the flammable-liquids keywords (Red, per the rulebook); plain "tablets" and "fuel tablets" no longer trigger R-06 (medicine and pool-chlorine tablets were false positives).
- **Price disclaimer** [R, item 4]: wherever a carrier price is shown, add "Indicative rate per pallet for the destination country. Actual prices vary by collection and delivery city, fuel surcharge and date — confirm with the carrier." Per-city pricing stays out of scope.
- **Pallet weight plan** [R, item 5: weight as an input, recommend the best pallet allocation]:
  - inputs: the gross weight already entered (or, if missing, an estimate from unit weight × quantity plus 25 kg per pallet, labelled as an estimate);
  - for each carrier on the route: the fewest pallets the weight allows (`ceil(gross ÷ max kg per pallet)`), the weight per pallet when the load is split evenly, and the total cost;
  - an Advisory when the booking uses more pallets than its weight needs and a cheaper plan exists ("by weight 2 pallets are enough, saving £220 — check volume and stacking height") [D];
  - a carton-to-pallet split by weight (heaviest carton first onto the lightest pallet) shown as a table [D: deterministic; it balances weight only, since carton sizes are not in the data].
  - Everything is a recommendation with a "Use N pallets" action. Nothing changes without a click (same rule as the HS change).
- **Ready date compared with the day the app is used** [R, item 6, user: "date is always current date, testing date is app use date"]: this is already how R-10 works (`engine.js:539`, `todayISO()` from the browser clock). The change writes it down as a requirement, shows "checked against today, <date>" in the report, and records that tests pin the date only for repeatable results.
- **Duplicate Booking ID** [R, item 7]: already a Red data issue (`engine.js:361`, `:441`). The change writes it down as a requirement and adds edge cases (different letter case, extra spaces, three copies).
- **Planted-bug coverage matrix** [R, item 3]: `references/test-scenarios.md` gets a table mapping every rule and check to at least one planted booking. The sample workbook gets new planted bookings for the new checks.
- Out of scope: Voice AI (whiteboard), per-city pricing, volumetric/stacking optimisation.

## Capabilities

### New Capabilities

- `dangerous-goods-screening`: screening item descriptions for dangerous goods. It covers the Red R-06 categories and the "possible dangerous goods" Advisory for every other ADR class, with matched words, class, UN numbers, exceptions and safe phrases.
- `pallet-weight-planning`: turning the shipment weight into recommended pallet counts, per-pallet weights, costs and a carton-to-pallet split per carrier.
- `carrier-price-display`: how carrier prices are shown, including the indicative-price disclaimer.
- `booking-integrity`: booking-level checks that don't depend on the items: unique booking IDs and the ready date compared with the day the app is used.

### Modified Capabilities

None. The project has no existing specs.

## Impact

- **Code:**
  - `scripts/engine.js`: new DG table and scan, pallet plan in the carrier recommendation, new advisory;
  - `scripts/app.js`: disclaimer, pallet plan table and actions, "checked against today" line;
  - `scripts/chat.js`: disclaimer and pallet plan in replies;
  - `scripts/tests.js`, `scripts/make_testdata.py`, `assets/Preflight_Test_Cases.xlsx`: new planted bookings and expected results;
  - `references/logic.md`, `references/test-scenarios.md`.
- **Dependencies:** none.
- **Expected results:** the 20 existing bookings keep their expected status. New planted bookings are added with their own expected rows.

## Decisions to confirm

- **Grey-area DG severity (decided 26 Oct 2026):** Advisory. It never changes Red/Amber/Green.


---

**Haiku validation:** each change names its exact file, rule, wording, thresholds and expected test outcome, so a smaller model can implement it step by step without further design decisions.
