# Road-freight rules: UK → Germany, France, Netherlands

These are the sources behind `ROAD_GOODS` and `roadLimits()` in `scripts/engine.js`. Scope is **road freight only**: ADR for dangerous goods, and the EU and national import rules that apply to goods arriving by lorry. Air (IATA), sea or ferry (IMDG), rail (RID) and post rules are out of scope.

Every warning is an **Advisory**. It never changes Red/Amber/Green, because the fixed rulebook R-01…R-10 is the only thing judges test.

Researched and checked on 26 Oct 2026. Rows marked ✔ were re-checked against the primary text by hand. The rest come from the research pass, which quoted primary sources.

## 1. Banned or permit-only goods (`ROAD_GOODS`)

| Rule id | Goods | DE | FR | NL | Needed / why | Primary source | Conf. |
|---|---|---|---|---|---|---|---|
| animal | Meat, dairy, fish, eggs, honey, gelatine | permit | permit | permit | Export health certificate (EHC). Border control post (BCP) check at first EU entry (Calais, Dunkirk or Rotterdam). Importer pre-notifies in TRACES. Wild fish needs a catch certificate. | Reg. (EU) 2017/625 Art. 47; gov.uk “Export or move food, drink and agricultural products” | high |
| composite | Shelf-stable chocolate, biscuits, confectionery, pasta | permit | permit | permit | No meat: private attestation by the importer. Chilled, frozen or with meat: composite EHC. | Reg. (EU) 2021/630 Art. 3; gov.uk composite food ✔ (page updated 19 May 2026) | high |
| petfood | Pet food, chews, animal by-products | permit | permit | permit | EHC plus BCP check | gov.uk “Export food for animals: special rules” | high |
| soil | Soil and growing media, seed potatoes, grapevine (*Vitis*) plants | ban | ban | ban | Prohibited from GB | Reg. (EU) 2016/2031 Art. 40; gov.uk “Export plants and plant products” | high |
| plants | Live plants, bulbs, cut flowers, potatoes, trees | permit | permit | permit | Phytosanitary certificate from APHA plus BCP check | Reg. (EU) 2016/2031; gov.uk | high |
| cites | Ivory, rosewood/*Dalbergia*, reptile skins, coral, caviar | permit | permit | permit | EU import permit plus UK CITES export permit. Ivory for sale is barred by the UK Ivory Act 2018. | Reg. (EC) 338/97 Art. 4; gov.uk CITES; Ivory Act 2018 | high (keywords: medium) |
| firearms | Firearms, air rifles, gun parts | permit | permit | permit | DE: permit from the weapons authority. FR: AIMG. NL: consent under Wwm Art. 14. All three need a UK export licence. | zoll.de; douane.gouv.fr; Wwm | high |
| knives | Butterfly knives, switchblades | ban | — | ban | DE: WaffG Anl. 2, 1.4.1 and 1.4.3 (side-opening blade ≤ 8.5 cm, single-edged, legitimate need exempt) ✔. NL: Wwm category I. | gesetze-im-internet.de/waffg_2002/anlage_2.html ✔; wetten.overheid.nl BWBR0008804 | high |
| blunt | Knuckle dusters, throwing stars | ban | — | ban | WaffG Anl. 2, 1.3.2–1.3.3 ✔; Wwm category I | same | high |
| stun | Stun guns, tasers | ban | — | ban | DE: unless officially approved and test-marked (1.3.6) ✔. NL: Wwm category II. | same | high |
| pepper | Pepper or CS spray | ban | — | — | Unless approved and test-marked (1.3.5) ✔ | WaffG Anl. 2 | high |
| snus | Tobacco for oral use | ban | ban | ban | EU market ban | Directive 2014/40/EU Art. 17 | high |
| pouches | Nicotine pouches | — | ban | ban | FR: import and possession banned from 1 Apr 2026 ✔; the Conseil d'État suspended only the manufacture and export parts. NL: total ban ✔. | service-public.gouv.fr A18450 ✔; rijksoverheid.nl ✔ | high |
| puffs | Disposable vapes | — | ban | — | Sale and holding for sale banned | Loi n° 2025-175 | medium-high |
| flavours | E-liquids in flavours other than tobacco | — | — | ban | Only tobacco flavour may be sold since 1 Jan 2023 ✔ | rijksoverheid.nl ✔ | high |
| excise | Beer, wine, spirits, tobacco, e-liquids | permit | permit | permit | Duty due unless the goods go straight into duty suspension (tax warehouse or registered consignee, e-AD in EMCS) | Directive (EU) 2020/262 Art. 6 | high |
| medicines | Medicines, including OTC | permit | permit | permit | Import and marketing authorisation, plus the consignee's wholesale licence. Controlled drugs also need a Home Office licence. | Directive 2001/83/EC Art. 40(3); gov.uk controlled drugs | high |
| catdogfur | Cat or dog fur | ban | ban | ban | Import prohibited | Reg. (EC) 1523/2007 Art. 3 | high |
| seal | Seal products | ban | ban | ban | Inuit-hunt attestation is the only exception | Reg. (EC) 1007/2009 Art. 3 | high |
| mercury | Mercury thermometers, barometers and similar | ban | ban | ban | Import prohibited. This overrides the ADR SP 366 note, which only says these are not dangerous goods. | Reg. (EU) 2017/852 Art. 5, Annex II | high |
| torture | Thumb-cuffs, leg irons, shock belts | ban | ban | ban | Import prohibited | Reg. (EU) 2019/125 Art. 4 | high |
| ods | R22/R12 refrigerant, halon | ban | ban | ban | Including equipment that contains it | Reg. (EU) 2024/590 Art. 5 | high |

**ISPM 15** applies to every load: wooden pallets must be heat-treated and stamped. It is a single line in the confirmation's “What happens next”, not a warning on each booking. Source: gov.uk OVS note, 16 Sep 2026.

**Not flagged, and why:**
- **Toys (CE), cosmetics (CPNP and responsible person), F-gas portal registration, medical-device CE:** these are the importer's market-compliance duties, and matching them on keywords would flag most ordinary goods.
- **Dual-use and military export licensing, counterfeit goods, cultural goods, cash and bullion:** they can't be identified reliably from a description.
- **Unverified, so left out:**
  - French categories for knives, tasers and pepper spray (secondary sources only);
  - CBD in DE, FR and NL;
  - the EU Annex VI host-plant bans as applied to GB;
  - the German tax stamp on e-liquids.

## 2. Road limits for R-06 goods (`roadLimits()`, ADR 2025, ECE/TRANS/352)

These say what a specialist ADR or limited-quantity (LQ) carrier could accept. Carriers A, B and C carry no dangerous goods (R-06).

| Goods | Limit | ADR reference | ✔ |
|---|---|---|---|
| Any LQ package | ≤ 30 kg gross per package; ≤ 20 kg per shrink- or stretch-wrapped tray | 3.4.2, 3.4.3 | ✔ |
| Aerosols, UN 1950 | ≤ 1 L per can as LQ (E0) | Table A col. 7a | ✔ |
| Aerosols ≤ 50 ml, non-toxic | Not subject to ADR | SP 190 | ✔ |
| Perfumery, UN 1266 PG II/III | ≤ 5 L per bottle as LQ | Table A col. 7a | ✔ |
| Flammable liquids (UN 1263, 1993, 1090, 1987) | 1 L per container if PG II, 5 L if PG III (paint PG I: 500 ml). The PG comes from the safety data sheet. | Table A col. 7a | research |
| Alcohol ≤ 24 % ABV | Not subject to ADR | SP 144 | ✔ |
| Alcoholic beverages ≤ 70 % ABV in ≤ 250 L | Not subject to ADR | SP 145 (UN 3065 PG III) | ✔ |
| Alcoholic beverages > 70 % ABV | ≤ 5 L per bottle as LQ | Table A UN 3065 PG II | research |
| Lithium cells / batteries | No LQ route (col. 7a = 0). SP 188: Li-ion cell ≤ 20 Wh and battery ≤ 100 Wh (lithium metal: 1 g / 2 g); UN 38.3-tested; package ≤ 30 kg gross unless installed in equipment. | SP 188 (a)(b)(h) | ✔ |
| Lighter refills, UN 1057 | No LQ route (col. 7a = 0) | Table A; 3.4.1 | research |
| Lighters to EN ISO 9994 | ≤ 10 kg gross per package, ≤ 100 kg per vehicle | SP 658 | ✔ |

**How the app uses these limits:**
- It parses ml/cl/L, % ABV, Wh and mAh from the description. It says “over” only when a stated value exceeds a limit, or when the goods weight per carton (units per carton × unit weight, a lower bound on gross) is already over the cap. Otherwise it asks the user to check.
- mAh is converted at 3.7 V only as a hint. The warning always asks for the Wh rating marked on the case, because a single-cell pack over 20 Wh is fully regulated.
- The ADR small-load exemption (1.1.3.6) applies per transport unit and is the carrier's business, so the app does not use it.

**ADR 2027** enters into force on 1 Jan 2027, and ADR 2025 may be used until 30 Jun 2027. It does not change chapters 3.4 or 3.5, or the Wh, lithium or 30 kg limits in SP 188. The SP 145 wording becomes “more than 24 % but not more than 70 %”, with the same effect.
