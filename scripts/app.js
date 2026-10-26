/* Preflight UI */
(function () {
'use strict';
const PF = window.PF, C = window.PFChat;
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(typo(String(k))));
  return e;
}
const typo = s => s.replace(/(\w)'(\w)/g, '$1\u2019$2');
const SEV_WORD = { Red: 'Must fix', Amber: 'Check' };
const STAMP = { Red: 'Hold', Amber: 'Check', Green: 'Cleared' };
const VERDICT = { Red: 'Not ready — fix the red items before collection', Amber: 'Can go, but review the warnings', Green: 'Ready to book' };

// ---------- Downloads (claude.ai viewer capability, with a plain-browser fallback) ----------
let DL = null;

// ---------- Automatic-correction review and audit trail (session only; download the report to keep it) ----------
const reviews = {}; // file bookingIndex -> { [correctionId]: { state: 'accepted' | 'changed', value, c } }
const audit = []; const auditSeen = new Set();
const FIELD_LABEL = { pallets: 'Pallets', cartons: 'Cartons', declared: 'Total declared value', gross: 'Total gross weight', appointment: 'Delivery appointment', ready: 'Ready to ship date', carrierOverride: 'Carrier', destType: 'Destination type', hs: 'HS code', coo: 'Country of origin', qty: 'Quantity', price: 'Unit price', upc: 'Units per carton', unitWeight: 'Unit weight' };
const shown = v => (v == null || v === '' ? '(blank)' : String(v));
function logEvent(e) { audit.push({ at: new Date().toISOString(), booking: '', sku: '', field: '', before: '', after: '', by: 'you', action: '', ...e }); }
function noteCorrections(ev, extra = {}) {
  ev.corrections.forEach(c => {
    const k = `${extra.chat ? 'chat' : ev.b.id}|${c.id}|${c.entered}|${c.used}`;
    if (auditSeen.has(k)) return; auditSeen.add(k);
    logEvent({ booking: ev.b.id, sku: c.sku || '', field: c.label, before: shown(c.entered), after: c.used, by: 'system', action: 'auto-corrected', ...extra });
  });
}
const hhmmss = iso => { const d = new Date(iso); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':'); };
function historyEl(events, title, open = false) {
  if (!events.length) return null;
  return h('details', Object.assign({ class: 'audit' }, open ? { open: true } : {}), h('summary', null, `${title} (${events.length} event${events.length === 1 ? '' : 's'})`),
    h('p', { class: 'note' }, 'Download the report to keep this record — it is not stored anywhere else.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'ctable' },
      h('thead', null, h('tr', null, ['Time', 'Booking', 'SKU', 'Field', 'Before', 'After', 'By', 'Action'].map(x => h('th', null, x)))),
      h('tbody', null, [...events].reverse().map(e => h('tr', null, h('td', null, hhmmss(e.at)), h('td', null, e.booking), h('td', null, e.sku || ''), h('td', null, e.field), h('td', null, e.before), h('td', null, e.after), h('td', null, e.by), h('td', null, e.action)))))));
}
function reviewEl(ev, ctx) {
  const R = ctx.review; if (!R) return null;
  const cur = ev.corrections; const rows = [...cur, ...R.changedOnly(cur)];
  if (!rows.length) return null;
  const open = cur.filter(c => !R.state(c.id));
  const editCell = (c) => (e2) => {
    const td = e2.target.closest('td'); td.innerHTML = '';
    const inp = h('input', { type: 'text', value: c.used, 'aria-label': `New value for ${c.label}` });
    const save = () => { const v = inp.value.trim(); if (v) R.change(c, v); };
    inp.addEventListener('keydown', k => { if (k.key === 'Enter') { k.preventDefault(); save(); } if (k.key === 'Escape') R.redraw(); });
    td.append(h('span', { class: 'rv-edit' }, inp, ' ', h('button', { class: 'btn tiny', type: 'button', onclick: save }, 'Save'), ' ', h('button', { class: 'linkbtn', type: 'button', onclick: () => R.redraw() }, 'Cancel')));
    inp.focus(); inp.select();
  };
  return h('section', { class: 'review' },
    h('div', { class: 'review-head' }, h('h3', null, 'Automatic corrections — please review'),
      open.length ? h('button', { class: 'btn small', type: 'button', onclick: () => R.acceptAll(open) }, 'Accept all') : null),
    h('p', { class: 'note' }, 'We changed these values before checking. Accept each one, or change it. Reviewing never changes the status.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'ctable rvtable' },
      h('thead', null, h('tr', null, ['Field', 'You entered', 'We used', 'Why', ''].map(x => h('th', null, x)))),
      h('tbody', null, rows.map(c => { const st = R.state(c.id); return h('tr', null,
        h('th', { scope: 'row' }, c.sku ? `${c.label} (${c.sku})` : c.label), h('td', null, shown(c.entered)), h('td', null, c.used), h('td', null, c.why),
        h('td', null, st ? h('span', { class: st.state === 'accepted' ? 'rv-ok' : 'rv-ch' }, st.state === 'accepted' ? '✓ Accepted' : `✎ Changed by you: ${st.value}`)
          : h('span', null, h('button', { class: 'btn tiny', type: 'button', onclick: () => R.accept(c) }, 'Accept'), ' ', h('button', { class: 'btn tiny ghost', type: 'button', onclick: editCell(c) }, 'Change…')))); })))),
    h('p', { class: 'muted' }, open.length ? `${open.length} to review` : 'All reviewed'));
}
try { if (window.claude && typeof window.claude.use === 'function') window.claude.use('downloads').then(d => { DL = d; }).catch(() => {}); } catch (e) {}
async function saveFile(name, buf) {
  if (DL) { try { await DL.save({ filename: name, data: new Blob([buf]) }); return; } catch (e) { if (e && e.code === 'declined') return; } }
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Tabs ----------
const TABS = ['chat', 'file', 'rules', 'tests'];
function showTab(t) {
  if (!TABS.includes(t)) t = 'chat';
  TABS.forEach(x => { $('#tab-' + x).setAttribute('aria-selected', x === t); $('#panel-' + x).hidden = x !== t; });
  if (t === 'tests') renderTests();
  try { if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t); } catch (e) {}
}
TABS.forEach(t => $('#tab-' + t).addEventListener('click', () => showTab(t)));
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

