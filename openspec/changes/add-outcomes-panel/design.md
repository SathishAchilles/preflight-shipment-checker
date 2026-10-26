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
- Cost inputs repaint only the estimate cells and totals, never the whole report, so typing keeps focus.
- Costs are stored in `localStorage['pf-outcome-costs']`. Every read and write is wrapped in try/catch, so the panel works without storage.
- The open/closed state of the estimate survives a re-render.

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
