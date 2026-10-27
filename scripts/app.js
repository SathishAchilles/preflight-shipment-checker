/* CargoPass UI */
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
const VERDICT = { Red: 'Not ready yet — fix the must-fix items first', Amber: 'Ready to go — a few things to check', Green: 'Ready to book' };

// ---------- Downloads (claude.ai viewer capability, with a plain-browser fallback) ----------
let DL = null;

// ---------- Automatic-correction review and audit trail (session only; download the report to keep it) ----------
const audit = []; const auditSeen = new Set();
const FIELD_LABEL = { priority: 'Priority', pallets: 'Pallets', cartons: 'Cartons', declared: 'Total declared value', gross: 'Total gross weight', appointment: 'Delivery appointment', ready: 'Ready to ship date', carrierOverride: 'Carrier', destType: 'Destination type', hs: 'HS code', coo: 'Country of origin', qty: 'Quantity', price: 'Unit price', upc: 'Units per carton', unitWeight: 'Unit weight' };
const shown = v => (v == null || v === '' ? '(blank)' : String(v));
function logEvent(e) { audit.push({ at: new Date().toISOString(), booking: '', sku: '', field: '', before: '', after: '', by: 'you', action: '', view: e.chat ? 'chat' : V.name, ...e }); }
function clearAudit(view) { for (let i = audit.length - 1; i >= 0; i--) if (audit[i].view === view) audit.splice(i, 1); [...auditSeen].forEach(k => { if (k.startsWith(view + '|')) auditSeen.delete(k); }); }
function noteCorrections(ev, extra = {}) {
  ev.corrections.forEach(c => {
    const k = `${extra.chat ? 'chat|chat' : V.name + '|' + ev.b.id}|${c.id}|${c.entered}|${c.used}`;
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
  return [secH('We tidied a few values', open.length ? `${open.length} to check` : 'all checked'), h('section', { class: 'review' },
    h('div', { class: 'review-head' }, h('h3', null, 'Do these look right?'),
      open.length ? h('button', { class: 'btn small', type: 'button', onclick: () => R.acceptAll(open) }, 'Accept all') : null),
    h('p', { class: 'note' }, 'Some values were written differently, so we read them like this. Tap Accept if they look right. This never blocks your booking.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'ctable rvtable' },
      h('thead', null, h('tr', null, ['What', 'You wrote', 'We read it as', 'Why', ''].map(x => h('th', null, x)))),
      h('tbody', null, rows.map(c => { const st = R.state(c.id); return h('tr', null,
        h('th', { scope: 'row' }, c.sku ? `${c.label} (${c.sku})` : c.label), h('td', null, shown(c.entered)), h('td', null, c.used), h('td', null, c.why),
        h('td', null, st ? h('span', { class: st.state === 'accepted' ? 'rv-ok' : 'rv-ch' }, st.state === 'accepted' ? '✓ Accepted' : `✎ Changed by you: ${st.value}`)
          : h('span', null, h('button', { class: 'btn tiny', type: 'button', onclick: () => R.accept(c) }, 'Accept'), ' ', h('button', { class: 'btn tiny ghost', type: 'button', onclick: editCell(c) }, 'Change')))); })))),
    null)];
}
try { if (window.claude && typeof window.claude.use === 'function') window.claude.use('downloads').then(d => { DL = d; }).catch(() => {}); } catch (e) {}
async function saveFile(name, buf) {
  if (DL) { try { await DL.save({ filename: name, data: new Blob([buf]) }); return; } catch (e) { if (e && e.code === 'declined') return; } }
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Tabs ----------
const TABS = ['chat', 'file', 'bookings', 'rules', 'tests'];
function renderMbar(ev) {
  const m = $('#mbar'); if (!m) return;
  m.innerHTML = '';
  const on = !!ev && (location.hash.slice(1) || 'chat') === 'chat';
  m.classList.toggle('on', on); document.body.classList.toggle('has-mbar', on);
  if (!ev) return;
  const c = ev.rec && ev.rec.chosen;
  m.append(h('span', { class: 'ministamp v-' + ev.status }, STAMP[ev.status]),
    h('span', { class: 'grow' }, [ev.reds ? `${ev.reds} must-fix` : null, ev.ambers ? `${ev.ambers} to check` : null].filter(Boolean).join(' · ') || 'No problems', c ? ' · ' : '', c ? h('b', null, `${c.carrier} ${PF.gbp(c.cost)}`) : null),
    h('button', { class: 'btn small', type: 'button', onclick: () => { const r = $('#chat-report .report') || $('#sheet'); r.scrollIntoView({ behavior: 'smooth' }); } }, 'Report ↓'));
}
function showTab(t) {
  if (!TABS.includes(t)) t = 'chat';
  TABS.forEach(x => { const tb = $('#tab-' + x); if (tb) tb.setAttribute('aria-selected', x === t); $('#panel-' + x).hidden = x !== t; });
  renderHero(t === 'file' || t === 'bookings' ? heroFor[t] : heroFor.chat);
  if (t === 'bookings') loadSaved();
  else if (t === 'file' && views.file.data && V !== views.file) renderView(views.file);
  if (t === 'tests') renderTests();
  const mb = $('#mbar'); if (mb) { const on = t === 'chat' && cs.complete; mb.classList.toggle('on', on); document.body.classList.toggle('has-mbar', on); }
  try { if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t); } catch (e) {}
}
TABS.forEach(t => { const tb = $('#tab-' + t); if (tb) tb.addEventListener('click', () => showTab(t)); });
document.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => { showTab(el.dataset.go); const tgt = el.dataset.go === 'chat' ? $('#chat-input') : $('#drop'); if (tgt) { tgt.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (el.dataset.go === 'chat') setTimeout(() => tgt.focus(), 300); } }));
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
  const svg = `<svg viewBox="50 90 630 380" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(`Route ${b.originCity} to ${b.destCity}`)}"><defs><linearGradient id="gLive" x1="0" x2="1"><stop offset="0" stop-color="#72C0DC"/><stop offset="1" stop-color="#DAAE6C"/></linearGradient></defs>${lanes}<path class="live${blocked ? ' blocked' : ''}" d="${live.d}" style="--len:${live.len}"/>${blocked ? '' : `<circle r="7" fill="#DAAE6C"><animateMotion dur="5s" repeatCount="indefinite" path="${live.d}"/></circle>`}${cities}</svg>`;
  const cap = blocked
    ? h('div', { class: 'cap' }, h('span', { class: 'k' }, `Route blocked · ${b.originCity} → ${b.destCity}`), h('span', null, h('b', null, PF.label(c)), ` can’t take ${PF.kg(rec.wpp)} pallets (max ${c.maxW} kg).`), rec.fixes.length ? h('span', null, 'Fix: ', h('b', null, rec.fixes[0].text)) : null)
    : h('div', { class: 'cap' }, h('span', { class: 'k' + (ev.status === 'Green' ? '' : ' k-' + ev.status) }, `${ev.status === 'Red' ? `Route held · ${ev.reds} must-fix` : ev.status === 'Amber' ? `Route open · check ${ev.ambers} first` : 'Route clear'} · ${b.originCity} → ${b.destCity}`), h('span', null, h('b', null, PF.label(c))), h('span', null, `${PF.gbp(c.cost)} · ${c.transit} days · ${c.onTime}% on time`), ev.eta ? h('span', null, `Collect ${PF.fmtDateLong(ev.eta.collect)} · arrive ${PF.fmtDateLong(ev.eta.arrive)}`) : null);
  return h('div', { class: 'route' + (blocked ? ' blocked' : '') }, h('div', { html: svg }), cap);
}

