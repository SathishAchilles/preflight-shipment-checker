# Design

## Context

- **R-06 today.** `scripts/engine.js` ~lines 158–190 hold `DG_DEFINITE` and `DG_POSSIBLE`. Each is a regex list for exactly the three rulebook categories (lithium batteries, aerosols, flammable liquids). `scanDG()` skips a match when it follows a negation ("no", "non", "free of", …) or is followed by one ("free", "not included", …). R-06 is Red on a definite hit and `check` (Amber) on a possible hit (~lines 614–621).
- **SKILL.md non-negotiable:** rule IDs and severities come only from the fixed rulebook, and extra checks are labelled "Data" or "Advisory".
- **Carrier rate card.** `CARRIERS` (~lines 7–15) has one price per pallet per destination country and a `maxW` per pallet (A 500 kg, B 750 kg, C 400 kg).
  - `recommend()` (~lines 505–535) already computes `need = ceil(gross ÷ maxW)` and offers "switch" and "re-pack" fixes, but only when the chosen carrier's limit is broken.
- **R-10.** `evaluate()` uses `opts.today || todayISO()` (~line 539). `app.js` always passes `PF.todayISO()`, and only `verify.js` and the Tests tab pin `25-10-2026`.
- **Duplicate IDs.** `parseSheets()` keys bookings by `id.toUpperCase()` (~line 360) and sets `duplicateOf`. `normaliseBooking()` raises the Red data issue (~line 441). The test "Duplicate Booking ID → Red on the second row" exists in `tests.js`.
- **Click-to-apply actions already exist.**
  - `fixActions()` (`app.js` ~lines 45–51) builds buttons.
  - `ctx.apply({ patch | itemPatch })` stores per-booking overrides (~line 315).
  - `evalAll()` re-checks and marks the row edited (~line 286).
  - In chat, `chatCtx.apply` sends the action's `say` text.

## Goals / Non-Goals

**Goals:**
- Catch every common dangerous-goods class seen in UK→EU road freight without breaking R-06's fixed rulebook meaning.
- Make prices honest, pallet advice useful before a limit is broken, and keep date and ID checks explicit and tested.
- Everything is deterministic. Every correction is a recommendation the user must accept.

**Non-Goals:**
- Per-city pricing, live carrier quotes, fuel surcharges.
- Volume, stacking height and 3-D load planning (carton sizes are not in the data).
- Producing ADR paperwork, or classifying a product with certainty (the scan reads descriptions only).
- Voice AI.

## Decisions

### D1. Dangerous goods: two tiers, one scanner
- **Tier 1 (unchanged, R-06 Red/check):** lithium batteries, aerosols, flammable liquids. These are the existing `DG_DEFINITE` and `DG_POSSIBLE`.
- **Tier 2 (new, Advisory, label "Possible dangerous goods"):** a new table `DG_ADR`, one entry per ADR class and category:
  `{ cls: '2', cat: 'gas cartridges and lighters', re: /…/, un: ['UN2037', 'UN1057'], unless: 'empty / unfuelled', safe: /…/ }`.
- `scanDG()` gains a third output, `adr: [...]`. It uses the same negation rules, and also the entry's `safe` regex, which removes known false positives before matching (e.g. "spirit level", "matchbox car", "battery-free", "fire pit" without fuel).
- **Where the warning goes.** A tier-2 hit becomes one entry per item in `evaluate()`'s `advisories`. That array is rebuilt on every call, so nothing is duplicated, and the status never changes. Text: "<SKU> (“<description>”) may be dangerous goods: ADR class <cls> <cat> (matched “…”; typical <UN numbers>)." Fix: "Not dangerous if <unless>. Otherwise it needs an ADR-capable carrier and the supplier's safety data sheet (SDS); pallet networks usually refuse it — confirm with the carrier or remove the item." It is not added to R-06, because R-06's text and severity are fixed by the rulebook.
- **Precedence.** If an item already has a tier-1 **definite** hit (R-06 Red), tier 2 is skipped for that item. After a tier-1 *possible* hit, tier 2 still runs, because e.g. "car battery" is a possible lithium hit in R-06 but is really class 8 lead-acid.
- **Catalogue.** The class-by-class keyword catalogue is in "D1 catalogue" below. It is built from ADR 2025 Table A and carrier hidden-dangerous-goods lists; see `research_notes/UK EU road dangerous goods/dg_catalogue.md`.
- *Rejected:*
  - a Red stop or Amber data issue for tier 2. The rulebook has no such rule, judges test against the rulebook only, and many hits are exempt (e.g. spirits at 24% ABV or less);
  - an LLM or embedding classifier, because it is not deterministic.

