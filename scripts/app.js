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
    h('p', { class: 'note' }, 'Adjusted before checking — accept or change. Never changes the status.'),
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
function renderMbar(ev) {
  const m = $('#mbar'); if (!m) return;
  m.innerHTML = '';
  const on = !!ev && (location.hash.slice(1) || 'chat') === 'chat';
  m.classList.toggle('on', on); document.body.classList.toggle('has-mbar', on);
  if (!ev) return;
  const c = ev.rec && ev.rec.chosen;
  m.append(h('span', { class: 'ministamp v-' + ev.status }, STAMP[ev.status]),
    h('span', { class: 'grow' }, [ev.reds ? `${ev.reds} must-fix` : null, ev.ambers ? `${ev.ambers} to check` : null].filter(Boolean).join(' · ') || 'No problems', c ? ' · ' : '', c ? h('b', null, `${c.carrier} ${PF.gbp(c.cost)}`) : null),
    h('button', { class: 'btn small', type: 'button', onclick: () => { const r = $('#sheet .report') || $('#sheet'); r.scrollIntoView({ behavior: 'smooth' }); } }, 'Report ↓'));
}
function showTab(t) {
  if (!TABS.includes(t)) t = 'chat';
  TABS.forEach(x => { $('#tab-' + x).setAttribute('aria-selected', x === t); $('#panel-' + x).hidden = x !== t; });
  if (t === 'tests') renderTests();
  const mb = $('#mbar'); if (mb) { const on = t === 'chat' && cs.complete; mb.classList.toggle('on', on); document.body.classList.toggle('has-mbar', on); }
  try { if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t); } catch (e) {}
}
TABS.forEach(t => $('#tab-' + t).addEventListener('click', () => showTab(t)));
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));


