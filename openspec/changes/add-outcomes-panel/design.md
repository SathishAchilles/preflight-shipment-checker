# Design

## Context

- `evaluate()` in `scripts/engine.js` returns `checks` (`id`, `sev`, `status`: pass / fail / check / cannot / na), `dataIssues` (`sev`) and `status` (Red / Amber / Green).
- `renderFile()` in `scripts/app.js` re-evaluates every booking with its overrides (`evalAll()`) and rebuilds `#file-results` from scratch on every change.
- `noteCorrections()` writes audit events and de-duplicates them, but the baseline must not go through it anyway.

## Decisions

### D1. Stage order and mapping
Journey order: booking → collection → border → receipt. `firstStop(ev)` returns `booking` when any data issue is Red. Otherwise it returns the first stage whose rules include a check with `status === 'fail' && sev === 'Red'`, and `null` when there is none. Order matters: TB-15 fails R-01, R-02 and R-04, and it counts once, as a customs hold.

### D2. Before and after
At ingest, `fileData.baseline` = `PF.evaluate(b, { today })` for each uploaded booking, computed once. `outcomes(before, after)` compares that baseline with the current `evalAll()` results, index by index:
- `before`: first stop as uploaded;
- `now`: first stop with fixes applied;
- `avoided`: stopped before and not stopped now.

### D3. Cost maths
`avoidedCost(out, costs, which)`:
- `which` is `'avoided'` (default) or `'before'` (at stake).
- Per stage: `n × low` to `n × high`.
- One bound entered → it is used for both.
- `high < low` → high is raised to low.
- Negative, non-numeric or blank → the stage is left out.

Totals are sums of the lines. They are never added to carrier prices.

### D4. Panel behaviour
- **One panel per file.** `outcomesPanel()` is built once per upload and cached on `fileData.oc`. `renderFile()` re-appends the same element and calls `update(rows)`, so a fix animates from the old values to the new ones (bar heights, ring, counters, waffle flip) instead of replaying the whole entrance.
- **Entrance.** It starts when the panel scrolls into view (IntersectionObserver): the route line draws, then the bars rise, then the waffle cells pop in by booking order, then the stacked bars grow, while the numbers count up. Delays are removed once it has settled.
- **Cost inputs** repaint only the cost bars and totals, never the report, so typing keeps focus.
- **Storage.** Costs are kept in `localStorage['pf-outcome-costs']`. Every read and write is wrapped in try/catch.
- **Reduced motion.** `prefers-reduced-motion` shows the final state at once and hides the moving dots.

### D5. Charts and colour
- **Form.** The stops are ordered, so they share one scale: a bar per stop, normalised to the largest stop. The 25 bookings are a waffle, one cell each, because every booking counts once. Before and now are two 100% stacked bars on the same scale. Costs are range bars on one shared £ scale.
- **Colour** is status only, using Night Route's tokens: stopped `#FF5C7A`, fixed `#4BE3A4`, need a look `#FFB547`, clean `#4FD1FF` (cyan tint), on navy `#070B16`.
  - Validated on `#0B1224`: CVD worst adjacent ΔE 10.8 and normal-vision 15.3, both pass; contrast ≥ 3:1, pass.
  - The categorical lightness band fails, which is expected for status colours.
  - Green against amber is weak for tritan vision (ΔE 2.6), so every state also carries a glyph (✕ ✓ !) and a word in the legend and tooltip.
- **Always night.** The panel uses its own `--n-*` tokens and stays dark in both app themes, as Night Route does.

## Sample workbook (today 26-10-2026, as uploaded)

| Stage | Bookings |
|---|---|
| Bounced back as filed | TB-18, TB-19, tb-05 |
| Refused at collection | TB-06, TB-07, TB-08, TB-20 |
| Customs hold | TB-02, TB-03, TB-15 |
| Rejected at delivery | TB-04, TB-05 |
| Need a look (Amber) | TB-09 … TB-13 (5) |
| Clean | 8 |

Total: 12 of 25 stopped.