### D1 catalogue (tier 2, Advisory)

Sources: ADR 2025 (mandatory since 1 Jul 2025), carrier lists (Pall-Ex, DHL Freight, DB Schenker), Eurotunnel rules. Full notes, keyword sets and citations are in `/Users/sathish/ws/research_notes/UK EU road dangerous goods/dg_catalogue.md`. All UN numbers were checked against ADR 2025 Table A (ECE/TRANS/352, Chapter 3.2) and the special provisions in 3.3.1 on 26 Oct 2026; notes are in `un_number_check.md` in the same folder. Subsidiary risks: hydrogen peroxide 20–60% (8), hydrofluoric acid (6.1), UN 3506 mercury articles (6.1).

| Class | Category | Keywords (description) | Typical UN | Not dangerous when (`unless`) |
|---|---|---|---|---|
| 1 | Fireworks and pyrotechnics | fireworks, sparklers, party poppers, christmas crackers, flares, smoke grenades/bombs, ammunition, nail-gun cartridges (UN 0014, tool cartridges; 0323 = power-device cartridges), gunpowder, model rocket motors | 0336, 0337, 0191, 0197, 0507, 0012, 0014, 0323, 0027, 0161 | never by these carriers. Eurotunnel bans pyrotechnics, so the fix text says "needs an ADR explosives carrier, not via Eurotunnel" |
| 2 | Gas cartridges, lighters and gas cylinders | butane/gas cartridge, camping gas canister, blowtorch, lighter refill, propane, LPG, helium canister/tank, CO2 cylinder, SodaStream cylinder, cream chargers, nitrous oxide, oxygen cylinder, scuba tank | 2037, 1057, 1965, 1978, 3150, 1046, 1013, 1070, 1072 | the cylinder or cartridge is empty, or a small receptacle of 50 ml or less with only non-toxic contents (SP 191). SP 653 was deleted in ADR 2025, replaced by SP 406 (LQ ≤1000 ml) on 1046/1013; transitional until 31 Dec 2026 |
| 2 | Fire extinguishers | fire extinguisher | 1044 | packed in strong outer packaging with the trigger protected (SP 594) |
| 2 (toxic, label 2.3) | Toxic gases | chlorine gas, anhydrous ammonia, ammonia gas | 1017, 1005 | never. Eurotunnel bans 2.3 and DHL Freight excludes it |
| 4.1 | Flammable solids | matches, firelighters, fuel tablets, hexamine, mothballs, naphthalene, slug pellets (metaldehyde) | 1944, 1331, 1945, 2623, 1328, 1334, 1332 | shipped as limited quantity (5 kg inner packs) and declared |
| 4.2 | Self-heating | barbecue/BBQ charcoal, lumpwood charcoal, activated carbon/charcoal, colour run remover, sodium dithionite | 1361, 1362, 1384 | the supplier's safety data sheet (SDS) shows it is not classified as self-heating; steam-activated carbon is not subject (SP 646). SP 665 covers only unground coal, coke and anthracite |
| 4.3 | Water-reactive | calcium carbide, sodium metal, flameless ration heater | 1402, 1428, 2813 (heaters: not a named ADR entry; SDS section 14 decides; 3209 was wrong) | never in ordinary freight |
| 5.1 | Oxidisers | pool chlorine, chlorine tablets/granules, trichlor, dichlor, calcium hypochlorite, stump remover, potassium permanganate, sodium chlorate, hydrogen peroxide (above 8%) | 2880, 1748, 2468, 2465, 1486, 1490, 1495, 2984, 2014 (8) | hydrogen peroxide below 8% |
| 5.2 | Organic peroxides | body filler hardener, MEKP, fibreglass catalyst/hardener, benzoyl peroxide paste | 3105, 3106, 3108 | never. The resin part of a filler kit (UN 3269) already triggers R-06 as a flammable liquid |
| 6.1 | Toxic | pesticide, insecticide concentrate, rat/rodent poison, weedkiller concentrate, paint stripper (dichloromethane/DCM), nicotine concentrate | 2588, 2902, 3027, 1593, 3144 | ready-to-use garden products whose SDS shows no ADR class |
| 6.2 | Infectious | biological specimens, clinical waste, sharps waste | 3373, 3291 | never. DHL Freight excludes 6.2 |
| 7 | Radioactive | ionisation smoke alarm, tritium keyring, thorium gas mantle | 2911, 2909 | consumer units after sale. Bulk stock is regulated, and Eurotunnel takes Class 7 on contract bookings only |
| 8 | Wet and lead-acid batteries | car battery, leisure battery, lead-acid, AGM battery, gel battery | 2794, 2795, 2800 | new batteries secured and protected against short circuit (SP 598); non-spillable batteries (SP 238). Pall-Ex refuses car batteries anyway |
| 8 | Corrosive cleaners | drain cleaner/unblocker, caustic soda, sodium hydroxide, oven cleaner, brick acid, patio acid, hydrochloric acid, alloy wheel cleaner, descaler (acid), ammonia solution | 1823, 1719, 1760, 1789, 1790 | the SDS says it is not classified |
| 8 | Mercury | mercury thermometer, mercury barometer | 3506 | 1 kg mercury or less per article (SP 366) |
| 9 | Sodium-ion batteries | sodium-ion, Na-ion battery | 3551, 3552 | (none listed) |
| 9 | Fuelled engines | petrol mower/lawnmower, chainsaw, petrol generator, outboard motor, strimmer (petrol) | 3528, 3529 (gas-powered, class 2), 3530 | the fuel tank has been drained and run dry; electric models are scanned as batteries instead |
| 9 | Dry ice | dry ice, solid CO2 | 1845 | Table A: "not subject to ADR except for 5.5.3" (coolant marking). The fix text says to mark the package |
| 9 | Life-saving appliances and kits | auto-inflating lifejacket, lifejacket CO2 rearm, chemistry set | 2990, 3316 | (none listed) |
| 9 | Airbags | airbag, seatbelt pretensioner | 3268 | (none listed) |
| 9 | Environmentally hazardous | marine pollutant, environmentally hazardous | 3077, 3082 | 5 L / 5 kg or less per package (SP 375) |