// ---------- Report (shared by chat and file modes) ----------
function fixActions(c, ev, mode) {
  const acts = [];
  const today = PF.todayISO();
  if (c.id === 'R-05' && c.fixes) c.fixes.forEach(f => {
    if (f.type === 'switch') acts.push({ label: `Switch to ${f.carrier}`, patch: { carrierOverride: f.carrier }, say: `switch to ${f.carrier.toLowerCase()}` });
    else acts.push({ label: `Use ${f.pallets} pallets${f.carrier !== ev.rec.chosen.carrier ? ' on ' + f.carrier : ''}`, patch: { pallets: f.pallets, carrierOverride: f.carrier }, say: `make it ${f.pallets} pallets${f.carrier !== ev.rec.chosen.carrier ? ' and use ' + f.carrier.toLowerCase() : ''}` });
  });
  if (c.id === 'R-04' && c.computed != null) acts.push({ label: `Set cartons to ${PF.fmtNum(c.computed)}`, patch: { cartons: c.computed }, say: `total cartons is ${c.computed}` });
  if (c.id === 'R-02' && c.computed != null) acts.push({ label: `Set declared value to ${PF.gbp(c.computed)}`, patch: { declared: c.computed }, say: `declared value is £${c.computed}` });
  if (c.id === 'R-08') acts.push({ label: 'Mark appointment as booked', patch: { appointment: 'Yes' }, say: 'the delivery appointment is booked' });
  if (c.id === 'R-10') acts.push({ label: 'Set ready date to today', patch: { ready: PF.fmtDate(today) }, say: 'ready today' });
  if (c.id === 'R-01') ev.b.items.forEach((it, i) => { if ((c.items || []).includes(it.sku)) { const recs = hsRecActs(it, i); if (recs.length) acts.push(...recs); else { const hint = PF.hsHint(it.description); if (hint) acts.push(hsUse(it, i, hint.code)); } } });
  return acts;
}
// "Use <code>" action: the code is written into the item only when clicked (file) or confirmed by the seller (chat).
function hsUse(it, i, code) { return { label: `Use ${code} for ${it.sku}`, itemPatch: { i, f: { hs: String(code) } }, say: `HS code for ${(it.description || it.sku).toLowerCase()} is ${code}` }; }
function hsRecActs(it, i) { const codes = [...(it.hsRec || []).map(r => r.code), ...(it.hsSug ? it.hsSug.codes : [])]; return [...new Set(codes)].map(c => hsUse(it, i, c)); }
// Recommendations attached to HS advisories (items whose code passes R-01 but lost a leading zero).
function hsAdvActs(ev) { const r01 = ev.checks.find(c => c.id === 'R-01'), bad = (r01 && r01.items) || []; return ev.b.items.flatMap((it, i) => bad.includes(it.sku) ? [] : hsRecActs(it, i)); }
function hsStamp() { const m = PF.hsMeta(); return m ? `HS codes checked against UK tariff snapshot ${m.version} (${PF.fmtDate(m.snapshotDate)}) — DBT data, Open Government Licence v3.0.` : null; }
// "suggested — verify" line for a code that fails R-01 (never written into the item).
function hsSugLine(it) {
  const sug = it.hsSug && it.hsSug.level !== 'none' ? it.hsSug.codes : !PF.hsMeta() && PF.hsHint(it.description) ? [PF.hsHint(it.description).code] : [];
  return sug.length ? h('small', { class: 'hsdesc hssug' }, `suggested ${sug.slice(0, 4).join(' / ')} — verify`) : null;
}
function hsCell(it) {
  if (it.hs.blank) return h('td', { class: 'bad' }, 'missing', hsSugLine(it));
  const short = it.hs.digits.length < 6 || it.hs.hasLetters, look = short ? { known: null } : PF.hsLookup(it.hs.digits);
  return h('td', { class: short || look.known === false ? 'bad' : '' }, it.hs.raw,
    short ? hsSugLine(it) : look.known ? h('small', { class: 'hsdesc' }, look.desc) : look.known === false ? h('small', { class: 'hsdesc' }, 'not in UK tariff') : null);
}
function reportEl(ev, ctx) {
  const { b, checks, dataIssues, advisories, status, rec, eta } = ev;
  const fails = checks.filter(c => c.status === 'fail' || c.status === 'check');
  const issues = [
    ...dataIssues.map(d => ({ kind: 'data', sev: d.sev, title: d.field, detail: d.text, fix: d.fix })),
    ...fails.map(c => ({ kind: 'rule', sev: c.status === 'check' ? 'Amber' : c.sev, id: c.id, title: c.rule, detail: c.detail, fix: c.fix, check: c })),
  ].sort((a, z) => (a.sev === z.sev ? 0 : a.sev === 'Red' ? -1 : 1));
  const passed = checks.filter(c => c.status === 'pass' || c.status === 'na');
  const cannot = checks.filter(c => c.status === 'cannot');
  const nRed = issues.filter(i => i.sev === 'Red').length, nAmb = issues.length - nRed;

  const head = h('div', { class: 'verdict v-' + status },
    h('div', { class: 'stamp', 'aria-hidden': 'true' }, STAMP[status]),
    h('div', { class: 'verdict-text' },
      h('p', { class: 'v-title' }, VERDICT[status]),
      h('p', { class: 'v-sub' }, [
        nRed ? `${nRed} must-fix` : null, nAmb ? `${nAmb} to check` : null,
        `${checks.filter(c => c.status === 'pass').length} of 10 rules passed${checks.some(c => c.status === 'na') ? ' (1 not applicable)' : ''}`,
      ].filter(Boolean).join(' · '))));

  const issueList = issues.length ? h('ol', { class: 'issues', 'aria-label': 'Issues' }, issues.map(it => {
    const acts = it.check ? fixActions(it.check, ev, ctx.mode) : [];
    return h('li', { class: 'issue s-' + it.sev },
      h('div', { class: 'issue-top' }, h('span', { class: 'sev' }, SEV_WORD[it.sev]), it.id ? h('span', { class: 'rid' }, it.id) : h('span', { class: 'rid' }, 'Data'), h('span', { class: 'rtitle' }, it.kind === 'rule' ? it.title : it.title)),
      h('p', { class: 'what' }, it.detail),
      it.fix ? h('p', { class: 'fix' }, h('b', null, 'How to fix: '), it.fix) : null,
      acts.length ? h('div', { class: 'fix-acts' }, acts.map(a => h('button', { class: 'btn small', type: 'button', onclick: () => ctx.apply(a) }, a.label))) : null);
  })) : h('p', { class: 'allclear' }, 'No problems found — every rulebook check passed.');

  const passedEl = h('details', { class: 'passed' }, h('summary', null, `${passed.length} check${passed.length === 1 ? '' : 's'} passed${cannot.length ? `, ${cannot.length} couldn't run` : ''}`),
    h('ul', null, [...passed, ...cannot].map(c => h('li', { class: 'p-' + c.status }, h('span', { class: 'rid' }, c.id), ' ', c.status === 'cannot' ? h('i', null, 'Couldn’t run: ') : c.status === 'na' ? h('i', null, 'Not applicable: ') : null, c.detail))));

  const advActs = hsAdvActs(ev);
  const adv = advisories.length ? h('div', { class: 'advisories' }, h('p', { class: 'mini-h' }, 'Worth a look (not rulebook breaks)'), h('ul', null, advisories.map(a => h('li', null, a))),
    advActs.length ? h('div', { class: 'fix-acts' }, advActs.map(a => h('button', { class: 'btn small', type: 'button', onclick: () => ctx.apply(a) }, a.label))) : null) : null;

  let carrierEl = null;
  if (rec) {
    const c = rec.chosen;
    const rows = rec.opts.map(o => {
      const isChosen = o.carrier === c.carrier;
      return h('tr', { class: isChosen ? 'chosen' : '' },
        h('th', { scope: 'row' }, o.carrier, h('span', { class: 'svc' }, o.service), isChosen ? h('span', { class: 'tag' + (o.fits === false ? ' bad' : '') }, o.fits === false ? (rec.overridden ? 'Your choice — over limit' : `Best for ${rec.priority.toLowerCase()} — over limit`) : rec.overridden ? 'Your choice' : 'Recommended') : null, !isChosen && o === rec.priorityPick && rec.overridden ? h('span', { class: 'tag ghost' }, 'Best for ' + rec.priority.toLowerCase()) : null),
        h('td', { class: 'num' }, PF.gbp(o.cost)), h('td', { class: 'num' }, o.transit + ' days'), h('td', { class: 'num' }, o.onTime + '%'),
        h('td', { class: 'num' }, o.maxW + ' kg', o.fits === false ? h('span', { class: 'over' }, 'over') : null),
        h('td', null, isChosen ? '' : h('button', { class: 'btn tiny', type: 'button', onclick: () => ctx.apply({ patch: { carrierOverride: o.carrier }, say: `switch to ${o.carrier.toLowerCase()}` }) }, 'Choose')));
    });
    carrierEl = h('section', { class: 'carriers' },
      h('h3', null, 'Carrier'),
      h('p', { class: 'reason' }, rec.overridden ? `You chose ${PF.label(c)}. For “${rec.priority}”, the pick would be ${PF.label(rec.priorityPick)}: ` : `Priority: ${rec.priority}. `, rec.reason,
        c.fits === false ? h('b', { class: 'warn' }, ` But at ${PF.kg(rec.wpp)} per pallet it’s over this service’s ${c.maxW} kg limit.`) : null,
        c.fits === false && rec.fixes.length ? h('span', { class: 'recfix' }, h('b', null, ' Recommended: '), rec.fixes[0].text, ' ', fixActions(ev.checks.find(x => x.id === 'R-05'), ev)[0] ? h('button', { class: 'btn small', type: 'button', onclick: () => ctx.apply(fixActions(ev.checks.find(x => x.id === 'R-05'), ev)[0]) }, fixActions(ev.checks.find(x => x.id === 'R-05'), ev)[0].label) : null) : null,
        rec.overridden ? h('button', { class: 'linkbtn', type: 'button', onclick: () => ctx.apply({ patch: { carrierOverride: null }, say: 'use the recommended carrier' }) }, ' Use the recommendation instead') : null),
      h('div', { class: 'tablewrap' }, h('table', { class: 'ctable' },
        h('thead', null, h('tr', null, h('th', null, 'Service'), h('th', { class: 'num' }, `Cost (${rec.opts[0].pallets} plt)`), h('th', { class: 'num' }, 'Transit'), h('th', { class: 'num' }, 'On time'), h('th', { class: 'num' }, 'Max/pallet'), h('th', null, ''))),
        h('tbody', null, rows))),
      rec.wpp != null ? h('p', { class: 'note' }, `Your load: ${PF.kg(b.gross)} on ${b.pallets} pallet${b.pallets === 1 ? '' : 's'} = ${PF.kg(rec.wpp)} per pallet.`) : null,
      h('p', { class: 'note' }, PF.PRICE_NOTE),
      planEl(ev, ctx));
  }

  const conf = PF.confirmation(ev, ctx.reviewedCount ? ctx.reviewedCount(ev) : 0);
  const confEl = conf ? h('section', { class: 'confirm' },
    h('h3', null, 'Booking summary'),
    h('p', { class: 'conf-head s-' + status }, conf.head),
    conf.lines.map(l => h('p', null, l)),
    eta && (eta.movedCollect || eta.movedArrive || eta.fromToday || eta.bufferDays) ? h('p', { class: 'note' }, [eta.bufferDays ? `No warehouse appointment yet, so ${eta.bufferDays} days are added to the delivery estimate to book a slot.` : null, eta.fromToday ? 'Ready date is in the past, so timing is counted from today.' : null, eta.movedCollect ? 'Collection moved to the next working day.' : null, eta.movedArrive ? 'Arrival moved to the next working day (no weekend deliveries).' : null].filter(Boolean).join(' ')) : null,
    h('p', { class: 'note' }, `Dates checked against today, ${PF.fmtDate(ev.today)} (this device’s date).`),
    h('h4', null, 'What happens next'),
    h('ol', { class: 'next' }, conf.next.map(n => h('li', null, n)))) : null;

  const lines = b.items.map(it => (PF.isNum(it.qty) && PF.isNum(it.price) ? it.qty * it.price : null));
  const inv = b.items.length ? h('details', { class: 'invoice' }, h('summary', null, 'Commercial invoice lines'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'itable' },
      h('thead', null, h('tr', null, ['SKU', 'Description', 'HS code', 'Origin', 'Qty', 'Unit', 'Line total', 'Packing', 'kg/unit'].map((x, i) => h('th', { class: i >= 4 ? 'num' : '' }, x)))),
      h('tbody', null, b.items.map((it, i) => h('tr', null, h('td', null, it.sku), h('td', null, it.description || '—'), hsCell(it), h('td', { class: it.coo ? '' : 'bad' }, it.coo || 'missing'), h('td', { class: 'num' }, PF.fmtNum(it.qty)), h('td', { class: 'num' }, PF.gbp(it.price)), h('td', { class: 'num' }, PF.gbp(lines[i])), h('td', { class: 'num' }, `${PF.fmtNum(it.upc)} × ${PF.fmtNum(it.cartons)} ctn`), h('td', { class: 'num' }, PF.fmtNum(it.unitWeight, 3))))),
      h('tfoot', null, h('tr', null, h('td', { colspan: 6 }, 'Total of lines · declared on booking'), h('td', { class: 'num' }, lines.every(x => x != null) ? PF.gbp(lines.reduce((a, c2) => a + c2, 0)) : '—', h('br'), h('small', null, PF.gbp(b.declared))), h('td', { colspan: 2 })))))) : null;

  const stamp = hsStamp() ? h('p', { class: 'note hsstamp' }, hsStamp()) : null;
  const hist = ctx.history ? historyEl(ctx.history(ev), 'History for this booking') : null;
  return h('div', { class: 'report' }, head, reviewEl(ev, ctx), issueList, passedEl, adv, carrierEl, confEl, inv, stamp, hist);
}

