# Design

## Context

Observed on `feat/add-hs-code-validation` @ `31c7143`:
- **Where values are silently corrected.** `scripts/engine.js` `normaliseBooking()` (~line 459) does it through these helpers:
  - `normCity`, `normCountry` (`COUNTRY_ALIASES`: UK/GB/PRC/Türkiye…), `normDestType` (Amazon/FC/shop…), `normPriority` (asap/budget…) and `normYesNo` (y/yes/booked/1…);
  - `parseSheetDate` (Excel serial, ISO, "5 Nov 2026");
  - `num` (strips `£`, `gbp`, `kg`, commas);
  - `normHS` (number-cell `.0`, an "HS"/"commodity code" prefix, dots and spaces);
  - defaults: a blank origin country becomes United Kingdom (~line 470), a blank currency becomes GBP.
  - None of these leaves a trace. Only the blank-priority case raises an Amber data issue.
- **Chat.** `scripts/chat.js` `deriveItems()` (~line 293) fills missing cartons, quantity or units per carton and returns "Worked out" notes. `toRaw()` (~line 311) computes total cartons and declared value when not stated (`cartonsStated` / `declaredStated` false).
- **Existing human-in-the-loop pieces.** In `scripts/app.js`:
  - `fixActions()` (~line 41) builds click-to-apply buttons;
  - `hsUse()` / `hsRecActs()` (~lines 56–57) offer HS "Use <code>";
  - `overrides[bookingIndex] = { patch, items }` (~line 291), merged by `applyOv()` (~line 321);
  - `evalAll()` re-evaluates and tags rows `edited` (~line 325);
  - "Undo my fixes" deletes the override (~line 356);
  - the report download builds Summary and Issues sheets with `XLSX.utils.aoa_to_sheet` (~lines 375–377).
- **No backend, no login.** All state is per browser session.

## Goals / Non-Goals

**Goals:**
- Every automatic correction is recorded by the pure engine, so it is deterministic and testable in Node.
- Old and new values are shown side by side, with Accept / Change / Accept all.
- One ordered audit trail covers system corrections and user decisions and fixes, and is exportable.
- Zero effect on Red/Amber/Green and on the Expected results.

**Non-Goals:**
- Server or durable storage, user identity, multi-reviewer sign-off.
- Changing what gets corrected; no correction is removed or added.
- Making review mandatory before confirming.

## Decisions

### D1. The engine records corrections as data (`b.corrections`)
A local helper in `normaliseBooking()`:
```
const corr = (scope, field, label, raw, used, kind, why, sku) => {
  if (isBlank(raw) && kind !== 'default') return;
  if (clean(raw) === String(used)) return;            // identical after trimming spaces
  b.corrections.push({ id: `${scope}:${sku || ''}:${field}`, scope, field, label, sku: sku || null,
                       entered: isBlank(raw) ? '' : String(raw), used: String(used), kind, why });
};
```
Called right after each existing normalisation. The logic of each helper is unchanged; only calls are added.

| Field | Kind | Condition | `why` |
|---|---|---|---|
| originCity, destCity | alias / format | `normCity` result ≠ entered text | "Recognised city name" |
| originCountry, destCountry, item `coo` | alias | `normCountry` result ≠ entered | "Recognised country name" |
| originCountry (blank) | default | blank → United Kingdom | "Every route starts in the United Kingdom" |
| destType | alias | `normDestType` ≠ entered | "Read as <type> from “<entered>”" |
| priority | alias | `normPriority` ≠ entered (not when blank; that case already raises an issue) | "Recognised priority" |
| appointment | format / alias | `normYesNo` ≠ entered | "Read as Yes/No" |
| ready | date | a date was parsed, and the entry was not text already in DD-MM-YYYY | "Date read as DD-MM-YYYY (from Excel date / ISO / text)" |
| pallets, cartons, declared, gross, item qty/price/upc/cartons/unitWeight | format | the entry was text and `num()` succeeded, e.g. `£5,400` → `5400` | "Removed £, commas or units" |
| currency (blank) | default | blank → GBP | "Only GBP is supported" |
| item `hs` | format | `normHS(...).digits` ≠ entered text, the code has no letters, and it is not blank. For a number cell, compare against `String(v)` (`691200.0` → `691200`) | "HS digits read without dots, spaces or prefix" |