**`safe` phrases** (removed before matching; each one has a test):
- battery-free, battery charger;
- gas-free, gas mark, gas hob;
- matchbox (car), matching;
- fire pit, fire blanket;
- spirit level, team spirit;
- charcoal grey/colour, charcoal toothpaste/soap/face mask;
- acid-wash(ed), hyaluronic acid, amino acid, salicylic acid;
- chlorine-free, pool float/toy;
- mercury-free, Freddie Mercury;
- optical smoke alarm;
- CO2-neutral, carbon neutral;
- helium-free;
- toy rocket;
- engine oil (scanned elsewhere), search engine;
- flare jeans, flared;
- ink/toner/filter cartridge;
- hydrogen peroxide 3%.

**Never flagged on road:** magnets (air-only rule), candles and wax, water-based or acrylic paint, wine and beer (24% ABV or less is not subject, SP 144).

**Not in scope, noted for later:**
- a route field (Eurotunnel vs ferry). Class 1, 2.3 and acetylene are a hard stop on Eurotunnel, and ferries follow the IMDG Code;
- a list of goods that are banned but not dangerous (weapons and knives, CITES species, perishables, tobacco and vapes, prescription medicines).

**R-06 keyword changes (user decision, 26 Oct 2026):** methanol / methyl alcohol (UN 1230, class 3) added to R-06's flammable-liquids keywords, so it is Red as the rulebook says. Plain "tablets" no longer counts as a possible lithium device (only iPad, Android/Samsung/Kindle/kids'/drawing tablets, or "tablet" with computer, screen, inch, Wi-Fi, GB), and "fuel tablets" no longer matches R-06's "fuel" (they are class 4.1, reported as an Advisory).