// ---------- Hero: route map + live check card for the booking in view ----------
const PLAIN = { 'R-01': 'Customs code', 'R-02': 'Total value', 'R-03': 'Packing', 'R-04': 'Box total', 'R-05': 'Pallet weight', 'R-06': 'Dangerous goods', 'R-07': 'Total weight', 'R-08': 'Delivery slot', 'R-09': 'Made in', 'R-10': 'Ready date' };
const PRICE_TXT = 'Prices are a guide. The final price can change with the city, fuel and date, so confirm with the carrier.';
const heroFor = { chat: null, file: null, bookings: null };
function setHero(tab, ev, label) {
  heroFor[tab] = ev ? { ev, label } : null;
  const cur = location.hash.slice(1) || 'chat';
  if (cur === tab || (tab === 'chat' && cur !== 'file' && cur !== 'bookings')) renderHero(heroFor[tab]);
}
// Example bookings for the hero until the user has one of their own: the demo set, one route after another.
// Each route draws in, holds for HOLD_MS, then the next one starts; hover or focus on the map pauses it.
const HOLD_MS = 300;
let demoHeroList, demoHeroIdx = 0, demoHeroTimer = null, heroPaused = false;
function demoHeroes() {
  if (demoHeroList) return demoHeroList;
  demoHeroList = [];
  try {
    if (window.DEMO_XLSX_B64 && window.XLSX) {
      const wb = XLSX.read(demoBuf(), { type: 'array' });
      demoHeroList = PF.parseSheets(sheetsFromWorkbook(wb, 'demo')).bookings.map(b => PF.evaluate(b, { today: PF.todayISO() }))
        .filter(ev => CITY_XY[ev.b.originCity] && CITY_XY[ev.b.destCity]).map(ev => ({ ev, label: `Example · ${ev.b.seller}`, example: true }));
    }
  } catch (e) { demoHeroList = []; }
  return demoHeroList;
}
function demoHero() { const l = demoHeroes(); return l.length ? l[demoHeroIdx % l.length] : null; }
function nextDemoHero(box) {
  clearTimeout(demoHeroTimer);
  if (demoHeroes().length < 2) return;
  const line = box.querySelector('.live');
  const drawMs = line && !calm() ? 2200 : 0;  // matches .hmap .live: 2s draw after a .2s delay
  demoHeroTimer = setTimeout(function tick() {
    if (heroPaused || document.hidden) { demoHeroTimer = setTimeout(tick, 500); return; }
    demoHeroIdx++; renderHero(null);
  }, drawMs + HOLD_MS);
}
function renderHero(x) {
  const box = $('#hero-map'); if (!box) return;
  const example = !x;
  clearTimeout(demoHeroTimer);
  if (!x) x = demoHero();
  const ev = x && x.ev, b = ev && ev.b, rec = ev && ev.rec;
  const o = b && CITY_XY[b.originCity], d = b && CITY_XY[b.destCity];
  const from = o ? b.originCity : 'Manchester', oxy = CITY_XY[from];
  const red = !!(rec && rec.chosen.fits === false);
  const lanes = DESTS.filter(n => !(d && n === b.destCity)).map(n => `<path class="lane" d="${arc(oxy, CITY_XY[n]).d}"/>`).join('');
  let live = '';
  if (o && d) { const L = arc(o, d); live = `<path class="live${red ? ' red' : ''}" d="${L.d}" style="--len:${L.len}"/>${red ? '' : `<circle r="5" fill="#DAAE6C"><animateMotion dur="5s" repeatCount="indefinite" path="${L.d}"/></circle>`}`; }
  const on = n => !!b && (n === b.originCity || n === b.destCity);
  const cities = Object.entries(CITY_XY).map(([n, [cx, cy]]) => `<g class="city${on(n) ? ' on' : ''}">${on(n) ? `<circle class="halo" cx="${cx}" cy="${cy}" r="10"/>` : ''}<circle class="core" cx="${cx}" cy="${cy}" r="${on(n) ? 4 : 3}"/>${LEFT.includes(n) ? `<text x="${cx - 10}" y="${cy + 4}" text-anchor="end">` : `<text x="${cx + 8}" y="${cy - 8}">`}${esc(n.toUpperCase())}</text></g>`).join('');
  const svg = `<svg viewBox="40 95 660 400" role="img" aria-label="${esc(o && d ? `Route ${b.originCity} to ${b.destCity}` : 'Routes from the UK to Germany, France and the Netherlands')}"><defs><linearGradient id="gHero" x1="0" x2="1"><stop offset="0" stop-color="#72C0DC"/><stop offset="1" stop-color="#DAAE6C"/></linearGradient><pattern id="hdots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" fill="rgba(255,255,255,.07)"/></pattern></defs><rect x="40" y="95" width="660" height="400" fill="url(#hdots)"/>${lanes}${live}${cities}</svg>`;
  const passed = ev ? ev.checks.filter(c => c.status === 'pass' || c.status === 'na').length : 0;
  const fails = ev ? ev.checks.filter(c => c.status === 'fail' || c.status === 'check') : [];
  const chips = ev ? [...fails.map(c => h('span', { class: 'hchip ' + (c.status === 'check' || c.sev === 'Amber' ? 'amber' : 'red') }, PLAIN[c.id] || c.id)),
    ev.dataIssues.length ? h('span', { class: 'hchip ' + (ev.dataIssues.some(i2 => i2.sev === 'Red') ? 'red' : 'amber') }, 'Booking details') : null,
    !fails.length && !ev.dataIssues.length ? h('span', { class: 'hchip ok' }, 'All clear') : null] : [];
  let recLine = h('span', null, 'Start a booking or check a file, and its route lights up here.');
  if (rec) {
    const c = rec.chosen, f = rec.fixes[0], alt = f && rec.opts.find(x2 => x2.carrier === f.carrier);
    recLine = c.fits === false && f
      ? h('span', null, 'Suggested: ', h('b', null, `${f.type === 'switch' ? f.carrier : `${f.pallets} pallets on ${f.carrier}`} · ${PF.gbp(f.cost)}${alt ? ` · ${alt.transit} days` : ''}`), ', fits as booked')
      : h('span', null, 'Carrier: ', h('b', null, `${c.carrier} · ${PF.gbp(c.cost)} · ${c.transit} days`), c.fits ? ', fits as booked' : '');
  }
  const card = h('div', { class: 'hcheck' },
    h('div', { class: 'hd' }, h('b', { style: 'font-weight:500' }, ev ? `${x.label}${PF.isNum(b.pallets) ? ` · ${PF.fmtNum(b.pallets)} pallet${b.pallets === 1 ? '' : 's'}` : ''}` : 'Your booking'),
      ev ? h('span', null, h('span', { class: 'live-l' }, x.example ? 'example' : 'live'), ' ', h('span', { class: 'ministamp v-' + ev.status }, STAMP[ev.status])) : h('span', { class: 'mono muted' }, 'waiting')),
    h('div', { class: 'ring' }, h('div', { html: `<svg viewBox="0 0 56 56" aria-hidden="true"><circle class="bgc" cx="28" cy="28" r="24"/><circle class="fg" cx="28" cy="28" r="24" style="stroke-dashoffset:${(150.8 * (1 - passed / 10)).toFixed(1)}"/></svg>` }),
      h('div', null, h('b', { class: 'num' }, `${passed} / 10`), h('span', null, 'checks passed'))),
    chips.length ? h('div', { class: 'hchips' }, chips) : null,
    h('div', { class: 'rec' }, recLine));
  box.innerHTML = ''; box.append(h('div', { html: svg }), card);
  // Only real bookings are announced; the rotating example stays quiet for screen readers.
  box.setAttribute('aria-live', example ? 'off' : 'polite');
  if (!box.dataset.pauseWired) {
    box.dataset.pauseWired = '1';
    box.addEventListener('mouseenter', () => { heroPaused = true; }); box.addEventListener('mouseleave', () => { heroPaused = false; });
    box.addEventListener('focusin', () => { heroPaused = true; }); box.addEventListener('focusout', () => { heroPaused = false; });
  }
  if (example) nextDemoHero(box);
}
const advKind = a => (/^Possible dangerous goods/.test(a) ? 'Dangerous goods?' : /^By weight/.test(a) ? 'Pallets' : /HS|commodity/i.test(a) ? 'Customs code' : /weight|pallet/i.test(a) ? 'Weight' : 'Note');

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


// Section header in the Night Route style: eyebrow, hairline, optional aside on the right.
function secH(label, aside, cls = '') { return h('div', { class: 'sec ' + cls }, h('span', { class: 'eyebrow' }, label), h('span', { class: 'rule' }), aside ? (aside.nodeType ? aside : h('span', { class: 'aside' }, aside)) : null); }
const failingIds = ev => new Set([...ev.checks.filter(c => c.status === 'fail' || c.status === 'check').map(c => c.id), ...ev.dataIssues.map(d => 'data:' + d.field)]);