function planEl(ev, ctx) {
  const p = ev.plan; if (!p) return null;
  const cur = ev.b.pallets;
  return h('div', { class: 'pallet-plan' },
    h('h4', null, 'Pallet plan by weight'),
    h('p', { class: 'note' }, `Planning weight ${PF.kg(p.weight)}${p.estimated ? ' — estimated from item weights (goods + 25 kg per pallet)' : ''}.`),
    h('div', { class: 'tablewrap' }, h('table', { class: 'ctable' },
      h('thead', null, h('tr', null, ['Service', 'Pallets', 'kg / pallet', 'Cost', ''].map((x, i) => h('th', { class: i > 0 && i < 4 ? 'num' : '' }, x)))),
      h('tbody', null, p.perCarrier.map(r => {
        const same = r.carrier === (ev.rec.chosen && ev.rec.chosen.carrier) && r.minPallets === cur;
        return h('tr', { class: r.carrier === p.chosen ? 'chosen' : '' },
          h('th', { scope: 'row' }, r.carrier, h('span', { class: 'svc' }, r.service)),
          h('td', { class: 'num' }, String(r.minPallets)), h('td', { class: 'num' }, PF.kg(r.perPallet)), h('td', { class: 'num' }, PF.gbp(r.cost)),
          h('td', null, same ? h('span', { class: 'tag' }, 'Current') : h('button', { class: 'btn tiny', type: 'button', onclick: () => ctx.apply({ patch: { pallets: r.minPallets, carrierOverride: r.carrier }, say: `make it ${r.minPallets} pallets${r.carrier !== ev.rec.chosen.carrier ? ' and use ' + r.carrier.toLowerCase() : ''}` }) }, `Use ${r.minPallets} pallet${r.minPallets === 1 ? '' : 's'} on ${r.carrier}`)));
      })))),
    p.split ? h('details', { class: 'split' }, h('summary', null, `Carton split for ${p.chosen} (${p.split.length} pallet${p.split.length === 1 ? '' : 's'})`),
      h('ul', { class: 'plain' }, p.split.map(x => h('li', null, `Pallet ${x.pallet}: ${PF.kg(x.kg)} of goods — ${Object.entries(x.cartons).map(([k, v]) => `${v} × ${k}`).join(', ')}`)))) : (p.splitNote ? h('p', { class: 'note' }, p.splitNote) : null),
    h('p', { class: 'note' }, 'Balances weight only — check volume and stacking height.'));
}