**Related finding about R-06:** by road, spirits up to 70% ABV in containers of 250 L or less are not subject to ADR (SP 145). R-06 tier 1 still lists vodka, whisky, gin and rum as "possible flammable liquid". This change leaves R-06 alone because it belongs to the rulebook. The finding is recorded in `references/logic.md` instead.

### D2. Price disclaimer
One constant `PRICE_NOTE` in `engine.js` (exported), rendered:
- in `app.js` under the carrier line (~line 204), under the comparison table (~line 96) and under the Rules-tab rate card (~line 374);
- in chat on the first price reply only, tracked by a `priceNoteShown` flag in the chat state.

### D3. Pallet plan
New pure function `palletPlan(b)` in `engine.js`, called from `recommend()`. It returns:
```
{ weight, estimated, perCarrier: [{ carrier, minPallets, perPallet, cost }],
  fewer: { carrier, from, to, saving } | null, split: [{ pallet, kg, cartons: { SKU: n } }] | null }
```
- **Weight.** Use `b.gross`. Otherwise, if all items have `unitWeight` and `qty`, use `net + 25 × max(1, pallets)`, with `estimated: true`.
- **Pallets per carrier.** `minPallets = max(1, ceil(weight ÷ maxW − 1e-9))`.
- **Fewer pallets.** Raise the "fewer pallets" Advisory only when `b.pallets > minPallets` for the chosen carrier.
- **Carton split.** This is longest-processing-time greedy (heaviest first onto the lightest pallet). Carton weight = units per carton × unit weight. Ties break by SKU, then pallet number. It is capped at 2,000 cartons; above that the split is skipped with a note.
- **UI.** A "Pallet plan" table in the report, with one "Use N pallets on <carrier>" action per row. The action reuses `patch: { pallets, carrierOverride }`, as the existing R-05 re-pack fix does.
- *Rejected:* full bin-packing or volume optimisation, because there is no carton size data and it is not explainable.

### D4. Ready date and duplicate IDs
- **R-10 logic is unchanged.**
  - The report adds "checked against today, <DD-MM-YYYY> (this device's date)".
  - The Tests tab keeps its pinned date and says so (already does, `app.js` ~line 397).
- **Duplicate key.** It becomes `clean(id).toUpperCase()`, so surrounding spaces are ignored. The `parseSheets()` change is one line. New tests cover case, spacing, three copies and `TB05` vs `TB-05`.

### D5. Planted-bug coverage
- `references/test-scenarios.md` gets a matrix: rows are R-01 … R-10, each data check, the HS existence and recommendation checks, DG tier 2, the fewer-pallets advisory and duplicate ID. Each row names the planted booking or bookings that exercise it.
- `make_testdata.py` adds bookings TB-21 onward for the new checks:
  - party poppers (class 1);
  - pool chlorine tablets (5.1);
  - a "spirit level" false-positive guard;
  - too many pallets for the weight;
  - a ` tb-05 ` duplicate.
- Each has its own Expected-results row, and `verify.js` must match all of them.

## Risks / Trade-offs

- **[False advisories from broad keywords]** → Each entry has a `safe` regex and the negation rules. Task 4.1 is a gate: run the new table over every description in the sample and test files and review every hit before committing.
- **[Missed DG items described vaguely, e.g. "gift set"]** → The scan reads descriptions only, so the limit is stated in the Rules tab. The HS suggestion change can add an HS-prefix cross-check later.
- **[Sample dates expire after 16-11-2026]** → Accepted (decided 26 Oct 2026). Judges upload their own files; the sample's Expected-results sheet already states the cut-off.
- **[Pallet advice ignores volume]** → Every pallet message says "check volume and stacking height".

## Migration Plan

This is additive.
1. Ship the engine and UI changes.
2. Regenerate the sample workbook.
3. Rebuild `preflight.html`.

To roll back, revert the commit.