// Plain sentences for the most common checks (the card's body and the hint next to its button).
function plainCard(it, ev) {
  const c = it.check; if (!c) return null;
  const b = ev.b, items = (c.items || []).map(sku => b.items.find(x => x.sku === sku)).filter(Boolean), one = items[0];
  const name = x => (x.description || x.sku).toLowerCase();
  switch (c.id) {
    case 'R-01': {
      const sug = one && ((one.hsRec || [])[0] ? one.hsRec[0].code : one.hsSug && one.hsSug.level === 'hs6' ? one.hsSug.codes[0] : null);
      const body = items.length > 1 ? `Customs needs a code with at least 6 digits for every item. ${items.length} items need one.`
        : one && one.hs.blank ? `Customs needs a code for every item.${sug ? ` From the name, ${name(one)} are usually ${sug}.` : ''}`
        : `Customs needs at least 6 digits.${sug ? ` It was probably ${sug}.` : ''}`;
      return { body, hint: sug ? 'Suggested · please double-check' : 'Look it up on the UK Trade Tariff' };
    }
    case 'R-05': { const r = ev.rec; if (!r) return null; const sw = r.fixes.find(f => f.type === 'switch'), o = sw && r.opts.find(x => x.carrier === sw.carrier);
      return { body: `Each pallet weighs ${PF.kg(r.wpp)}, but ${r.chosen.carrier} takes ${r.chosen.maxW} kg at most.`, hint: sw ? `${sw.carrier} takes it · ${PF.gbp(sw.cost)}${o ? ` · ${o.transit} days` : ''}` : 'Use more pallets' }; }
    case 'R-06': return c.status === 'check'
      ? { body: `${items.length === 1 ? one.description : 'Some items'} may contain lithium batteries, sprays or flammable liquids. Please check and confirm.`, hint: 'Add “battery-free” or “non-aerosol” if that’s right' }
      : { body: `${items.length === 1 ? one.description : 'Some items'} can’t travel on these road services — they don’t carry dangerous goods.`, hint: 'Remove it from this shipment' };
    case 'R-08': return { body: 'Warehouses turn away trucks without a booked time slot.', hint: ev.eta ? `Arrives ${PF.fmtDateLong(ev.eta.arrive).replace(/ \d{4}$/, '')}` : '' };
    default: return null;
  }
}
function issueTitle(it, ev) {
  const c = it.check;
  if (!c) return `${it.title} needs fixing`;
  const bad = (c.items || []).map(sku => ev.b.items.find(x => x.sku === sku)).filter(Boolean);
  switch (c.id) {
    case 'R-01': return bad.length === 1 && !bad[0].hs.blank ? 'Customs code too short' : 'Customs code missing';
    case 'R-02': return 'Total value doesn’t match the items';
    case 'R-03': return 'Boxes don’t add up';
    case 'R-04': return 'Box total doesn’t match the items';
    case 'R-05': return ev.rec ? `Too heavy for ${ev.rec.chosen.carrier}` : 'Pallets too heavy';
    case 'R-06': return c.status === 'check' ? 'Might be dangerous goods' : 'Dangerous goods can’t go on this truck';
    case 'R-07': return 'Total weight looks too low';
    case 'R-08': return 'No delivery slot booked';
    case 'R-09': return 'Missing where it was made';
    case 'R-10': return 'Ready date is in the past';
    default: return PLAIN[c.id] || c.rule;
  }
}
function issueItem(it, ev) {
  const c = it.check;
  if (!c) return it.title;
  const skus = c.items || [];
  if (skus.length === 1) { const x = ev.b.items.find(i2 => i2.sku === skus[0]); return x ? words(x.description || x.sku, 3) : skus[0]; }
  if (skus.length > 1) return `${skus.length} items`;
  return PLAIN[c.id] || c.id;
}
function carrierCards(ev, ctx) {
  const rec = ev.rec, b = ev.b, c = rec.chosen;
  const WHY = { Cheapest: 'the lowest price', Fastest: 'the quickest delivery', 'Most reliable': 'the best on-time record', Balanced: 'a good mix of price and speed' };
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'What matters most' }, PF.PRIORITIES.map(p => h('button', { type: 'button', 'aria-pressed': String(rec.priority === p && !rec.overridden), onclick: () => ctx.apply({ patch: { priority: p, carrierOverride: null }, say: `${p.toLowerCase()} please` }) }, p)));
  const by = { Cheapest: (x, y) => x.cost - y.cost || x.transit - y.transit, Fastest: (x, y) => x.transit - y.transit || y.onTime - x.onTime, 'Most reliable': (x, y) => y.onTime - x.onTime || x.transit - y.transit };
  const ranked = [...rec.opts].sort(by[rec.priority] || ((x, y) => (x.carrier === rec.priorityPick.carrier ? -1 : y.carrier === rec.priorityPick.carrier ? 1 : x.cost - y.cost)));
  const cards = h('div', { class: 'ccards' }, ranked.map((o, rank) => {
    const isC = o.carrier === c.carrier, best = o.carrier === rec.priorityPick.carrier;
    const need = rec.wpp != null && o.fits === false && PF.isNum(b.gross) ? Math.ceil(b.gross / o.maxW - 1e-9) : null;
    const pct = rec.wpp != null ? Math.min(100, Math.round(rec.wpp / o.maxW * 100)) : 0;
    return h('div', { class: 'ccard' + (isC ? ' chosen' : '') },
      isC && rec.overridden ? h('span', { class: 'badge' }, 'Your choice') : best ? h('span', { class: 'badge' }, 'Best for you') : null,
      h('span', { class: 'rk' }, `#${rank + 1}`), h('h4', null, o.carrier), h('span', { class: 'svc' }, o.service),
      h('dl', null, h('div', null, h('dt', null, 'Cost'), h('dd', null, PF.gbp(o.cost))), h('div', null, h('dt', null, 'Days'), h('dd', null, String(o.transit))), h('div', null, h('dt', null, 'On time'), h('dd', null, o.onTime + '%'))),
      rec.wpp != null ? h('div', { class: 'meter' + (o.fits === false ? ' no' : '') }, h('i', { style: `width:${pct}%` })) : null,
      rec.wpp != null ? h('p', { class: 'fit ' + (o.fits === false ? 'no' : 'ok') }, o.fits === false ? `✕ Too heavy · max ${o.maxW} kg a pallet` : `✓ Fits · ${Math.round(rec.wpp)} of ${o.maxW} kg a pallet`) : null,
      h('div', { class: 'pick' }, isC && o.fits !== false ? h('span', { class: 'mono chosen-l' }, 'Your carrier')
        : need ? h('button', { class: 'btn tiny', type: 'button', onclick: () => ctx.apply({ patch: { pallets: need, carrierOverride: o.carrier }, say: `make it ${need} pallets${o.carrier !== c.carrier ? ' and use ' + o.carrier.toLowerCase() : ''}` }) }, `Use ${need} pallets · ${PF.gbp(o.price * need)}`)
        : h('button', { class: 'btn tiny', type: 'button', onclick: () => ctx.apply({ patch: { carrierOverride: o.carrier }, say: `switch to ${o.carrier.toLowerCase()}` }) }, 'Choose')));
  }));
  const why = h('p', { class: 'why-line' },
    rec.overridden ? [`You chose `, h('b', null, c.carrier), '. ', h('button', { class: 'linkbtn', type: 'button', onclick: () => ctx.apply({ patch: { carrierOverride: null }, say: 'use the recommended carrier' }) }, 'Use the best match instead')]
      : ['You asked for ', h('b', null, WHY[rec.priority] || rec.priority), '. ', c.fits === false ? `${c.carrier} is the best match, but your pallets are too heavy for it. Pick another carrier or use more pallets.` : `${c.carrier} is the best match${c.fits ? ' and your pallets fit' : ''}.`]);
  return h('section', { class: 'carriers' }, seg, cards, why, h('p', { class: 'note disc' }, PRICE_TXT));
}
function reportEl(ev, ctx) {
  const { b, checks, dataIssues, advisories, warnings = [], status, rec, eta } = ev;
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
        `${checks.filter(c => c.status === 'pass' || c.status === 'na').length} of 10 checks passed`,
      ].filter(Boolean).join(' · '))));

  const issueList = issues.length ? h('ol', { class: 'issues', 'aria-label': 'Things to fix' }, issues.map(it => {
    const acts = it.check ? fixActions(it.check, ev, ctx.mode) : [], br = brief(it, ev);
    const pc = plainCard(it, ev);
    const bodyTxt = pc ? [pc.body] : [br.head, ...(br.lines || [])].filter(x => typeof x === 'string');
    const nodeLines = pc ? [] : (br.lines || []).filter(x => typeof x !== 'string');
    const hint = pc ? pc.hint : br.line || (!acts.length && it.fix ? words(firstPart(it.fix), 14) : '');
    return h('li', { class: 'issue s-' + it.sev },
      h('div', { class: 'top2' }, h('span', { class: 'sev' }, SEV_WORD[it.sev]), h('span', { class: 'item' }, issueItem(it, ev))),
      h('h4', null, issueTitle(it, ev)),
      h('p', { class: 'body' }, bodyTxt.join('. ').replace(/\.\./g, '.')),
      ...nodeLines.map(n => h('p', { class: 'body' }, n)),
      h('div', { class: 'foot' }, h('small', null, hint || ''), acts.length ? h('span', { class: 'acts' }, acts.map((x, k) => h('button', { class: 'btn small' + (k ? ' ghost' : ''), type: 'button', onclick: () => ctx.apply(x) }, x.label))) : null));
  })) : null;

  const okNames = passed.map(c => (PLAIN[c.id] || c.id).toLowerCase());
  const passedEl = issues.length
    ? h('p', { class: 'okline' }, h('b', null, '✓ '), `Everything else looks good: ${okNames.slice(0, -1).join(', ')}${okNames.length > 1 ? ' and ' : ''}${okNames.slice(-1)}.`, cannot.length ? ` ${cannot.length} check${cannot.length === 1 ? '' : 's'} couldn’t run yet.` : '')
    : h('p', { class: 'okline' }, h('b', null, '✓ '), `All ${passed.length} checks look good.`, cannot.length ? ` ${cannot.length} couldn’t run yet.` : '');

  const advActs = hsAdvActs(ev);
  // Dangerous-goods advisories in plain words (the engine text stays under "Why").
  const dgPlain = txt => { const m = /— (\S+) \(“([^”]*)”\) may be ADR class [^ ]+ ([^(]+?) \(matched/.exec(txt); if (!m) return null; const it2 = b.items.find(x => x.sku === m[1]); const adr = it2 ? (PF.scanDG(`${it2.description} ${it2.sku}`).adr[0] || {}) : {}; return `${m[2]} may count as dangerous goods on the road (${m[3].trim()}). ${adr.ok || ''} Otherwise ask your supplier for the safety data sheet, or check with the carrier.`; };
  const adv = advisories.length ? h('section', { class: 'advisories' }, secH('Good to know', 'doesn’t block your booking', 'adv'), h('div', { class: 'advlist' }, advisories.map(a => h('div', { class: 'advcard' }, h('span', { class: 'adv-tag' }, advKind(dgPlain(a) ? [dgPlain(a), h('details', { class: 'why' }, h('summary', null, 'Why'), h('p', null, a))] : a)), h('div', null, a)))),
    advActs.length ? h('div', { class: 'fix-acts' }, advActs.map(a => h('button', { class: 'btn small', type: 'button', onclick: () => ctx.apply(a) }, a.label))) : null) : null;

  const warnEl = warningsEl(warnings);

  const carrierEl = rec ? carrierCards(ev, ctx) : null;

  const conf = PF.confirmation(ev, ctx.reviewedCount ? ctx.reviewedCount(ev) : 0);
  const unrev = conf ? conf.lines.find(l => /not yet reviewed/.test(l)) : null;
  const confEl = conf ? h('div', { class: 'confcard2' },
    h('p', { class: 'ch', style: 'color:var(--ink);margin:0' }, conf.head),
    conf.lines.filter(l => l !== unrev).map(l => h('p', null, l)),
    unrev ? h('p', { class: 'warnline' }, `Please check the ${unrev.match(/^\d+/)[0]} value${/^1 /.test(unrev) ? '' : 's'} we tidied up.`) : null,
    eta && eta.bufferDays ? h('p', null, `No warehouse slot yet, so ${eta.bufferDays} days are added to the delivery estimate.`) : null,
    h('p', { class: 'nx' }, 'What happens next'),
    h('ol', null, conf.next.map(n => h('li', null, n)))) : null;

  const lines = b.items.map(it => (PF.isNum(it.qty) && PF.isNum(it.price) ? it.qty * it.price : null));
  const inv = ctx.mode === 'file' && b.items.length ? h('details', { class: 'invoice' }, h('summary', null, 'Items and customs codes'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'itable' },
      h('thead', null, h('tr', null, ['SKU', 'Description', 'HS code', 'Origin', 'Qty', 'Unit', 'Line total', 'Packing', 'kg/unit'].map((x, i) => h('th', { class: i >= 4 ? 'num' : '' }, x)))),
      h('tbody', null, b.items.map((it, i) => h('tr', null, h('td', null, it.sku), h('td', null, it.description || '—'), hsCell(it), h('td', { class: it.coo ? '' : 'bad' }, it.coo || 'missing'), h('td', { class: 'num' }, PF.fmtNum(it.qty)), h('td', { class: 'num' }, PF.gbp(it.price)), h('td', { class: 'num' }, PF.gbp(lines[i])), h('td', { class: 'num' }, `${PF.fmtNum(it.upc)} × ${PF.fmtNum(it.cartons)} ctn`), h('td', { class: 'num' }, PF.fmtNum(it.unitWeight, 3))))),
      h('tfoot', null, h('tr', null, h('td', { colspan: 6 }, 'Total of lines · declared on booking'), h('td', { class: 'num' }, lines.every(x => x != null) ? PF.gbp(lines.reduce((a, c2) => a + c2, 0)) : '—', h('br'), h('small', null, PF.gbp(b.declared))), h('td', { colspan: 2 })))))) : null;

  const stamp = hsStamp() ? h('p', { class: 'note hsstamp' }, hsStamp()) : null;
  const hist = ctx.history ? historyEl(ctx.history(ev), 'What changed') : null;
  const fixedN = ctx.fixedCount ? ctx.fixedCount(ev) : 0;
  const tally = h('div', { class: 'tally' }, h('span', null, 'Must fix ', h('b', null, String(nRed))), h('span', null, 'Check ', h('b', null, String(nAmb))), h('span', null, 'Fixed ', h('b', null, String(fixedN))));
  return h('div', { class: 'report' },
    secH('Your check', 'updates every time you change something'), head,
    reviewEl(ev, ctx),
    issues.length ? secH('Things to fix', tally) : null, issueList, passedEl,
    warnEl, adv,
    rec ? secH('Choose your carrier', `${PF.isNum(b.pallets) ? PF.fmtNum(b.pallets) + ' pallet' + (b.pallets === 1 ? '' : 's') : ''}${PF.isNum(b.gross) ? ' · ' + PF.kg(b.gross) : ''} · ${b.originCity || '?'} → ${b.destCity || '?'}`) : null, carrierEl,
    confEl ? secH('Ready to book?') : null, confEl,
    inv, ctx.mode === 'file' ? stamp : null,
    hist ? h('div', { class: 'histcard' }, hist) : null);
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
function bubble(role, ...kids) { const b = h('div', { class: 'msg ' + role }, ...kids); log.append(b); log.scrollTop = log.scrollHeight; return b; }
function chipsEl(chips, cls = '') { return h('div', { class: 'chips ' + cls }, chips.map(c => h('button', { class: 'chip', type: 'button', onclick: () => send(c === 'Don’t know' ? "don't know" : c) }, c))); }
function clearChips() { log.querySelectorAll('.chips.live').forEach(c => c.remove()); }
function greet() {
  log.innerHTML = '';
  // Interactive intro: phrases and cities write into the message box; nothing is sent until the seller presses Send.
  const input = $('#chat-input');
  const pick = { from: null, to: null };
  const ORIGINS = ['London', 'Manchester', 'Birmingham', 'Leeds'];
  const DESTS_BY = [['Germany', ['Berlin', 'Frankfurt', 'Hamburg']], ['France', ['Paris', 'Lyon']], ['Netherlands', ['Amsterdam', 'Rotterdam']]];
  const add = text => { const v = input.value.trim().replace(/[,.\s]+$/, ''); input.value = v ? `${v}, ${text}` : text.charAt(0).toUpperCase() + text.slice(1); input.focus(); input.dispatchEvent(new Event('input')); };
  const routeRe = /,?\s*\b(?:[Ss]hip\s+)?from\s+(?:London|Manchester|Birmingham|Leeds)(?:\s+to\s+(?:Berlin|Frankfurt|Hamburg|Paris|Lyon|Amsterdam|Rotterdam))?|,?\s*\bto\s+(?:Berlin|Frankfurt|Hamburg|Paris|Lyon|Amsterdam|Rotterdam)\b/g;
  const writeRoute = () => {
    const base = input.value.replace(routeRe, '').trim().replace(/^[,\s]+/, '');
    const phrase = pick.from && pick.to ? `ship from ${pick.from} to ${pick.to}` : pick.from ? `ship from ${pick.from}` : pick.to ? `ship to ${pick.to}` : '';
    input.value = base; if (phrase) add(phrase); else input.focus();
    box.querySelectorAll('button[data-city]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.city === pick[b.dataset.role])));
  };
  const city = (name, role) => h('button', { class: 'chip city', type: 'button', 'data-city': name, 'data-role': role, 'aria-pressed': 'false', onclick: () => { pick[role] = pick[role] === name ? null : name; writeRoute(); } }, name);
  const phrase = (label, text, title) => h('button', { class: 'ilink', type: 'button', title, onclick: () => add(text) }, label);
  const box = h('div', { class: 'intro' },
    h('p', null, 'Describe your shipment the way you’d tell a colleague — ',
      phrase('what you’re sending', '240 ceramic mugs at £5 each, 12 per carton, 0.5 kg each', 'Add an example item'), ', ',
      phrase('where from and to', 'ship from Manchester to Berlin', 'Add an example route'), ', ',
      phrase('how many pallets', 'on 2 pallets', 'Add a pallet count'),
      '. I’ll ask only for what’s missing, then run the ten pre-flight checks and recommend a carrier.'),
    h('p', { class: 'mini-h' }, 'Routes — tap to add to your message'),
    h('div', { class: 'route-pick' },
      h('div', { class: 'rp-row' }, h('span', { class: 'rp-lab' }, 'From'), ORIGINS.map(c => city(c, 'from'))),
      h('div', { class: 'rp-row' }, h('span', { class: 'rp-lab' }, 'To'), DESTS_BY.map(([country, cs]) => h('span', { class: 'rp-group', title: country }, cs.map(c => city(c, 'to')))))));
  bubble('bot', box);
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
  if (reply.intent === 'reset') { chatDb = null; chatSaved = ''; renderSheet(); bubble('bot', h('p', null, reply.ask)); return; }
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
    parts.push(miniVerdict(ev, reply.priceNote, reply.asked));
    noteCorrections(ev, { chat: true });
    (reply.accepted || []).forEach(c => logEvent({ booking: 'CHAT', sku: c.sku || '', field: c.label, before: shown(c.entered), after: c.used, action: 'accepted', chat: true }));
    if (reply.corrections && reply.corrections.length) parts.push(h('div', { class: 'got' }, h('p', { class: 'mini-h' }, 'I filled in or tidied these — please check'),
      h('ul', null, reply.corrections.map(c => h('li', null, `${c.sku ? c.label + ' (' + c.sku + ')' : c.label}: ${shown(c.entered)} → ${c.used} (${c.why})`)))));
    if (reply.intent === 'confirm-blocked') parts.push(h('p', { class: 'note-warn' }, `I can’t confirm while there ${ev.reds === 1 ? 'is 1 red issue' : 'are ' + ev.reds + ' red issues'} — red means the shipment would be stopped. Fix ${ev.reds === 1 ? 'it' : 'them'} (the buttons in the report do most of it) and say “confirm” again.`));
    if (reply.intent === 'confirmed') parts.push(confCard(ev, reply.ref));
    if (reply.intent !== 'confirmed') chips = ev.status === 'Red' ? ['What’s wrong?'] : ev.status === 'Amber' ? ['Confirm booking', 'What’s wrong?'] : ['Confirm booking']; // nothing to ask about when every check passed
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
// Road-freight warnings (bans, permits, ADR limits): advisory only, shown with a small ⚠.
const warnIcon = () => h('span', { class: 'warn-ico', role: 'img', 'aria-label': 'Warning' }, '⚠');
function warningsEl(warnings) {
  if (!warnings.length) return null;
  return h('section', { class: 'warnings' },
    h('div', { class: 'sec-h' }, h('h3', null, warnIcon(), ' Road-freight warnings'), h('span', { class: 'muted' }, 'doesn’t block your booking — check before you ship')),
    h('div', { class: 'warnlist' }, warnings.map(w => h('div', { class: 'warncard k-' + w.kind },
      h('span', { class: 'warn-tag' }, warnIcon(), ' ', w.title),
      h('p', null, w.text),
      h('p', { class: 'warn-fix' }, h('b', null, 'What to do: '), w.fix),
      h('p', { class: 'warn-ref' }, w.ref)))));
}
// "What's wrong?": each problem in plain words, with its one-click fixes as chips.
function problemList(ev) {
  const fails = ev.checks.filter(c => c.status === 'fail' || c.status === 'check');
  const issues = [
    ...ev.dataIssues.map(d => ({ kind: 'data', sev: d.sev, title: d.field, detail: d.text, fix: d.fix })),
    ...fails.map(c => ({ kind: 'rule', sev: c.status === 'check' ? 'Amber' : c.sev, id: c.id, title: c.rule, detail: c.detail, fix: c.fix, check: c })),
  ].sort((a, z) => (a.sev === z.sev ? 0 : a.sev === 'Red' ? -1 : 1));
  if (!issues.length) return h('p', null, 'Nothing to fix — every check passed.');
  return h('ol', { class: 'plist' }, issues.map(it => {
    const pc = plainCard(it, ev), br = brief(it, ev);
    const body = pc ? pc.body : [br.head, ...(br.lines || [])].filter(x => typeof x === 'string').join('. ');
    const hint = pc ? pc.hint : br.line || (it.fix ? words(firstPart(it.fix), 14) : '');
    const acts = it.check ? fixActions(it.check, ev, 'chat') : [];
    return h('li', { class: 's-' + it.sev },
      h('b', null, issueTitle(it, ev)), h('span', { class: 'sevw' }, ` · ${SEV_WORD[it.sev]}`), h('br'),
      h('span', null, body), hint ? h('span', { class: 'muted' }, ` ${hint}.`.replace(/\.\.$/, '.')) : null,
      acts.length ? h('div', { class: 'chips' }, acts.map(a => h('button', { class: 'chip', type: 'button', onclick: () => chatCtx.apply(a) }, a.label))) : null);
  }));
}
function miniVerdict(ev, priceNote, asked) {
  const n = [ev.reds ? `${ev.reds} must fix` : null, ev.ambers ? `${ev.ambers} to check` : null].filter(Boolean).join(' · ') || 'nothing to fix';
  return h('div', { class: 'mini v-' + ev.status },
    h('p', null, h('span', { class: 'ministamp' }, STAMP[ev.status]), ' ', `All checked — ${n}.`),
    ev.warnings && ev.warnings.length ? h('p', { class: 'mini-warn' }, warnIcon(), ` ${ev.warnings.length} road-freight warning${ev.warnings.length === 1 ? '' : 's'} — ${[...new Set(ev.warnings.map(w => w.title))].join(' · ')}.`) : null,
    asked ? problemList(ev) : null,
    h('p', { class: 'muted' }, asked ? 'Every detail is in your full check below.' : 'Your full check is below.'),
    ev.rec && priceNote ? h('p', { class: 'note' }, PRICE_TXT) : null,
    h('button', { class: 'linkbtn only-narrow', type: 'button', onclick: () => ($('#chat-report .report') || $('#sheet')).scrollIntoView({ behavior: 'smooth' }) }, 'See your check ↓'));
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
let chatBase = null;
const chatCtx = { mode: 'chat', fixedCount: ev => (chatBase ? chatBase.filter(id => !failingIds(ev).has(id)).length : 0), apply: a => send(a.say), review: chatReview, reviewedCount: ev => ev.corrections.filter(c => cs.reviewed && cs.reviewed[c.id]).length, history: () => audit.filter(e => e.chat) };

function renderSheet() {
  const s = $('#sheet'); s.innerHTML = '';
  const b = cs.booking; const t = C.totals(b); const pend = cs.pending;
  const F = (key, label, val, derived) => h('div', { class: 'cell' + (val == null ? ' empty' : '') + (pend && pend.field === key && pend.item == null ? ' asking' : '') },
    h('span', { class: 'lab' }, label), h('span', { class: 'val' }, val == null ? 'needed' : val, derived ? h('span', { class: 'calc', title: 'Worked out from the items' }, 'calc') : null));
  const cartons = b.cartonsStated ? b.cartons : t.cartons; const declared = b.declaredStated ? b.declared : t.value;
  s.append(h('div', { class: 'sheet-head' }, h('h2', null, 'Booking sheet'), h('span', { class: 'muted' }, cs.confirmed ? 'Confirmed · ' + cs.confirmed : cs.complete ? 'Complete' : `${C.missing(cs).length} detail${C.missing(cs).length === 1 ? '' : 's'} to go`, cs.complete ? [' ', saveNote('chat')] : null)));
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
  saveChat();
  setHero('chat', cs.complete ? ev : null, 'Your booking');
  const cr = $('#chat-report'); if (cr) { cr.innerHTML = ''; if (cs.complete) { if (!chatBase) chatBase = [...failingIds(ev)]; cr.append(reportEl(ev, chatCtx)); } else chatBase = null; }
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
$('#chat-reset').addEventListener('click', () => { cs = C.newState(); chatDb = null; chatSaved = ''; greet(); renderSheet(); $('#chat-input').focus(); });

// ---------- FILE ----------
// Two lists share this UI: the uploaded file and the saved bookings. V is the one being drawn.
// data: {bookings, notices, expected, name, baseline, db?}; ov: bookingIndex -> {patch, items:{i:{}}}; rv: bookingIndex -> reviewed corrections.
const newView = (name, out) => ({ name, out, data: null, ov: {}, rv: {}, filter: 'All', source: 'All', openRow: null });
const views = { file: newView('file', '#file-results'), bookings: newView('bookings', '#bookings-results') };
let V = views.file;
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
  ingest(all, names.join(' + '), { save: true });
}
function ingest(sheets, name, opts = {}) {
  const v = views.file;
  const parsed = PF.parseSheets(sheets, { skipExample: $('#skip-ex').checked });
  v.data = { ...parsed, expected: readExpected(sheets), name, sheets };
  v.data.baseline = v.data.bookings.map(b => PF.evaluate(b, { today: PF.todayISO() }));
  v.ov = {}; v.rv = {}; v.openRow = null; v.filter = 'All';
  clearAudit('file');
  delete saveState.file;
  // Uploaded files go to the shared bookings list; the built-in sample and demo files don't.
  if (opts.save && v.data.bookings.length) {
    const uploadId = uuid();
    v.data.db = v.data.bookings.map(() => ({ id: uuid(), source: 'file', upload_id: uploadId, file_name: name }));
    saveRows(v, v.data.bookings.map((b, i) => i));
  }
  renderFile(v);
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
  const fileData = V.data;
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
function evalAll(v = V) { return v.data.bookings.map((b, i) => ({ i, raw: b, ev: PF.evaluate(applyOv(b, v.ov[i]), { today: PF.todayISO() }), edited: !!v.ov[i] })); }
function toReview(r, v = V) { return r.ev.corrections.filter(c => !(v.rv[r.i] || {})[c.id]).length; }
function logFix(r, a) {
  const b = r.ev.b; const cur = k => (k === 'carrierOverride' ? (r.ev.rec ? r.ev.rec.chosen.carrier : '') : k === 'ready' ? PF.fmtDate(b.ready) : b[k]);
  if (a.patch) Object.entries(a.patch).forEach(([k, v]) => logEvent({ booking: b.id, field: FIELD_LABEL[k] || k, before: shown(cur(k)), after: v == null ? '(recommended)' : String(v), action: 'fix applied' }));
  if (a.itemPatch) { const it = b.items[a.itemPatch.i] || {}; Object.entries(a.itemPatch.f).forEach(([k, v]) => logEvent({ booking: b.id, sku: it.sku || '', field: FIELD_LABEL[k] || k, before: shown(k === 'hs' ? (it.hs && it.hs.raw) : it[k]), after: String(v), action: 'fix applied' })); }
}
function fileReview(r, getCtx, v = V) {
  const reviews = v.rv, renderFile = () => renderView(v);
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
function renderFile(v = V) { renderView(v); }
const SRC_LABEL = { All: 'All sources', chat: 'Chat', file: 'Files' };
function renderView(v) {
  V = v;
  const out = $(v.out); out.innerHTML = '';
  const fileData = v.data;
  if (!fileData) return;
  const all = evalAll(v);
  all.forEach(r => noteCorrections(r.ev));
  // Saved bookings: rows can also be narrowed to chat or file bookings; the counts follow that choice.
  const src = r => (fileData.db && fileData.db[r.i] ? fileData.db[r.i].source : 'file');
  const rows = v.name === 'bookings' && v.source !== 'All' ? all.filter(r => src(r) === v.source) : all;
  const cnt = s => rows.filter(r => r.ev.status === s).length;
  out.append(h('div', { class: 'file-head' },
    h('div', null, h('h2', null, v.name === 'bookings' ? `${rows.length} saved booking${rows.length === 1 ? '' : 's'}` : `${rows.length} booking${rows.length === 1 ? '' : 's'} checked`), h('p', { class: 'muted' }, fileData.name, ' ', v.name !== 'bookings' && !all.length ? h('span', { class: 'savenote s-error' }, '· No bookings identified') : saveNote(v))),
    h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by status' }, ['All', 'Red', 'Amber', 'Green', 'Review', 'Advisory'].map(s => h('button', { type: 'button', class: 'fbtn f-' + s, 'aria-pressed': String(v.filter === s), onclick: () => { v.filter = s; renderView(v); } }, `${({ All: 'All', Red: 'Must fix', Amber: 'Check', Green: 'Ready', Review: 'To check', Advisory: 'Good to know' })[s]} ${s === 'All' ? rows.length : s === 'Review' ? rows.filter(r => toReview(r, v)).length : s === 'Advisory' ? rows.filter(r => r.ev.advisories.length + (r.ev.warnings || []).length).length : cnt(s)}`))),
    h('button', { class: 'btn', type: 'button', onclick: () => { V = v; exportResults(); }, disabled: !rows.length }, 'Export results (.xlsx)')));
  if (v.name === 'bookings') out.append(h('div', { class: 'filters srcf', role: 'group', 'aria-label': 'Filter by source' }, ['All', 'chat', 'file'].map(s => h('button', { type: 'button', class: 'fbtn', 'aria-pressed': String(v.source === s), onclick: () => { v.source = s; v.openRow = null; renderView(v); } }, `${SRC_LABEL[s]} ${s === 'All' ? all.length : all.filter(r => src(r) === s).length}`))));
  fileData.notices.forEach(n => out.append(h('p', { class: 'notice n-' + n.level }, n.text)));
  if (!all.length) { out.append(h('p', { class: 'note-warn' }, v.name === 'bookings' ? 'No saved bookings yet. Book by chat or upload a sheet, and they appear here.' : 'No bookings identified. Check the file has a Bookings sheet with at least one booking under its header row.')); return; }
  out.append(outcomesPanel().update(all));
  const exp = null; // expected-results comparison is not shown in the simplified UI
  { const openR = rows.find(r2 => r2.i === v.openRow); setHero(v.name, openR ? openR.ev : null, openR ? openR.ev.b.id : ''); }
  const tbody = h('tbody');
  rows.filter(r => v.filter === 'All' || (v.filter === 'Review' ? toReview(r, v) > 0 : v.filter === 'Advisory' ? r.ev.advisories.length + r.ev.warnings.length > 0 : r.ev.status === v.filter)).forEach(r => {
    const { ev } = r; const b = ev.b;
    const flagged = [...ev.checks.filter(c => c.status === 'fail' || c.status === 'check').map(c => ({ t: PLAIN[c.id] || c.id, s: c.status === 'check' ? 'Amber' : c.sev })), ...(ev.dataIssues.length ? [{ t: `Booking details ×${ev.dataIssues.length}`, s: ev.dataIssues.some(d => d.sev === 'Red') ? 'Red' : 'Amber' }] : [])];
    const e = exp && exp[b.id.toUpperCase()];
    const open = v.openRow === r.i;
    const dbr = v.name === 'bookings' && fileData.db ? fileData.db[r.i] : null;
    const tr = h('tr', { class: 'brow' + (open ? ' open' : ''), tabindex: 0, 'aria-expanded': open, onclick: () => { v.openRow = open ? null : r.i; renderView(v); }, onkeydown: ev2 => { if (ev2.key === 'Enter' || ev2.key === ' ') { ev2.preventDefault(); v.openRow = open ? null : r.i; renderView(v); } } },
      h('td', null, h('span', { class: 'chev', 'aria-hidden': 'true' }, open ? '▾' : '▸'), b.id, r.edited ? h('span', { class: 'tag ghost' }, 'edited') : null,
        dbr ? h('small', { class: 'src', title: dbr.source === 'chat' ? 'Booked by chat' : `Uploaded in ${dbr.file_name || 'a file'}` }, `${dbr.source === 'chat' ? 'Chat' : dbr.file_name || 'File'} · ${savedAt(dbr.updated_at)}`) : null),
      h('td', null, b.seller || '—'),
      h('td', null, `${b.originCity || '?'} → ${b.destCity || '?'}`),
      h('td', null, h('span', { class: 'pill p-' + ev.status }, ({ Red: 'Must fix', Amber: 'Check', Green: 'Ready' })[ev.status])),
      h('td', null, flagged.length ? flagged.map(f => h('span', { class: 'rchip s-' + f.s }, f.t)) : (ev.advisories.length + (ev.warnings || []).length ? null : h('span', { class: 'muted' }, 'none')), ev.warnings.length ? h('span', { class: 'rchip s-Warn', title: ev.warnings.map(w => `${w.title}: ${w.sku}`).join('\n') }, warnIcon(), ` ${ev.warnings.length}`) : null, ev.advisories.length + (ev.warnings || []).length ? h('span', { class: 'rchip s-Adv', title: 'Doesn’t block the booking' }, 'Good to know') : null),
      h('td', null, !ev.rec ? '—' : ev.rec.chosen.fits === false && ev.rec.fixes.length ? h('span', null, h('s', { class: 'muted' }, ev.rec.chosen.carrier), ' → ', `${ev.rec.fixes[0].carrier}${ev.rec.fixes[0].type === 'repack' ? ` on ${ev.rec.fixes[0].pallets} plt` : ''} · ${PF.gbp(ev.rec.fixes[0].cost)}`) : `${ev.rec.chosen.carrier} · ${PF.gbp(ev.rec.chosen.cost)}`),
      h('td', { class: 'num' }, toReview(r, v) || ''),
      exp ? h('td', null, e ? h('span', { class: String(e.status).toLowerCase() === ev.status.toLowerCase() ? 'match' : 'mismatch', title: e.rules || '' }, String(e.status).toLowerCase() === ev.status.toLowerCase() ? `✓ ${e.status}` : `✕ expected ${e.status}`) : '—') : null);
    tbody.append(tr);
    if (open) {
      const ctx = { mode: 'file', apply: a => { if (a.audit !== false) logFix(r, a); const o = v.ov[r.i] = v.ov[r.i] || { patch: {}, items: {} }; if (a.patch) Object.assign(o.patch, a.patch); if (a.itemPatch) o.items[a.itemPatch.i] = { ...(o.items[a.itemPatch.i] || {}), ...a.itemPatch.f }; saveRows(v, [r.i]); renderView(v); },
        fixedCount: e2 => { const base = failingIds(PF.evaluate(r.raw, { today: PF.todayISO() })); const now = failingIds(e2); return [...base].filter(id => !now.has(id)).length; },
        review: fileReview(r, () => ctx, v), reviewedCount: e2 => e2.corrections.filter(c => (v.rv[r.i] || {})[c.id]).length,
        history: () => audit.filter(e2 => e2.view === v.name && e2.booking === r.ev.b.id) };
      tbody.append(h('tr', { class: 'detail' }, h('td', { colspan: exp ? 8 : 7 },
        r.edited ? h('p', { class: 'edited-note' }, 'You’ve applied fixes here — the report shows the corrected booking. ', h('button', { class: 'linkbtn', type: 'button', onclick: () => { logEvent({ booking: b.id, field: 'All fixes and reviews', before: 'edited', after: 'as uploaded', action: 'fixes undone' }); delete v.ov[r.i]; delete v.rv[r.i]; saveRows(v, [r.i]); renderView(v); } }, 'Undo my fixes')) : null,
        reportEl(r.ev, ctx))));
    }
  });
  out.append(h('div', { class: 'tablewrap' }, h('table', { class: 'btable' },
    h('thead', null, h('tr', null, h('th', null, 'Booking'), h('th', null, 'Seller'), h('th', null, 'Route'), h('th', null, 'Status'), h('th', null, 'Issues'), h('th', null, 'Carrier'), h('th', { class: 'num' }, 'To check'), exp ? h('th', null, 'Expected') : null)), tbody)));
  out.append(historyEl(audit.filter(e2 => e2.view === v.name), 'Audit trail') || h('p', { class: 'muted' }, 'Audit trail: no changes yet.'));
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
    (ev.warnings || []).forEach(w => iss.push([b.id, 'Warning', w.title, w.text, `${w.fix} (${w.ref})`]));
  });
  const wb = XLSX.utils.book_new();
  const s1 = XLSX.utils.aoa_to_sheet(sum); s1['!cols'] = [10, 22, 24, 12, 8, 9, 10, 22, 26, 10, 10, 12, 12, 10, 10].map(w => ({ wch: w }));
  const s2 = XLSX.utils.aoa_to_sheet(iss); s2['!cols'] = [10, 9, 40, 70, 70].map(w => ({ wch: w }));
  const cor = [['Time', 'Booking', 'SKU', 'Field', 'Before', 'After', 'By', 'Action'], ...audit.filter(e => e.view === V.name).map(e => [e.at, e.booking, e.sku, e.field, e.before, e.after, e.by, e.action])];
  const s3 = XLSX.utils.aoa_to_sheet(cor); s3['!cols'] = [22, 10, 10, 24, 22, 22, 8, 16].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, s1, 'Summary'); XLSX.utils.book_append_sheet(wb, s2, 'Issues'); XLSX.utils.book_append_sheet(wb, s3, 'Corrections');
  await saveFile('cargopass-results.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}
const drop = $('#drop'); const finput = $('#file-input');
finput.addEventListener('change', () => { if (finput.files.length) loadFiles([...finput.files]); finput.value = ''; });
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) loadFiles([...e.dataTransfer.files]); });
function sampleBuf() { const bin = atob(window.SAMPLE_XLSX_B64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
$('#load-sample').addEventListener('click', () => { const wb = XLSX.read(sampleBuf(), { type: 'array' }); ingest(sheetsFromWorkbook(wb, 'CargoPass_Test_Cases.xlsx'), 'Sample: CargoPass_Test_Cases.xlsx (25 test bookings)'); });
$('#dl-sample').addEventListener('click', () => saveFile('CargoPass_Test_Cases.xlsx', sampleBuf()));
function demoBuf() { const bin = atob(window.DEMO_XLSX_B64 || ''); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
$('#load-demo').addEventListener('click', () => { const wb = XLSX.read(demoBuf(), { type: 'array' }); ingest(sheetsFromWorkbook(wb, 'CargoPass_Demo_Bookings.xlsx'), 'Demo: 12 bookings across every route'); });
$('#dl-demo').addEventListener('click', () => saveFile('CargoPass_Demo_Bookings.xlsx', demoBuf()));
$('#skip-ex').addEventListener('change', () => { const d = views.file.data; if (d) ingest(d.sheets, d.name, { save: false }); });

// ---------- SAVED BOOKINGS (shared list in the database, through /api/bookings) ----------
const API = 'api/bookings';
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const savedAt = iso => { if (!iso) return ''; const d = new Date(iso), p2 = n => String(n).padStart(2, '0'); return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const inflight = new Set();
// The row the database keeps: what was entered, the fixes on top, and the result of checking it.
function savedRow(meta, original, ov) {
  const cur = applyOv(original, ov || null);
  const ev = PF.evaluate(cur, { today: PF.todayISO() }); const c = ev.rec && ev.rec.chosen;
  return { id: meta.id, source: meta.source, booking_id: String(cur.id || '(no ID)').trim().slice(0, 80) || '(no ID)', upload_id: meta.upload_id || null, file_name: meta.file_name || null,
    original, overrides: ov || null, current: cur, status: ev.status, carrier: c ? c.carrier : null, cost: c ? c.cost : null };
}
async function postRows(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookings: rows.slice(i, i + 500) }) });
    if (!r.ok) { let msg = `error ${r.status}`; try { msg = (await r.json()).error || msg; } catch (e) {} throw new Error(msg); }
  }
}
// Save state per list ('file', 'bookings', 'chat'), shown next to the list's name.
const saveState = {};
function saveNote(key) { const st = saveState[key.name || key]; return h('span', { class: 'savenote s-' + (st ? st.state : 'none'), 'data-save': key.name || key }, saveText(st)); }
function saveText(st) { return !st ? '' : st.state === 'saving' ? '· Saving…' : st.state === 'saved' ? '· Saved to Bookings' : `· Not saved (${st.msg}) — it will try again with your next change`; }
function setSave(key, state, msg) { saveState[key] = { state, msg }; document.querySelectorAll(`[data-save="${key}"]`).forEach(el => { el.className = 'savenote s-' + state; el.textContent = saveText(saveState[key]); }); }
function track(key, p) { inflight.add(p); setSave(key, 'saving'); p.then(() => setSave(key, 'saved'), e => setSave(key, 'error', e.message || 'offline')).finally(() => inflight.delete(p)); return p; }
// Rows of a list waiting to be saved; changes within 300 ms go up together. Rows that failed stay queued for the next try.
const pending = { file: new Set(), bookings: new Set() }; const timers = {};
function saveRows(v, idxs) {
  if (!v.data || !v.data.db) return;
  idxs.forEach(i => pending[v.name].add(i));
  clearTimeout(timers[v.name]);
  timers[v.name] = setTimeout(() => {
    const data = v.data, idx = [...pending[v.name]]; pending[v.name].clear();
    const rows = idx.map(i => savedRow(data.db[i], data.bookings[i], v.ov[i]));
    track(v.name, postRows(rows)).catch(() => { if (v.data === data) idx.forEach(i => pending[v.name].add(i)); });
  }, 300);
}
// A chat booking is saved once every detail is in, and again after every change (its original follows the conversation).
let chatDb = null, chatSaved = '';
function saveChat() {
  if (!cs.complete) return;
  chatDb = chatDb || { id: uuid(), source: 'chat' };
  const raw = C.toRaw(cs, cs.confirmed || 'CHAT-' + chatDb.id.slice(0, 6).toUpperCase());
  const row = savedRow(chatDb, JSON.parse(JSON.stringify(raw)), null);
  const key = JSON.stringify(row); if (key === chatSaved) return;
  track('chat', postRows([row])).then(() => { chatSaved = key; }, () => {});
}
async function loadSaved() {
  const v = views.bookings, out = $(v.out);
  if (!v.data) { out.innerHTML = ''; out.append(h('p', { class: 'muted' }, 'Loading saved bookings…')); }
  await Promise.allSettled([...inflight]);
  let res;
  try { const r = await fetch(API, { cache: 'no-store' }); res = await r.json(); if (!r.ok) throw new Error(res.error || `error ${r.status}`); }
  catch (e) { out.innerHTML = ''; out.append(h('p', { class: 'note-warn' }, `Couldn’t load saved bookings: ${e.message}. `, h('button', { class: 'linkbtn', type: 'button', onclick: loadSaved }, 'Try again'))); return; }
  const rows = res.bookings || [];
  const keepOpen = v.data && v.openRow != null && v.data.db[v.openRow] ? v.data.db[v.openRow].id : null;
  v.data = { bookings: rows.map(r => r.original), notices: [], expected: null,
    name: `Shared list · newest first${rows.length >= res.limit ? ` · latest ${res.limit}` : ''}`,
    db: rows.map(r => ({ id: r.id, source: r.source, upload_id: r.upload_id, file_name: r.file_name, updated_at: r.updated_at })) };
  v.data.baseline = v.data.bookings.map(b => PF.evaluate(b, { today: PF.todayISO() }));
  v.ov = {}; rows.forEach((r, i) => { if (r.overrides) v.ov[i] = r.overrides; });
  v.rv = {}; pending.bookings.clear(); clearAudit('bookings');
  v.openRow = keepOpen ? v.data.db.findIndex(d => d.id === keepOpen) : null; if (v.openRow < 0) v.openRow = null;
  if ((location.hash.slice(1) || 'chat') === 'bookings') renderView(v);
}
$('#bookings-refresh').addEventListener('click', loadSaved);