// ---------- CHAT ----------
let cs = C.newState();
const log = $('#chat-log');
const STARTERS = [
  "Hi, I'm Priya from Northfield Goods. We need to send 3 pallets from Manchester to our Amazon warehouse in Frankfurt, ready 5 Nov. 1080 ceramic mugs at £5 each, 12 per carton, 0.5kg each, HS 691200, made in the UK. Total weight 620kg. Delivery slot is booked. Cheapest please.",
  'I need to ship some scented candles to Paris',
  'Sending 2 pallets of cast iron pans to a warehouse in Hamburg, fastest option',
];
function bubble(role, ...kids) { const b = h('div', { class: 'msg ' + role }, ...kids); log.append(b); log.scrollTop = log.scrollHeight; return b; }
function chipsEl(chips, cls = '') { return h('div', { class: 'chips ' + cls }, chips.map(c => h('button', { class: 'chip', type: 'button', onclick: () => send(c === 'Don’t know' ? "don't know" : c) }, c))); }
function clearChips() { log.querySelectorAll('.chips.live').forEach(c => c.remove()); }
function greet() {
  log.innerHTML = '';
  bubble('bot', h('p', null, 'Describe your shipment the way you’d tell a colleague — what you’re sending, where from and to, how many pallets. I’ll ask only for what’s missing, then run the ten pre-flight checks and recommend a carrier.'),
    h('p', { class: 'muted' }, 'Routes: London, Manchester, Birmingham or Leeds → Berlin, Frankfurt, Hamburg, Paris, Lyon, Amsterdam or Rotterdam.'),
    h('div', { class: 'chips live starters' }, h('span', { class: 'chips-label' }, 'Try:'), STARTERS.map((s, i) => h('button', { class: 'chip', type: 'button', onclick: () => send(s) }, ['Everything in one go', 'Start sparse', 'Heavy & urgent'][i]))));
}
function changeLine(c) { return c.from === '—' || c.first ? `${c.label}: ${c.to}` : `${c.label}: ${c.from} → ${c.to}`; }
function groupChanges(ch) {
  // Booking fields: one line each. First-time item details: one line per item.
  const out = []; const byItem = new Map();
  ch.forEach(c => {
    if (c.field === 'item' && c.first && c.label !== 'Added item') {
      const it = cs.booking.items.find(i => c.label.startsWith(i.description + ' '));
      if (it) { const k = it.description; if (!byItem.has(k)) { byItem.set(k, []); out.push({ item: k }); } byItem.get(k).push(`${c.label.slice(k.length + 1)} ${c.to}`); return; }
    }
    out.push(changeLine(c));
  });
  return out.map(o => (typeof o === 'string' ? o : `${o.item}: ${byItem.get(o.item).join(', ')}`));
}
const STATUS_WORD = { pass: 'passes', fail: 'fails', check: 'needs confirming', cannot: 'can’t run', na: 'n/a' };
function send(text) {
  text = String(text || '').trim(); if (!text) return;
  clearChips();
  const up = document.createElement('p'); up.textContent = text; bubble('user', up);
  const { st, reply } = C.turn(cs, text, PF.todayISO());
  cs = st;
  const parts = [];
  if (reply.intent === 'reset') { renderSheet(); bubble('bot', h('p', null, reply.ask)); return; }
  if (reply.intent === 'help') parts.push(h('p', null, 'Tell me about the shipment in plain words. You can change anything at any time — “add a pallet”, “send it to Lyon instead”, “HS code for the mugs is 691200”, “switch to carrier B”. Say “what’s wrong?” for the report, “confirm” to book, or “start over”.'));
  reply.notes.forEach(n => parts.push(h('p', { class: 'note-warn' }, n)));
  if (cs.complete || reply.status) reply.changes.filter(c => !c.first && c.from !== '—').forEach(c => logEvent({ booking: 'CHAT', field: c.label, before: String(c.from), after: String(c.to), action: 'changed', chat: true }));
  const ch = reply.changes.filter(c => c.field !== 'destCountry' || !reply.changes.some(x => x.field === 'destCity'));
  if (ch.length) parts.push(h('div', { class: 'got' }, h('p', { class: 'mini-h' }, cs.turns === 1 || ch.every(c => c.first) ? 'Got it' : 'Updated'), h('ul', null, groupChanges(ch).map(t => h('li', null, t)))));
  if (reply.derived.length) parts.push(h('p', { class: 'muted' }, 'Worked out: ' + reply.derived.join(' ')));
  if (reply.nothing && !reply.status) parts.push(h('p', null, 'I couldn’t match that to anything in the booking.'));
  let chips = null;
  if (reply.status) {
    const ev = PF.evaluate(C.toRaw(cs, cs.confirmed || 'CHAT'), { today: PF.todayISO() });
    if (reply.diff.length) parts.push(h('div', { class: 'got' }, h('p', { class: 'mini-h' }, 'Checks re-run'), h('ul', null, reply.diff.map(d => h('li', { class: 'd-' + d.to }, `${d.id} now ${STATUS_WORD[d.to]}`)))));
    if (reply.firstComplete) parts.push(h('p', null, 'That’s everything I need. Pre-flight result:'));
    parts.push(miniVerdict(ev, reply.priceNote));
    noteCorrections(ev, { chat: true });
    (reply.accepted || []).forEach(c => logEvent({ booking: 'CHAT', sku: c.sku || '', field: c.label, before: shown(c.entered), after: c.used, action: 'accepted', chat: true }));
    if (reply.corrections && reply.corrections.length) parts.push(h('div', { class: 'got' }, h('p', { class: 'mini-h' }, 'I worked out or adjusted these — please check'),
      h('ul', null, reply.corrections.map(c => h('li', null, `${c.sku ? c.label + ' (' + c.sku + ')' : c.label}: ${shown(c.entered)} → ${c.used} (${c.why})`)))));
    if (reply.intent === 'confirm-blocked') parts.push(h('p', { class: 'note-warn' }, `I can’t confirm while there ${ev.reds === 1 ? 'is 1 red issue' : 'are ' + ev.reds + ' red issues'} — red means the shipment would be stopped. Fix ${ev.reds === 1 ? 'it' : 'them'} (the buttons in the report do most of it) and say “confirm” again.`));
    if (reply.intent === 'confirmed') parts.push(confCard(ev, reply.ref));
    if (reply.intent !== 'confirmed') chips = ev.status === 'Red' ? ['What’s wrong?'] : ['Confirm booking', 'What’s wrong?'];
    if (chips && reply.corrections && reply.corrections.length) chips = ['Looks right', ...chips];
    if (ev.status !== 'Red' && reply.intent !== 'confirmed' && !reply.firstComplete && !reply.diff.length && !ch.length && !reply.nothing) {/* summary only */}
  } else {
    if (reply.intent === 'confirm-incomplete') parts.push(h('p', null, 'Not yet — I still need a few details first.'));
    if (reply.reopened) parts.push(h('p', { class: 'muted' }, 'That reopened the booking.'));
    parts.push(h('p', { class: 'ask' }, reply.ask));
    chips = reply.chips;
  }
  const b = bubble('bot', ...parts);
  if (chips) b.append(chipsEl(chips, 'live'));
  renderSheet();
}
function miniVerdict(ev, priceNote) {
  const bad = [...ev.dataIssues.map(d => ({ sev: d.sev, t: d.text })), ...ev.checks.filter(c => c.status === 'fail' || c.status === 'check').map(c => ({ sev: c.status === 'check' ? 'Amber' : c.sev, t: `${c.id}: ${c.detail}` }))].sort((a, z) => (a.sev === z.sev ? 0 : a.sev === 'Red' ? -1 : 1));
  return h('div', { class: 'mini v-' + ev.status },
    h('p', null, h('span', { class: 'ministamp' }, STAMP[ev.status]), ' ', VERDICT[ev.status]),
    bad.length ? h('ul', null, bad.slice(0, 5).map(x => h('li', { class: 's-' + x.sev }, x.t))) : null,
    bad.length > 5 ? h('p', { class: 'muted' }, `…and ${bad.length - 5} more in the report.`) : null,
    ev.rec ? (ev.rec.chosen.fits === false && ev.rec.fixes.length
      ? h('p', null, h('b', null, 'Carrier: '), `${PF.label(ev.rec.chosen)} can’t take ${PF.kg(ev.rec.wpp)} pallets. Recommended: ${ev.rec.fixes[0].text}`)
      : h('p', null, h('b', null, 'Carrier: '), `${PF.label(ev.rec.chosen)} — ${PF.gbp(ev.rec.chosen.cost)}, ${ev.rec.chosen.transit} days`, ev.eta ? `, arriving ${PF.fmtDateLong(ev.eta.arrive)}.` : '.')) : null,
    ev.rec && priceNote ? h('p', { class: 'note' }, priceNote) : null,
    h('button', { class: 'linkbtn only-narrow', type: 'button', onclick: () => $('#sheet').scrollIntoView({ behavior: 'smooth' }) }, 'See the full report ↓'));
}
function confCard(ev, ref) {
  const conf = PF.confirmation(ev, Object.keys(cs.reviewed || {}).filter(id => ev.corrections.some(c => c.id === id)).length);
  return h('div', { class: 'confcard' }, h('p', { class: 'mini-h' }, 'Booking confirmed'), h('p', { class: 'ref' }, ref),
    ev.status === 'Amber' ? h('p', { class: 'note-warn' }, 'Confirmed with warnings — please still sort the amber items before collection.') : null,
    conf.lines.map(l => h('p', null, l)), h('p', { class: 'mini-h' }, 'What happens next'), h('ol', null, conf.next.filter(n => !/^Fix every|^Review the amber/.test(n)).map(n => h('li', null, n))));
}
const chatReview = {
  state: id => (cs.reviewed && cs.reviewed[id] ? (typeof cs.reviewed[id] === 'object' ? cs.reviewed[id] : { state: cs.reviewed[id] }) : null),
  changedOnly: () => [],
  accept: c => { cs.reviewed = { ...(cs.reviewed || {}), [c.id]: 'accepted' }; logEvent({ booking: 'CHAT', sku: c.sku || '', field: c.label, before: shown(c.entered), after: c.used, action: 'accepted', chat: true }); renderSheet(); },
  acceptAll: list => { list.forEach(c => chatReview.accept(c)); },
  change: (c, value) => { cs.reviewed = { ...(cs.reviewed || {}), [c.id]: { state: 'changed', value } }; send(`${c.sku ? c.label.toLowerCase() + ' for ' + c.sku : c.label.toLowerCase()} is ${value}`); },
  redraw: () => renderSheet(),
};
const chatCtx = { mode: 'chat', apply: a => send(a.say), review: chatReview, reviewedCount: ev => ev.corrections.filter(c => cs.reviewed && cs.reviewed[c.id]).length, history: () => audit.filter(e => e.chat) };

