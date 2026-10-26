# Proposal

## Why

The rulebook checks the paperwork, but not whether the goods can lawfully enter the destination country by road. Two gaps:
- Goods that are banned, or that need a certificate or permit at the EU border, are never mentioned. The earlier booking-safeguards plan listed this as “noted for later”.
- R-06 says Carriers A, B and C carry no dangerous goods, but not what a specialist carrier could take, or whether an item is not regulated at all (e.g. spirits ≤ 70 % ABV, SP 145).

The user asked (26 Oct 2026) for a list of products not allowed in the case's countries, the maximum quantity at which allowed products can still move, validation of both, and a small ⚠ warning to the user. Scope: per-product limits, Advisory only, road freight only. [R]

## What Changes

- **Catalogue** [R]: `ROAD_GOODS`, a list of goods banned or needing a permit, with a status for each destination (DE / FR / NL). It matches multi-word phrases and strips look-alikes and negations first. Only high-confidence entries are included (`references/road-freight-rules.md`).
- **Road limits** [R]: `roadLimits()` gives ADR 2025 limits for items R-06 clearly matches (lithium, aerosols, flammable liquids), plus spirits and lighters. It parses ml, % ABV, Wh and mAh from the description, and says “over” only when a stated value exceeds a limit. [D]
- **Warnings** [D]: `evaluate()` returns `warnings: [{ kind: ban | permit | limit, country, sku, title, text, fix, ref }]`, separate from `advisories`.
- **UI** [R]: a “⚠ Road-freight warnings” section in the report, a ⚠ line in the chat verdict, a ⚠ count chip in the file table, and the Advisory filter counts warnings. The export adds warning rows to the Issues sheet.
- **Confirmation** [D]: adds one ISPM 15 line to “What happens next”.
- **Unchanged**: Red, Amber and Green. `verify.js` output is identical to `main`.

## Out of scope

- Toys and cosmetics market compliance, F-gas registration, dual-use, counterfeit, cultural goods, cash.
- Unverified French weapon categories and CBD.
- The ADR 1.1.3.6 small-load exemption, which is carrier-side.
- Air, sea, rail and post rules.

---

**Haiku validation:** every entry names its regex, per-country status, text, fix and legal reference, and every limit names its value and ADR section, so a smaller model can implement or extend it without further design decisions.