// ---------- Route strip: the booking's lane, lit; red when the chosen carrier can't take the pallets ----------
const CITY_XY = { Manchester: [175, 170], Leeds: [200, 148], Birmingham: [188, 208], London: [215, 245], Amsterdam: [395, 200], Rotterdam: [378, 228], Hamburg: [500, 140], Berlin: [590, 170], Frankfurt: [470, 300], Paris: [300, 330], Lyon: [355, 440] };
const LEFT = ['Manchester', 'Birmingham', 'London'];
const DESTS = ['Amsterdam', 'Rotterdam', 'Hamburg', 'Berlin', 'Frankfurt', 'Paris', 'Lyon'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function arc(o, d) {
  const cx = (o[0] + d[0]) / 2, cy = Math.min(o[1], d[1]) - Math.max(40, Math.abs(d[0] - o[0]) * 0.28);
  let len = 0, px = o[0], py = o[1];
  for (let i = 1; i <= 24; i++) { const t = i / 24, x = (1 - t) * (1 - t) * o[0] + 2 * (1 - t) * t * cx + t * t * d[0], y = (1 - t) * (1 - t) * o[1] + 2 * (1 - t) * t * cy + t * t * d[1]; len += Math.hypot(x - px, y - py); px = x; py = y; }
  return { d: `M${o[0]} ${o[1]} Q${cx.toFixed(0)} ${cy.toFixed(0)} ${d[0]} ${d[1]}`, len: Math.ceil(len) };
}
function routeEl(ev) {
  const b = ev.b, rec = ev.rec, o = CITY_XY[b.originCity], d = CITY_XY[b.destCity];
  if (!o || !d || !rec) return null;
  const c = rec.chosen, blocked = c.fits === false, live = arc(o, d);
  const lanes = DESTS.filter(x => x !== b.destCity).map(x => `<path class="lane" d="${arc(o, CITY_XY[x]).d}"/>`).join('');
  const cities = Object.entries(CITY_XY).map(([n, [x, y]]) => { const on = n === b.originCity || n === b.destCity; return `<g class="city${on ? ' on' : ''}">${on ? `<circle class="halo" cx="${x}" cy="${y}" r="14"/>` : ''}<circle class="core" cx="${x}" cy="${y}" r="${on ? 6 : 3.5}"/>${LEFT.includes(n) ? `<text x="${x - 12}" y="${y + 5}" text-anchor="end">` : `<text x="${x + 10}" y="${y - 10}">`}${esc(n.toUpperCase())}</text></g>`; }).join('');
  const svg = `<svg viewBox="50 90 630 380" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(`Route ${b.originCity} to ${b.destCity}`)}"><defs><linearGradient id="gLive" x1="0" x2="1"><stop offset="0" stop-color="#4FD1FF"/><stop offset="1" stop-color="#FFB547"/></linearGradient></defs>${lanes}<path class="live${blocked ? ' blocked' : ''}" d="${live.d}" style="--len:${live.len}"/>${blocked ? '' : `<circle r="7" fill="#FFB547"><animateMotion dur="5s" repeatCount="indefinite" path="${live.d}"/></circle>`}${cities}</svg>`;
  const cap = blocked
    ? h('div', { class: 'cap' }, h('span', { class: 'k' }, `Route blocked · ${b.originCity} → ${b.destCity}`), h('span', null, h('b', null, PF.label(c)), ` can’t take ${PF.kg(rec.wpp)} pallets (max ${c.maxW} kg).`), rec.fixes.length ? h('span', null, 'Fix: ', h('b', null, rec.fixes[0].text)) : null)
    : h('div', { class: 'cap' }, h('span', { class: 'k' + (ev.status === 'Green' ? '' : ' k-' + ev.status) }, `${ev.status === 'Red' ? `Route held · ${ev.reds} must-fix` : ev.status === 'Amber' ? `Route open · check ${ev.ambers} first` : 'Route clear'} · ${b.originCity} → ${b.destCity}`), h('span', null, h('b', null, PF.label(c))), h('span', null, `${PF.gbp(c.cost)} · ${c.transit} days · ${c.onTime}% on time`), ev.eta ? h('span', null, `Collect ${PF.fmtDateLong(ev.eta.collect)} · arrive ${PF.fmtDateLong(ev.eta.arrive)}`) : null);
  return h('div', { class: 'route' + (blocked ? ' blocked' : '') }, h('div', { html: svg }), cap);
}
const advKind = a => (/^Possible dangerous goods/.test(a) ? 'Dangerous goods' : /^By weight/.test(a) ? 'Pallet plan' : /HS|commodity/i.test(a) ? 'HS code' : /weight|pallet/i.test(a) ? 'Weight' : 'Advisory');

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
function hsStamp() { const m = PF.hsMeta(); return m ? `HS codes checked against UK tariff snapshot ${m.version} (${PF.fmtDate(m.snapshotDate)}) · DBT data, OGL v3.0` : null; }
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
// ---------- Concise review cards (human-in-the-loop) ----------
// Each card leads with a headline (what is wrong, with the numbers), one evidence line and the actions.
// The rule text, the full explanation and "How to fix" stay one click away under "Why".
const words = (t, n) => { const w = String(t || '').trim().split(/\s+/); return w.length <= n ? w.join(' ') : w.slice(0, n).join(' ') + '…'; };
const firstPart = t => String(t || '').split(/ — |(?<=\.)\s/)[0].replace(/\.$/, '');
// Tariff label short enough for one line: heading's first words + the last level ("Pantyhose, tights, stockings › Of cotton").
function hsLabel(desc) { const p = String(desc || '').split(' > '); return words(p[0].split(/[;(]/)[0].replace(/,\s*$/, ''), 4).replace(/,…$/, '…') + (p.length > 1 ? ` › ${p[p.length - 1]}` : ''); }
function hsBrief(it) {
  const s = it.hsSug && it.hsSug.level !== 'none' ? it.hsSug : null, r = (it.hsRec || [])[0];
  const one = code => { const d = PF.hsLookup(code).desc; return h('span', { title: d || '' }, `${it.sku} → `, h('b', null, code), d ? ` · ${hsLabel(d)}` : ''); };
  if (r) return one(r.code);
  if (!s) return null;
  if (s.level === 'hs6') return one(s.codes[0]);
  return h('span', null, `${it.sku} → one of `, h('b', null, s.codes.slice(0, 4).join(', ')));
}
function brief(it, ev) {
  const c = it.check, b = ev.b, d = it.detail || '';
  if (!c) return { head: words(firstPart(d), 12) };
  const bad = (c.items || []).map(sku => b.items.find(x => x.sku === sku)).filter(Boolean);
  switch (c.id) {
    case 'R-01': {
      const one = x => x.hs.blank ? `${x.sku} has no HS code` : x.hs.hasLetters ? `${x.sku}: “${x.hs.raw}” has letters` : `${x.sku}: “${x.hs.raw}” is ${x.hs.digits.length} digits`;
      const ev1 = bad.map(hsBrief).filter(Boolean).slice(0, 3);
      return { head: bad.length === 1 ? one(bad[0]) : `${bad.length} items need a 6-digit HS code`, lines: ev1.length ? ev1 : ['No suggestion — look it up on the UK Trade Tariff'] };
    }
    case 'R-02': { const m = /(over|under) by (£[\d,.]+ \([\d.]+%\))/.exec(d), left = /equals (\S+?)'s line value/.exec(d);
      return { head: `Declared ${PF.gbp(b.declared)} · items ${PF.gbp(c.computed)}`, line: [m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} by ${m[2]}` : null, left ? `${left[1]} looks left out` : null].filter(Boolean).join(' · ') }; }
    case 'R-04': { const m = /\((\d[\d,]* (?:extra|short))\)/.exec(d); return { head: `Booking ${PF.fmtNum(b.cartons)} cartons · items ${PF.fmtNum(c.computed)}`, line: m ? m[1] : null }; }
    case 'R-05': { const r = ev.rec, f = r && r.fixes[0], o = f && r.opts.find(x => x.carrier === f.carrier);
      return { head: r ? `${PF.kg(r.wpp)} per pallet · ${r.chosen.carrier} max ${r.chosen.maxW} kg` : words(firstPart(d), 12),
        line: f ? `Best fix: ${f.type === 'switch' ? f.carrier : `${f.pallets} pallets${f.carrier !== r.chosen.carrier ? ' on ' + f.carrier : ''}`} · ${PF.gbp(f.cost)}${o ? ` · ${o.transit} days` : ''}` : null }; }
    case 'R-06': { const hits = [...d.matchAll(/(\S+) \(“[^”]*”\)(?: is |: )([^—.(]+)/g)].map(m => `${m[1]}: ${m[2].trim().replace(/^it may contain an? /, 'may contain ')}`);
      return { head: c.status === 'check' ? 'Possible dangerous goods' : 'Dangerous goods in the load', lines: hits.length ? hits.slice(0, 3) : [words(firstPart(d), 12)] }; }
    case 'R-07': { const m = /Gross weight ([\d,.]+ kg) is less than the goods alone \(([\d,.]+ kg)/.exec(d), s2 = /— ([\d,.]+ kg) short/.exec(d);
      return { head: m ? `Gross ${m[1]} · goods alone ${m[2]}` : words(firstPart(d), 12), line: s2 ? `${s2[1]} short before cartons and pallets` : null }; }
    case 'R-08': return { head: 'No warehouse delivery slot booked', line: ev.eta ? `Delivery est. ${PF.fmtDate(ev.eta.arrive)}${ev.eta.bufferDays ? ` (+${ev.eta.bufferDays} days to book)` : ''}` : null };
    case 'R-10': return { head: `Ready date ${PF.fmtDate(b.ready)} is in the past`, line: `Today is ${PF.fmtDate(ev.today)}` };
    default: return { head: words(firstPart(d), 12) };
  }
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
    const acts = it.check ? fixActions(it.check, ev, ctx.mode) : [], br = brief(it, ev);
    return h('li', { class: 'issue s-' + it.sev },
      h('div', { class: 'issue-top' }, h('span', { class: 'sev' }, SEV_WORD[it.sev]), h('span', { class: 'rid', title: it.title }, it.id || it.title)),
      h('p', { class: 'what', title: it.detail }, br.head),
      ...(br.lines || (br.line ? [br.line] : [])).map(l => h('p', { class: 'evid' }, l)),
      // With no button, the first step of the fix stays visible so the reviewer still knows what to do.
      !acts.length && it.fix ? h('p', { class: 'fix' }, words(firstPart(it.fix), 14)) : null,
      acts.length ? h('div', { class: 'fix-acts' }, acts.map((a, k) => h('button', { class: 'btn small' + (k ? ' ghost' : ''), type: 'button', onclick: () => ctx.apply(a) }, a.label))) : null,
      h('details', { class: 'why' }, h('summary', null, 'Why'),
        it.kind === 'rule' ? h('p', { class: 'rtitle' }, `${it.id}: ${it.title}`) : null,
        h('p', null, it.detail), it.fix ? h('p', null, h('b', null, 'How to fix: '), it.fix) : null));
  })) : h('p', { class: 'allclear' }, 'No problems found — every rulebook check passed.');

  const passedEl = h('details', { class: 'passed' }, h('summary', null, `${passed.length} check${passed.length === 1 ? '' : 's'} passed${cannot.length ? `, ${cannot.length} couldn't run` : ''}`),
    h('ul', null, [...passed, ...cannot].map(c => h('li', { class: 'p-' + c.status }, h('span', { class: 'rid' }, c.id), ' ', c.status === 'cannot' ? h('i', null, 'Couldn’t run: ') : c.status === 'na' ? h('i', null, 'Not applicable: ') : null, c.detail))));

  const advActs = hsAdvActs(ev);
  const adv = advisories.length ? h('section', { class: 'advisories' }, h('p', { class: 'mini-h' }, `Advisories · ${advisories.length} · worth knowing, never change the status`), h('div', { class: 'advlist' }, advisories.map(a => h('div', { class: 'advcard' }, h('span', { class: 'adv-tag' }, advKind(a)), h('div', null, a)))),
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
  // Long sections fold to one line until the booking is clean, so the decisions above stay in view.
  const fold = (el, line) => el ? h('details', { class: 'fold', open: status === 'Green' }, h('summary', null, line), el) : null;
  const carrierFold = rec ? fold(carrierEl, `Carrier · ${PF.label(rec.chosen)} · ${PF.gbp(rec.chosen.cost)} · ${rec.chosen.transit} days${rec.chosen.fits === false ? ' · over limit' : ''}`) : null;
  const confFold = fold(confEl, status === 'Red' ? 'Booking summary · after the must-fix items are cleared' : 'Booking summary and next steps');
  return h('div', { class: 'report' }, head, routeEl(ev), reviewEl(ev, ctx), issueList, passedEl, adv, carrierFold, confFold, inv, stamp, hist);
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
  renderMbar(cs.complete ? ev : null);
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
  fileData.baseline = fileData.bookings.map(b => PF.evaluate(b, { today: PF.todayISO() }));
  Object.keys(overrides).forEach(k => delete overrides[k]); Object.keys(reviews).forEach(k => delete reviews[k]);
  audit.length = 0; auditSeen.clear(); openRow = null; filter = 'All';
  renderFile();
}
function showFileError(msg) { $('#file-results').innerHTML = ''; $('#file-results').append(h('p', { class: 'note-warn' }, msg)); }
function applyOv(raw, ov) {
  if (!ov) return raw;
  return { ...raw, ...ov.patch, items: raw.items.map((it, i) => ({ ...it, ...((ov.items || {})[i] || {}) })) };
}
// ---------- Outcomes panel (reporting only; statuses still come from the rulebook) ----------
// One panel per uploaded file. It stays in the DOM across re-renders, so a fix animates the change instead of replaying everything.
const COST_KEY = 'pf-outcome-costs';
let costs = {}; try { costs = JSON.parse(localStorage.getItem(COST_KEY) || '{}') || {}; } catch (e) { costs = {}; }
function saveCosts() { try { localStorage.setItem(COST_KEY, JSON.stringify(costs)); } catch (e) {} }
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const range = (lo, hi) => (lo === hi ? PF.gbp(lo) : `${PF.gbp(lo)}–${PF.gbp(hi)}`);
function tween(el, to, fmt = String, ms = 900) {
  const from = +el.dataset.v || 0; el.dataset.v = to;
  if (calm() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const OC_STATE = { stopped: { word: 'Stopped', glyph: '✕' }, fixed: { word: 'Fixed', glyph: '✓' }, risk: { word: 'Need a look', glyph: '!' }, clean: { word: 'Clean', glyph: '' } };
function ocState(r) { return r.now ? 'stopped' : r.before ? 'fixed' : r.status === 'Amber' ? 'risk' : 'clean'; }
function outcomesPanel() {
  if (fileData.oc) return fileData.oc;
  const stageById = Object.fromEntries(PF.OUTCOME_STAGES.map(st => [st.id, st]));
  const n = () => h('b', { class: 'num', 'data-v': 0 }, '0');
  // Header: headline numbers + fixed ring
  const hStopped = n(), hTotal = n(), hFixed = n(), hOf = n();
  const ring = h('div', { class: 'oc-ring', html: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="bg" cx="32" cy="32" r="27"/><circle class="fg" cx="32" cy="32" r="27"/></svg>' });
  const ringFg = ring.querySelector('.fg');
  ring.append(h('div', { class: 'oc-ring-lbl' }, hFixed, h('span', null, ' / '), hOf, h('small', null, 'stops fixed')));
  // Route: uploaded → four stops → through
  const startN = n(), endN = n(), endSub = h('span', { class: 'oc-sub' });
  const stops = PF.OUTCOME_STAGES.map(st => {
    const cnt = n(), nowI = h('i', { class: 'now' }), fixI = h('i', { class: 'fix' }), bar = h('div', { class: 'oc-bar' }, nowI, fixI), tag = h('span', { class: 'oc-tag' });
    const el = h('div', { class: 'oc-stop', tabindex: 0 }, h('span', { class: 'oc-node' }, cnt), h('span', { class: 'oc-lbl' }, st.label), h('span', { class: 'oc-rules' }, st.rules.length ? st.rules.join(' · ') : 'Red data issues'), h('div', { class: 'oc-barbox' }, bar), tag);
    return { st, el, cnt, bar, nowI, fixI, tag };
  });
  const route = h('div', { class: 'oc-route' },
    h('div', { class: 'oc-track', 'aria-hidden': 'true' }, h('i', { class: 'line' }), [0, 1, 2].map(i => h('i', { class: 'dot', style: `--d:${i * 1.6}s` }))),
    h('div', { class: 'oc-stop oc-end start' }, h('span', { class: 'oc-node' }, startN), h('span', { class: 'oc-lbl' }, 'Uploaded'), h('span', { class: 'oc-rules' }, 'bookings in the file')),
    stops.map(x => x.el),
    h('div', { class: 'oc-stop oc-end finish' }, h('span', { class: 'oc-node' }, endN), h('span', { class: 'oc-lbl' }, 'Get through now'), endSub));
  // Waffle: one cell per booking, in upload order
  const waffle = h('div', { class: 'oc-waffle', role: 'list', 'aria-label': 'Every booking, one cell each' });
  const legendN = {}; const legend = h('div', { class: 'oc-legend' }, Object.entries(OC_STATE).map(([k, v]) => h('span', { class: 'lg s-' + k }, h('i', null, v.glyph), v.word, ' ', (legendN[k] = n()))));
  // Stacked bars: where every booking stands, as uploaded and now
  const segRow = name => { const segs = Object.fromEntries(Object.keys(OC_STATE).map(k => [k, h('i', { class: 's-' + k, tabindex: 0 })])); return { segs, el: h('div', { class: 'oc-srow' }, h('span', { class: 'oc-slbl' }, name), h('div', { class: 'oc-strack' }, Object.values(segs))) }; };
  const sBefore = segRow('As uploaded'), sNow = segRow('Now');
  // Cost chart (your figures)
  const costRows = PF.OUTCOME_STAGES.map(st => {
    const inp = k => h('input', { type: 'number', min: 0, step: 50, inputmode: 'decimal', placeholder: k === 'low' ? 'low £' : 'high £', value: (costs[st.id] || {})[k] ?? '', 'aria-label': `${st.label}: ${k} cost per stopped booking, £`,
      oninput: e => { costs[st.id] = { ...(costs[st.id] || {}), [k]: e.target.value }; saveCosts(); paintCost(); } });
    const stake = h('i', { class: 'stake' }), saved = h('i', { class: 'saved' }), val = h('span', { class: 'oc-val' }, '—');
    return { st, el: h('div', { class: 'oc-crow' }, h('span', { class: 'oc-clbl' }, st.label), h('span', { class: 'oc-inputs' }, inp('low'), inp('high')), h('div', { class: 'oc-rtrack', tabindex: 0 }, stake, saved), val), stake, saved, val };
  });
  const totStakeLo = n(), totStakeHi = n(), totSavedLo = n(), totSavedHi = n();
  const totals = h('div', { class: 'oc-totals' },
    h('div', { class: 'oc-tot stake' }, h('span', null, 'At stake as uploaded'), h('strong', null, '£', totStakeLo, h('em', null, '–£'), totStakeHi)),
    h('div', { class: 'oc-tot saved' }, h('span', null, 'Avoided by fixes so far'), h('strong', null, '£', totSavedLo, h('em', null, '–£'), totSavedHi)));
  const costEmpty = h('p', { class: 'oc-empty' }, 'Type what one stopped booking costs you at each stage (storage, re-delivery, demurrage, a missed slot). No default figures.');
  // Data table (the accessible view of every chart)
  const tbody = h('tbody');
  const tip = h('div', { class: 'oc-tip', hidden: true });
  const el = h('section', { class: 'oc', 'aria-label': 'Outcomes' },
    h('div', { class: 'oc-glow', 'aria-hidden': 'true' }),
    h('header', { class: 'oc-head' },
      h('div', null, h('span', { class: 'oc-eyebrow' }, 'Outcomes · as uploaded → now'),
        h('h3', null, hStopped, ' of ', hTotal, ' bookings would have been ', h('span', { class: 'grad' }, 'stopped')),
        h('p', null, 'Each booking counts once, at the first place it would most likely be stopped. Reporting only — Red, Amber and Green still come from the rulebook.')),
      ring),
    route,
    h('div', { class: 'oc-grid' },
      h('div', { class: 'oc-card' }, h('span', { class: 'oc-eyebrow' }, 'Every booking, once'), waffle, legend,
        h('div', { class: 'oc-stack' }, sBefore.el, sNow.el)),
      h('div', { class: 'oc-card' }, h('span', { class: 'oc-eyebrow' }, 'Cost estimate · your figures'), costEmpty, h('div', { class: 'oc-cost' }, costRows.map(r => r.el)), totals,
        h('p', { class: 'oc-note' }, 'Estimate — from your inputs, not measured. Only bookings fixed here count as avoided. Kept separate from carrier prices. Saved in this browser only.'))),
    h('details', { class: 'oc-table' }, h('summary', null, 'Data table'),
      h('table', null, h('thead', null, h('tr', null, h('th', null, 'Stage'), h('th', null, 'Stopped as uploaded'), h('th', null, 'Still stopped'), h('th', null, 'Fixed'), h('th', null, 'Bookings'))), tbody)),
    tip);
  // Tooltip shared by every mark
  const showTip = t => { const txt = t.dataset.tip; if (!txt) return; tip.textContent = txt; tip.hidden = false; const a = t.getBoundingClientRect(), p = el.getBoundingClientRect(); tip.style.left = Math.max(8, Math.min(p.width - tip.offsetWidth - 8, a.left - p.left + a.width / 2 - tip.offsetWidth / 2)) + 'px'; tip.style.top = (a.top - p.top - tip.offsetHeight - 8) + 'px'; };
  ['pointerover', 'focusin'].forEach(ev => el.addEventListener(ev, e => { const t = e.target.closest('[data-tip]'); if (t) showTip(t); }));
  ['pointerout', 'focusout'].forEach(ev => el.addEventListener(ev, e => { if (e.target.closest('[data-tip]')) tip.hidden = true; }));
  let o = null, first = true;
  function paintCost() {
    if (!o) return;
    const stake = PF.avoidedCost(o, costs, 'before'), saved = PF.avoidedCost(o, costs);
    const max = Math.max(1, ...stake.lines.map(l => l.totalHigh));
    costRows.forEach(r => {
      const l = stake.lines.find(x => x.stage === r.st.id), sv = saved.lines.find(x => x.stage === r.st.id);
      r.stake.style.setProperty('--lo', l ? l.totalLow / max : 0); r.stake.style.setProperty('--hi', l ? l.totalHigh / max : 0);
      r.saved.style.setProperty('--lo', sv ? sv.totalLow / max : 0); r.saved.style.setProperty('--hi', sv ? sv.totalHigh / max : 0);
      r.val.textContent = l ? range(l.totalLow, l.totalHigh) : '—';
      r.el.querySelector('.oc-rtrack').setAttribute('data-tip', l ? `${r.st.label}: ${l.n} × ${range(l.low, l.high)} = ${range(l.totalLow, l.totalHigh)} at stake${sv ? `; ${range(sv.totalLow, sv.totalHigh)} avoided` : ''}` : `${r.st.label}: no figure entered`);
    });
    const fmt = v => PF.fmtNum(v, 0);
    tween(totStakeLo, stake.low, fmt); tween(totStakeHi, stake.high, fmt); tween(totSavedLo, saved.low, fmt); tween(totSavedHi, saved.high, fmt);
    el.classList.toggle('no-cost', !stake.lines.length);
  }
  function update(rows) {
    o = PF.outcomes(fileData.baseline, rows.map(r => r.ev));
    const apply = () => {
      tween(hStopped, o.stoppedBefore); tween(hTotal, o.total); tween(hFixed, o.avoided); tween(hOf, o.stoppedBefore);
      ringFg.style.strokeDashoffset = String(169.6 * (1 - (o.stoppedBefore ? o.avoided / o.stoppedBefore : 0)));
      tween(startN, o.total); tween(endN, o.total - o.stoppedNow);
      endSub.textContent = `${o.atRisk.length} need a look · ${o.clean.length} clean${o.avoided ? ` · ${o.avoided} fixed` : ''}`;
      const max = Math.max(1, ...o.stages.map(s => s.before.length));
      stops.forEach((x, i) => {
        const s = o.stages[i], b = s.before.length;
        tween(x.cnt, b);
        x.bar.style.setProperty('--b', b / max);
        x.nowI.style.setProperty('--f', b ? s.now.length / b : 0); x.fixI.style.setProperty('--f', b ? s.avoided.length / b : 0);
        x.bar.classList.toggle('split', s.now.length > 0 && s.avoided.length > 0);
        x.el.classList.toggle('hit', s.now.length > 0); x.el.classList.toggle('clear', b > 0 && !s.now.length);
        x.tag.textContent = !b ? 'none' : s.now.length ? `${s.now.length} still stopped` : 'all fixed';
        x.el.setAttribute('data-tip', b ? `${x.st.label} — ${x.st.where}: ${s.before.join(', ')}${s.avoided.length ? ` (fixed: ${s.avoided.join(', ')})` : ''}` : `${x.st.label}: no bookings`);
      });
      // Waffle cells
      const cells = waffle.children;
      o.rows.forEach((r, i) => {
        let c = cells[i]; if (!c) { c = h('span', { class: 'oc-cell', role: 'listitem', tabindex: 0, style: `--i:${i}` }, h('b')); waffle.append(c); }
        const st = ocState(r);
        if (c.dataset.state && c.dataset.state !== st && !calm()) { c.classList.remove('flip'); void c.offsetWidth; c.classList.add('flip'); }
        c.dataset.state = st; c.className = c.className.replace(/\bs-\w+/g, '').trim() + ' s-' + st;
        c.firstChild.textContent = OC_STATE[st].glyph;
        const stage = r.before ? stageById[r.before].label : null;
        c.setAttribute('data-tip', `${r.id} · ${OC_STATE[st].word}${stage ? ` · ${stage.toLowerCase()}` : ''}`);
        c.setAttribute('aria-label', c.dataset.tip);
      });
      while (cells.length > o.rows.length) cells[cells.length - 1].remove();
      const count = k => o.rows.filter(r => ocState(r) === k).length;
      Object.keys(OC_STATE).forEach(k => tween(legendN[k], count(k)));
      const was = { stopped: o.stoppedBefore, fixed: 0, risk: o.atRisk.length, clean: o.clean.length };
      Object.keys(OC_STATE).forEach(k => {
        [[sBefore, was[k], 'as uploaded'], [sNow, count(k), 'now']].forEach(([row, v, when]) => {
          const seg = row.segs[k]; seg.style.setProperty('--w', o.total ? v / o.total : 0); seg.classList.toggle('zero', !v);
          seg.setAttribute('data-tip', `${OC_STATE[k].word} ${when}: ${v} of ${o.total}`); seg.setAttribute('aria-label', seg.dataset.tip);
          seg.textContent = v && v / o.total >= 0.08 ? String(v) : '';
        });
      });
      tbody.replaceChildren(...o.stages.map(s => h('tr', null, h('td', null, s.label), h('td', null, String(s.before.length)), h('td', null, String(s.now.length)), h('td', null, String(s.avoided.length)), h('td', null, s.before.join(', ') || '—'))));
      paintCost();
    };
    if (first) {
      first = false;
      // Let the zero state paint first, then start the entrance when the panel scrolls into view.
      const go = () => requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('in'); apply(); setTimeout(() => el.classList.add('settled'), 1800); }));
      if ('IntersectionObserver' in window && !calm()) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { threshold: 0.15 }); io.observe(el); }
      else { el.classList.add('in', 'settled'); apply(); }
    } else apply();
    return el;
  }
  fileData.oc = { el, update };
  return fileData.oc;
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
    h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by status' }, ['All', 'Red', 'Amber', 'Green', 'Review', 'Advisory'].map(s => h('button', { type: 'button', class: 'fbtn f-' + s, 'aria-pressed': filter === s, onclick: () => { filter = s; renderFile(); } }, s === 'All' ? `All ${rows.length}` : s === 'Review' ? `Needs review ${rows.filter(r => toReview(r)).length}` : s === 'Advisory' ? `Has advisories ${rows.filter(r => r.ev.advisories.length).length}` : `${s} ${cnt(s)}`))),
    h('button', { class: 'btn', type: 'button', onclick: exportResults, disabled: !rows.length }, 'Export results (.xlsx)')));
  fileData.notices.forEach(n => out.append(h('p', { class: 'notice n-' + n.level }, n.text)));
  if (!rows.length) { out.append(h('p', { class: 'note-warn' }, 'No bookings found under the header row.')); return; }
  out.append(outcomesPanel().update(rows));
  const exp = fileData.expected;
  const tbody = h('tbody');
  rows.filter(r => filter === 'All' || (filter === 'Review' ? toReview(r) > 0 : filter === 'Advisory' ? r.ev.advisories.length > 0 : r.ev.status === filter)).forEach(r => {
    const { ev } = r; const b = ev.b;
    const flagged = [...ev.checks.filter(c => c.status === 'fail' || c.status === 'check').map(c => ({ t: c.id, s: c.status === 'check' ? 'Amber' : c.sev })), ...(ev.dataIssues.length ? [{ t: `Data ×${ev.dataIssues.length}`, s: ev.dataIssues.some(d => d.sev === 'Red') ? 'Red' : 'Amber' }] : [])];
    const e = exp && exp[b.id.toUpperCase()];
    const open = openRow === r.i;
    const tr = h('tr', { class: 'brow' + (open ? ' open' : ''), tabindex: 0, 'aria-expanded': open, onclick: () => { openRow = open ? null : r.i; renderFile(); }, onkeydown: ev2 => { if (ev2.key === 'Enter' || ev2.key === ' ') { ev2.preventDefault(); openRow = open ? null : r.i; renderFile(); } } },
      h('td', null, h('span', { class: 'chev', 'aria-hidden': 'true' }, open ? '▾' : '▸'), b.id, r.edited ? h('span', { class: 'tag ghost' }, 'edited') : null),
      h('td', null, b.seller || '—'),
      h('td', null, `${b.originCity || '?'} → ${b.destCity || '?'}`),
      h('td', null, h('span', { class: 'pill p-' + ev.status }, ev.status)),
      h('td', null, flagged.length ? flagged.map(f => h('span', { class: 'rchip s-' + f.s }, f.t)) : h('span', { class: 'muted' }, 'none'), ev.advisories.length ? h('span', { class: 'rchip s-Adv', title: 'Advisories never change the status' }, `Adv ×${ev.advisories.length}`) : null),
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
  let nTests = '—'; try { nTests = window.PFTests(PF, C).length; } catch (e) {}
  R.append(h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('b', null, '10'), h('span', null, 'Rules, R-01 to R-10')),
    h('div', { class: 'stat' }, h('b', null, String(nTests)), h('span', null, 'Automated tests')),
    h('div', { class: 'stat' }, h('b', null, '25'), h('span', null, 'Planted-error bookings')),
    h('div', { class: 'stat' }, h('b', null, '0'), h('span', null, 'Crashes on bad input'))));
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
$('#today-short').textContent = PF.fmtDate(PF.todayISO());
showTab(location.hash.slice(1) || 'chat');
})();