function renderSheet() {
  const s = $('#sheet'); s.innerHTML = '';
  const b = cs.booking; const t = C.totals(b); const pend = cs.pending;
  const F = (key, label, val, derived) => h('div', { class: 'cell' + (val == null ? ' empty' : '') + (pend && pend.field === key && pend.item == null ? ' asking' : '') },
    h('span', { class: 'lab' }, label), h('span', { class: 'val' }, val == null ? 'needed' : val, derived ? h('span', { class: 'calc', title: 'Worked out from the items' }, 'calc') : null));
  const cartons = b.cartonsStated ? b.cartons : t.cartons; const declared = b.declaredStated ? b.declared : t.value;
  s.append(h('div', { class: 'sheet-head' }, h('h2', null, 'Booking sheet'), h('span', { class: 'muted' }, cs.confirmed ? 'Confirmed · ' + cs.confirmed : cs.complete ? 'Complete' : `${C.missing(cs).length} detail${C.missing(cs).length === 1 ? '' : 's'} to go`)));
  s.append(h('div', { class: 'formgrid' },
    F('seller', 'Seller', b.seller), F('originCity', 'Collect from', b.originCity ? b.originCity + ', UK' : null), F('destCity', 'Deliver to', b.destCity ? `${b.destCity}, ${b.destCountry}` : b.destCountry ? `? , ${b.destCountry}` : null),
    F('destType', 'Destination type', b.destType), F('ready', 'Ready to ship', b.ready ? PF.fmtDate(b.ready) : null), F('priority', 'Priority', b.priority),
    F('pallets', 'Pallets', b.pallets != null ? PF.fmtNum(b.pallets) : null), F('cartons', 'Cartons', cartons != null ? PF.fmtNum(cartons) : null, cartons != null && !b.cartonsStated),
    F('gross', 'Gross weight', b.gross != null ? PF.kg(b.gross) : null), F('declared', 'Declared value', declared != null ? PF.gbp(declared) : null, declared != null && !b.declaredStated),
    b.destType === 'Business address' ? F('appointment', 'Appointment', 'Not needed') : F('appointment', 'Appointment', b.appointment),
    F('carrier', 'Carrier', b.carrierOverride || (cs.complete ? 'Recommended' : '—'))));
  const cellv = (it, i, k, fmt) => { const v = it[k]; const asked = pend && pend.item === i && pend.field === k; const unknown = (k === 'hs' && it.hsUnknown) || (k === 'coo' && it.cooUnknown); const sug = k === 'hs' && v == null ? C.hsSuggestFor(it) : null; return h('td', { class: (v == null ? 'empty' : '') + (asked ? ' asking' : '') + (/^(qty|price|upc|cartons|unitWeight)$/.test(k) ? ' num' : '') }, v == null ? (sug ? h('small', { class: 'hssug' }, `suggested ${sug.codes.slice(0, 4).join(' / ')} — verify`) : unknown ? 'unknown' : '—') : fmt ? fmt(v) : v, it.derived && it.derived[k] ? h('span', { class: 'calc' }, 'calc') : null); };
  s.append(h('div', { class: 'tablewrap' }, h('table', { class: 'itable live' },
    h('thead', null, h('tr', null, ['Item', 'Qty', '£/unit', 'Per ctn', 'Ctns', 'kg/unit', 'HS code', 'Origin'].map((x, i) => h('th', { class: i && i < 6 ? 'num' : '' }, x)))),
    h('tbody', null, b.items.length ? b.items.map((it, i) => h('tr', null, h('td', null, it.description, h('small', null, it.sku)), cellv(it, i, 'qty', PF.fmtNum), cellv(it, i, 'price', PF.gbp), cellv(it, i, 'upc', PF.fmtNum), cellv(it, i, 'cartons', PF.fmtNum), cellv(it, i, 'unitWeight', v => PF.fmtNum(v, 3)), cellv(it, i, 'hs'), cellv(it, i, 'coo')))
      : h('tr', null, h('td', { colspan: 8, class: 'empty' }, 'No items yet'))))));
  const ev = PF.evaluate(C.toRaw(cs, cs.confirmed || 'CHAT'), { today: PF.todayISO() });
  if (cs.complete) s.append(reportEl(ev, chatCtx));
  else {
    // While details are still being collected, don't flag what simply hasn't been asked yet.
    const its = b.items;
    const waitIf = { 'R-01': !its.some(it => it.hsUnknown || (it.hs && String(it.hs).replace(/\D/g, '').length < 6)), 'R-09': !its.some(it => it.cooUnknown), 'R-08': b.appointment !== 'No', 'R-07': b.gross == null };
    ev.checks.forEach(c => { if (c.status === 'fail' && waitIf[c.id]) c.status = 'cannot'; });
    s.append(h('div', { class: 'livechecks' }, h('p', { class: 'mini-h' }, 'Checks so far'),
      h('ul', null, ev.checks.map(c => h('li', { class: 'lc-' + c.status, title: c.detail }, h('span', { class: 'dot' }), c.id, h('span', { class: 'lcw' }, c.status === 'cannot' ? 'waiting' : c.status === 'check' ? 'confirm' : c.status === 'na' ? 'n/a' : c.status)))),
      ev.checks.some(c => c.status === 'fail' || c.status === 'check') ? h('ul', { class: 'early' }, ev.checks.filter(c => c.status === 'fail' || c.status === 'check').map(c => h('li', { class: 's-' + (c.status === 'check' ? 'Amber' : c.sev) }, `${c.id}: ${c.detail}`))) : null));
  }
}
$('#chat-form').addEventListener('submit', e => { e.preventDefault(); const i = $('#chat-input'); const v = i.value; i.value = ''; send(v); i.focus(); });
$('#chat-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chat-form').requestSubmit(); } });
$('#chat-reset').addEventListener('click', () => { cs = C.newState(); greet(); renderSheet(); $('#chat-input').focus(); });