// ---------- RULES ----------
function renderRules() {
  const R = $('#rules-body'); R.innerHTML = '';
  const CHECKS = [
    ['Every item has a customs code (at least 6 digits)', 'Red'], ['The total value matches the items', 'Red'], ['Units per box × boxes equals the quantity', 'Red'],
    ['The box total matches the items', 'Red'], ['Pallets aren’t too heavy for the carrier', 'Red'], ['No lithium batteries, sprays or flammable liquids', 'Red'],
    ['Total weight isn’t less than the goods', 'Amber'], ['Warehouse deliveries have a time slot', 'Amber'], ['Every item says where it was made', 'Amber'], ['The ready date isn’t in the past', 'Amber'],
  ];
  R.append(h('div', { class: 'steps' },
    h('div', { class: 'step' }, h('span', { class: 'n' }, '01'), h('h4', null, 'Tell us about it'), h('p', null, 'Write it the way you’d say it, or drop in your booking sheet. We only ask for what’s missing.')),
    h('div', { class: 'step' }, h('span', { class: 'n' }, '02'), h('h4', null, 'We check it'), h('p', null, 'Ten checks run straight away: codes, value, boxes, weight, dangerous goods, dates and more.')),
    h('div', { class: 'step' }, h('span', { class: 'n' }, '03'), h('h4', null, 'Fix and book'), h('p', null, 'Every problem comes with a one-click fix. Then pick a carrier and you’re ready to go.'))));
  R.append(h('h3', null, 'What we check'), h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' },
    h('thead', null, h('tr', null, h('th', null, 'Check'), h('th', null, 'If it fails'))),
    h('tbody', null, CHECKS.map(([t, s]) => h('tr', null, h('td', null, t), h('td', null, h('span', { class: 'pill p-' + s }, s === 'Red' ? 'Must fix' : 'Check'))))))));
  R.append(h('h3', null, 'Good to know'), h('ul', { class: 'plain' },
    h('li', null, '“Must fix” stops the shipment. “Check” won’t stop it, but often causes delays.'),
    h('li', null, 'If a value was written differently (like “UK” or a spreadsheet date), we show what we read it as, so you can accept or change it.'),
    h('li', null, 'Notes under “Good to know” never block your booking.'),
    h('li', null, PRICE_TXT),
    h('li', null, 'The checks run in your browser. Bookings you finish by chat and sheets you upload are saved to one shared list on the Bookings tab, which anyone with this link can see — don’t enter anything private.')));
  if (hsStamp()) R.append(h('p', { class: 'note hsstamp' }, hsStamp()));
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
