/* Preflight chat — turns plain-language messages into booking updates. Pure; depends on PF (engine). */
(function (root) {
'use strict';
const PF = root.PF || (typeof require !== 'undefined' ? require('./engine.js') : null);
const { num, gbp, kg, fmtNum, fmtDate, fmtDateLong, addDays, weekday, isoFromYMD, normCountry, normPriority, normDestType, CITY_COUNTRY, ORIGIN_CITIES, COO_LIST, isNum, MONTHS } = PF;

const WORDNUM = { a: 1, an: 1, one: 1, single: 1, another: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const toN = w => (w == null ? null : /^\d/.test(w) ? parseFloat(String(w).replace(/,/g, '')) : WORDNUM[w.toLowerCase()] ?? null);
const NUMW = '(\\d[\\d,]*|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|single)';
const OTHER_DEST = { munich: 'Germany', münchen: 'Germany', cologne: 'Germany', köln: 'Germany', dusseldorf: 'Germany', düsseldorf: 'Germany', stuttgart: 'Germany', leipzig: 'Germany', dresden: 'Germany', hanover: 'Germany', nuremberg: 'Germany', bremen: 'Germany', dortmund: 'Germany', marseille: 'France', nice: 'France', lille: 'France', bordeaux: 'France', toulouse: 'France', nantes: 'France', strasbourg: 'France', utrecht: 'Netherlands', eindhoven: 'Netherlands', 'the hague': 'Netherlands', 'den haag': 'Netherlands', groningen: 'Netherlands', tilburg: 'Netherlands' };
const OTHER_UK = ['bristol', 'glasgow', 'edinburgh', 'liverpool', 'sheffield', 'cardiff', 'newcastle', 'nottingham', 'leicester', 'belfast', 'southampton', 'coventry', 'bradford', 'luton', 'reading', 'milton keynes'];
const OTHER_COUNTRIES = ['spain', 'italy', 'belgium', 'ireland', 'poland', 'austria', 'switzerland', 'portugal', 'denmark', 'sweden', 'usa', 'united states', 'america', 'canada', 'australia', 'dubai', 'uae'];
const EXCL_FIRST = /^(pallets?|plts?|cartons?|boxes|box|cases?|ctns?|kgs?|kilos?|kilograms?|g|gr|grams?|tonnes?|tons?|t|days?|weeks?|months?|hours?|hrs?|mins?|units?|per|each|percent|pct|gbp|pounds?|quid|ml|l|cl|litres?|liters?|mm|cm|m|inch|inches|oz|w|v|mah|gb|tb|x|more|less|fewer|of|in|on|at|to|for|by|items?|products?|skus?|lines?|types?|kinds?|different|things|jan\w*|feb\w*|mar|march|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*|st|nd|rd|th|am|pm|digits?|pieces?|pcs|ltd|limited|plc|inc|co|percent|times|people|stores?|warehouses?|working|business|calendar|is|are|was|and|or|the|total|in|extra|additional|ft|feet|metres?|meters?)$/i;
const NAME_STOP = /^(at|@|for|costing|priced|price|each|made|manufactured|produced|from|with|hs|in|packed|and|weigh|weighs|weighing|per|to|that|which|on|going|ready|worth|valued|totalling|totaling|total|plus|also|but|then|they|it|are|is|unit|units|so|we|via|by|origin|country|commodity|tariff|apiece|a)$/i;

function mask(w, start, end) { return w.slice(0, start) + ' '.repeat(end - start) + w.slice(end); }
function takeAll(state, re, fn) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let m; const hits = [];
  while ((m = g.exec(state.w))) { if (m[0].trim() === '') { g.lastIndex++; continue; } hits.push({ m, start: m.index, end: m.index + m[0].length }); }
  for (const h of hits) { const keep = fn(h.m, h.start); if (keep !== false) state.w = mask(state.w, h.start, h.end); }
  return hits.length;
}
const titleCase = s => s.replace(/\b([a-z])/g, c => c.toUpperCase());
const stem = w => w.toLowerCase().replace(/[^a-z]/g, '').replace(/(ies)$/, 'y').replace(/(ches|shes|sses|xes)$/, m => m.slice(0, -2)).replace(/s$/, '');
const STOPWORDS = new Set(['the', 'and', 'with', 'for', 'our', 'your', 'some', 'set', 'pack', 'item', 'product', 'unit', 'large', 'small', 'medium', 'new']);
function tokens(s) { return (s || '').toLowerCase().split(/[^a-z]+/).filter(x => x.length >= 3 && !STOPWORDS.has(x)).map(stem); }
function itemByName(items, text) {
  const tt = new Set(tokens(text)); let best = null, score = 0;
  items.forEach((it, i) => { const s = tokens(it.description).filter(x => tt.has(x)).length + (it.sku && new RegExp('\\b' + it.sku.replace(/[^a-z0-9]/gi, '.?') + '\\b', 'i').test(text) ? 2 : 0); if (s > score) { score = s; best = i; } });
  return best;
}
function makeSku(desc, items) {
  const words = tokens(desc); const base = (words[words.length - 1] || 'ITEM').toUpperCase().slice(0, 4);
  let n = 1; while (items.some(i => i.sku === `${base}-${String(n).padStart(2, '0')}`)) n++;
  return `${base}-${String(n).padStart(2, '0')}`;
}

// ---------- Dates in chat ----------
const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function chatDate(text, today) {
  const t = text.toLowerCase(); let m;
  const res = (iso, mm) => (iso ? { iso, start: mm.index, end: mm.index + mm[0].length } : null);
  if ((m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t))) return res(isoFromYMD(+m[1], +m[2], +m[3]), m);
  if ((m = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})\b/.exec(t))) return res(isoFromYMD(+m[3], +m[2], +m[1]), m);
  const yearFor = (mo, d) => { const y = +today.slice(0, 4); const iso = isoFromYMD(y, mo, d); if (!iso) return null; return iso < addDays(today, -60) ? isoFromYMD(y + 1, mo, d) : iso; };
  if ((m = /\b(\d{1,2})\/(\d{1,2})\b(?!\s*(?:days?|weeks?|kg|units?|cartons?))/.exec(t))) return res(yearFor(+m[2], +m[1]), m);
  const MRE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MRE}\\b\\.?(?:,?\\s+(20\\d{2}))?`).exec(t))) { const mo = MONTHS.indexOf(m[2].slice(0, 3)) + 1; return res(m[3] ? isoFromYMD(+m[3], mo, +m[1]) : yearFor(mo, +m[1]), m); }
  if ((m = new RegExp(`\\b${MRE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d{2}))?`).exec(t))) { const mo = MONTHS.indexOf(m[1].slice(0, 3)) + 1; return res(m[3] ? isoFromYMD(+m[3], mo, +m[2]) : yearFor(mo, +m[2]), m); }
  if ((m = /\bday after tomorrow\b/.exec(t))) return res(addDays(today, 2), m);
  if ((m = /\btomorrow\b/.exec(t))) return res(addDays(today, 1), m);
  if ((m = /\b(?:today|tonight|right now)\b/.exec(t))) return res(today, m);
  if ((m = /\bin\s+(\d+|a|one|two|three|four|five|six|seven|ten)\s+(days?|weeks?)\b/.exec(t))) return res(addDays(today, toN(m[1]) * (/week/.test(m[2]) ? 7 : 1)), m);
  if ((m = /\bnext week\b/.exec(t))) { let d = addDays(today, 1); while (weekday(d) !== 1) d = addDays(d, 1); return res(d, m); }
  if ((m = /\b(?:(this|next|on|coming)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thur?s?|fri|sat|sun)\b/.exec(t))) {
    if (!m[1] && /^(sat|sun|mon|wed|fri|tue|thu)$/.test(m[2])) { /* bare short forms are too ambiguous */ } else {
      const idx = WD.findIndex(w => w.startsWith(m[2].slice(0, 3)));
      let d = addDays(today, 1); while (weekday(d) !== idx) d = addDays(d, 1);
      if (m[1] === 'next' && (Date.parse(d) - Date.parse(today)) / 864e5 < 7 && weekday(today) < idx && weekday(today) !== 0) { /* "next Friday" said early in the week = the one in 7+ days? keep nearest; shown back to user */ }
      return res(d, m);
    }
  }
  return null;
}

// ---------- Parse one message into a patch ----------
function parseMessage(text, st, today) {
  const raw = String(text || '');
  const low = raw.toLowerCase();
  const P = { booking: {}, items: [], removeItems: [], palletsDelta: 0, notes: [], intents: [], hsUnknown: [], cooUnknown: [], material: null, understood: false };
  const S = { w: ' ' + raw.replace(/[’]/g, "'") + ' ' }; // working copy; matched spans are masked with spaces
  const items = st.booking.items;

  if (/^\s*(start over|reset|restart|new booking|clear( all)?|start again)\b/i.test(raw)) { P.intents.push('reset'); return P; }
  if (/\b(confirm|book it|go ahead|place (?:the )?booking|let'?s book|submit|finali[sz]e)\b/i.test(raw) && !/\bnot? (?:yet )?confirm/i.test(raw)) P.intents.push('confirm');
  if (/\b(summary|show (?:me )?(?:the )?(?:booking|report|checks)|what'?s wrong|status|run (?:the )?checks|recheck)\b/i.test(raw)) P.intents.push('summary');
  if (/^\s*(help|\?|what can you do)\s*$/i.test(raw)) P.intents.push('help');

  // Carrier override
  takeAll(S, /\bcarrier\s+([abc])\b/i, m => { P.booking.carrierOverride = 'Carrier ' + m[1].toUpperCase(); });
  takeAll(S, /\broad\s+(economy|standard|express)\b/i, m => { P.booking.carrierOverride = { economy: 'Carrier A', standard: 'Carrier B', express: 'Carrier C' }[m[1].toLowerCase()]; });
  if (/\b(use (?:the )?recommend(?:ed|ation)|whichever you recommend|you (?:choose|pick|decide)|reset (?:the )?carrier)\b/i.test(raw)) P.booking.carrierOverride = null;

  // Dates
  const d = chatDate(S.w, today);
  if (d && d.iso) { P.booking.ready = d.iso; S.w = mask(S.w, d.start, d.end); }
  else if (d && !d.iso) P.notes.push("That date doesn't exist — please give it as DD-MM-YYYY.");

  // Declared value
  const money = s => { const v = num(s[1]); return s[2] ? v * 1000 : v; };
  takeAll(S, /\b(?:declared|total|invoice|customs|goods|shipment|commercial)\s+value\s*(?:is|of|:|=|at|will be|comes to)?\s*(?:about|around|roughly|~)?\s*£?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i, m => { P.booking.declared = money(m); });
  takeAll(S, /\b(?:worth|valued at|value of|value is)\s*(?:about|around|~)?\s*£?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b(?!\s*(?:each|per|apiece))/i, m => { P.booking.declared = money(m); });
  takeAll(S, /£\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:in total|total|altogether|overall|all in|worth of (?:goods|stock|products))\b/i, m => { P.booking.declared = money(m); });

  // Total cartons
  takeAll(S, /\b(?:total|in total|altogether|overall)\s*(?:of\s*)?(\d[\d,]*)\s*(?:cartons|boxes|cases|ctns)\b/i, m => { P.booking.cartons = num(m[1]); });
  takeAll(S, /\b(\d[\d,]*)\s*(?:cartons|boxes|cases|ctns)\s*(?:in total|total|altogether|overall|on the booking)\b/i, m => { P.booking.cartons = num(m[1]); });
  takeAll(S, /\btotal\s*(?:cartons|boxes|cases)\s*(?:is|are|:|=|to|of)?\s*(\d[\d,]*)/i, m => { P.booking.cartons = num(m[1]); });

  // Pallets — deltas first, then absolute
  takeAll(S, new RegExp(`\\b(?:add(?:ing)?|plus|one more|another|an extra|extra|additional)\\s+(?:${NUMW}\\s+)?(?:more\\s+|extra\\s+|additional\\s+)?(?:pallets?|plts?)\\b`, 'i'), m => { const k = /one more|another|an extra/i.test(m[0]) && !m[1] ? 1 : (toN(m[1]) || 1); P.palletsDelta += k; });
  takeAll(S, new RegExp(`\\b${NUMW}\\s+(?:more|extra|additional)\\s+(?:pallets?|plts?)\\b`, 'i'), m => { P.palletsDelta += toN(m[1]) || 1; });
  takeAll(S, new RegExp(`\\b(?:remove|drop|take off|take away|minus|one less|one fewer)\\s+(?:${NUMW}\\s+)?(?:pallets?|plts?)\\b`, 'i'), m => { P.palletsDelta -= /one less|one fewer/i.test(m[0]) && !m[1] ? 1 : (toN(m[1]) || 1); });
  takeAll(S, new RegExp(`\\b${NUMW}\\s+(?:less|fewer)\\s+(?:pallets?|plts?)\\b`, 'i'), m => { P.palletsDelta -= toN(m[1]) || 1; });
  takeAll(S, /\b(?:pallets?|pallet count|number of pallets)\s*(?:is|are|:|=|to|now|should be|will be)\s*(\d+)\b/i, m => { P.booking.pallets = num(m[1]); });
  takeAll(S, new RegExp(`\\b${NUMW}\\s*(?:x\\s*)?(?:pallets?|plts?)\\b`, 'i'), m => { const v = toN(m[1]); if (v != null) P.booking.pallets = v; });

  // Explicit gross weight
  const W = '(\\d[\\d,]*(?:\\.\\d+)?)\\s*(kg|kgs|kilos?|kilograms?|tonnes?|tons?|t)\\b';
  const wt = m => { let v = num(m[1]); if (/^t/i.test(m[2])) v *= 1000; return v; };
  takeAll(S, new RegExp(`\\b(?:total|gross|overall|whole|entire|all[- ]in|combined|shipment)\\s*(?:gross\\s*)?(?:shipment\\s*)?(?:weight|wt)?\\s*(?:is|of|:|=|comes to|will be|about|around|approx\\.?|roughly|~)?\\s*(?:about|around|approx\\.?|roughly|~)?\\s*${W}`, 'i'), m => { P.booking.gross = wt(m); });
  takeAll(S, new RegExp(`${W}\\s*(?:in total|total|gross|overall|altogether|all in|all-in|combined)`, 'i'), m => { P.booking.gross = wt(m); });
  takeAll(S, new RegExp(`\\b(?:it|everything|shipment|load|consignment|the lot|all)\\s+weighs\\s*(?:about|around|roughly|~)?\\s*${W}`, 'i'), m => { P.booking.gross = wt(m); });

  // Items — mentions of "<qty> <product>"
  const mentions = [];
  {
    const re = /(\d{1,3}(?:,\d{3})+|\d+)\s*(?:x\s+|×\s*)?(?:(?:units?|pcs\.?|pieces|packs?|sets?)\s+of\s+)?((?:[a-z][a-z0-9'&\/-]*)(?:\s+[a-z][a-z0-9'&\/-]*){0,6})/gi;
    let m;
    while ((m = re.exec(S.w))) {
      const prev = S.w.slice(Math.max(0, m.index - 2), m.index);
      if ((/[£$€\d]\s?$/.test(prev) || /\.$/.test(prev)) && !/\s{2}$/.test(prev)) continue;
      if (/\b(?:hs|code|no\.?|number|#|sku)\s*[:#=]?\s*$/i.test(S.w.slice(Math.max(0, m.index - 14), m.index))) continue;
      const qty = num(m[1]); if (!qty) continue;
      let words = m[2].split(/\s+/); let more = false;
      if (/^more$/i.test(words[0])) { more = true; words = words.slice(1); }
      if (!words.length || EXCL_FIRST.test(words[0])) continue;
      const cut = words.findIndex((w, i) => i > 0 && NAME_STOP.test(w));
      const name = (cut > 0 ? words.slice(0, cut) : words).join(' ').replace(/[-\/&]+$/, '').trim();
      if (!name || name.length < 2 || /^(of|the|and)$/i.test(name)) continue;
      mentions.push({ start: m.index, qtyEnd: m.index + m[1].length, nameEnd: m.index + m[0].indexOf(m[2]) + name.length, qty, name, more });
      re.lastIndex = m.index + m[0].indexOf(m[2]) + name.length;
    }
  }
  const segs = mentions.map((mn, i) => ({ ...mn, end: i + 1 < mentions.length ? mentions[i + 1].start : S.w.length }));
  // Resolve each mention to an existing item (update) or a new one
  const pending = [];
  segs.forEach(sg => {
    let idx = itemByName(items, sg.name);
    const desc = titleCase(sg.name.charAt(0)) + sg.name.slice(1);
    if (idx != null) {
      const f = sg.more ? { qtyDelta: sg.qty } : { qty: sg.qty };
      pending.push({ ref: idx, fields: f, seg: sg });
    } else {
      pending.push({ ref: 'new', fields: { description: desc, qty: sg.qty }, seg: sg });
    }
    S.w = mask(S.w, sg.start, sg.nameEnd);
  });

  // "ship some candles to Paris" — a product named without a quantity
  if (!segs.length && !items.length) {
    const m = /\b(?:ship|send|sending|shipping|move|moving|export(?:ing)?|deliver(?:ing)?)\s+(?!from\b|to\b)(?:some|a load of|a batch of|a shipment of|a consignment of|our|my|the)?\s*([a-z][a-z \-]{2,40}?)\s+(?:to|from|over to|across to)\b/i.exec(S.w);
    const pm = /\b(?:pallets?|cartons?|boxes|cases|load|batch|shipment|consignment)\s+of\s+([a-z][a-z \-]{2,40}?)(?=\s+(?:to|from|for|going|at|that|which|on)\b|\s*[,.;!?]|\s*$)/i.exec(raw);
    const lead = /^\s*([a-z][a-z \-]{2,30}?)\s*(?:—|–|-|:|,|x)\s*(\d{1,3}(?:,\d{3})+|\d+)\b(?!\s*(?:kg|g|pallets?|cartons?|boxes))/i.exec(raw);
    if (pm && !/^(goods|stuff|products|stock|items|things)$/i.test(pm[1].trim())) { const nm = pm[1].trim(); pending.push({ ref: 'new', fields: { description: nm.charAt(0).toUpperCase() + nm.slice(1) } }); }
    else if (lead) { const nm = lead[1].trim(); pending.push({ ref: 'new', fields: { description: nm.charAt(0).toUpperCase() + nm.slice(1), qty: num(lead[2]) } }); }
    else if (m && !/^(from|to|of)\b/i.test(m[1].trim()) && !/^(it|them|goods|stuff|products|stock|items|a shipment|shipment|things|pallets?|cartons?|boxes|something|some stuff|an order|order|freight)$/i.test(m[1].trim())) {
      const nm = m[1].trim(); pending.push({ ref: 'new', fields: { description: nm.charAt(0).toUpperCase() + nm.slice(1) } });
    }
  }
  // Which item does free-floating detail belong to?
  const nameIdx = itemByName(items, raw.replace(/\d/g, ' '));
  // An HS answer that names no item belongs to the one item still without a code, not to the last item mentioned.
  const hsAnswer = /\b(?:use|accept|go with)\s+(?:the\s+)?(?:suggested\s+)?(?:code\s+)?\d{6,10}\b|\b(?:hs|commodity|tariff)\s*(?:code|no\.?|number)?\b/i.test(raw);
  const noHs = items.map((x, i) => (!x.hs ? i : null)).filter(i => i != null);
  const focusRef = nameIdx != null ? nameIdx : (hsAnswer && noHs.length === 1 ? noHs[0] : (st.pending && st.pending.item != null ? st.pending.item : (items.length ? (st.lastItem ?? items.length - 1) : null)));
  const zones = segs.length ? [{ ref: null, start: 0, end: segs[0].start }, ...segs.map((sg, i) => ({ ref: i, start: sg.start, end: sg.end }))] : [{ ref: null, start: 0, end: S.w.length }];
  const looseNew = pending.find(p => p.ref === 'new' && !p.seg);
  const target = z => (z.ref != null ? pending[z.ref] : looseNew && focusRef == null ? looseNew : (focusRef != null ? (pending.find(p => p.ref === focusRef) || (pending.push({ ref: focusRef, fields: {} }), pending[pending.length - 1])) : null));

  const UW = '(\\d+(?:\\.\\d+)?)\\s*(kg|kgs|kilos?|g|gr|grams?)';
  const toKg = (v, u) => (/^g/i.test(u) ? v / 1000 : v);
  zones.forEach(z => {
    const sub = { w: S.w.slice(z.start, z.end) };
    const t = target(z); const F = t ? t.fields : null;
    const set = (k, v) => { if (F && v != null && !(typeof v === 'number' && isNaN(v))) F[k] = v; };
    takeAll(sub, /(\d[\d,]*)\s*(?:cartons|boxes|cases|ctns)\s*(?:of|with|x|each holding|holding)\s*(\d+)\b/i, m => { set('cartons', num(m[1])); set('upc', num(m[2])); });
    takeAll(sub, /\b(?:units?\s+per\s+(?:carton|box|case)|per carton)\s*(?:is|are|:|=|of|to)?\s*(\d+)\b/i, m => set('upc', num(m[1])));
    takeAll(sub, /\b(\d+)\s*(?:units?\s+|pcs\s+|pieces\s+|items\s+|[a-z]+\s+)?(?:per|a|an|in each|in a|to a|to each|\/)\s*(?:carton|box|case|ctn)\b/i, m => set('upc', num(m[1])));
    takeAll(sub, /\b(?:cartons?|boxes|box|cases?)\s+(?:of|hold|holds|contain|contains|with)\s+(\d+)\b/i, m => set('upc', num(m[1])));
    takeAll(sub, /\b(?:packed|pack(?:ed)?\s+in)\s+(\d+)s\b/i, m => set('upc', num(m[1])));
    takeAll(sub, /\b(\d[\d,]*)\s*(?:cartons|boxes|cases|ctns)\b/i, m => set('cartons', num(m[1])));
    takeAll(sub, /\b(?:cartons|boxes)\s*(?:is|are|:|=|to|should be)\s*(\d[\d,]*)\b/i, m => set('cartons', num(m[1])));
    takeAll(sub, new RegExp(`${UW}\\s*(?:each|per\\s*(?!pallet)(?:unit|item|piece|pc|[a-z]+)|apiece|a piece|ea\\b)`, 'i'), m => set('unitWeight', toKg(num(m[1]), m[2])));
    takeAll(sub, new RegExp(`\\b(?:each|unit|per unit|one)\\s*(?:[a-z]+\\s+)?(?:weighs|weight|is)\\s*(?:about|around|~)?\\s*${UW}`, 'i'), m => set('unitWeight', toKg(num(m[1]), m[2])));
    takeAll(sub, new RegExp(`\\bunit weight\\s*(?:is|of|:|=)?\\s*${UW}?`, 'i'), m => { if (m[1]) set('unitWeight', toKg(num(m[1]), m[2] || 'kg')); });
    takeAll(sub, new RegExp(`\\bweigh(?:s|ing)?\\s*(?:about|around|~)?\\s*${UW}\\s*(?:each|apiece|a piece)?`, 'i'), m => { const v = toKg(num(m[1]), m[2]); if (v < 30 || /each|apiece|piece/i.test(m[0])) set('unitWeight', v); else return false; });
    takeAll(sub, /\b(?:use|accept|go with)\s+(?:the\s+)?(?:suggested\s+)?(?:code\s+)?(\d{6,10})\b/i, m => set('hs', m[1]));
    takeAll(sub, /\b(?:hs|h\.s\.|commodity|tariff)\s*(?:code|no\.?|number)?\s*(?:for\s+(?:the\s+)?[a-z][a-z \-]{0,40}?\s+)?(?:is|:|=|#|of)?\s*(\d[\d .]{2,14}\d|\d{3,})/i, m => set('hs', m[1].replace(/[ .]/g, '')));
    takeAll(sub, /\b(?:made|manufactured|produced|built|sourced|originat(?:es|ing)?|grown|assembled)\s+(?:in|from)\s+(?:the\s+)?([a-z][a-z'.]*(?:\s+[a-z][a-z'.]*){0,3})/i, m => { const c = countryIn(m[1]); if (c) set('coo', c); else return false; });
    takeAll(sub, /\b(?:country of origin|coo|origin)\s*(?:is|:|=|-)?\s*(?:the\s+)?([a-z][a-z'.]*(?:\s+[a-z][a-z'.]*){0,3})/i, m => { const c = countryIn(m[1]); if (c) set('coo', c); else return false; });
    takeAll(sub, /(?:\bat\b|@|\bcosting\b|\bpriced at\b|\bunit price\s*(?:is|of|:|=)?|\bprice\s*(?:is|of|:|=)?|\bcosts?\b|\bfor\b)\s*£\s*(\d+(?:\.\d+)?)(?![\d]|,\d)/i, m => set('price', num(m[1])));
    takeAll(sub, /£\s*(\d+(?:\.\d+)?)(?![\d]|,\d)\s*(?:each|per\s*(?:unit|item|piece|pc|[a-z]+)|apiece|a piece|ea\b|\/\s*(?:unit|pc|ea))/i, m => set('price', num(m[1])));
    takeAll(sub, /(?:\bat\b|@)\s*(\d+(?:\.\d+)?)\s*(?:gbp|pounds?|quid|p)?\s*(?:each|per|apiece|a piece|a unit)/i, m => set('price', num(m[1])));
    takeAll(sub, /\b(\d+(?:\.\d+)?)\s*(?:gbp|pounds?|quid)\s*(?:each|per|apiece|a piece|a unit)/i, m => set('price', num(m[1])));
    takeAll(sub, /\bunit price\s*(?:is|of|:|=)?\s*£?\s*(\d+(?:\.\d+)?)/i, m => set('price', num(m[1])));
    takeAll(sub, /(?:\bat\b|@)\s*£\s*(\d+(?:\.\d+)?)(?![\d]|,\d)/i, m => set('price', num(m[1])));
    takeAll(sub, /\b(?:quantity|qty)\s*(?:is|of|:|=|to|should be|now)?\s*(\d[\d,]*)/i, m => set('qty', num(m[1])));
    takeAll(sub, /\b(\d[\d,]*)\s*(?:units|pieces|pcs)\b(?!\s*(?:per|of|in|to|a))/i, m => set('qty', num(m[1])));
    if (F && /\b(?:no|don'?t (?:know|have)(?: the)?|not sure (?:of|about)(?: the)?|unknown)\s+(?:hs|commodity)/i.test(sub.w)) P.hsUnknown.push(t.ref);
    // leftover small kg in an item zone = unit weight; big = gross
    takeAll(sub, new RegExp(`(?<![\\d.])${W}`, 'i'), m => {
      const v = wt(m);
      if (F && v < 30 && F.unitWeight == null && P.booking.gross == null && (z.ref != null || (st.pending && st.pending.field === 'unitWeight'))) { set('unitWeight', v); return; }
      if (P.booking.gross == null && v >= 10) { P.booking.gross = v; return; }
      return false;
    });
    S.w = S.w.slice(0, z.start) + sub.w + S.w.slice(z.end);
  });

  // Remove items
  takeAll(S, /\b(?:remove|drop|delete|take out|cancel|exclude|get rid of)\s+(?:the\s+|all\s+(?:the\s+)?|those\s+)?([a-z][a-z \-]{2,40})/i, m => { if (/pallet/i.test(m[1])) return false; const i = itemByName(items, m[1]); if (i != null) P.removeItems.push(i); else return false; });

  // Cities / countries
  const destHits = Object.keys(CITY_COUNTRY).map(c => { const r = new RegExp(`\\b${c}\\b`, 'i').exec(raw); return r ? { c, i: r.index } : null; }).filter(Boolean).sort((a, b) => a.i - b.i);
  if (destHits.length) P.booking.destCity = destHits[destHits.length - 1].c;
  const orgHit = ORIGIN_CITIES.find(c => new RegExp(`\\b${c}\\b`, 'i').test(raw));
  if (orgHit) P.booking.originCity = orgHit;
  for (const [c, ctry] of Object.entries(OTHER_DEST)) if (new RegExp(`\\b${c}\\b`, 'i').test(low)) { P.notes.push(`${titleCase(c)} isn't on a carrier route. In ${ctry} we deliver to ${Object.keys(CITY_COUNTRY).filter(k => CITY_COUNTRY[k] === ctry).join(' or ')} — which is closest?`); P.suggestCountry = ctry; }
  for (const c of OTHER_UK) if (new RegExp(`\\b${c}\\b`, 'i').test(low)) P.notes.push(`We collect from ${ORIGIN_CITIES.join(', ')} only — not ${titleCase(c)}. Which of those is nearest?`);
  for (const c of OTHER_COUNTRIES) if (new RegExp(`\\bto\\s+(?:the\\s+)?${c}\\b`, 'i').test(low)) P.notes.push(`Shipping to ${titleCase(c)} isn't available — routes run from the UK to Germany, France or the Netherlands.`);
  if (!P.booking.destCity) { const m = /\b(?:to|into|in|for)\s+(?:the\s+)?(germany|france|netherlands|holland)\b/i.exec(raw); if (m) P.booking.destCountry = normCountry(m[1]); }

  // Destination type
  {
    const wh = /\b(warehouse|fulfil+ment (?:centre|center)|\bfc\b|distribution (?:centre|center)|\bdc\b|3pl|amazon|depot)/i.exec(raw);
    const ba = /\b(business address|office|shop|store|retail(?:er)?|boutique|showroom|premises|restaurant|cafe|salon|studio|customer'?s? address)\b/i.exec(raw);
    if (wh && !/\bfrom\s+(?:our|my|the|a)?\s*$/i.test(raw.slice(Math.max(0, wh.index - 12), wh.index))) P.booking.destType = 'Warehouse';
    else if (ba && !/\bfrom\s+(?:our|my|the|a)?\s*$/i.test(raw.slice(Math.max(0, ba.index - 12), ba.index)) && !/\bstore it\b/i.test(raw)) P.booking.destType = 'Business address';
  }
  // Appointment
  if (/\b(?:no|without|haven'?t|have not|not yet|don'?t have|do not have|didn'?t|did not|hasn'?t)\b[^.?!]{0,30}\b(?:appointment|slot|delivery window)/i.test(raw) || /\b(?:appointment|slot)\b[^.?!]{0,20}\b(?:not (?:yet )?booked|isn'?t booked|not arranged|pending|not yet)\b/i.test(raw)) P.booking.appointment = 'No';
  else if (/\b(?:appointment|slot|delivery window)\b[^.?!]{0,20}\b(?:is |are |'s )?(?:already )?(?:booked|confirmed|arranged|sorted|in place|done)\b/i.test(raw) || /\b(?:have|got|booked|has|arranged|secured)\b[^.?!]{0,15}\b(?:appointment|slot|delivery window)\b/i.test(raw)) P.booking.appointment = 'Yes';

  // Priority
  {
    let p = null;
    if (/\b(cheap(?:est|er|ly)?|lowest (?:cost|price)|budget|least expensive|economical|save money|no rush|not urgent|not in a hurry)\b/i.test(raw)) p = 'Cheapest';
    if (/\b(fastest|quickest|asap|urgent(?:ly)?|as (?:fast|quick|soon) as possible|express|rush|speed)\b/i.test(raw) && !/\bno rush|not urgent\b/i.test(raw) && !P.booking.carrierOverride) p = 'Fastest';
    if (/\b(most reliable|reliab(?:le|ility)|on[- ]time|dependab(?:le|ility)|can'?t be late|must arrive on)\b/i.test(raw)) p = 'Most reliable';
    if (/\b(balanced?|best value|no (?:strong )?preference|don'?t mind|dont mind|trade[- ]off|whatever(?:'s| is) best|good value|middle)\b/i.test(raw)) p = 'Balanced';
    if (p) { P.booking.priority = p; if (!('carrierOverride' in P.booking)) P.booking.carrierOverride = null; }
  }

  // Seller name
  {
    const cands = [];
    const NAME = "((?:[A-Z][\\w&'-]*|&)(?:\\s+(?:[A-Z][\\w&'-]*|&|and|of|the))*)";
    const pats = [new RegExp(`\\b(?:[Cc]ompany|[Bb]usiness|[Ss]eller|[Bb]rand|[Ss]hop)(?:\\s+name)?\\s+is\\s+${NAME}`), new RegExp(`\\b(?:[Oo]n behalf of|[Tt]his is|[Ww]e are|[Ww]e're|[Ii]'?m|I am|[Ii]t's|[Ss]eller is)\\s+(?:[A-Z][a-z]+\\s+from\\s+)?${NAME}`), new RegExp(`\\bfrom\\s+${NAME}`)];
    for (const re of pats) { const m = re.exec(raw); if (m) cands.push(m[1].trim()); }
    const bad = c => !c || ORIGIN_CITIES.concat(Object.keys(CITY_COUNTRY)).some(x => x.toLowerCase() === c.toLowerCase()) || normCountry(c) || /^(I|We|Hi|Hello|Carrier|Road|HS|The|Amazon|UK|EU|GBP|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(c) || /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(c) && c.split(' ').length === 1;
    let pick = null;
    const mFrom = /\b(?:i'?m|I am|this is)\s+[A-Z][a-z]+\s+from\s+((?:[A-Z][\w&'-]*|&)(?:\s+(?:[A-Z][\w&'-]*|&|and|of|the))*)/.exec(raw);
    if (mFrom && !bad(mFrom[1].trim())) pick = mFrom[1].trim();
    else pick = cands.find(c => !bad(c) && (c.split(/\s+/).length > 1 || /ltd|limited|co\b|goods|trading|supplies|store|shop/i.test(c))) || null;
    if (pick) P.booking.seller = pick.replace(/[.,]+$/, '').replace(/\s+(?:in|based|and)$/i, '');
  }

  // "don't know" answers to the pending question
  const pend = st.pending;
  const dunno = /\b(don'?t know|do not know|not sure|no idea|unknown|skip|n\/a|none|haven'?t got (?:one|it)|can'?t find|leave (?:it )?blank)\b/i.test(raw);
  if (pend && pend.item != null && dunno) { if (pend.field === 'hs') P.hsUnknown.push(pend.item); if (pend.field === 'coo') P.cooUnknown.push(pend.item); if (pend.field === 'hsMaterial') P.material = { item: pend.item, value: null }; }

  // Bare answer to the pending question (only fills the asked field if nothing else did)
  if (pend && !dunno) {
    const f = pend.field; const bareNum = (() => { const m = /(\d[\d,]*(?:\.\d+)?)\s*(k|g|grams?|kg|kgs|tonnes?)?/i.exec(S.w); return m ? { v: num(m[1]), u: (m[2] || '').toLowerCase() } : null; })();
    const pItem = pend.item != null ? (pending.find(p => p.ref === pend.item) || (pending.push({ ref: pend.item, fields: {} }), pending[pending.length - 1])) : null;
    if (pItem && ['qty', 'price', 'upc', 'cartons', 'unitWeight'].includes(f) && pItem.fields[f] == null && bareNum) pItem.fields[f] = f === 'unitWeight' && /^g/.test(bareNum.u) ? bareNum.v / 1000 : bareNum.v;
    if (pItem && f === 'hs' && pItem.fields.hs == null) { const m = /\b(\d[\d .]{2,14}\d|\d{3,})\b/.exec(S.w); if (m) pItem.fields.hs = m[1].replace(/[ .]/g, ''); }
    if (pItem && f === 'coo' && pItem.fields.coo == null) { const c = countryIn(raw); if (c) pItem.fields.coo = c; }
    if (f === 'hsMaterial' && pend.item != null) { const m = new RegExp(`\\b(${PF.HS_MATERIALS.join('|')}|other)\\b`, 'i').exec(raw); P.material = { item: pend.item, value: m ? m[1].toLowerCase() : null }; }
    if (f === 'pallets' && P.booking.pallets == null && !P.palletsDelta && bareNum) P.booking.pallets = bareNum.v;
    if (f === 'gross' && P.booking.gross == null && bareNum) P.booking.gross = /^t/.test(bareNum.u) ? bareNum.v * 1000 : bareNum.v;
    if (f === 'declared' && P.booking.declared == null && bareNum) P.booking.declared = bareNum.u === 'k' ? bareNum.v * 1000 : bareNum.v;
    if (f === 'destType' && !P.booking.destType) { const v = normDestType(raw); if (v) P.booking.destType = v; }
    if (f === 'appointment' && !P.booking.appointment) { if (/^\s*(y|yes|yep|yeah|yup|booked|it is|we have|done|sure)\b/i.test(raw)) P.booking.appointment = 'Yes'; else if (/^\s*(n|no|nope|not yet|nah|we don'?t|haven'?t)\b/i.test(raw)) P.booking.appointment = 'No'; }
    if (f === 'priority' && !P.booking.priority) { const v = normPriority(raw); if (v) { P.booking.priority = v; P.booking.carrierOverride = null; } }
    if (f === 'seller' && !P.booking.seller) { const v = raw.trim().replace(/^(?:it'?s|we are|we're|i'?m|the seller is|seller is|company is|our company is|this is)\s+/i, '').replace(/[.!]+$/, ''); if (v && v.length <= 80) P.booking.seller = v; }
    if (f === 'items' && !segs.length && !items.length && !pending.length && !Object.keys(P.booking).length && !P.palletsDelta) { const v = raw.trim().replace(/^(?:we(?:'re| are)? (?:sending|shipping)|sending|shipping|it'?s|they'?re)\s+/i, '').replace(/[.!]+$/, ''); if (v && !/^\d+$/.test(v) && v.length <= 80 && !dunno) pending.push({ ref: 'new', fields: { description: titleCase(v.charAt(0)) + v.slice(1) } }); }
  }
  P.items = pending.filter(p => Object.keys(p.fields).length);
  P.understood = !!(Object.keys(P.booking).length || P.items.length || P.removeItems.length || P.palletsDelta || P.hsUnknown.length || P.cooUnknown.length || (P.material && P.material.value) || P.intents.length);
  return P;
}
function countryIn(s) {
  const t = s.toLowerCase().replace(/[.]/g, '').trim();
  const words = t.split(/\s+/);
  for (let n = Math.min(4, words.length); n >= 1; n--) { const c = normCountry(words.slice(0, n).join(' ')); if (c) return c; }
  const known = ['japan', 'south korea', 'korea', 'taiwan', 'thailand', 'bangladesh', 'pakistan', 'indonesia', 'malaysia', 'italy', 'spain', 'portugal', 'poland', 'france', 'netherlands', 'usa', 'united states', 'mexico', 'sri lanka', 'cambodia', 'egypt', 'morocco'];
  const k = known.find(x => t.startsWith(x)); return k ? titleCase(k) : null;
}

// ---------- State ----------
function newState() { return { booking: { seller: null, originCity: null, destCity: null, destCountry: null, destType: null, ready: null, priority: null, pallets: null, cartons: null, cartonsStated: false, declared: null, declaredStated: false, gross: null, appointment: null, carrierOverride: null, items: [] }, reviewed: {}, pending: null, complete: false, lastEval: null, lastItem: null, confirmed: null, turns: 0 }; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function deriveItems(b) {
  const notes = [];
  b.items.forEach(it => {
    it.derived = it.derived || {};
    const q = it.qty, u = it.upc, c = it.cartons;
    if (isNum(q) && isNum(u) && c == null && u > 0 && Number.isInteger(q / u)) { it.cartons = q / u; it.derived.cartons = true; notes.push(`${it.description}: ${fmtNum(q)} ÷ ${fmtNum(u)} per carton = ${fmtNum(it.cartons)} cartons.`); }
    else if (isNum(c) && isNum(u) && q == null) { it.qty = c * u; it.derived.qty = true; notes.push(`${it.description}: ${fmtNum(c)} cartons × ${fmtNum(u)} = ${fmtNum(it.qty)} units.`); }
    else if (isNum(q) && isNum(c) && u == null && c > 0 && Number.isInteger(q / c)) { it.upc = q / c; it.derived.upc = true; notes.push(`${it.description}: ${fmtNum(q)} ÷ ${fmtNum(c)} cartons = ${fmtNum(it.upc)} per carton.`); }
  });
  return notes;
}
function totals(b) {
  const lines = b.items.map(it => (isNum(it.qty) && isNum(it.price) ? it.qty * it.price : null));
  const value = b.items.length && lines.every(x => x != null) ? Math.round(lines.reduce((a, c) => a + c, 0) * 100) / 100 : null;
  const cartons = b.items.length && b.items.every(it => isNum(it.cartons)) ? b.items.reduce((a, it) => a + it.cartons, 0) : null;
  const net = b.items.length && b.items.every(it => isNum(it.unitWeight) && isNum(it.qty)) ? Math.round(b.items.reduce((a, it) => a + it.unitWeight * it.qty, 0) * 100) / 100 : null;
  return { value, cartons, net };
}
function toRaw(st, id) {
  const b = st.booking; const t = totals(b);
  return {
    id: id || 'CHAT', source: 'chat', seller: b.seller, originCity: b.originCity, originCountry: 'United Kingdom', destCity: b.destCity, destCountry: b.destCountry,
    destType: b.destType, ready: b.ready, priority: b.priority, pallets: b.pallets, cartons: b.cartonsStated ? b.cartons : t.cartons, declared: b.declaredStated ? b.declared : t.value,
    currency: 'GBP', derived: { cartons: !b.cartonsStated, declared: !b.declaredStated }, gross: b.gross, appointment: b.destType === 'Business address' ? (b.appointment || 'No') : b.appointment, carrierOverride: b.carrierOverride,
    items: b.items.map(it => ({ sku: it.sku, description: it.description, hs: it.hsUnknown ? '' : it.hs, qty: it.qty, price: it.price, upc: it.upc, cartons: it.cartons, unitWeight: it.unitWeight, coo: it.cooUnknown ? '' : it.coo, derived: it.derived || {} })),
  };
}

// What's still missing, in asking order
// HS suggestion for a chat item (design D6): the tariff index when loaded, else the curated hint. Recommendation only.
function hsSuggestFor(it) {
  if (!PF.hsMeta()) { const h = PF.hsHint(it.description); return h ? { level: 'hs6', codes: [h.code], label: h.label } : null; }
  const r = PF.hsSuggest(`${it.description || ''}${it.material && it.material !== 'other' ? ' ' + it.material : ''}`);
  if (r.level === 'none') return null;
  if (it.material === 'other' && r.level === 'hs6' && PF.hsMaterialsOf(r.codes[0]).length) {   // "other material": drop subheadings named for a material
    const rest = PF.hsHeading(r.heading).subs.filter(c => !PF.hsMaterialsOf(c).length);
    if (rest.length) return { ...r, level: rest.length === 1 ? 'hs6' : 'heading', codes: rest };
  }
  return r;
}
// Materials worth asking about: the item names none, and the candidate subheadings are told apart by material.
function hsMaterialChoices(it, sug) {
  if (!PF.hsMeta() || !sug || it.material || it.materialAsked) return null;
  if (PF.hsTokens(it.description).some(t => PF.HS_MATERIALS.includes(t))) return null;
  const cands = sug.level === 'hs6' ? (PF.hsHeading(sug.codes[0].slice(0, 4)).subs || []) : sug.codes;
  const mats = [...new Set(cands.flatMap(c => PF.hsMaterialsOf(c)))];
  return cands.length > 1 && mats.length ? mats : null;
}
function missing(st) {
  const b = st.booking; const out = [];
  const destChips = b.destCountry ? Object.keys(CITY_COUNTRY).filter(c => CITY_COUNTRY[c] === b.destCountry) : Object.keys(CITY_COUNTRY);
  if (!b.destCity) out.push({ field: 'destCity', q: b.destCountry ? `Which city in ${b.destCountry} is it going to?` : 'Where is the shipment going?', chips: destChips });
  if (!b.originCity) out.push({ field: 'originCity', q: 'Where should we collect it from?', chips: ORIGIN_CITIES });
  if (!b.items.length) out.push({ field: 'items', q: 'What are you sending? Give each product with its quantity and unit price — e.g. “1,080 ceramic mugs at £5 each, 12 per carton, 0.5 kg each, HS 691200, made in the UK”.' });
  b.items.forEach((it, i) => {
    const need = [];
    if (!isNum(it.qty)) need.push(['qty', 'quantity (units)']);
    if (!isNum(it.price)) need.push(['price', 'unit price (£)']);
    if (!isNum(it.upc)) need.push(['upc', 'units per carton']);
    if (!isNum(it.cartons) && (isNum(it.upc) || isNum(it.qty))) {
      if (!(isNum(it.qty) && isNum(it.upc) && !Number.isInteger(it.qty / it.upc))) { if (!isNum(it.upc)) {} else need.push(['cartons', 'number of cartons']); }
      else need.push(['cartons', `number of cartons (${fmtNum(it.qty)} ÷ ${fmtNum(it.upc)} isn't a whole number)`]);
    }
    if (!isNum(it.unitWeight)) need.push(['unitWeight', 'weight of one unit (kg)']);
    const sug = !it.hs && !it.hsUnknown ? hsSuggestFor(it) : null, mats = !it.hs && !it.hsUnknown ? hsMaterialChoices(it, sug) : null;
    const sugCodes = sug ? sug.codes.slice(0, 4) : [];
    if (mats) need.push(['hsMaterial', 'what it is mainly made of (it decides the HS code)']);
    else if (!it.hs && !it.hsUnknown) need.push(['hs', !sug ? 'HS code (or say “don’t know”)' : sug.level === 'hs6' ? `HS code (suggested ${sug.codes[0]} ${sug.label ? `for ${sug.label}` : `(${PF.hsShort(PF.hsLookup(sug.codes[0]).desc)})`} — tap to use it after checking, or say “don’t know”)` : `HS code (one of ${sugCodes.join(', ')} — tap the one that fits, or say “don’t know”)`]);
    if (!it.coo && !it.cooUnknown) need.push(['coo', 'country where it was made']);
    if (need.length) {
      const lst = need.map(n => n[1]);
      const q = `For the ${it.description.toLowerCase()} I still need: ${lst.length > 1 ? lst.slice(0, -1).join(', ') + ' and ' + lst[lst.length - 1] : lst[0]}.`;
      const chips = need[0][0] === 'coo' ? [...COO_LIST, 'Don’t know'] : need[0][0] === 'hs' ? [...sugCodes.map(c => `Use ${c}`), 'Don’t know'] : need[0][0] === 'hsMaterial' ? [...mats.map(m => m[0].toUpperCase() + m.slice(1)), 'Other'] : null;
      out.push({ field: need[0][0], item: i, q: need[0][0] === 'hsMaterial' && need.length === 1 ? `What are the ${it.description.toLowerCase()} mainly made of? It decides the HS code.` : q, chips });
    }
  });
  if (!isNum(b.pallets)) out.push({ field: 'pallets', q: 'How many pallets?' });
  if (!isNum(b.gross)) { const t = totals(b); out.push({ field: 'gross', q: `What's the total gross weight in kg — goods plus cartons and pallets?${t.net != null ? ` (The goods alone come to ${kg(t.net)}.)` : ''}` }); }
  if (!b.ready) out.push({ field: 'ready', q: 'When will it be packed and ready for collection?', chips: ['Today', 'Tomorrow', 'Next Monday'] });
  if (!b.destType) out.push({ field: 'destType', q: `Is it going to a warehouse (e.g. an Amazon FC) or a business address?`, chips: ['Warehouse', 'Business address'] });
  if (b.destType === 'Warehouse' && !b.appointment) out.push({ field: 'appointment', q: 'Do you already have a delivery appointment booked at the warehouse?', chips: ['Yes', 'No'] });
  if (!b.priority) out.push({ field: 'priority', q: 'What matters most for this shipment?', chips: ['Cheapest', 'Fastest', 'Most reliable', 'Balanced'] });
  if (!b.seller) out.push({ field: 'seller', q: 'Last one: what business name should go on the paperwork as the seller?' });
  return out;
}

const FIELD_LABEL = { destCountry: 'Country', seller: 'Seller', originCity: 'Collect from', destCity: 'Deliver to', destType: 'Destination type', ready: 'Ready date', priority: 'Priority', pallets: 'Pallets', cartons: 'Total cartons', declared: 'Declared value', gross: 'Gross weight', appointment: 'Delivery appointment', carrierOverride: 'Carrier' };
const fmtField = (k, v) => (v == null ? '—' : k === 'ready' ? fmtDate(v) : k === 'declared' ? gbp(v) : k === 'gross' ? kg(v) : k === 'destCity' ? v : String(v));

/** Apply a patch; returns list of human-readable changes. Mutates st. */
function applyPatch(st, P) {
  const b = st.booking; const changes = [];
  const setB = (k, v) => { if (v === undefined) return; if (b[k] !== v) { changes.push({ field: k, label: FIELD_LABEL[k] || k, from: fmtField(k, b[k]), to: fmtField(k, v), first: b[k] == null }); b[k] = v; } };
  for (const [k, v] of Object.entries(P.booking)) {
    if (k === 'destCity') { setB('destCity', v); setB('destCountry', CITY_COUNTRY[v]); continue; }
    if (k === 'destCountry') { if (b.destCity && CITY_COUNTRY[b.destCity] !== v) { setB('destCity', null); } setB('destCountry', v); continue; }
    if (k === 'cartons') { b.cartonsStated = true; }
    if (k === 'declared') { b.declaredStated = true; }
    if (k === 'priority' && P.booking.carrierOverride === undefined) { /* keep */ }
    setB(k, v);
  }
  if (P.palletsDelta) { const nv = Math.max(0, (b.pallets || 0) + P.palletsDelta); setB('pallets', nv); }
  // items
  P.removeItems.sort((a, c) => c - a).forEach(i => { const it = b.items[i]; if (it) { changes.push({ field: 'item', label: 'Removed item', from: it.description, to: '—' }); b.items.splice(i, 1); } });
  const idxMap = {};
  P.items.forEach(p => {
    if (p.ref === 'new') {
      const it = { sku: null, description: p.fields.description || 'Item', hs: null, hsUnknown: false, qty: null, price: null, upc: null, cartons: null, unitWeight: null, coo: null, cooUnknown: false, derived: {} };
      it.sku = makeSku(it.description, b.items); b.items.push(it); st.lastItem = b.items.length - 1;
      changes.push({ field: 'item', label: 'Added item', from: '—', to: `${it.description} (SKU ${it.sku})`, first: true });
      applyItemFields(it, p.fields, changes);
    } else if (b.items[p.ref]) { applyItemFields(b.items[p.ref], p.fields, changes); st.lastItem = p.ref; }
  });
  P.hsUnknown.forEach(i => { if (b.items[i] && !b.items[i].hsUnknown && !b.items[i].hs) { b.items[i].hsUnknown = true; changes.push({ field: 'item', label: `${b.items[i].description} HS code`, from: '—', to: 'not known yet' }); } });
  P.cooUnknown.forEach(i => { if (b.items[i] && !b.items[i].cooUnknown && !b.items[i].coo) { b.items[i].cooUnknown = true; changes.push({ field: 'item', label: `${b.items[i].description} origin`, from: '—', to: 'not known yet' }); } });
  return changes;
}
function applyItemFields(it, f, changes) {
  const L = { qty: 'quantity', price: 'unit price', upc: 'units per carton', cartons: 'cartons', unitWeight: 'unit weight', hs: 'HS code', coo: 'origin', description: 'description' };
  const show = (k, v) => (v == null ? '—' : k === 'price' ? gbp(v) : k === 'unitWeight' ? kg(v) : k === 'qty' || k === 'cartons' || k === 'upc' ? fmtNum(v) : String(v));
  if (f.qtyDelta) f = { ...f, qty: (it.qty || 0) + f.qtyDelta };
  for (const [k, v] of Object.entries(f)) {
    if (k === 'qtyDelta' || k === 'description' || v == null) continue;
    if (it[k] !== v) {
      changes.push({ field: 'item', label: `${it.description} ${L[k]}`, from: show(k, it[k]), to: show(k, v), first: it[k] == null });
      // a stated value overrides a derived one; a change to qty/upc invalidates derived partners
      if (['qty', 'upc', 'cartons'].includes(k)) { for (const dk of ['qty', 'upc', 'cartons']) if (dk !== k && it.derived && it.derived[dk] && f[dk] == null) { it[dk] = null; delete it.derived[dk]; } }
      it[k] = v; if (it.derived) delete it.derived[k];
      if (k === 'hs') it.hsUnknown = false; if (k === 'coo') it.cooUnknown = false;
    }
  }
}

function checkDiff(prev, next) {
  if (!prev) return [];
  const out = [];
  next.checks.forEach(c => { const p = prev.checks.find(x => x.id === c.id); if (p && p.status !== c.status) out.push({ id: c.id, from: p.status, to: c.status, sev: c.sev }); });
  return out;
}
function refFor(st) { let h = 0; const s = JSON.stringify(st.booking); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return 'PF-' + (h % 900000 + 100000); }

/** One conversational turn. Returns {st, reply:{parts:[...], ask, chips, showReport, diff, changes, derived}} */
function turn(stIn, text, today) {
  let st = clone(stIn); st.turns++;
  const P = parseMessage(text, st, today);
  const reply = { notes: [...P.notes], changes: [], derived: [], ask: null, chips: null, showReport: false, diff: [], status: null, intent: null, nothing: false };
  if (P.intents.includes('reset')) { st = newState(); const m = missing(st)[0]; st.pending = m; reply.intent = 'reset'; reply.ask = 'Starting a fresh booking. Describe the shipment — what, where to, and how many pallets — and I’ll ask for anything missing.'; return { st, reply }; }
  if (P.intents.includes('help')) { reply.intent = 'help'; }
  reply.changes = applyPatch(st, P);
  if (P.material && st.booking.items[P.material.item]) { const it = st.booking.items[P.material.item]; it.materialAsked = true; if (P.material.value) { it.material = P.material.value; reply.notes.push(`Noted: ${it.description} — ${P.material.value}.`); } }
  P.hsUnknown.forEach(i => { const it = st.booking.items[i]; if (!it || it.hs) return; const h = hsSuggestFor(it), what = h && (h.label || PF.hsShort((PF.hsLookup(h.codes[0]) || {}).desc)); reply.notes.push(h && h.level === 'hs6' ? `No problem. For “${it.description}” the suggested HS code is ${h.codes[0]} (${what}). Say “use ${h.codes[0]}” to accept it — worth a quick check on the UK Trade Tariff. Until then R-01 stays red.` : h ? `No problem. For “${it.description}” the code is probably one of ${h.codes.slice(0, 4).join(', ')}. Say “use” and the one that fits — check it on the UK Trade Tariff. Until then R-01 stays red.` : `No problem — I couldn’t suggest a code for “${it.description}”. Look it up on the UK Trade Tariff (trade-tariff.service.gov.uk); until then R-01 stays red.`); });
  reply.derived = deriveItems(st.booking);
  const miss = missing(st);
  if (miss.length) {
    st.pending = miss[0]; reply.ask = miss[0].q; reply.chips = miss[0].chips || null;
    if (st.complete) reply.reopened = true;
    if (P.intents.includes('confirm')) reply.intent = 'confirm-incomplete';
  } else {
    st.pending = null;
    const ev = PF.evaluate(toRaw(st, st.confirmed || 'CHAT'), { today });
    reply.diff = checkDiff(st.lastEval, ev);
    reply.status = ev.status; reply.showReport = !st.complete || reply.changes.length > 0 || P.intents.includes('summary') || P.intents.includes('confirm');
    reply.firstComplete = !st.complete; st.complete = true;
    if (ev.rec && !st.priceNoteShown) { reply.priceNote = PF.PRICE_NOTE; st.priceNoteShown = true; }
    st.lastEval = { checks: ev.checks.map(c => ({ id: c.id, status: c.status })), status: ev.status };
    // Human review of automatic corrections: "looks right" accepts every one shown; nothing else changes.
    st.reviewed = st.reviewed || {};
    if (/^\s*(?:looks? (?:right|good|fine|ok(?:ay)?)|all (?:correct|good|fine)|that'?s (?:right|correct)|correct)\s*[.!]?\s*$/i.test(text)) {
      const open = ev.corrections.filter(c => !st.reviewed[c.id]);
      open.forEach(c => { st.reviewed[c.id] = 'accepted'; });
      reply.accepted = open;
      reply.notes.push(open.length ? `Thanks — ${open.length} automatic correction${open.length === 1 ? '' : 's'} marked as checked. Nothing in the booking changed.` : 'Nothing left to check.');
    }
    if (reply.firstComplete || P.intents.includes('summary')) reply.corrections = ev.corrections.filter(c => !st.reviewed[c.id]);
    if (P.intents.includes('confirm')) {
      if (ev.status === 'Red') reply.intent = 'confirm-blocked';
      else { st.confirmed = st.confirmed || refFor(st); reply.intent = 'confirmed'; reply.ref = st.confirmed; }
    }
  }
  if (!P.understood && !reply.notes.length) reply.nothing = true;
  return { st, reply };
}

const CHAT = { newState, parseMessage, applyPatch, deriveItems, missing, toRaw, turn, chatDate, totals, countryIn, hsSuggestFor };
if (typeof module !== 'undefined' && module.exports) module.exports = CHAT; else root.PFChat = CHAT;
})(typeof window !== 'undefined' ? window : globalThis);