// ---------- FILE ----------
let fileData = null; // {bookings, notices, expected, name}
const overrides = {}; // bookingIndex -> {patch, items:{i:{}}}
let filter = 'All', openRow = null;
function sheetsFromWorkbook(wb, fname) {
  return wb.SheetNames.map(n => ({ name: wb.SheetNames.length === 1 ? (fname.replace(/\.[^.]+$/, '') || n) : n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }) }));
}
function readExpected(sheets) {
  const s = sheets.find(x => /expected/i.test(x.name)); if (!s) return null;
  const hr = s.rows.findIndex(r => (r || []).some(v => /booking id/i.test(String(v || ''))));
  if (hr < 0) return null;
  const hdr = s.rows[hr].map(v => String(v || '').toLowerCase());
  const iId = hdr.findIndex(x => /booking id/.test(x)), iSt = hdr.findIndex(x => /expected status/.test(x)), iR = hdr.findIndex(x => /rules/.test(x));
  const m = {}; s.rows.slice(hr + 1).forEach(r => { if (r && r[iId]) m[String(r[iId]).trim().toUpperCase()] = { status: r[iSt], rules: iR >= 0 ? r[iR] : '' }; });
  return m;
}
async function loadFiles(files) {
  const all = []; const names = [];
  for (const f of files) {
    const buf = await f.arrayBuffer(); const csv = /\.(csv|tsv|txt)$/i.test(f.name);
    try { const wb = XLSX.read(buf, { type: 'array', raw: csv, cellDates: false }); all.push(...sheetsFromWorkbook(wb, f.name)); names.push(f.name); }
    catch (e) { showFileError(`Couldn’t read ${f.name}: ${e.message}. Upload .xlsx, .xls or .csv.`); return; }
  }
  ingest(all, names.join(' + '));
}
function ingest(sheets, name) {
  const parsed = PF.parseSheets(sheets, { skipExample: $('#skip-ex').checked });
  fileData = { ...parsed, expected: readExpected(sheets), name, sheets };
  Object.keys(overrides).forEach(k => delete overrides[k]); Object.keys(reviews).forEach(k => delete reviews[k]);
  audit.length = 0; auditSeen.clear(); openRow = null; filter = 'All';
  renderFile();
}
function showFileError(msg) { $('#file-results').innerHTML = ''; $('#file-results').append(h('p', { class: 'note-warn' }, msg)); }
function applyOv(raw, ov) {
  if (!ov) return raw;
  return { ...raw, ...ov.patch, items: raw.items.map((it, i) => ({ ...it, ...((ov.items || {})[i] || {}) })) };
}
function evalAll() { return fileData.bookings.map((b, i) => ({ i, raw: b, ev: PF.evaluate(applyOv(b, overrides[i]), { today: PF.todayISO() }), edited: !!overrides[i] })); }
function toReview(r) { return r.ev.corrections.filter(c => !(reviews[r.i] || {})[c.id]).length; }
function logFix(r, a) {
  const b = r.ev.b; const cur = k => (k === 'carrierOverride' ? (r.ev.rec ? r.ev.rec.chosen.carrier : '') : k === 'ready' ? PF.fmtDate(b.ready) : b[k]);
  if (a.patch) Object.entries(a.patch).forEach(([k, v]) => logEvent({ booking: b.id, field: FIELD_LABEL[k] || k, before: shown(cur(k)), after: v == null ? '(recommended)' : String(v), action: 'fix applied' }));
  if (a.itemPatch) { const it = b.items[a.itemPatch.i] || {}; Object.entries(a.itemPatch.f).forEach(([k, v]) => logEvent({ booking: b.id, sku: it.sku || '', field: FIELD_LABEL[k] || k, before: shown(k === 'hs' ? (it.hs && it.hs.raw) : it[k]), after: String(v), action: 'fix applied' })); }
}
function fileReview(r, getCtx) {
  const mine = () => (reviews[r.i] = reviews[r.i] || {});
  const log = (c, action, after) => logEvent({ booking: r.ev.b.id, sku: c.sku || '', field: c.label, before: action === 'changed' ? c.used : shown(c.entered), after, action });
  return {
    state: id => (reviews[r.i] || {})[id],
    changedOnly: cur => Object.values(reviews[r.i] || {}).filter(v => v.state === 'changed' && !cur.some(c => c.id === v.c.id)).map(v => v.c),
    accept: c => { mine()[c.id] = { state: 'accepted', c }; log(c, 'accepted', c.used); renderFile(); },
    acceptAll: list => { list.forEach(c => { mine()[c.id] = { state: 'accepted', c }; log(c, 'accepted', c.used); }); renderFile(); },
    change: (c, value) => {
      mine()[c.id] = { state: 'changed', value, c }; log(c, 'changed', value);
      const it = c.scope === 'item' ? r.ev.b.items.findIndex(x => x.sku === c.sku) : -1;
      getCtx().apply(c.scope === 'item' ? { itemPatch: { i: it, f: { [c.field]: value } }, audit: false } : { patch: { [c.field]: value }, audit: false });
    },
    redraw: () => renderFile(),
  };
}
function renderFile() {
  const out = $('#file-results'); out.innerHTML = '';
  if (!fileData) return;
  const rows = evalAll();
  rows.forEach(r => noteCorrections(r.ev));
  const cnt = s => rows.filter(r => r.ev.status === s).length;
  out.append(h('div', { class: 'file-head' },
    h('div', null, h('h2', null, `${rows.length} booking${rows.length === 1 ? '' : 's'} checked`), h('p', { class: 'muted' }, fileData.name)),
    h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by status' }, ['All', 'Red', 'Amber', 'Green'].map(s => h('button', { type: 'button', class: 'fbtn f-' + s, 'aria-pressed': filter === s, onclick: () => { filter = s; renderFile(); } }, s === 'All' ? `All ${rows.length}` : `${s} ${cnt(s)}`))),
    h('button', { class: 'btn', type: 'button', onclick: exportResults, disabled: !rows.length }, 'Export results (.xlsx)')));
  fileData.notices.forEach(n => out.append(h('p', { class: 'notice n-' + n.level }, n.text)));
  if (!rows.length) { out.append(h('p', { class: 'note-warn' }, 'No bookings found under the header row.')); return; }
  const exp = fileData.expected;
  const tbody = h('tbody');
  rows.filter(r => filter === 'All' || r.ev.status === filter).forEach(r => {
    const { ev } = r; const b = ev.b;
    const flagged = [...ev.checks.filter(c => c.status === 'fail' || c.status === 'check').map(c => ({ t: c.id, s: c.status === 'check' ? 'Amber' : c.sev })), ...(ev.dataIssues.length ? [{ t: `Data ×${ev.dataIssues.length}`, s: ev.dataIssues.some(d => d.sev === 'Red') ? 'Red' : 'Amber' }] : [])];
    const e = exp && exp[b.id.toUpperCase()];
    const open = openRow === r.i;
    const tr = h('tr', { class: 'brow' + (open ? ' open' : ''), tabindex: 0, 'aria-expanded': open, onclick: () => { openRow = open ? null : r.i; renderFile(); }, onkeydown: ev2 => { if (ev2.key === 'Enter' || ev2.key === ' ') { ev2.preventDefault(); openRow = open ? null : r.i; renderFile(); } } },
      h('td', null, h('span', { class: 'chev', 'aria-hidden': 'true' }, open ? '▾' : '▸'), b.id, r.edited ? h('span', { class: 'tag ghost' }, 'edited') : null),
      h('td', null, b.seller || '—'),
      h('td', null, `${b.originCity || '?'} → ${b.destCity || '?'}`),
      h('td', null, h('span', { class: 'pill p-' + ev.status }, ev.status)),
      h('td', null, flagged.length ? flagged.map(f => h('span', { class: 'rchip s-' + f.s }, f.t)) : h('span', { class: 'muted' }, 'none')),
      h('td', null, !ev.rec ? '—' : ev.rec.chosen.fits === false && ev.rec.fixes.length ? h('span', null, h('s', { class: 'muted' }, ev.rec.chosen.carrier), ' → ', `${ev.rec.fixes[0].carrier}${ev.rec.fixes[0].type === 'repack' ? ` on ${ev.rec.fixes[0].pallets} plt` : ''} · ${PF.gbp(ev.rec.fixes[0].cost)}`) : `${ev.rec.chosen.carrier} · ${PF.gbp(ev.rec.chosen.cost)}`),
      h('td', { class: 'num' }, toReview(r) || ''),
      exp ? h('td', null, e ? h('span', { class: String(e.status).toLowerCase() === ev.status.toLowerCase() ? 'match' : 'mismatch', title: e.rules || '' }, String(e.status).toLowerCase() === ev.status.toLowerCase() ? `✓ ${e.status}` : `✕ expected ${e.status}`) : '—') : null);
    tbody.append(tr);
    if (open) {
      const ctx = { mode: 'file', apply: a => { if (a.audit !== false) logFix(r, a); const o = overrides[r.i] = overrides[r.i] || { patch: {}, items: {} }; if (a.patch) Object.assign(o.patch, a.patch); if (a.itemPatch) o.items[a.itemPatch.i] = { ...(o.items[a.itemPatch.i] || {}), ...a.itemPatch.f }; renderFile(); },
        review: fileReview(r, () => ctx), reviewedCount: e2 => e2.corrections.filter(c => (reviews[r.i] || {})[c.id]).length,
        history: () => audit.filter(e2 => !e2.chat && e2.booking === r.ev.b.id) };
      tbody.append(h('tr', { class: 'detail' }, h('td', { colspan: exp ? 8 : 7 },
        r.edited ? h('p', { class: 'edited-note' }, 'You’ve applied fixes here — the report shows the corrected booking. ', h('button', { class: 'linkbtn', type: 'button', onclick: () => { logEvent({ booking: b.id, field: 'All fixes and reviews', before: 'edited', after: 'as uploaded', action: 'fixes undone' }); delete overrides[r.i]; delete reviews[r.i]; renderFile(); } }, 'Undo my fixes')) : null,
        reportEl(r.ev, ctx))));
    }
  });
  out.append(h('div', { class: 'tablewrap' }, h('table', { class: 'btable' },
    h('thead', null, h('tr', null, h('th', null, 'Booking'), h('th', null, 'Seller'), h('th', null, 'Route'), h('th', null, 'Status'), h('th', null, 'Flags'), h('th', null, 'Carrier'), h('th', { class: 'num' }, 'To review'), exp ? h('th', null, 'Expected') : null)), tbody)));
  out.append(historyEl(audit.filter(e2 => !e2.chat), 'Audit trail') || h('p', { class: 'muted' }, 'Audit trail: no changes yet.'));
  if (exp) { const m = rows.filter(r => exp[r.ev.b.id.toUpperCase()]); const ok = m.filter(r => String(exp[r.ev.b.id.toUpperCase()].status).toLowerCase() === r.ev.status.toLowerCase()); out.append(h('p', { class: 'muted' }, `Expected-results sheet found: ${ok.length} of ${m.length} bookings match the expected status${rows.some(r => r.edited) ? ' (after your fixes)' : ''}.`)); }
}
async function exportResults() {
  const rows = evalAll();
  const sum = [['Booking ID', 'Seller', 'Route', 'Priority', 'Status', 'Red issues', 'Amber issues', 'Flags', 'Carrier', 'Cost (GBP)', 'Transit (days)', 'Collection', 'Est. delivery', 'Fixed in app', 'To review']];
  const iss = [['Booking ID', 'Severity', 'Rule / check', 'What is wrong', 'How to fix']];
  rows.forEach(r => noteCorrections(r.ev));
  rows.forEach(({ ev, edited }, ri) => {
    const b = ev.b; const flags = ev.checks.filter(c => c.status === 'fail' || c.status === 'check');
    sum.push([b.id, b.seller, `${b.originCity || '?'} → ${b.destCity || '?'}`, b.priorityUsed, ev.status, ev.reds, ev.ambers, [...flags.map(c => c.id), ...(ev.dataIssues.length ? ['Data'] : [])].join(', '), ev.rec ? (ev.rec.chosen.fits === false && ev.rec.fixes.length ? `${PF.label(ev.rec.chosen)} over limit → ${ev.rec.fixes[0].text}` : PF.label(ev.rec.chosen)) : '', ev.rec ? (ev.rec.chosen.fits === false && ev.rec.fixes.length ? ev.rec.fixes[0].cost : ev.rec.chosen.cost) : '', ev.rec ? ev.rec.chosen.transit : '', ev.eta ? PF.fmtDate(ev.eta.collect) : '', ev.eta ? PF.fmtDate(ev.eta.arrive) : '', edited ? 'Yes' : '']);
    sum[sum.length - 1].push(toReview(rows[ri]) || '');
    ev.dataIssues.forEach(d => iss.push([b.id, d.sev, 'Data: ' + d.field, d.text, d.fix || '']));
    flags.forEach(c => iss.push([b.id, c.status === 'check' ? 'Amber' : c.sev, `${c.id} ${c.rule}`, c.detail, c.fix || '']));
  });
  const wb = XLSX.utils.book_new();
  const s1 = XLSX.utils.aoa_to_sheet(sum); s1['!cols'] = [10, 22, 24, 12, 8, 9, 10, 22, 26, 10, 10, 12, 12, 10, 10].map(w => ({ wch: w }));
  const s2 = XLSX.utils.aoa_to_sheet(iss); s2['!cols'] = [10, 9, 40, 70, 70].map(w => ({ wch: w }));
  const cor = [['Time', 'Booking', 'SKU', 'Field', 'Before', 'After', 'By', 'Action'], ...audit.filter(e => !e.chat).map(e => [e.at, e.booking, e.sku, e.field, e.before, e.after, e.by, e.action])];
  const s3 = XLSX.utils.aoa_to_sheet(cor); s3['!cols'] = [22, 10, 10, 24, 22, 22, 8, 16].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, s1, 'Summary'); XLSX.utils.book_append_sheet(wb, s2, 'Issues'); XLSX.utils.book_append_sheet(wb, s3, 'Corrections');
  await saveFile('preflight-results.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}
const drop = $('#drop'); const finput = $('#file-input');
finput.addEventListener('change', () => { if (finput.files.length) loadFiles([...finput.files]); finput.value = ''; });
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) loadFiles([...e.dataTransfer.files]); });
function sampleBuf() { const bin = atob(window.SAMPLE_XLSX_B64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
$('#load-sample').addEventListener('click', () => { const wb = XLSX.read(sampleBuf(), { type: 'array' }); ingest(sheetsFromWorkbook(wb, 'Preflight_Test_Cases.xlsx'), 'Sample: Preflight_Test_Cases.xlsx (25 test bookings)'); });
$('#dl-sample').addEventListener('click', () => saveFile('Preflight_Test_Cases.xlsx', sampleBuf()));
$('#skip-ex').addEventListener('change', () => { if (fileData) ingest(fileData.sheets, fileData.name); });

// ---------- RULES ----------
function renderRules() {
  const R = $('#rules-body');
  const how = {
    'R-01': 'Digits are counted after removing spaces and dots, so “6912.00” counts as 691200. Letters fail. A 5-digit number typed into a number cell gets a hint that Excel may have dropped a leading zero. The code is always checked exactly as entered and never corrected for you: when the UK tariff snapshot shows what was probably meant (090111 for 90111, 691200 for heading 6912), it is offered as a recommendation with a “Use” button. Codes that pass but are not real HS subheadings or UK commodity codes get an advisory. A suggested code is offered for common products — always to be verified.',
    'R-02': 'Sum of quantity × unit price, compared with the declared value. Exactly 1% apart still passes. If the gap equals one item’s line value, that item is named as the likely cause; a ×10 gap is called out as a misplaced zero.',
    'R-03': 'Exact match per item. The fix offers both directions: correct the quantity, or the carton count (only if it divides evenly).',
    'R-04': 'Exact match. If the gap equals one item’s cartons, that item is named.',
    'R-05': 'Checked against the carrier picked for the seller’s priority (or the one they chose). When it fails, Preflight prices every way out — switch carrier as-is, or re-pack onto more pallets — and orders them by the seller’s priority. Exactly at the limit passes.',
    'R-06': 'Keyword scan of description and SKU in three groups. Clear matches (lithium, power bank, aerosol, perfume, nail polish…) are Red. Items that often contain them (Bluetooth speaker, “spray”, reed diffuser, spirits) are flagged Amber to confirm. Negations like “batteries not included”, “non-aerosol”, “alcohol-free” are respected.',
    'R-07': 'Gross must be at least net (unit weight × quantity). Equal passes, with a note that it looks like net weight.',
    'R-08': 'Only for Warehouse destinations; business addresses show “not applicable”. A blank answer is treated as not booked. Still Amber when not booked, and the delivery estimate adds 2 days to the transit time so there is time to book the slot (e.g. 5 days on Carrier A + 2).',
    'R-09': 'Blank fails. “UK”, “GB”, “PRC”, “Türkiye” and similar are read as the full country name.',
    'R-10': 'Compared with today’s date in your browser. Today passes. Dates are read day-first (DD-MM-YYYY); real Excel dates and ISO dates also work; impossible dates (31-02) are rejected rather than guessed.',
  };
  R.innerHTML = '';
  R.append(h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' },
    h('thead', null, h('tr', null, h('th', null, 'Rule'), h('th', null, 'Severity'), h('th', null, 'How Preflight checks it'))),
    h('tbody', null, Object.entries(PF.RULES).map(([id, r]) => h('tr', null, h('td', null, h('b', null, id), ' ', r.text), h('td', null, h('span', { class: 'pill p-' + r.sev }, r.sev)), h('td', null, how[id])))))));
  R.append(h('h3', null, 'Also checked (data quality)'),
    h('p', null, 'Possible dangerous goods outside R-06 (ADR classes 1–9: fireworks, gas cartridges, matches, charcoal, pool chlorine, pesticides, car batteries, drain cleaner, dry ice, airbags…) are shown as an Advisory with the ADR class, typical UN numbers and the exemption that would make the item unregulated. An Advisory never changes Red/Amber/Green — only the ten rules above do.'),
    h('p', null, 'Missing or non-numeric required fields, zero or fractional counts, a destination city that doesn’t match its country, cities or countries with no carrier route, currency other than GBP, bookings with no items, duplicate Booking IDs, item rows pointing at unknown bookings, and duplicate SKUs. These are listed as “Data” issues alongside the rulebook results.'));
  if (hsStamp()) R.append(h('p', { class: 'note hsstamp' }, hsStamp()));
  R.append(h('h3', null, 'Carrier options (fixed rate card)'), h('div', { class: 'tablewrap' }, h('table', { class: 'ctable' },
    h('thead', null, h('tr', null, ['Carrier', 'Service', 'Route', 'Per pallet', 'Transit', 'On time', 'Max/pallet'].map((x, i) => h('th', { class: i > 2 ? 'num' : '' }, x)))),
    h('tbody', null, PF.CARRIERS.map(c => h('tr', null, h('td', null, c.carrier), h('td', null, c.service), h('td', null, 'UK → ' + c.dest), h('td', { class: 'num' }, PF.gbp(c.price)), h('td', { class: 'num' }, c.transit + ' days'), h('td', { class: 'num' }, c.onTime + '%'), h('td', { class: 'num' }, c.maxW + ' kg')))))));
  R.append(h('p', { class: 'note' }, PF.PRICE_NOTE));
  R.append(h('h3', null, 'How the carrier is recommended'),
    h('ul', { class: 'plain' },
      h('li', null, h('b', null, 'Cheapest: '), 'lowest total cost (price per pallet × pallets); ties go to the faster service.'),
      h('li', null, h('b', null, 'Fastest: '), 'shortest transit; ties go to the higher on-time rate, then cost.'),
      h('li', null, h('b', null, 'Most reliable: '), 'highest on-time rate; ties go to speed, then cost.'),
      h('li', null, h('b', null, 'Balanced: '), 'start with the cheapest and step up to a faster service only when the percentage of transit time saved is at least the percentage added to cost. On every route that picks Carrier B: it costs ~22–25% more than A but is 40% faster, while C costs a further ~55–60% to save one more day (33%).'),
      h('li', null, 'If the picked service can’t take the pallet weight, R-05 fails and the cheapest/fastest/most reliable way out is offered as a one-click fix.')));
  R.append(h('h3', null, 'Assumptions'),
    h('ul', { class: 'plain' },
      h('li', null, 'Transit days are calendar days. Collection and delivery move to the next working day if they land on a weekend.'),
      h('li', null, 'If the ready date is in the past, timing is counted from today.'),
      h('li', null, 'In the chat, total cartons and declared value are worked out from the items unless the seller states them — if they do, R-02 and R-04 check them.'),
      h('li', null, 'The grey example row in the template (BK-001, Northfield Goods) is skipped by default; untick the option on the file tab to include it.')));
}