- **Display values.** `used` is the display form: dates use `fmtDate`, numbers use `String`.
- **Recorded corrections are never the source of truth.** The engine keeps using the normalised values exactly as today.
- **Chat derived values (kind `derived`).** `toRaw()` adds `raw.derived = { cartons: !cartonsStated, declared: !declaredStated }` and keeps each item's existing `it.derived` flags (`cartons`, `qty`, `upc`). `normaliseBooking()` records them with `entered: ''` and a why such as "Worked out: 1,080 ÷ 12 per carton" (the chat already produces this text in its notes).
- **Order.** Corrections are recorded in the order of the normaliser: booking fields, then items in order, then fields within an item. That makes the result deterministic.
- *Rejected:* computing corrections in the UI by diffing raw and normalised values. That duplicates the normaliser's knowledge and can't be tested in Node.

### D2. Status is untouched
`evaluate()` returns `corrections: b.corrections` and does not count them in `reds` or `ambers`. A test asserts that every Expected-results status is unchanged and that TB-16 stays Green with four corrections.

### D3. Review state lives in the UI (`reviews`)
- **File mode.** `const reviews = {}` keeps `bookingIndex → { [correctionId]: { state: 'accepted' | 'changed', value?, at } }`, next to `overrides`.
- **Accept** sets the state to `accepted`. Nothing else changes, and the booking is not re-evaluated.
- **Change…** opens an inline input pre-filled with the used value. On submit it:
  - writes the value through the existing override path: `ctx.apply({ patch: { [field]: value } })` for a booking field, or `itemPatch: { i, f: { [field]: value } }` for an item field (the same shape `hsUse()` uses);
  - sets the state to `changed`.
  - Because the value is now the user's own input, a later re-check records no correction for it if it is already canonical. If it still differs, the row shows "Changed by you" from `reviews`.
- **Accept all** accepts every correction for that booking.
- **"To review" count** = corrections without a review entry. It goes in a new column of the file results table and in the exported Summary sheet.
- **"Undo my fixes"** clears both `overrides[i]` and `reviews[i]`.
- **Chat mode.** The chat state gains `st.reviewed = { [correctionId]: 'accepted' }`.
  - When `reply.status` is set and unreviewed corrections exist, the reply carries `reply.corrections` (unreviewed only), and `app.js` shows them as "You entered → We used" lines with a "Looks right" chip.
  - The chip sends "looks right". `parseMessage` treats it as an intent that marks all listed corrections accepted.
  - "change cartons to 80" already works through the existing patch parsing and is logged as `changed`.

### D4. Audit trail (`audit`, UI only, ordered)
- **Storage.** `const audit = []` in `app.js`. Each event: `{ at: new Date().toISOString(), booking, field, sku, before, after, by: 'system' | 'you', action }`. The clock is read only here; the engine stays pure.
- **Events:**
  - `auto-corrected` (by system): added when a booking's corrections are first seen. Keyed by `booking + correctionId + entered + used`, and a `Set` of seen keys prevents duplicates on re-evaluation. When a correction changes (e.g. after Change…), the new one is logged once.
  - `accepted` / `changed` (by you): from D3.
  - `fix applied` (by you): logged inside `ctx.apply`, with before = the current value and after = the patch value, one event per patched field. This covers the R-02/R-04/R-05/R-08/R-10 fixes, carrier "Choose", pallet plan "Use N pallets" and HS "Use <code>".
  - `fixes undone` (by you): from "Undo my fixes".
- **Display.** An "Audit trail" `<details>` panel under the file results (newest first on screen), plus a per-booking filtered list inside the report.
- **Export.** The report download adds a third sheet, `Corrections`, with columns Time | Booking | SKU | Field | Before | After | By | Action, oldest first, built with `XLSX.utils.aoa_to_sheet` like Summary and Issues.
- **Lifetime.** The session only. Loading a new file asks nothing and starts a new trail; the export is the durable record. *Rejected:* `localStorage`, which is per-browser, can be cleared, and isn't reliable as an audit record.

### D5. Confirmation and chat copy
- `confirmation()` gains one line when the count is above 0: "N automatic corrections not yet reviewed — check them before booking." It does not block.
- The chat's "Worked out:" notes stay as they are. The new review list appears once, when the booking first becomes complete, and again on "what's wrong?".

## Risks / Trade-offs

- **[Noise from trivial corrections, e.g. `yes` → `Yes`]** → These are kept, because the judges' TB-16 plants exactly this. Accept all clears them in one click.
- **[Audit trail is lost when the tab is closed]** → The panel says "Download the report to keep this record", and the Corrections sheet is the durable copy.
- **[Logging inside `ctx.apply` misses a direct state mutation]** → Every existing button already goes through `ctx.apply`. A test-tab check asserts that each `fixActions()` action produces a `fix applied` event.

## Migration Plan

This is additive.
1. Engine records first; tests prove the statuses are unchanged.
2. Then the UI review table, the audit trail and the export.
3. Then the chat review.

To roll back, revert the commit. The engine stays backward compatible, since `corrections` is just an extra field.