// ---------- TESTS ----------
let testsDone = false;
function renderTests() {
  if (testsDone) return; testsDone = true;
  const res = window.PFTests(PF, C);
  const ok = res.filter(r => r.pass).length;
  const T = $('#tests-body'); T.innerHTML = '';
  T.append(h('div', { class: 'tests-head' }, h('p', { class: 'big ' + (ok === res.length ? 'ok' : 'bad') }, `${ok} / ${res.length}`), h('p', null, `automated test cases pass, run live in your browser against the same engine the app uses (with today fixed to 25-10-2026 so date tests are stable).`)));
  T.append(h('p', null, 'For an end-to-end test, the sample workbook has 25 bookings in the exact judges’ format, each planting one or more mistakes, plus an “Expected results” sheet. ', h('button', { class: 'linkbtn', type: 'button', onclick: () => { showTab('file'); $('#load-sample').click(); } }, 'Run it on the file tab'), '.'));
  const groups = [...new Set(res.map(r => r.group))];
  groups.forEach(g => {
    const rs = res.filter(r => r.group === g); const gok = rs.filter(r => r.pass).length;
    T.append(h('details', { class: 'tgroup', open: gok !== rs.length }, h('summary', null, h('span', null, g), h('span', { class: gok === rs.length ? 'match' : 'mismatch' }, `${gok}/${rs.length}`)),
      h('ul', null, rs.map(r => h('li', { class: r.pass ? 't-ok' : 't-bad' }, h('span', { class: 'tmark', 'aria-label': r.pass ? 'passed' : 'failed' }, r.pass ? '✓' : '✕'), r.name, !r.pass && r.detail ? h('small', null, r.detail) : null)))));
  });
}

// ---------- boot ----------
greet(); renderSheet(); renderRules();
$('#today').textContent = PF.fmtDateLong(PF.todayISO());
showTab(location.hash.slice(1) || 'chat');
})();
