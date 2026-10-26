/* Preflight engine — pure functions, no DOM. Shared by the web app and the Node test runner. */
(function (root) {
'use strict';

// ---------- Fixed reference data (Sheets 3 & 4 of the template) ----------
// Days added to the delivery estimate for a warehouse delivery whose appointment is not booked yet (R-08).
const APPT_BUFFER_DAYS = 2;
const CARRIERS = [
  { carrier: 'Carrier A', service: 'Road economy',  dest: 'Germany',     price: 180, transit: 5, onTime: 92, maxW: 500 },
  { carrier: 'Carrier B', service: 'Road standard', dest: 'Germany',     price: 220, transit: 3, onTime: 95, maxW: 750 },
  { carrier: 'Carrier C', service: 'Road express',  dest: 'Germany',     price: 340, transit: 2, onTime: 98, maxW: 400 },
  { carrier: 'Carrier A', service: 'Road economy',  dest: 'France',      price: 170, transit: 5, onTime: 92, maxW: 500 },
  { carrier: 'Carrier B', service: 'Road standard', dest: 'France',      price: 210, transit: 3, onTime: 95, maxW: 750 },
  { carrier: 'Carrier C', service: 'Road express',  dest: 'France',      price: 330, transit: 2, onTime: 98, maxW: 400 },
  { carrier: 'Carrier A', service: 'Road economy',  dest: 'Netherlands', price: 160, transit: 5, onTime: 92, maxW: 500 },
  { carrier: 'Carrier B', service: 'Road standard', dest: 'Netherlands', price: 200, transit: 3, onTime: 95, maxW: 750 },
  { carrier: 'Carrier C', service: 'Road express',  dest: 'Netherlands', price: 320, transit: 2, onTime: 98, maxW: 400 },
];
const RULES = {
  'R-01': { sev: 'Red',   text: 'Every item must have an HS code of at least 6 digits' },
  'R-02': { sev: 'Red',   text: 'Total declared value must equal the sum of quantity × unit price across all items (within 1%)' },
  'R-03': { sev: 'Red',   text: 'For each item, units per carton × cartons must equal quantity' },
  'R-04': { sev: 'Red',   text: 'Total cartons on the booking must equal the sum of cartons across all items' },
  'R-05': { sev: 'Red',   text: "Weight per pallet (total gross weight ÷ pallets) must not exceed the chosen carrier's max weight per pallet" },
  'R-06': { sev: 'Red',   text: 'No lithium batteries, aerosols or flammable liquids' },
  'R-07': { sev: 'Amber', text: 'Total gross weight must be at least the sum of unit weight × quantity across all items' },
  'R-08': { sev: 'Amber', text: 'Shipments to a warehouse must have a delivery appointment booked' },
  'R-09': { sev: 'Amber', text: 'Every item must have a country of origin' },
  'R-10': { sev: 'Amber', text: 'Ready to ship date must not be in the past' },
};
const CITY_COUNTRY = { Berlin: 'Germany', Frankfurt: 'Germany', Hamburg: 'Germany', Paris: 'France', Lyon: 'France', Amsterdam: 'Netherlands', Rotterdam: 'Netherlands' };
const ORIGIN_CITIES = ['London', 'Manchester', 'Birmingham', 'Leeds'];
const COO_LIST = ['United Kingdom', 'China', 'India', 'Vietnam', 'Turkey', 'Germany'];
const PRIORITIES = ['Cheapest', 'Fastest', 'Most reliable', 'Balanced'];
const PRICE_NOTE = 'Indicative rate per pallet for the destination country. Actual prices vary by collection and delivery city, fuel surcharge and date — confirm with the carrier.';
const EXAMPLE_BOOKING = ['BK-001', 'Northfield Goods', 'Manchester', 'United Kingdom', 'Frankfurt', 'Germany', 'Warehouse', '05-11-2026', 'Cheapest', 3, 90, 5400, 'GBP', 620, 'Yes'];
const EXAMPLE_ITEM = ['BK-001', 'MUG-01', 'Ceramic coffee mug, 350 ml', 691200, 1080, 5, 12, 90, 0.5, 'United Kingdom'];

// ---------- Small helpers ----------
const clean = v => (v == null ? '' : String(v).replace(/\u00a0/g, ' ').trim());
const isBlank = v => v == null || (typeof v === 'string' && v.trim() === '');
const round2 = n => Math.round(n * 100) / 100;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const isNum = n => typeof n === 'number' && isFinite(n);

function num(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = clean(v).toLowerCase().replace(/£|gbp|kgs?|kilos?|units?|pcs/g, '').replace(/[,\s]/g, '');
  if (s === '') return null;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return parseFloat(s);
}
function gbp(n) {
  if (!isNum(n)) return '—';
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return (n < 0 ? '-£' : '£') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}
function fmtNum(n, dp = 2) {
  if (!isNum(n)) return '—';
  return n.toLocaleString('en-GB', { maximumFractionDigits: dp });
}
const kg = n => (isNum(n) ? fmtNum(n, 1) + ' kg' : '—');

// ---------- Dates (internal format: ISO YYYY-MM-DD, compared as strings) ----------
const pad = n => String(n).padStart(2, '0');
function isoFromYMD(y, m, d) {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n)); return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`; }
function weekday(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function fmtDate(iso) { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; }
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function fmtDateLong(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const mn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1];
  return `${DAY_NAMES[weekday(iso)]} ${d} ${mn} ${y}`;
}
function nextWorkingDay(iso) { let d = iso; while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1); return d; }

/** Parse a date cell from a sheet. Day-first, per the template (DD-MM-YYYY). Returns {iso} or {error}. */
function parseSheetDate(v) {
  if (isBlank(v)) return { error: 'missing' };
  if (v instanceof Date && !isNaN(v)) return { iso: isoFromYMD(v.getFullYear(), v.getMonth() + 1, v.getDate()) };
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) { // Excel serial date
      const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return { iso: isoFromYMD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()) };
    }
    return { error: `“${v}” is not a date` };
  }
  let s = clean(v).replace(/[T\s]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?Z?$/i, '').trim();
  let m;
  if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) {
    const iso = isoFromYMD(+m[1], +m[2], +m[3]); return iso ? { iso } : { error: `“${clean(v)}” is not a real date` };
  }
  if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/))) {
    const iso = isoFromYMD(+m[3], +m[2], +m[1]); return iso ? { iso } : { error: `“${clean(v)}” is not a real date (expected DD-MM-YYYY)` };
  }
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+(?:of\s+)?([a-z]{3,9})\.?,?[\s-]+(\d{2,4})$/i))) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) { const iso = isoFromYMD(+m[3], mi + 1, +m[1]); if (iso) return { iso }; }
  }
  if ((m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i))) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) { const iso = isoFromYMD(+m[3], mi + 1, +m[2]); if (iso) return { iso }; }
  }
  return { error: `“${clean(v)}” is not a recognisable date (expected DD-MM-YYYY)` };
}

// ---------- Enum normalisers ----------
const COUNTRY_ALIASES = {
  'united kingdom': 'United Kingdom', 'uk': 'United Kingdom', 'u.k.': 'United Kingdom', 'u.k': 'United Kingdom', 'gb': 'United Kingdom', 'great britain': 'United Kingdom', 'britain': 'United Kingdom', 'england': 'United Kingdom', 'scotland': 'United Kingdom', 'wales': 'United Kingdom', 'northern ireland': 'United Kingdom',
  'germany': 'Germany', 'deutschland': 'Germany', 'de': 'Germany',
  'france': 'France', 'fr': 'France',
  'netherlands': 'Netherlands', 'the netherlands': 'Netherlands', 'holland': 'Netherlands', 'nl': 'Netherlands',
  'china': 'China', 'prc': 'China', "people's republic of china": 'China', 'cn': 'China',
  'india': 'India', 'in': 'India',
  'vietnam': 'Vietnam', 'viet nam': 'Vietnam', 'vn': 'Vietnam',
  'turkey': 'Turkey', 'türkiye': 'Turkey', 'turkiye': 'Turkey', 'tr': 'Turkey',
};
function normCountry(v) { const k = clean(v).toLowerCase().replace(/\s+/g, ' '); return COUNTRY_ALIASES[k] || null; }
function normCity(v, list) { const k = clean(v).toLowerCase(); return list.find(c => c.toLowerCase() === k || (c === 'Frankfurt' && /^frankfurt( am main)?$/.test(k))) || null; }
function normPriority(v) {
  const k = clean(v).toLowerCase();
  if (!k) return null;
  if (/cheap|lowest cost|lowest price|budget|economical|least expensive/.test(k)) return 'Cheapest';
  if (/fast|quick|asap|urgent|speed/.test(k)) return 'Fastest';
  if (/reliab|on.?time|dependab/.test(k)) return 'Most reliable';
  if (/balanc|no (strong )?preference|best value|trade.?off|don'?t mind|either|any/.test(k)) return 'Balanced';
  return null;
}
function normDestType(v) {
  const k = clean(v).toLowerCase();
  if (!k) return null;
  if (/warehouse|fulfil+ment|distribution|\bfc\b|\bdc\b|depot|3pl|amazon/.test(k)) return 'Warehouse';
  if (/business|office|shop|store|retail|premises|boutique|showroom|address/.test(k)) return 'Business address';
  return null;
}
function normYesNo(v) {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  const k = clean(v).toLowerCase();
  if (/^(y|yes|yep|yeah|true|booked|1|confirmed)$/.test(k)) return 'Yes';
  if (/^(n|no|nope|false|0|not booked|not yet|none)$/.test(k)) return 'No';
  return null;
}
function normHS(v) {
  if (isBlank(v)) return { blank: true, digits: '', raw: '' };
  let s;
  if (typeof v === 'number') s = Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : String(v);
  else s = clean(v).replace(/^(hs|h\.s\.|commodity)\s*(code)?\s*[:#-]?\s*/i, '');
  return { blank: false, raw: s, digits: s.replace(/[^0-9]/g, ''), hasLetters: /[a-z]/i.test(s), numericCell: typeof v === 'number' };
}

// ---------- Dangerous goods scan (R-06) ----------
const DG_DEFINITE = [
  { cat: 'lithium batteries', re: /\blithium\b|\bli-?ion\b|\bli-?po(?:ly|lymer)?\b|\blifepo4\b|\b(?:18650|21700|cr2032|cr2025|cr2016|cr123a?)\b|\bpower ?banks?\b|\be-?cig(?:arette)?s?\b|\bvapes?\b|\bvape pens?\b|\be-?bikes?\b|\be-?scooters?\b|\bhoverboards?\b/i },
  { cat: 'aerosols', re: /\baerosols?\b|\bspray ?cans?\b|\bspray ?paints?\b|\bhair ?sprays?\b|\b(?:deodorant|body|cooking oil) sprays?\b|\bspray (?:deodorant|polish|adhesive|lubricant|foam|starch)\b|\bcompressed (?:gas|air)\b|\bpressuri[sz]ed (?:can|canister|container)s?\b|\bco2 (?:cartridge|canister)s?\b|\b(?:cream|nitrous) (?:charger|canister)s?\b|\bdry shampoo\b|\bwd-?40\b|\bshaving foam\b/i },
  { cat: 'flammable liquids', re: /\b(?:in)?flammable\b|\bperfumes?\b|\beau de (?:parfum|toilette|cologne)\b|\bcolognes?\b|\bnail (?:polish|varnish)\b|\bacetone\b|\bpetrol\b|\bgasoline\b|\bdiesel\b|\bkerosene\b|\bparaffin oil\b|\blighter (?:fluid|refills?|gas)\b|\bmethylated spirits?\b|\bwhite spirit\b|\bturpentine\b|\bthinners?\b|\bethanol\b|\bmethanol\b|\bmethyl alcohol\b|\bisopropyl\b|\brubbing alcohol\b|\bhand sanitis(?:er|ing)\b|\bhand saniti[sz]er\b|\bsolvent[- ]based\b|\bfuel\b(?! tablets?)|\blamp oil\b|\bmeths\b/i },
];
const DG_POSSIBLE = [
  { cat: 'lithium batteries', why: 'it may contain a lithium battery', re: /\bbatter(?:y|ies)\b|\brechargeable\b|\b(?:bluetooth|wireless) (?:speakers?|earbuds|headphones|earphones)\b|\bsmart ?watch(?:es)?\b|\bfitness trackers?\b|\bcordless\b|\blaptops?\b(?! (?:bags?|sleeves?|stands?|cases?|covers?))|\bsmart ?phones?\b(?! (?:cases?|covers?|stands?|holders?|mounts?))|\bmobile phones?\b(?! (?:cases?|covers?|stands?|holders?|mounts?))|\b(?:ipads?|(?:android|samsung|galaxy|lenovo|kindle|fire|kids'?|drawing|graphics) tablets?)\b|\btablets?\b(?= (?:computers?|pcs?|devices?)\b|[^,.;]*\b(?:inch|screen|wi-?fi|android|\d+ ?gb)\b)|\bdrones?\b/i },
  { cat: 'aerosols', why: 'it may be pressurised', re: /\bsprays?\b(?! bottles?)|\bmist\b/i },
  { cat: 'flammable liquids', why: 'it may contain a flammable liquid', re: /\bpaints?\b|\bvarnish\b|\bglue\b|\badhesive\b|\bessential oils?\b|\breed diffusers?\b|\bdiffuser oils?\b|\bfragrance oils?\b|\bvodka\b|\bwhisk(?:e)?y\b|\bgin\b|\brum\b|\bliqueurs?\b|\bbrandy\b|\bspirits\b|\balcohol\b|\blighters?\b(?! (?:weight|colou?r|shade))|\bresin\b|\bcamping gas\b/i },
];
// Tier 2: other ADR classes found in ordinary goods (UK → EU road). Advisory only — R-06 above is the rulebook.
// Each entry: ADR class, category, description regex, typical UN numbers, and when the item is not regulated.
const DG_ADR = [
  { cls: '1', cat: 'fireworks, pyrotechnics, ammunition and tool cartridges', re: /\bfireworks?\b|\bsparklers?\b|\bparty poppers?\b|\b(?:christmas|xmas) crackers?\b|\bflares?\b|\bsmoke (?:grenades?|bombs?)\b|\bammunition\b|\bnail ?gun cartridges?\b|\bgunpowder\b|\bblack powder\b|\brocket motors?\b/i, un: ['UN0336', 'UN0337', 'UN0191', 'UN0197', 'UN0507', 'UN0012', 'UN0014', 'UN0323', 'UN0027', 'UN0161'], ok: 'There is no exemption for normal freight: it needs an ADR explosives carrier, and Eurotunnel refuses pyrotechnics.' },
  { cls: '2', cat: 'gas cartridges, lighters and gas cylinders', re: /\bgas (?:cartridges?|canisters?|cylinders?|bottles?|refills?)\b|\bbutane\b|\bpropane\b|\blpg\b|\bblow ?torch(?:es)?\b|(?<!fire )\blighters?\b(?! (?:weight|colou?r|shade))|\bhelium (?:canisters?|tanks?|cylinders?|balloon kits?)\b|\bco2 cylinders?\b|\bsodastream (?:cylinders?|gas)\b|\bnitrous oxide\b|\boxygen (?:cylinders?|tanks?|bottles?)\b|\bscuba tanks?\b|\bdiving cylinders?\b/i, un: ['UN2037', 'UN1057', 'UN1965', 'UN1978', 'UN3150', 'UN1046', 'UN1013', 'UN1070', 'UN1072'], ok: 'Not regulated if the cylinder or cartridge is empty.' },
  { cls: '2', cat: 'fire extinguishers', re: /\bfire extinguishers?\b/i, un: ['UN1044'], ok: 'Not regulated when packed in strong outer packaging with the trigger protected (ADR special provision 594).' },
  { cls: '2 (toxic, label 2.3)', cat: 'toxic gases', re: /\bchlorine gas\b|\banhydrous ammonia\b|\bammonia gas\b/i, un: ['UN1017', 'UN1005'], ok: 'There is no exemption: Eurotunnel and most road groupage refuse toxic gases.' },
  { cls: '4.1', cat: 'flammable solids', re: /\bmatches\b|\bmatchsticks?\b|\bfire ?lighters?\b|\bfuel tablets?\b|\bhexamine\b|\bmoth ?balls?\b|\bnaphthalene\b|\bslug pellets?\b|\bmetaldehyde\b/i, un: ['UN1944', 'UN1331', 'UN1945', 'UN2623', 'UN1328', 'UN1334', 'UN1332'], ok: 'It can travel as a declared limited quantity (inner packs up to 5 kg).' },
  { cls: '4.2', cat: 'self-heating substances', re: /\bcharcoal\b|\bactivated carbon\b|\bcolou?r run removers?\b|\bsodium dithionite\b/i, un: ['UN1361', 'UN1362', 'UN1384'], ok: "Not regulated if the supplier's safety data sheet shows it is not classified as self-heating; steam-activated carbon is not subject (special provision 646)." },
  { cls: '4.3', cat: 'water-reactive substances', re: /\bcalcium carbide\b|\bsodium metal\b|\b(?:flameless )?ration heaters?\b/i, un: ['UN1402', 'UN1428', 'UN2813'], ok: 'There is no exemption for normal freight; for ration heaters, section 14 of the safety data sheet decides (air-activated heaters are reportedly not regulated).' },
  { cls: '5.1', cat: 'oxidisers', re: /\bpool chlorine\b|\bchlorine (?:tablets?|granules?|shock)\b|\bpool shock\b|\btrichlor\b|\bdichlor\b|\bcalcium hypochlorite\b|\bstump (?:remover|killer)s?\b|\bpotassium (?:permanganate|nitrate)\b|\bsodium chlorate\b|\bhydrogen peroxide\b/i, un: ['UN2880', 'UN1748', 'UN2468', 'UN2465', 'UN1486', 'UN1490', 'UN1495', 'UN2984', 'UN2014'], ok: 'Hydrogen peroxide below 8% is not regulated; the others need ADR paperwork.' },
  { cls: '5.2', cat: 'organic peroxides', re: /\bbody filler hardeners?\b|\b(?:filler|fibreglass|fiberglass|resin) (?:hardeners?|catalysts?)\b|\bmekp\b|\bbenzoyl peroxide paste\b/i, un: ['UN3105', 'UN3106', 'UN3108'], ok: 'There is no exemption for normal freight; the resin half of a filler kit is also a flammable liquid.' },
  { cls: '6.1', cat: 'toxic substances', re: /\bpesticides?\b|\binsecticides?\b|\brat poison\b|\brodenticides?\b|\b(?:rat|mouse) bait\b|\bweed ?killer concentrate\b|\bconcentrated weed ?killer\b|\bpaint strippers?\b|\bdichloromethane\b|\bnicotine (?:concentrate|liquid|base)\b/i, un: ['UN2588', 'UN2902', 'UN3027', 'UN1593', 'UN3144'], ok: "Not regulated if the product's safety data sheet shows no ADR class (true of many ready-to-use garden products)." },
  { cls: '6.2', cat: 'infectious substances', re: /\bbiological (?:specimens?|samples?)\b|\bdiagnostic specimens?\b|\bclinical waste\b|\bsharps waste\b/i, un: ['UN3373', 'UN3291'], ok: 'There is no exemption: most road carriers refuse class 6.2.' },
  { cls: '7', cat: 'radioactive material', re: /\bioni[sz]ation smoke (?:alarms?|detectors?)\b|\bsmoke (?:alarms?|detectors?)\b|\btritium\b|\bthorium\b|\bgas mantles?\b/i, un: ['UN2911', 'UN2909'], ok: 'Optical (photoelectric) smoke alarms are not radioactive; ionisation units are excepted once sold to the end user, but bulk stock is regulated.' },
  { cls: '8', cat: 'wet and lead-acid batteries', re: /\b(?:car|leisure|motorcycle|agm|gel) batter(?:y|ies)\b|\blead[- ]acid\b/i, un: ['UN2794', 'UN2795', 'UN2800'], ok: 'New batteries secured and protected against short circuit (special provision 598), or non-spillable batteries (special provision 238), are not regulated; Pall-Ex refuses car batteries anyway.' },
  { cls: '8', cat: 'corrosive cleaners', re: /\bdrain (?:cleaners?|unblockers?)\b|\bcaustic soda\b|\bsodium hydroxide\b|\boven cleaners?\b|\b(?:brick|patio) acid\b|\b(?:hydrochloric|hydrofluoric|sulphuric|sulfuric) acid\b|\balloy wheel cleaners?\b|\bdescalers?\b|\bammonia\b/i, un: ['UN1823', 'UN1719', 'UN1760', 'UN1789', 'UN1790'], ok: "Not regulated if the product's safety data sheet says it is not classified." },
  { cls: '8', cat: 'mercury in articles', re: /\bmercury (?:thermometers?|barometers?)\b/i, un: ['UN3506'], ok: 'Articles with 1 kg of mercury or less each are not regulated (special provision 366).' },
  { cls: '9', cat: 'sodium-ion batteries', re: /\bsodium[- ]ion\b|\bna[- ]ion\b/i, un: ['UN3551', 'UN3552'], ok: 'There is no general exemption.' },
  { cls: '9', cat: 'fuelled engines and machinery', re: /\bchainsaws?\b|\blawn ?mowers?\b|\b(?:power|petrol|diesel|portable) generators?\b|\boutboard (?:motors?|engines?)\b|\bstrimmers?\b/i, un: ['UN3528', 'UN3529', 'UN3530'], ok: 'Not regulated if the fuel tank has been drained and the engine run dry; battery models are covered by R-06.' },
  { cls: '9', cat: 'dry ice', re: /\bdry ice\b|\bsolid co2\b|\bcardice\b/i, un: ['UN1845'], ok: 'Not subject to ADR except the coolant rules (5.5.3): mark the package as containing dry ice as coolant.' },
  { cls: '9', cat: 'life-saving appliances and kits', re: /\bauto(?:matic)?[- ]?inflat(?:ing|able) life ?jackets?\b|\blife ?jacket re-?arm kits?\b|\bchemistry sets?\b/i, un: ['UN2990', 'UN3316'], ok: 'There is no general exemption.' },
  { cls: '9', cat: 'airbags and seatbelt pretensioners', re: /\bair ?bags?\b|\bseat ?belt pretensioners?\b/i, un: ['UN3268'], ok: 'There is no general exemption.' },
  { cls: '9', cat: 'environmentally hazardous substances', re: /\bmarine pollutants?\b|\benvironmentally hazardous\b/i, un: ['UN3077', 'UN3082'], ok: 'Not regulated at 5 L / 5 kg or less per package (special provision 375).' },
];
// Phrases that look like a hazard keyword but are not; removed before the tier-2 scan.
const DG_SAFE = /\bbattery[- ]free\b|\bbattery chargers?\b|\bgas[- ]free\b|\bgas mark\b|\bgas hobs?\b|\bmatchbox\b|\bmatching\b|\bfire ?pits?\b|\bfire blankets?\b|\bspirit levels?\b|\bteam spirit\b|\bcharcoal (?:gr[ae]y|black|colou?r|toothpaste|soap|face ?masks?)\b|\bacid[- ]wash(?:ed)?\b|\b(?:hyaluronic|amino|salicylic|citric) acid\b|\bchlorine[- ]free\b|\bmercury[- ]free\b|\bfreddie mercury\b|\b(?:optical|photoelectric) smoke (?:alarms?|detectors?)\b|\bco2[- ]neutral\b|\bcarbon[- ]neutral\b|\bhelium[- ]free\b|\btoy rockets?\b|\bengine oil\b|\bsearch engine\b|\bflared?\s+(?:jeans|trousers|leg|skirts?)\b|\b(?:ink|toner|water filter|filter) cartridges?\b|\b[0-7](?:\.\d+)?\s*% hydrogen peroxide\b|\bhydrogen peroxide\s*[0-7](?:\.\d+)?\s*%/gi;
const NEG_BEFORE = /\b(?:no|non|without|free of|zero|not|excluding|excl\.?)[\s-]+(?:\w+[\s-]+){0,2}$/i;
const NEG_AFTER = /^[\s-]*(?:free|not included|excluded|not supplied|sold separately)\b/i;
function scanDG(text) {
  const t = clean(text);
  const out = { definite: [], possible: [], adr: [] };
  if (!t) return out;
  const hits = (re, src = t) => {
    const g = new RegExp(re.source, 'gi'); let m; const found = [];
    while ((m = g.exec(src))) {
      const before = src.slice(0, m.index), after = src.slice(m.index + m[0].length);
      if (NEG_BEFORE.test(before) || NEG_AFTER.test(after)) continue;
      found.push(m[0]);
    }
    return found;
  };
  for (const d of DG_DEFINITE) { const f = hits(d.re); if (f.length) out.definite.push({ cat: d.cat, words: [...new Set(f.map(x => x.toLowerCase()))] }); }
  for (const d of DG_POSSIBLE) {
    if (out.definite.some(x => x.cat === d.cat)) continue;
    const f = hits(d.re); if (f.length) out.possible.push({ cat: d.cat, why: d.why, words: [...new Set(f.map(x => x.toLowerCase()))] });
  }
  out.adr = [];
  if (out.definite.length) return out; // R-06 Red already stops the item
  const safeText = t.replace(DG_SAFE, ' ');
  for (const d of DG_ADR) {
    const f = hits(d.re, safeText);
    if (f.length) out.adr.push({ cls: d.cls, cat: d.cat, words: [...new Set(f.map(x => x.toLowerCase()))], un: d.un, ok: d.ok });
  }
  return out;
}

// ---------- HS suggestions (for fix text only; always "verify") ----------
const HS_HINTS = [
  // Specific before general — first match wins. Suggestions only; always to be verified on the UK Trade Tariff.
  [/\bporcelain\b|\bbone china\b|\bfine china\b/i, '691110', 'porcelain tableware'],
  [/\b(?:ceramic|stoneware|earthenware|pottery)\b.*\b(?:vases?|plant pots?|planters?|ornaments?|figurines?)\b|\b(?:vases?|planters?)\b.*\bceramic\b/i, '691390', 'ceramic ornaments and pots'],
  [/\bmugs?\b|\bcups?\b(?! ?cakes?)|\bteapots?\b|\bplates?\b|\bbowls?\b|\btableware\b|\bdinnerware\b|\bjugs?\b|\bsaucers?\b/i, '691200', 'ceramic tableware'],
  [/\b(?:drinking )?glasses\b|\btumblers?\b|\bwine glass(?:es)?\b/i, '701337', 'drinking glasses'],
  [/\bglass\b.*\b(?:vases?|jars?|bowls?)\b/i, '701399', 'glassware'],
  [/\bframed mirrors?\b|\bmirrors?\b/i, '700992', 'framed mirrors'],
  [/\bcast iron\b.*\b(?:enamel(?:led)?)\b|\benamel(?:led)? cast iron\b/i, '732392', 'enamelled cast-iron cookware'],
  [/\bcast iron\b.*\b(?:pans?|skillets?|pots?|casseroles?|dutch ovens?)\b/i, '732391', 'cast-iron cookware'],
  [/\b(?:log burners?|wood ?burners?|stoves?)\b/i, '732189', 'solid-fuel stoves'],
  [/\b(?:stainless steel|steel|metal)\b.*\b(?:bottles?|flasks?|tumblers?|pans?|pots?|kitchen)\b|\bwater bottles?\b|\bflasks?\b/i, '732393', 'stainless-steel household articles'],
  [/\baluminium\b.*\b(?:pans?|pots?|trays?|cookware)\b/i, '761510', 'aluminium kitchenware'],
  [/\bcutlery\b|\bforks?\b|\bspoons?\b/i, '821520', 'cutlery sets'],
  [/\b(?:brass|copper)\b.*\b(?:tins?|pots?|kitchen|bowls?)\b/i, '741810', 'copper/brass household articles'],
  [/\bbamboo\b.*\b(?:boards?|utensils?|trays?)\b/i, '441911', 'bamboo kitchen boards'],
  [/\b(?:chopping|cutting|serving|cheese) boards?\b|\bwooden (?:spoons?|utensils?|bowls?|trays?)\b/i, '441990', 'wooden tableware and kitchenware'],
  [/\bpicture frames?\b|\bphoto frames?\b/i, '441400', 'wooden frames'],
  [/\b(?:granite|marble|stone)\b.*\b(?:mortar|pestle|coasters?|boards?|bowls?)\b|\bpestle\b/i, '680293', 'worked granite/stone articles'],
  [/\bcandles?\b|\btealights?\b/i, '340600', 'candles'],
  [/\bsoaps?\b/i, '340111', 'toilet soap'],
  [/\bshampoo\b(?! bars?)/i, '330510', 'shampoo'],
  [/\blipsticks?\b|\blip balm\b/i, '330410', 'lip make-up'],
  [/\b(?:hand|face|body) (?:cream|lotion)\b|\bmoisturi[sz]er\b|\bskin ?care\b/i, '330499', 'skin-care preparations'],
  [/\btoothbrush(?:es)?\b/i, '960321', 'toothbrushes'],
  [/\bt-?shirts?\b|\btees?\b/i, '610910', 'cotton T-shirts'],
  [/\b(?:hoodies?|sweatshirts?|jumpers?|sweaters?|cardigans?)\b/i, '611020', 'cotton jerseys and sweatshirts'],
  [/\bsocks?\b/i, '611595', 'cotton socks'],
  [/\bjeans\b|\btrousers\b/i, '620342', 'cotton trousers'],
  [/\bdress(?:es)?\b/i, '620442', 'cotton dresses'],
  [/\bscar(?:f|ves)\b/i, '611710', 'knitted scarves'],
  [/\bgloves?\b|\bmittens?\b/i, '611693', 'knitted gloves'],
  [/\b(?:caps?|beanies?|hats?)\b/i, '650500', 'knitted or textile hats'],
  [/\btea towels?\b|\bkitchen towels?\b/i, '630291', 'cotton kitchen linen'],
  [/\btowels?\b/i, '630260', 'cotton terry towels'],
  [/\bnapkins?\b|\btablecloths?\b|\btable runners?\b/i, '630251', 'cotton table linen'],
  [/\b(?:bed ?sheets?|duvet covers?|pillowcases?|bed linen)\b/i, '630231', 'cotton bed linen'],
  [/\bblankets?\b|\bthrows?\b/i, '630130', 'cotton blankets and throws'],
  [/\bcurtains?\b/i, '630391', 'cotton curtains'],
  [/\brugs?\b|\bcarpets?\b|\bdoormats?\b/i, '570500', 'rugs'],
  [/\bcushions?\b|\bpillows?\b(?! ?cases?)/i, '940490', 'cushions and pillows'],
  [/\bchairs?\b|\bstools?\b/i, '940169', 'wooden seats'],
  [/\b(?:tables?|shelves|shelf|bookcases?|cabinets?|wooden furniture)\b/i, '940360', 'wooden furniture'],
  [/\btote bags?\b|\bcanvas bags?\b|\bshopping bags?\b/i, '420222', 'textile bags'],
  [/\bbackpacks?\b|\brucksacks?\b/i, '420292', 'textile backpacks'],
  [/\bsuitcases?\b|\bluggage\b/i, '420212', 'suitcases'],
  [/\bwallets?\b|\bpurses?\b|\bcard holders?\b/i, '420231', 'leather wallets'],
  [/\bhandbags?\b/i, '420221', 'leather handbags'],
  [/\bbelts?\b/i, '420330', 'leather belts'],
  [/\b(?:trainers?|sneakers?)\b/i, '640411', 'textile-upper sports shoes'],
  [/\b(?:shoes?|boots?)\b/i, '640399', 'leather footwear'],
  [/\bnotebooks?\b|\bjournals?\b|\bnotepads?\b|\bdiar(?:y|ies)\b/i, '482020', 'notebooks'],
  [/\bgreeting cards?\b|\bbirthday cards?\b|\bpostcards?\b/i, '490900', 'greeting cards'],
  [/\b(?:art )?prints?\b|\bposters?\b/i, '491191', 'printed pictures'],
  [/\bbooks?\b/i, '490199', 'printed books'],
  [/\bpens?\b/i, '960810', 'ballpoint pens'],
  [/\bpencils?\b/i, '960910', 'pencils'],
  [/\bjigsaws?\b|\bpuzzles?\b|\btoys?\b|\bdolls?\b|\bteddy\b|\bplush\b/i, '950300', 'toys and puzzles'],
  [/\bplaying cards\b/i, '950440', 'playing cards'],
  [/\bboard games?\b/i, '950490', 'board games'],
  [/\byoga mats?\b|\bdumbbells?\b|\bkettlebells?\b|\bresistance bands?\b/i, '950691', 'exercise equipment'],
  [/\bphone cases?\b|\bphone covers?\b|\bplastic\b/i, '392690', 'plastic articles'],
  [/\bstorage (?:boxes|box|containers?)\b|\blunch ?box(?:es)?\b/i, '392490', 'plastic household articles'],
  [/\bsilver\b.*\b(?:rings?|necklaces?|earrings?|bracelets?|jewel(?:le)?ry)\b/i, '711311', 'silver jewellery'],
  [/\b(?:rings?|necklaces?|earrings?|bracelets?|jewel(?:le)?ry)\b/i, '711719', 'imitation jewellery'],
  [/\bsunglasses\b/i, '900410', 'sunglasses'],
  [/\bumbrellas?\b/i, '660191', 'telescopic umbrellas'],
  [/\bgreen tea\b/i, '090210', 'green tea'],
  [/\btea\b/i, '090240', 'black tea', 'generic'],   // generic: hsSuggest skips it (0902 has four subheadings)
  [/\bpower ?banks?\b/i, '850760', 'lithium-ion power banks'],
  [/\bcoffee\b/i, '090121', 'roasted coffee'],
  [/\bchocolate\b/i, '180632', 'chocolate bars'],
  [/\bhoney\b/i, '040900', 'natural honey'],
  [/\bjams?\b|\bmarmalade\b|\bpreserves?\b/i, '200799', 'jams and marmalades'],
  [/\bbiscuits?\b|\bcookies?\b/i, '190531', 'sweet biscuits'],
  [/\bolive oil\b/i, '150920', 'olive oil'],
];
function hsHint(desc) { const d = clean(desc); for (const [re, code, label] of HS_HINTS) if (re.test(d)) return { code, label }; return null; }

// ---------- UK tariff index (assets/hs_index.json, exported from Supabase) ----------
// Read-only lookups. With no index loaded every lookup returns { known: null } and nothing is checked.
let HSX = null;
function setHsIndex(idx) {
  if (!idx || !idx.h6) { HSX = null; return; }
  const h4 = new Map(Object.entries(idx.h4 || {}));
  // h6 paths are exported relative to the heading: '' = the heading itself, '> …' = below it.
  const full = (c, v) => v === '' ? h4.get(c.slice(0, 4)) || '' : v.startsWith('> ') && h4.has(c.slice(0, 4)) ? `${h4.get(c.slice(0, 4))} ${v}` : v;
  HSX = { raw: idx, meta: idx.meta || {}, h4, h6: new Map(Object.entries(idx.h6).map(([c, v]) => [c, full(c, v)])), cn8: idx.cn8 || [], l10: idx.l10 || [] };
  // Suggestion data (design D6), built once: reference heads/qualifiers as tokens, candidates per prefix, IDF over HS-6 wording.
  const codes = [...HSX.h6.keys()].sort(), under = new Map();
  const subsOf = p => { if (!under.has(p)) { let lo = 0, hi = codes.length; while (lo < hi) { const m = (lo + hi) >> 1; if (codes[m] < p) lo = m + 1; else hi = m; } const out = []; while (lo < codes.length && codes[lo].startsWith(p)) out.push(codes[lo++]); under.set(p, out); } return under.get(p); };
  HSX.refs = (idx.refs || []).map(([title, prefix]) => { const cut = title.search(/,| - /), head = cut < 0 ? title : title.slice(0, cut), qual = cut < 0 ? '' : title.slice(cut + 1);
    return { title, head: hsTokens(head), qual: hsTokens(qual), cands: subsOf(prefix) }; }).filter(r => r.head.length && r.cands.length);
  HSX.h6tok = new Map(codes.map(c => [c, hsWording(HSX.h6.get(c))]));
  const df = new Map(); HSX.h6tok.forEach(w => new Set(w.tokens).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
  HSX.idf = new Map([...df].map(([t, n]) => [t, Math.log(codes.length / n)]));
}
function getHsIndex() { return HSX ? HSX.raw : null; }
function hsMeta() { return HSX ? HSX.meta : null; }
function inSorted(arr, v) { let lo = 0, hi = arr.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] === v) return true; if (arr[m] < v) lo = m + 1; else hi = m - 1; } return false; }
function hsLookup(digits) {
  if (!HSX) return { known: null };
  const d = String(digits == null ? '' : digits).replace(/\D/g, '');
  if (d.length < 6) return { known: false, hs6: d, desc: null, full: 'n/a' };
  const hs6 = d.slice(0, 6), desc = HSX.h6.get(hs6) || null;
  const full = d.length === 8 ? (inSorted(HSX.cn8, d) ? 'ok' : 'unknown') : d.length === 10 ? (inSorted(HSX.l10, d) ? 'ok' : 'unknown') : 'n/a';
  return { known: !!desc, hs6, desc, full };
}
function hsHeading(h4) {
  if (!HSX) return { known: null };
  const k = String(h4 == null ? '' : h4).replace(/\D/g, '').slice(0, 4), desc = k.length === 4 ? HSX.h4.get(k) || null : null;
  return { known: !!desc, desc, subs: desc ? [...HSX.h6.keys()].filter(c => c.startsWith(k)).sort() : [] };
}
// ---------- HS suggestion from the product description (design D6; recommendation only) ----------
const HS_STOP = new Set('a an the of and or for with without in on to by from per each set sets pack packs organic new other others assorted various item items piece pieces pcs pc pair pairs size small medium large mini made style kind type misc miscellaneous stock goods product products etc'.split(' '));
const HS_MATERIALS = ['cotton', 'wool', 'synthetic', 'polyester', 'nylon', 'silk', 'leather', 'porcelain', 'china', 'ceramic', 'stoneware', 'glass', 'plastic', 'steel', 'iron', 'aluminium', 'wood', 'paper'];
const HS_MATERIAL_RE = new RegExp(`\\b(${HS_MATERIALS.join('|')})\\b`, 'g');
function hsStem(w) { if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'; if (w.length > 3 && /(s|x|z)es$/.test(w)) return w.slice(0, -2); if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1); return w; }
function hsTokens(text) {
  const t = clean(text).toLowerCase().replace(/\bt[\s-]?shirts?\b|\btees?\b/g, ' t-shirt ')
    .replace(/\d+(?:[.,]\d+)?\s*(?:-\s*)?(?:ml|cl|l|ltr|litres?|g|kg|mg|mm|cm|m|mah|wh|v|w|pack|packs|pcs?|pieces?|x)?\b/g, ' ');
  const out = [];
  for (const raw of t.match(/[a-z]+(?:-[a-z]+)*/g) || []) for (const w of raw === 't-shirt' ? [raw] : raw.split('-')) { const s = hsStem(w); if (s.length > 1 && !HS_STOP.has(w) && !HS_STOP.has(s) && !out.includes(s)) out.push(s); }
  return out;
}
// Tokens of a tariff description, and the materials it names (words after "other than" are excluded materials).
function hsWording(desc) {
  const named = new Set(), d = String(desc || '').toLowerCase();
  d.split(/[>;,(]/).forEach(part => { for (const m of part.split(/\bother than\b/)[0].match(HS_MATERIAL_RE) || []) named.add(m); });
  return { tokens: hsTokens(desc), materials: named };
}
function hsSuggest(description) {
  const none = { level: 'none', codes: [], heading: null, matched: [], source: null };
  if (!HSX || !HSX.refs) return none;
  const d = clean(description), tok = hsTokens(d);
  if (!tok.length) return none;
  // S1 curated hints (generic entries skipped; code must exist in the snapshot)
  const mats = HS_MATERIALS.filter(m => tok.includes(m)), otherMaterial = c => { const n = HSX.h6tok.get(c).materials; return mats.length > 0 && n.size > 0 && !mats.some(m => n.has(m)); };
  for (const [re, code, , flag] of HS_HINTS) { const m = flag === 'generic' ? null : re.exec(d); if (m && HSX.h6.has(code) && !otherMaterial(code)) return { level: 'hs6', codes: [code], heading: code.slice(0, 4), matched: hsTokens(m[0]), source: 'curated' }; }
  const score = new Map(), why = new Map();
  const bump = (c, v, words) => { if (v > (score.get(c) || 0)) { score.set(c, v); why.set(c, words); } };
  // S2 search references: every head token present; 3 per head token (1 for a bare material word) + 1 per matched qualifier − 0.1 per unmatched qualifier
  let source = 'reference';
  for (const r of HSX.refs) {
    if (!r.head.every(t => tok.includes(t))) continue;
    const q = r.qual.filter(t => tok.includes(t)), v = r.head.reduce((a, t) => a + (HS_MATERIALS.includes(t) ? 1 : 3), 0) + q.length - 0.1 * (r.qual.length - q.length);
    r.cands.forEach(c => bump(c, v, [...r.head, ...q]));
  }
  // S3 tariff wording, only when nothing else matched: IDF-weighted overlap with each HS-6 description
  if (!score.size) {
    source = 'tariff';
    const need = Math.ceil(tok.length / 2);   // a single shared word ("kit") is not enough
    HSX.h6tok.forEach((w, c) => { const hit = tok.filter(t => w.tokens.includes(t)); if (hit.length >= need) bump(c, hit.reduce((a, t) => a + (HSX.idf.get(t) || 0), 0), hit); });
    if (!score.size) return none;
  }
  // Material check
  if (mats.length) score.forEach((v, c) => { const named = HSX.h6tok.get(c).materials; if (mats.some(m => named.has(m))) score.set(c, v * 1.5); else if (named.size) score.set(c, v * 0.3); });
  const ranked = [...score].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const [top, second] = ranked, matchedOf = cs => [...new Set(cs.flatMap(c => why.get(c)))];
  if (!second || top[1] >= 1.5 * second[1]) return { level: 'hs6', codes: [top[0]], heading: top[0].slice(0, 4), matched: matchedOf([top[0]]), source };
  const tied = ranked.filter(([, v]) => v >= top[1] - 1e-9).map(([c]) => c);
  if (new Set(tied.map(c => c.slice(0, 4))).size === 1) { const codes = tied.slice().sort(); return { level: 'heading', codes, heading: codes[0].slice(0, 4), matched: matchedOf(codes), source }; }
  const codes = ranked.filter(([, v]) => v >= top[1] / 1.5).slice(0, 3).map(([c]) => c);
  return { level: 'list', codes, heading: null, matched: matchedOf(codes), source };
}
function hsMaterialsOf(code) { return HSX && HSX.h6tok && HSX.h6tok.has(code) ? [...HSX.h6tok.get(code).materials] : []; }
// Short label for fix text: the heading's first clause plus the levels below it ("Coffee > Coffee, not roasted > Not decaffeinated").
function hsShort(desc) {
  if (!desc) return '';
  const parts = desc.split(' > ');
  if (parts.length === 1) { const d = desc.length > 110 ? desc.split(' (')[0].split(';')[0] : desc; return d.length > 110 ? d.slice(0, 107).replace(/[ ,;]+\S*$/, '') + '…' : d; }
  const head = parts[0].split(/[;,]/)[0], all = [head, ...parts.slice(1)].join(' > ');
  return all.length <= 90 ? all : `${head} > ${parts[parts.length - 1]}`;
}
// Codes recommended from the code as entered (never applied; shown with a "Use" action): lost leading zeros, single-subheading headings.
function hsRecommend(hs) {
  if (!HSX || !hs || hs.blank || hs.hasLetters) return [];
  const d = hs.digits, out = [];
  if (hs.numericCell && [5, 7, 9].includes(d.length)) { const r = hsLookup('0' + d); if (r.known) out.push({ code: '0' + d, desc: r.desc, why: 'leading zero dropped by the spreadsheet' }); }
  if (d.length === 4) { const h = hsHeading(d); if (h.known && h.subs.length === 1) out.push({ code: h.subs[0], desc: HSX.h6.get(h.subs[0]), why: `the only subheading of heading ${d}` }); }
  return out;
}
if (root.HS_INDEX) setHsIndex(root.HS_INDEX);

// ---------- File parsing: sheet arrays -> booking objects ----------
const KEY = s => clean(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const BOOKING_COLS = {
  id: ['bookingid', 'booking', 'bookingref', 'bookingreference'],
  seller: ['sellername', 'seller'],
  originCity: ['origincity'], originCountry: ['origincountry'],
  destCity: ['destinationcity', 'destcity'], destCountry: ['destinationcountry', 'destcountry'],
  destType: ['destinationtype', 'desttype'],
  ready: ['readytoshipdate', 'readydate', 'readytoship', 'shipdate'],
  priority: ['sellerpriority', 'priority'],
  pallets: ['pallets', 'palletcount', 'noofpallets'],
  cartons: ['cartons', 'totalcartons'],
  declared: ['totaldeclaredvalue', 'declaredvalue'],
  currency: ['currency'],
  gross: ['totalgrossweightkg', 'totalgrossweight', 'grossweightkg', 'grossweight'],
  appointment: ['deliveryappointmentbooked', 'deliveryappointment', 'appointmentbooked'],
};
const ITEM_COLS = {
  id: ['bookingid', 'booking'], sku: ['sku'], description: ['description', 'productdescription'],
  hs: ['hscode', 'hs', 'commoditycode'], qty: ['quantityunits', 'quantity', 'qty', 'units'],
  price: ['unitprice', 'priceperunit', 'price'], upc: ['unitspercarton', 'unitsperbox'],
  cartons: ['cartons', 'itemcartons'], unitWeight: ['unitweightkg', 'unitweight'],
  coo: ['countryoforigin', 'origin', 'coo'],
};
function findHeader(rows, cols) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const keys = (rows[r] || []).map(KEY);
    if (!keys.includes('bookingid')) continue;
    const map = {};
    for (const [field, aliases] of Object.entries(cols)) {
      const idx = keys.findIndex(k => aliases.includes(k));
      if (idx >= 0) map[field] = idx;
    }
    return { row: r, map };
  }
  return null;
}
function sameAsExample(row, map, cols, example) {
  const fields = Object.keys(cols);
  return fields.every((f, i) => {
    if (map[f] == null) return true;
    const a = row[map[f]], b = example[i];
    if (typeof b === 'number') return near(num(a), b);
    return clean(a) === clean(b);
  });
}
function classifySheet(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const keys = (rows[r] || []).map(KEY);
    if (keys.includes('bookingid')) {
      if (keys.includes('sku') || keys.includes('unitprice') || keys.includes('hscode')) return 'items';
      if (keys.includes('sellername') || keys.includes('pallets') || keys.includes('destinationcity')) return 'bookings';
    }
  }
  return null;
}

/** sheets: [{name, rows}] (rows = array of arrays). Returns {bookings, notices}. */
function parseSheets(sheets, opts = {}) {
  const skipExample = opts.skipExample !== false;
  const notices = [];
  let bSheet = null, iSheet = null;
  for (const s of sheets) {
    const n = s.name.toLowerCase();
    const kind = classifySheet(s.rows) || (/booking/.test(n) ? 'bookings' : /item/.test(n) ? 'items' : null);
    if (kind === 'bookings' && !bSheet) bSheet = s;
    if (kind === 'items' && !iSheet) iSheet = s;
  }
  if (!bSheet) notices.push({ level: 'Red', text: 'No Bookings sheet found. Upload a workbook (or CSV) whose header row includes “Booking ID”, “Seller name”, “Pallets”…' });
  if (!iSheet) notices.push({ level: 'Red', text: 'No Items sheet found. Each booking needs its item lines (header row with “Booking ID”, “SKU”, “Unit price”…).' });
  if (!bSheet) return { bookings: [], notices };

  const bh = findHeader(bSheet.rows, BOOKING_COLS);
  const missingCols = Object.keys(BOOKING_COLS).filter(f => bh.map[f] == null);
  if (missingCols.length) notices.push({ level: 'Amber', text: `Bookings sheet is missing column(s): ${missingCols.join(', ')}. Those values are treated as blank.` });
  const bookings = []; const byId = new Map(); let skippedEx = false;
  for (let r = bh.row + 1; r < bSheet.rows.length; r++) {
    const row = bSheet.rows[r] || [];
    if (row.every(isBlank)) continue;
    if (skipExample && !skippedEx && r === bh.row + 1 && sameAsExample(row, bh.map, BOOKING_COLS, EXAMPLE_BOOKING)) { skippedEx = true; notices.push({ level: 'Info', text: 'Skipped the grey template example row (BK-001 · Northfield Goods) in Bookings.' }); continue; }
    const g = f => (bh.map[f] == null ? null : row[bh.map[f]]);
    const b = {
      id: clean(g('id')), rowNum: r + 1, source: 'file',
      seller: g('seller'), originCity: g('originCity'), originCountry: g('originCountry'),
      destCity: g('destCity'), destCountry: g('destCountry'), destType: g('destType'), ready: g('ready'),
      priority: g('priority'), pallets: g('pallets'), cartons: g('cartons'), declared: g('declared'),
      currency: g('currency'), gross: g('gross'), appointment: g('appointment'), items: [],
    };
    if (!b.id) b.id = `(row ${r + 1})`;
    const key = clean(b.id).toUpperCase();
    if (byId.has(key)) { b.duplicateOf = byId.get(key).rowNum; }
    else byId.set(key, b);
    bookings.push(b);
  }
  if (iSheet) {
    const ih = findHeader(iSheet.rows, ITEM_COLS);
    const orphans = []; let skippedItemEx = false;
    for (let r = ih.row + 1; r < iSheet.rows.length; r++) {
      const row = iSheet.rows[r] || [];
      if (row.every(isBlank)) continue;
      if (skipExample && skippedEx && !skippedItemEx && r === ih.row + 1 && sameAsExample(row, ih.map, ITEM_COLS, EXAMPLE_ITEM)) { skippedItemEx = true; continue; }
      const g = f => (ih.map[f] == null ? null : row[ih.map[f]]);
      const it = { rowNum: r + 1, sku: g('sku'), description: g('description'), hs: g('hs'), qty: g('qty'), price: g('price'), upc: g('upc'), cartons: g('cartons'), unitWeight: g('unitWeight'), coo: g('coo') };
      const id = clean(g('id')).toUpperCase();
      const b = byId.get(id);
      if (b) b.items.push(it); else orphans.push({ id: clean(g('id')) || '(blank)', row: r + 1, sku: clean(it.sku) });
    }
    if (orphans.length) notices.push({ level: 'Amber', text: `${orphans.length} item row(s) point to a Booking ID that isn't on the Bookings sheet and were not checked: ${orphans.slice(0, 8).map(o => `${o.id} (row ${o.row}${o.sku ? ', ' + o.sku : ''})`).join('; ')}${orphans.length > 8 ? '…' : ''}.` });
  }
  return { bookings, notices };
}

// ---------- Normalise a raw booking (from file or chat) ----------
function normaliseBooking(raw) {
  const issues = []; // data-quality issues (not rulebook)
  const red = (field, text, fix) => issues.push({ sev: 'Red', field, text, fix });
  const amber = (field, text, fix) => issues.push({ sev: 'Amber', field, text, fix });
  const b = { id: raw.id || 'NEW', source: raw.source || 'chat', duplicateOf: raw.duplicateOf, carrierOverride: raw.carrierOverride || null };
  // Automatic corrections: every value used that differs from what was entered (beyond surrounding spaces).
  // Recorded for human review only; they never change a status.
  b.corrections = [];
  const corr = (scope, field, label, rawV, used, kind, why, sku) => {
    if (used == null || (typeof used === 'number' && !isFinite(used))) return;
    const blank = isBlank(rawV);
    if (blank && kind !== 'default' && kind !== 'derived') return;
    const entered = blank ? '' : clean(rawV);
    if (!blank && entered === String(used)) return;
    b.corrections.push({ id: `${scope}:${sku || ''}:${field}`, scope, field, label, sku: sku || null, entered, used: String(used), kind, why });
  };
  const caseOrAlias = (r, u) => (clean(r).toLowerCase() === String(u).toLowerCase() ? 'format' : 'alias');

  b.seller = clean(raw.seller);
  if (!b.seller) red('Seller name', 'Seller name is missing.', 'Add the business name that is sending the goods — it goes on the commercial invoice.');

  b.originCity = normCity(raw.originCity, ORIGIN_CITIES);
  if (!b.originCity) red('Origin city', isBlank(raw.originCity) ? 'Origin city is missing.' : `Origin city “${clean(raw.originCity)}” isn't a collection point we serve.`, `Use one of: ${ORIGIN_CITIES.join(', ')}.`);
  if (b.originCity) corr('booking', 'originCity', 'Origin city', raw.originCity, b.originCity, caseOrAlias(raw.originCity, b.originCity), 'Recognised city name');
  b.originCountry = isBlank(raw.originCountry) ? 'United Kingdom' : normCountry(raw.originCountry);
  if (isBlank(raw.originCountry)) corr('booking', 'originCountry', 'Origin country', raw.originCountry, 'United Kingdom', 'default', 'Every route starts in the United Kingdom');
  else if (b.originCountry) corr('booking', 'originCountry', 'Origin country', raw.originCountry, b.originCountry, caseOrAlias(raw.originCountry, b.originCountry), 'Recognised country name');
  if (b.originCountry !== 'United Kingdom') red('Origin country', `Origin country “${clean(raw.originCountry)}” isn't served — every route starts in the United Kingdom.`, 'Set origin country to United Kingdom.');

  b.destCity = normCity(raw.destCity, Object.keys(CITY_COUNTRY));
  const dc = isBlank(raw.destCountry) ? null : normCountry(raw.destCountry);
  if (!b.destCity) red('Destination city', isBlank(raw.destCity) ? 'Destination city is missing.' : `Destination city “${clean(raw.destCity)}” isn't on any carrier route.`, 'Use Berlin, Frankfurt, Hamburg (Germany), Paris, Lyon (France), Amsterdam or Rotterdam (Netherlands).');
  if (!isBlank(raw.destCountry) && !['Germany', 'France', 'Netherlands'].includes(dc)) red('Destination country', `Destination country “${clean(raw.destCountry)}” has no carrier route.`, 'Routes run to Germany, France or the Netherlands only.');
  if (b.destCity && dc && CITY_COUNTRY[b.destCity] !== dc) red('Destination', `${b.destCity} is in ${CITY_COUNTRY[b.destCity]}, but the destination country says ${dc}.`, `Correct either the city or the country so they match (e.g. ${b.destCity} · ${CITY_COUNTRY[b.destCity]}).`);
  b.destCountry = b.destCity ? CITY_COUNTRY[b.destCity] : (['Germany', 'France', 'Netherlands'].includes(dc) ? dc : null);
  if (b.destCity) corr('booking', 'destCity', 'Destination city', raw.destCity, b.destCity, caseOrAlias(raw.destCity, b.destCity), 'Recognised city name');
  if (isBlank(raw.destCountry) && b.destCountry) corr('booking', 'destCountry', 'Destination country', raw.destCountry, b.destCountry, 'derived', `Taken from the destination city (${b.destCity})`);
  else if (dc && b.destCountry === dc) corr('booking', 'destCountry', 'Destination country', raw.destCountry, dc, caseOrAlias(raw.destCountry, dc), 'Recognised country name');

  b.destType = normDestType(raw.destType);
  if (b.destType) corr('booking', 'destType', 'Destination type', raw.destType, b.destType, caseOrAlias(raw.destType, b.destType), `Read as ${b.destType}`);
  if (!b.destType) red('Destination type', isBlank(raw.destType) ? 'Destination type is missing.' : `Destination type “${clean(raw.destType)}” isn't recognised.`, 'Set it to Warehouse or Business address.');

  const d = typeof raw.ready === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.ready) && raw.readyIsISO ? { iso: raw.ready } : parseSheetDate(raw.ready);
  b.ready = d.iso || null;
  if (b.ready && !raw.readyIsISO && raw.source !== 'chat' && !(typeof raw.ready === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(clean(raw.ready)))) {
    const entered = raw.ready instanceof Date ? raw.ready.toISOString().slice(0, 10) : raw.ready;
    corr('booking', 'ready', 'Ready to ship date', entered, fmtDate(b.ready), 'date', typeof raw.ready === 'number' || raw.ready instanceof Date ? 'Excel date cell read as DD-MM-YYYY' : 'Date read as DD-MM-YYYY');
  }
  if (!b.ready) red('Ready to ship date', d.error === 'missing' ? 'Ready to ship date is missing.' : `Ready to ship date ${d.error}.`, 'Enter the collection date as DD-MM-YYYY.');

  b.priority = PRIORITIES.includes(raw.priority) ? raw.priority : normPriority(raw.priority);
  if (!b.priority) amber('Seller priority', isBlank(raw.priority) ? 'Seller priority is missing — recommending on a Balanced basis.' : `Seller priority “${clean(raw.priority)}” isn't recognised — recommending on a Balanced basis.`, 'Choose Cheapest, Fastest, Most reliable or Balanced.');
  b.priorityUsed = b.priority || 'Balanced';
  if (b.priority && !isBlank(raw.priority) && !PRIORITIES.includes(raw.priority)) corr('booking', 'priority', 'Seller priority', raw.priority, b.priority, caseOrAlias(raw.priority, b.priority), 'Recognised priority');

  const count = (field, label, allowZero = false) => {
    const v = num(raw[field]);
    if (v == null) { red(label, `${label} is missing.`, `Enter the ${label.toLowerCase()}.`); return null; }
    if (isNaN(v)) { red(label, `${label} “${clean(raw[field])}” isn't a number.`, `Enter ${label.toLowerCase()} as a whole number.`); return null; }
    if (v < 0 || (!allowZero && v === 0)) { red(label, `${label} is ${v} — it must be more than zero.`, `Enter the real ${label.toLowerCase()}.`); return v === 0 ? 0 : null; }
    if (!Number.isInteger(v)) { red(label, `${label} is ${v} — it must be a whole number.`, `Round to the real count of ${label.toLowerCase()}.`); }
    if (typeof raw[field] === 'string') corr('booking', field, label, raw[field], v, 'format', 'Removed £, commas or units');
    return v;
  };
  const amount = (field, label) => {
    const v = num(raw[field]);
    if (v == null) { red(label, `${label} is missing.`, `Enter the ${label.toLowerCase()}.`); return null; }
    if (isNaN(v)) { red(label, `${label} “${clean(raw[field])}” isn't a number.`, `Enter ${label.toLowerCase()} as a number.`); return null; }
    if (v <= 0) { red(label, `${label} is ${v} — it must be more than zero.`, `Enter the real ${label.toLowerCase()}.`); return v; }
    if (typeof raw[field] === 'string') corr('booking', field, label, raw[field], v, 'format', 'Removed £, commas or units');
    return v;
  };
  b.pallets = count('pallets', 'Pallets');
  b.cartons = count('cartons', 'Cartons');
  b.declared = amount('declared', 'Total declared value');
  b.gross = amount('gross', 'Total gross weight');
  b.currency = isBlank(raw.currency) ? 'GBP' : clean(raw.currency).toUpperCase();
  if (isBlank(raw.currency)) corr('booking', 'currency', 'Currency', raw.currency, 'GBP', 'default', 'Only GBP is supported');
  else if (b.currency === 'GBP') corr('booking', 'currency', 'Currency', raw.currency, 'GBP', 'format', 'Currency code in capitals');
  if (raw.derived && raw.derived.cartons && isNum(b.cartons)) corr('booking', 'cartons', 'Cartons', '', b.cartons, 'derived', 'Worked out: sum of the item cartons');
  if (raw.derived && raw.derived.declared && isNum(b.declared)) corr('booking', 'declared', 'Total declared value', '', b.declared, 'derived', 'Worked out: quantity × unit price across items');
  if (b.currency !== 'GBP') red('Currency', `Currency is ${clean(raw.currency)} — this service books in GBP only.`, 'Convert all money values to GBP and set currency to GBP.');

  b.appointment = normYesNo(raw.appointment);
  if (b.appointment && !isBlank(raw.appointment)) corr('booking', 'appointment', 'Delivery appointment', raw.appointment, b.appointment, caseOrAlias(raw.appointment, b.appointment), 'Read as Yes/No');
  if (!b.appointment && b.destType === 'Warehouse') amber('Delivery appointment', isBlank(raw.appointment) ? 'Delivery appointment answer is missing — treated as not booked.' : `Delivery appointment “${clean(raw.appointment)}” isn't Yes/No — treated as not booked.`, 'Answer Yes or No.');

  if (b.duplicateOf) red('Booking ID', `Booking ID ${b.id} is used more than once (first on row ${b.duplicateOf}). Items can't be matched safely.`, 'Give every booking a unique ID.');

  b.items = (raw.items || []).map((it, i) => {
    const n = { idx: i, rowNum: it.rowNum, sku: clean(it.sku) || `ITEM-${i + 1}`, description: clean(it.description) };
    const lab = n.sku;
    if (!clean(it.sku)) amber(`Item ${i + 1}`, `Item line ${i + 1}${it.rowNum ? ' (row ' + it.rowNum + ')' : ''} has no SKU.`, 'Add the seller SKU so the warehouse can match cartons.');
    if (!n.description) red(lab, `${lab} has no description.`, 'Describe the product in plain words — customs and the dangerous-goods check need it.');
    n.hs = normHS(it.hs);
    if (!n.hs.blank && !n.hs.hasLetters && n.hs.digits) corr('item', 'hs', 'HS code', it.hs, n.hs.digits, 'format', 'HS digits read without dots, spaces or prefix', n.sku);
    n.hsRec = hsRecommend(n.hs);
    n.hsSug = n.hs.blank || n.hs.hasLetters || n.hs.digits.length < 6 ? hsSuggest(it.description) : null;   // recommendation only
    const v = (f, label, isCount) => {
      const x = num(it[f]);
      if (x == null) { red(lab, `${lab}: ${label} is missing.`, `Enter ${label} for ${lab}.`); return null; }
      if (isNaN(x)) { red(lab, `${lab}: ${label} “${clean(it[f])}” isn't a number.`, `Enter ${label} as a number.`); return null; }
      if (x <= 0) { red(lab, `${lab}: ${label} is ${x} — it must be more than zero.`, `Enter the real ${label}.`); return x; }
      if (isCount && !Number.isInteger(x)) red(lab, `${lab}: ${label} is ${x} — it must be a whole number.`, `Use a whole number for ${label}.`);
      if (typeof it[f] === 'string') corr('item', f, label.charAt(0).toUpperCase() + label.slice(1), it[f], x, 'format', 'Removed £, commas or units', n.sku);
      return x;
    };
    n.qty = v('qty', 'quantity', true);
    n.price = v('price', 'unit price', false);
    n.upc = v('upc', 'units per carton', true);
    n.cartons = v('cartons', 'cartons', true);
    n.unitWeight = v('unitWeight', 'unit weight', false);
    const dv = it.derived || {};
    if (dv.cartons && isNum(n.cartons)) corr('item', 'cartons', 'Cartons', '', n.cartons, 'derived', `Worked out: ${fmtNum(n.qty)} ÷ ${fmtNum(n.upc)} per carton`, n.sku);
    if (dv.qty && isNum(n.qty)) corr('item', 'qty', 'Quantity', '', n.qty, 'derived', `Worked out: ${fmtNum(n.cartons)} cartons × ${fmtNum(n.upc)}`, n.sku);
    if (dv.upc && isNum(n.upc)) corr('item', 'upc', 'Units per carton', '', n.upc, 'derived', `Worked out: ${fmtNum(n.qty)} ÷ ${fmtNum(n.cartons)} cartons`, n.sku);
    if (isBlank(it.coo)) n.coo = null;
    else { n.coo = normCountry(it.coo) || clean(it.coo); if (normCountry(it.coo)) corr('item', 'coo', 'Country of origin', it.coo, n.coo, caseOrAlias(it.coo, n.coo), 'Recognised country name', n.sku); if (!COO_LIST.includes(n.coo)) amber(lab, `${lab}: country of origin “${clean(it.coo)}” isn't one of the expected values.`, `Use the full country name (e.g. ${COO_LIST.join(', ')}).`); }
    return n;
  });
  if (!b.items.length) red('Items', 'This booking has no item lines.', 'Add at least one item (SKU, description, HS code, quantity, unit price, packing and weight) — the commercial invoice is built from them.');
  const skuSeen = {};
  b.items.forEach(it => { const k = it.sku.toUpperCase(); if (skuSeen[k]) amber(it.sku, `${it.sku} appears on more than one item line.`, 'Merge duplicate lines or give each SKU its own code, so carton labels match.'); skuSeen[k] = true; });
  b.dataIssues = issues;
  return b;
}

// ---------- Carrier ranking ----------
function carriersFor(country) { return CARRIERS.filter(c => c.dest === country); }
function sortByPriority(opts, priority) {
  const s = [...opts];
  const by = {
    Cheapest: (a, b) => a.cost - b.cost || a.transit - b.transit || b.onTime - a.onTime,
    Fastest: (a, b) => a.transit - b.transit || b.onTime - a.onTime || a.cost - b.cost,
    'Most reliable': (a, b) => b.onTime - a.onTime || a.transit - b.transit || a.cost - b.cost,
  }[priority];
  if (by) return { order: s.sort(by), why: [] };
  // Balanced: start from the cheapest; step up to a faster service only when
  // the % saved on transit time is at least the % added to cost.
  s.sort((a, b) => a.cost - b.cost || a.transit - b.transit);
  let pick = s[0]; const why = [];
  for (const nx of s.slice(1)) {
    if (nx.transit >= pick.transit) continue;
    const costUp = (nx.cost - pick.cost) / pick.cost, timeDown = (pick.transit - nx.transit) / pick.transit;
    const ok = costUp <= timeDown + 1e-9;
    why.push({ from: pick, to: nx, costUp, timeDown, ok });
    if (ok) pick = nx;
  }
  const order = [pick, ...s.filter(x => x !== pick)];
  return { order, why };
}
const label = c => `${c.carrier} · ${c.service}`;
const pct = x => `${Math.round(x * 100)}%`;
function priorityReason(top, priority, opts, why) {
  if (priority === 'Cheapest') return `${label(top)} is the lowest-cost option on this route (${gbp(top.cost)} for ${top.pallets} pallet${top.pallets === 1 ? '' : 's'}).`;
  if (priority === 'Fastest') return `${label(top)} has the shortest transit time (${top.transit} days).`;
  if (priority === 'Most reliable') return `${label(top)} has the highest on-time rate (${top.onTime}%).`;
  const steps = why.map(w => `${w.to.carrier} costs ${pct(w.costUp)} more than ${w.from.carrier} and arrives ${pct(w.timeDown)} sooner (${w.to.transit} vs ${w.from.transit} days) — ${w.ok ? 'worth it' : 'not worth it'}`);
  return `Balanced = start with the cheapest, and only pay for a faster service when the time saved (in %) is at least the extra cost (in %). ${steps.join('; ')}. So ${label(top)} is the best trade-off (${gbp(top.cost)}, ${top.transit} days, ${top.onTime}% on time).`;
}

function recommend(b) {
  if (!b.destCountry) return null;
  const pallets = isNum(b.pallets) && b.pallets > 0 ? b.pallets : null;
  const wpp = pallets && isNum(b.gross) ? b.gross / pallets : null;
  const opts = carriersFor(b.destCountry).map(c => ({ ...c, key: c.carrier, pallets: pallets || 1, cost: c.price * (pallets || 1), wpp, fits: wpp == null ? null : wpp <= c.maxW + 1e-9 }));
  const priority = b.priorityUsed;
  const { order, why } = sortByPriority(opts, priority);
  const priorityPick = order[0];
  let chosen = priorityPick, overridden = false;
  if (b.carrierOverride) { const o = opts.find(c => c.carrier === b.carrierOverride); if (o) { chosen = o; overridden = o !== priorityPick; } }
  const rec = { opts, priority, priorityPick, chosen, overridden, wpp, reason: priorityReason(priorityPick, priority, opts, why), fixes: [] };
  if (chosen.fits === false && isNum(b.gross)) {
    // Build fix scenarios: switch carrier as-is, or re-pack onto more pallets.
    const scen = opts.map(c => {
      const need = Math.max(pallets, Math.ceil(b.gross / c.maxW - 1e-9));
      return { ...c, pallets: need, cost: c.price * need, repack: need > pallets, wpp: b.gross / need, fits: true };
    });
    const ranked = sortByPriority(scen, priority).order;
    const switchAlt = ranked.find(s => !s.repack && s.carrier !== chosen.carrier);
    const keep = scen.find(s => s.carrier === chosen.carrier);
    rec.bestFix = ranked[0];
    if (switchAlt) rec.fixes.push({ type: 'switch', carrier: switchAlt.carrier, text: `Switch to ${label(switchAlt)} — it accepts up to ${switchAlt.maxW} kg per pallet (${gbp(switchAlt.cost)}, ${switchAlt.transit} days, ${switchAlt.onTime}% on time).`, cost: switchAlt.cost });
    rec.fixes.push({ type: 'repack', carrier: keep.carrier, pallets: keep.pallets, text: `Keep ${label(keep)} by re-packing onto ${keep.pallets} pallets (${kg(b.gross / keep.pallets)} each, ${gbp(keep.cost)}).`, cost: keep.cost });
    const best = ranked[0];
    if (best.repack && best.carrier !== keep.carrier) rec.fixes.push({ type: 'repack', carrier: best.carrier, pallets: best.pallets, text: `Re-pack onto ${best.pallets} pallets and switch to ${label(best)} (${kg(b.gross / best.pallets)} each, ${gbp(best.cost)}, ${best.transit} days).`, cost: best.cost });
    rec.fixes.sort((a, c) => (ranked.findIndex(s => s.carrier === a.carrier && (a.type === 'repack') === s.repack) - ranked.findIndex(s => s.carrier === c.carrier && (c.type === 'repack') === s.repack)));
  }
  return rec;
}

// ---------- Pallet plan (weight only; a recommendation, never applied by itself) ----------
const PALLET_TARE_KG = 25;
const SPLIT_MAX_CARTONS = 2000;
function palletPlan(b, chosenCarrier) {
  if (!b.destCountry) return null;
  const items = b.items || [];
  let weight = null, estimated = false;
  if (isNum(b.gross) && b.gross > 0) weight = b.gross;
  else if (items.length && items.every(it => isNum(it.unitWeight) && isNum(it.qty))) {
    const net = items.reduce((a, it) => a + it.unitWeight * it.qty, 0);
    weight = round2(net + PALLET_TARE_KG * Math.max(1, isNum(b.pallets) && b.pallets > 0 ? b.pallets : 1));
    estimated = true;
  }
  if (weight == null) return null;
  const perCarrier = carriersFor(b.destCountry).map(c => {
    const minPallets = Math.max(1, Math.ceil(weight / c.maxW - 1e-9));
    return { carrier: c.carrier, service: c.service, maxW: c.maxW, minPallets, perPallet: round2(weight / minPallets), cost: c.price * minPallets };
  });
  const chosen = perCarrier.find(p => p.carrier === chosenCarrier) || null;
  let fewer = null;
  if (chosen && isNum(b.pallets) && Number.isInteger(b.pallets) && b.pallets > chosen.minPallets) {
    const price = carriersFor(b.destCountry).find(c => c.carrier === chosen.carrier).price;
    fewer = { carrier: chosen.carrier, from: b.pallets, to: chosen.minPallets, perPallet: chosen.perPallet, saving: price * (b.pallets - chosen.minPallets) };
  }
  // Carton split: heaviest carton first onto the lightest pallet (LPT). Balances goods weight only.
  let split = null, splitNote = null;
  const n = chosen ? chosen.minPallets : null;
  if (!n) splitNote = 'No carrier chosen, so no carton split.';
  else if (!items.length || !items.every(it => isNum(it.upc) && isNum(it.unitWeight) && isNum(it.cartons) && Number.isInteger(it.cartons) && it.cartons > 0)) splitNote = 'Carton split needs units per carton, unit weight and a whole number of cartons for every item.';
  else if (items.reduce((a, it) => a + it.cartons, 0) > SPLIT_MAX_CARTONS) splitNote = `More than ${SPLIT_MAX_CARTONS} cartons — carton split skipped.`;
  else {
    const cartons = [];
    items.forEach(it => { const w = it.upc * it.unitWeight; for (let k = 0; k < it.cartons; k++) cartons.push({ sku: it.sku, w }); });
    cartons.sort((x, y) => y.w - x.w || (x.sku < y.sku ? -1 : x.sku > y.sku ? 1 : 0));
    split = Array.from({ length: n }, (_, i) => ({ pallet: i + 1, kg: 0, cartons: {} }));
    for (const c of cartons) {
      let t = split[0];
      for (const p of split) if (p.kg < t.kg - 1e-9) t = p;
      t.kg += c.w; t.cartons[c.sku] = (t.cartons[c.sku] || 0) + 1;
    }
    split.forEach(p => { p.kg = round2(p.kg); });
  }
  return { weight, estimated, perCarrier, chosen: chosen ? chosen.carrier : null, fewer, split, splitNote };
}

// ---------- Rulebook evaluation ----------
// R-01 fix text for one item: index-based recommendations first, the curated hint as the fallback.
const HS_SOURCE = { curated: 'curated list', reference: 'HMRC search reference', tariff: 'tariff wording' };
// Wording for a description-based suggestion (design D6): always "suggested — verify", never applied.
function hsSugText(sug) {
  if (!sug || sug.level === 'none') return '';
  const why = `(matched: ${sug.matched.join(', ')}; source: ${HS_SOURCE[sug.source]})`, verify = 'Suggested — verify on trade-tariff.service.gov.uk.';
  if (sug.level === 'hs6') return `Suggested HS code ${sug.codes[0]} — ${hsShort(HSX.h6.get(sug.codes[0]))} ${why}. ${verify}`;
  if (sug.level === 'heading') return `Heading ${sug.heading} (${hsShort(HSX.h4.get(sug.heading))}) — choose one of ${sug.codes.join(', ')} ${why}. ${verify}`;
  return `Possible HS codes: ${sug.codes.map(c => `${c} (${hsShort(HSX.h6.get(c))})`).join('; ')} ${why}. ${verify}`;
}
function r01Fix(it) {
  const d = it.hs.digits || '', rec = it.hsRec || [], sug = it.hsSug && it.hsSug.level !== 'none' ? it.hsSug : null;
  const lz = rec.find(r => /leading zero/.test(r.why));
  if (lz) return `Add a 6+ digit HS code for ${it.sku} — recommended ${lz.code} (${hsShort(lz.desc)}): the spreadsheet dropped the leading zero, so store the code as text. Verify on trade-tariff.service.gov.uk.`;
  if (!it.hs.blank && !it.hs.hasLetters && d.length === 4) {
    const h = hsHeading(d);
    if (h.known && h.subs.length === 1) return `Add a 6+ digit HS code for ${it.sku} — heading ${d} (${hsShort(h.desc)}) has one subheading: recommended 6-digit code: ${h.subs[0]}.`;
    const inHeading = sug && sug.codes.every(c => c.startsWith(d)) ? ` ${hsSugText(sug)}` : '';
    if (h.known) return `Add a 6+ digit HS code for ${it.sku} — heading ${d} (${hsShort(h.desc)}) has ${h.subs.length} subheadings; choose the one that matches the item on trade-tariff.service.gov.uk.${inHeading}`;
    if (h.known === false) return `Add a 6+ digit HS code for ${it.sku} — heading ${d} is not in the UK tariff; look the item up on trade-tariff.service.gov.uk.${sug ? ` ${hsSugText(sug)}` : ''}`;
  }
  if (sug) return `Add a 6+ digit HS code for ${it.sku}. ${hsSugText(sug)}`;
  if (HSX && it.hsSug) return `Add a 6+ digit HS code for ${it.sku} — no code could be suggested from the description; look it up on the UK Trade Tariff (trade-tariff.service.gov.uk).`;
  const h = hsHint(it.description);
  return `Add a 6+ digit HS code for ${it.sku}${h ? ` — for ${h.label} it is usually ${h.code} (verify on the UK Trade Tariff)` : ' — look it up on the UK Trade Tariff (trade-tariff.service.gov.uk)'}.`;
}
// HS advisories from the tariff index for codes that pass R-01 (never change the status).
function hsAdvisories(items) {
  const out = [], meta = hsMeta();
  if (!meta) return out;
  items.forEach(it => {
    const d = it.hs.digits || '';
    if (it.hs.blank || it.hs.hasLetters || d.length < 6) return;
    const r = hsLookup(d), lz = (it.hsRec || []).find(x => /leading zero/.test(x.why));
    if (lz && (d.length === 7 || d.length === 9)) {
      out.push(`${it.sku}: HS code ${it.hs.raw} reads as ${r.hs6}${r.known ? ` (${hsShort(r.desc)})` : ', which is not in the UK tariff'}. The spreadsheet probably dropped a leading zero: recommended ${lz.code} (${hsShort(lz.desc)}). Store codes as text.`);
      return;
    }
    if (!r.known) {
      const h = hsHeading(d.slice(0, 4));
      out.push(`${it.sku}: HS code ${it.hs.raw} — ${r.hs6} is not an HS subheading in the UK tariff snapshot ${meta.version}.${h.known ? ` Heading ${d.slice(0, 4)} (${hsShort(h.desc)}) has ${h.subs.length} subheading${h.subs.length === 1 ? '' : 's'} to choose from.` : ` Heading ${d.slice(0, 4)} is not in the tariff either; look the item up on trade-tariff.service.gov.uk.`}`);
      return;
    }
    if ((d.length === 8 || d.length === 10) && r.full === 'unknown') out.push(`${it.sku}: the first 6 digits (${r.hs6}) are a valid HS subheading, but ${d} is not a current UK commodity code — check the last digits on trade-tariff.service.gov.uk.`);
  });
  return out;
}

function evaluate(rawOrNorm, opts = {}) {
  const today = opts.today || todayISO();
  const b = rawOrNorm.dataIssues ? rawOrNorm : normaliseBooking(rawOrNorm);
  const checks = [];
  const add = (id, status, detail, fix, extra = {}) => checks.push({ id, sev: RULES[id].sev, rule: RULES[id].text, status, detail, fix, ...extra });
  const items = b.items;
  const allHave = f => items.length > 0 && items.every(it => isNum(it[f]));

  // R-01 HS codes
  {
    const bad = items.filter(it => it.hs.blank || it.hs.hasLetters || it.hs.digits.length < 6);
    if (!items.length) add('R-01', 'cannot', 'No items to check.', 'Add item lines.');
    else if (!bad.length) add('R-01', 'pass', `All ${items.length} item${items.length > 1 ? 's have' : ' has'} an HS code of 6+ digits.`);
    else add('R-01', 'fail', bad.map(it => {
      if (it.hs.blank) return `${it.sku} (${it.description || 'no description'}) has no HS code.`;
      if (it.hs.hasLetters) return `${it.sku}: HS code “${it.hs.raw}” contains letters.`;
      const lz = it.hs.numericCell && it.hs.digits.length === 5 ? ' (if it really starts with 0, Excel dropped the leading zero — store the code as text)' : '';
      return `${it.sku}: HS code “${it.hs.raw}” has only ${it.hs.digits.length} digit${it.hs.digits.length === 1 ? '' : 's'}${lz}.`;
    }).join(' '), bad.map(r01Fix).join(' '), { items: bad.map(i => i.sku) });
  }
  // R-02 declared value
  {
    const lines = items.map(it => (isNum(it.qty) && isNum(it.price) ? it.qty * it.price : null));
    if (!items.length || lines.some(x => x == null) || !isNum(b.declared)) add('R-02', 'cannot', 'Missing quantity, unit price or declared value — see data issues.', 'Fill the missing values so the invoice can be totalled.');
    else {
      const sum = round2(lines.reduce((a, c) => a + c, 0));
      const diff = b.declared - sum; const rel = sum === 0 ? (b.declared === 0 ? 0 : Infinity) : Math.abs(diff) / sum;
      if (rel <= 0.01 + 1e-9) add('R-02', 'pass', `Declared ${gbp(b.declared)} vs items ${gbp(sum)}${Math.abs(diff) > 0.005 ? ` (${(rel * 100).toFixed(2)}% apart, within the 1% tolerance)` : ' — exact match'}.`);
      else {
        let hint = '';
        const miss = items.find((it, i) => near(Math.abs(diff), lines[i], 1e-4));
        if (miss && diff < 0) hint = ` The gap equals ${miss.sku}'s line value — it looks left out of the declared total.`;
        else if (miss && diff > 0) hint = ` The gap equals ${miss.sku}'s line value — it may be counted twice.`;
        else if (near(b.declared, sum * 10, 1e-4) || near(b.declared * 10, sum, 1e-4)) hint = ' It is out by a factor of 10 — check for a misplaced zero or decimal point.';
        add('R-02', 'fail', `Declared value is ${gbp(b.declared)} but quantity × unit price adds up to ${gbp(sum)} — ${diff > 0 ? 'over' : 'under'} by ${gbp(Math.abs(diff))} (${(rel * 100).toFixed(1)}%).${hint}`, `Change the declared value to ${gbp(sum)}, or correct the item quantities/prices if those are wrong. Customs compares the invoice total with the lines.`, { computed: sum });
      }
    }
  }
  // R-03 per-item packing
  {
    if (!items.length) add('R-03', 'cannot', 'No items to check.', 'Add item lines.');
    else {
      const cant = items.filter(it => !isNum(it.upc) || !isNum(it.cartons) || !isNum(it.qty));
      const bad = items.filter(it => isNum(it.upc) && isNum(it.cartons) && isNum(it.qty) && !near(it.upc * it.cartons, it.qty, 1e-9));
      if (bad.length) add('R-03', 'fail', bad.map(it => `${it.sku}: ${fmtNum(it.upc)} per carton × ${fmtNum(it.cartons)} cartons = ${fmtNum(it.upc * it.cartons)}, but quantity says ${fmtNum(it.qty)}.`).join(' '),
        bad.map(it => { const c = it.qty / it.upc; const opts = [`set quantity to ${fmtNum(it.upc * it.cartons)}`]; if (Number.isInteger(c)) opts.push(`set cartons to ${c}`); else opts.push(`check units per carton (${fmtNum(it.qty)} ÷ ${fmtNum(it.upc)} = ${fmtNum(c)} cartons isn't whole)`); return `${it.sku}: ${opts.join(', or ')}.`; }).join(' ') + ' The receiving warehouse counts units per carton — a mismatch is reported as missing stock.', { items: bad.map(i => i.sku) });
      else if (cant.length) add('R-03', 'cannot', `Can't check ${cant.map(i => i.sku).join(', ')} — quantity, units per carton or cartons missing.`, 'Fill the missing packing values.');
      else add('R-03', 'pass', `Packing adds up for all ${items.length} item${items.length > 1 ? 's' : ''}.`);
    }
  }
  // R-04 carton total
  {
    if (!items.length || !allHave('cartons') || !isNum(b.cartons)) add('R-04', 'cannot', 'Missing carton counts — see data issues.', 'Fill the booking and item carton counts.');
    else {
      const sum = items.reduce((a, it) => a + it.cartons, 0);
      if (near(sum, b.cartons)) add('R-04', 'pass', `${fmtNum(b.cartons)} cartons on the booking = ${fmtNum(sum)} across items.`);
      else {
        const diff = b.cartons - sum; const it = items.find(x => near(Math.abs(diff), x.cartons));
        add('R-04', 'fail', `Booking says ${fmtNum(b.cartons)} cartons but the items add up to ${fmtNum(sum)} (${diff > 0 ? diff + ' extra' : Math.abs(diff) + ' short'}).${it ? ` The gap equals ${it.sku}'s ${fmtNum(it.cartons)} cartons — ${diff < 0 ? 'it was probably left out of the total' : 'it may be counted twice'}.` : ''}`, `Set booking cartons to ${fmtNum(sum)} (or fix the item carton counts). Carton labels and the warehouse receipt are matched against this number.`, { computed: sum });
      }
    }
  }
  // R-05 weight per pallet vs chosen carrier
  const rec = recommend(b);
  {
    if (!rec) add('R-05', 'cannot', 'No carrier route for this destination — see data issues.', 'Fix the destination.');
    else if (rec.wpp == null) add('R-05', 'cannot', 'Needs pallets and gross weight.', 'Fill pallets and total gross weight.');
    else {
      const c = rec.chosen;
      if (c.fits) add('R-05', 'pass', `${kg(rec.wpp)} per pallet (${kg(b.gross)} ÷ ${b.pallets}) is within ${label(c)}'s ${c.maxW} kg limit.`);
      else {
        const all = rec.opts.every(o => !o.fits);
        add('R-05', 'fail', `${kg(rec.wpp)} per pallet (${kg(b.gross)} ÷ ${b.pallets}) is over ${label(c)}'s ${c.maxW} kg limit${rec.overridden ? ' (the carrier you chose)' : ` (the ${rec.priority.toLowerCase()} option)`}${all ? ' — and over every carrier\'s limit on this route (max 750 kg)' : ''}. The carrier would refuse the pallets at collection.`, rec.fixes.map(f => f.text).join(' Or: '), { fixes: rec.fixes });
      }
    }
  }
  // R-06 dangerous goods
  {
    const def = [], pos = [];
    items.forEach(it => { const s = scanDG(`${it.description} ${it.sku}`); s.definite.forEach(d => def.push({ it, d })); s.possible.forEach(d => pos.push({ it, d })); });
    if (!items.length) add('R-06', 'cannot', 'No items to check.', 'Add item lines.');
    else if (def.length) add('R-06', 'fail', def.map(x => `${x.it.sku} (“${x.it.description}”) is ${x.d.cat} — matched “${x.d.words.join('”, “')}”.`).join(' '), `Remove ${[...new Set(def.map(x => x.it.sku))].join(', ')} from this shipment. None of these road services carry dangerous goods; they need a specialist ADR (dangerous-goods) service with UN-marked packaging and a DG declaration.`, { items: def.map(x => x.it.sku) });
    else if (pos.length) add('R-06', 'check', pos.map(x => `${x.it.sku} (“${x.it.description}”): ${x.d.why} (matched “${x.d.words.join('”, “')}”).`).join(' '), `Confirm ${[...new Set(pos.map(x => x.it.sku))].join(', ')} contain${pos.length === 1 ? 's' : ''} no lithium batteries, aerosols or flammable liquids. If any do, it's a Red stop — remove the item. If not, add that to the description (e.g. “batteries not included”, “non-aerosol”, “alcohol-free”).`, { items: pos.map(x => x.it.sku) });
    else add('R-06', 'pass', 'No lithium batteries, aerosols or flammable liquids found in item descriptions.');
  }
  // R-07 gross >= net
  let net = null;
  {
    if (!items.length || !allHave('unitWeight') || !allHave('qty') || !isNum(b.gross)) add('R-07', 'cannot', 'Missing unit weights, quantities or gross weight.', 'Fill the missing weights.');
    else {
      net = round2(items.reduce((a, it) => a + it.unitWeight * it.qty, 0));
      if (b.gross + 1e-9 >= net) add('R-07', 'pass', `Gross ${kg(b.gross)} ≥ goods ${kg(net)} (${kg(b.gross - net)} for cartons and pallets).`);
      else { const est = Math.ceil(net + (b.pallets || 1) * 25); add('R-07', 'fail', `Gross weight ${kg(b.gross)} is less than the goods alone (${kg(net)} = unit weight × quantity) — ${kg(net - b.gross)} short, before any carton or pallet weight.`, `Re-weigh and update the gross weight. It must be at least ${kg(net)}; with packaging expect roughly ${kg(est)} (≈25 kg per pallet + cartons). An under-declared weight also hides pallet-limit problems (R-05).`, { computed: net }); }
    }
  }
  // R-08 appointment
  {
    if (b.destType === 'Business address') add('R-08', 'na', 'Business address — no appointment needed.');
    else if (b.destType !== 'Warehouse') add('R-08', 'cannot', 'Destination type unknown.', 'Set Warehouse or Business address.');
    else if (b.appointment === 'Yes') add('R-08', 'pass', 'Warehouse delivery appointment is booked.');
    else add('R-08', 'fail', 'Shipping to a warehouse without a booked delivery appointment — warehouses turn away unbooked trucks, and the re-delivery is charged.', 'Book a delivery slot with the receiving warehouse for the estimated arrival date (shown below), then mark the appointment as booked.');
  }
  // R-09 country of origin
  {
    const bad = items.filter(it => !it.coo);
    if (!items.length) add('R-09', 'cannot', 'No items to check.', 'Add item lines.');
    else if (!bad.length) add('R-09', 'pass', 'Every item has a country of origin.');
    else add('R-09', 'fail', `${bad.map(it => it.sku).join(', ')} ${bad.length === 1 ? 'has' : 'have'} no country of origin.`, `Add where each item was made (not where it ships from) — e.g. United Kingdom, China, India. It decides the import duty in the EU.`, { items: bad.map(i => i.sku) });
  }
  // R-10 date
  {
    if (!b.ready) add('R-10', 'cannot', 'No valid ready to ship date.', 'Enter the date as DD-MM-YYYY.');
    else if (b.ready < today) add('R-10', 'fail', `Ready to ship date ${fmtDate(b.ready)} is in the past (today is ${fmtDate(today)}).`, `Update it to the real collection date — today (${fmtDate(today)}) or later.`);
    else add('R-10', 'pass', `Ready on ${fmtDateLong(b.ready)}${b.ready === today ? ' — today; same-day collection depends on carrier cut-off' : ''}.`);
  }

  // Advisories (not rulebook)
  const advisories = [];
  if (net != null && isNum(b.gross) && near(b.gross, net, 1e-6) && b.gross > 0) advisories.push('Gross weight equals the goods weight exactly, with nothing for cartons or pallets — it is probably the net weight.');
  items.forEach(it => { if (!it.hs.blank && !it.hs.hasLetters && it.hs.digits.length > 10) advisories.push(`${it.sku}: HS code has ${it.hs.digits.length} digits; UK/EU commodity codes are at most 10.`); });
  advisories.push(...hsAdvisories(items));
  if (isNum(b.pallets) && isNum(b.cartons) && b.pallets > b.cartons) advisories.push(`More pallets (${b.pallets}) than cartons (${b.cartons}) — check the pallet count.`);
  items.forEach(it => {
    const adr = scanDG(`${it.description} ${it.sku}`).adr;
    if (!adr.length) return;
    const classes = [...new Set(adr.map(d => d.cls))].join(', ');
    const what = adr.map(d => `ADR class ${d.cls} ${d.cat} (matched “${d.words.join('”, “')}”; typical ${d.un.join(', ')})`).join('; ');
    advisories.push(`Possible dangerous goods (ADR class ${classes}) — ${it.sku} (“${it.description}”) may be ${what}. ${adr.map(d => d.ok).join(' ')} Otherwise it needs an ADR-capable carrier and the supplier's safety data sheet (SDS); pallet networks usually refuse it — confirm with the carrier or remove the item.`);
  });
  const warnings = roadWarnings(b);
  const plan = rec ? palletPlan(b, rec.chosen.carrier) : null;
  if (plan && plan.fewer) { const f = plan.fewer; const c = rec.opts.find(o => o.carrier === f.carrier); advisories.push(`By weight, ${f.to} pallet${f.to === 1 ? ' is' : 's are'} enough on ${label(c)} (${kg(f.perPallet)} each), saving ${gbp(f.saving)} — check volume and stacking height before changing.`); }

  // Overall status
  const reds = checks.filter(c => c.status === 'fail' && c.sev === 'Red').length + b.dataIssues.filter(i => i.sev === 'Red').length;
  const ambers = checks.filter(c => (c.status === 'fail' && c.sev === 'Amber') || c.status === 'check').length + b.dataIssues.filter(i => i.sev === 'Amber').length;
  const status = reds ? 'Red' : ambers ? 'Amber' : 'Green';

  // Timeline. A warehouse delivery with no booked appointment (R-08) gets APPT_BUFFER_DAYS added to the
  // transit time: the earliest realistic arrival once a slot has been booked. R-08 itself stays Amber.
  let eta = null;
  if (b.ready && rec) {
    const start = b.ready < today ? today : b.ready;
    const collect = nextWorkingDay(start);
    const bufferDays = b.destType === 'Warehouse' && b.appointment !== 'Yes' ? APPT_BUFFER_DAYS : 0;
    const arriveRaw = addDays(collect, rec.chosen.transit + bufferDays);
    const arrive = nextWorkingDay(arriveRaw);
    eta = { collect, arrive, bufferDays, movedCollect: collect !== start, movedArrive: arrive !== arriveRaw, fromToday: b.ready < today };
  }
  return { b, checks, dataIssues: b.dataIssues, advisories, warnings, corrections: b.corrections || [], status, reds, ambers, rec, plan, eta, net, today };
}

// ---------- Plain-language confirmation ----------
function confirmation(ev, reviewed = 0) {
  const { b, rec, eta, status } = ev;
  if (!rec) return null;
  const c = rec.chosen;
  const itemsLine = b.items.map(it => `${fmtNum(it.qty)} × ${it.description || it.sku}`).join(', ');
  const head = status === 'Red' ? 'Not ready to book — fix the red items first.' : status === 'Amber' ? 'Ready to book, with warnings to check.' : 'Ready to book.';
  const lines = [
    `${b.seller || 'Seller'} is sending ${itemsLine} on ${fmtNum(b.pallets)} pallet${b.pallets === 1 ? '' : 's'} (${fmtNum(b.cartons)} cartons, ${kg(b.gross)}, declared ${gbp(b.declared)}) from ${b.originCity || '?'} to ${b.destType === 'Warehouse' ? 'a warehouse' : 'a business address'} in ${b.destCity || '?'}, ${b.destCountry || '?'}.`,
    c.fits === false && rec.fixes.length
      ? `Carrier: ${label(c)} can't take ${kg(rec.wpp)} pallets. Recommended fix: ${rec.fixes[0].text}`
      : `Carrier: ${label(c)} — ${gbp(c.cost)} (${gbp(c.price)} × ${c.pallets} pallet${c.pallets === 1 ? '' : 's'}), ${c.transit} days in transit, ${c.onTime}% on time.`,
  ];
  if (eta) lines.push(`Collection ${fmtDateLong(eta.collect)}; estimated delivery ${fmtDateLong(eta.arrive)}${eta.bufferDays ? ` (${rec.chosen.transit} days in transit + ${eta.bufferDays} days to book the warehouse slot)` : ''}.`);
  const unreviewed = Math.max(0, (ev.corrections || []).length - reviewed);
  if (unreviewed) lines.push(`${unreviewed} automatic correction${unreviewed === 1 ? '' : 's'} not yet reviewed — check ${unreviewed === 1 ? 'it' : 'them'} before booking.`);
  const next = [];
  if (status === 'Red') next.push('Fix every red issue above — the shipment cannot be handed to the carrier until they are cleared.');
  if (status === 'Amber') next.push('Review the amber warnings — they will not stop collection but often cause delays at customs or the warehouse.');
  next.push(`We confirm the collection with ${c.carrier} and email you the booking reference.`);
  next.push(`We generate the commercial invoice from your ${b.items.length} item line${b.items.length === 1 ? '' : 's'} (HS code, origin, quantity, value) and the UK export declaration.`);
  next.push(`Label all ${fmtNum(b.cartons)} cartons and ${fmtNum(b.pallets)} pallet${b.pallets === 1 ? '' : 's'} with the booking reference${b.destType === 'Warehouse' ? ' and SKU/quantity per carton — the warehouse checks counts against what you declared' : ''}.`);
  if (eta) next.push(`Have the goods packed and ready at ${b.originCity} on ${fmtDate(eta.collect)}.`);
  if (b.destType === 'Warehouse') next.push(b.appointment === 'Yes' ? `Make sure your delivery appointment matches the estimated arrival (${eta ? fmtDate(eta.arrive) : 'see above'}).` : `Book a delivery appointment at the warehouse for ${eta ? fmtDate(eta.arrive) : 'the arrival date'}${eta && eta.bufferDays ? ` — the estimate already allows ${eta.bufferDays} days to get the slot` : ''}.`);
  next.push('Use heat-treated wooden pallets with a legible ISPM 15 stamp; untreated wood packaging is refused or destroyed at the EU border.');
  next.push(`EU import clearance in ${b.destCountry}, then delivery. You get tracking updates at collection, customs and delivery.`);
  return { head, lines, next };
}

// ---------- Road-freight warnings (UK → DE/FR/NL by road; Advisory only — never changes Red/Amber/Green) ----------
// Goods that are banned, or need a certificate or permit, on import into the destination country, and the ADR limits
// at which R-06 goods could still move by road with a specialist carrier. Sources and confidence: references/road-freight-rules.md.
const DESTS = ['Germany', 'France', 'Netherlands'];
const all = st => Object.fromEntries(DESTS.map(c => [c, st]));
// Phrases that look like a match but are not (removed before matching).
const ROAD_SAFE = /\b(?:vegan|plant[- ]based|dairy[- ]free|meat[- ]free|faux|imitation|fake|artificial|synthetic|toy|nerf|water|effect|print(?:ed)?|patterned|colou?r(?:ed)?|style|look)\s+[\w-]+(?:\s+[\w-]+)?|\b[\w-]+[- ](?:colou?r(?:ed)?|effect|print|pattern)\b|\bcheese (?:graters?|boards?|kni(?:fe|ves)|slicers?|domes?|planes?|cloths?)\b|\b(?:peanut|shea|cocoa|body|apple|nut) butter\b|\bbutter (?:kni(?:fe|ves)|dish(?:es)?|curlers?)\b|\bbutterfl(?:y|ies)\b(?! knife| knives)|\begg (?:cups?|timers?|poachers?|separators?|slicers?)\b|\begg[- ]shaped\b|\beaster eggs?\b|\bhoney (?:dippers?|pots?|spoons?|oak|blonde)\b|\bmeat (?:thermometers?|tenderi[sz]ers?|grinders?|mincers?|cleavers?|hooks?|slicers?|probes?)\b|\bchicken (?:wire|feeders?|coops?)\b|\bsalmon pink\b|\bfish (?:tanks?|nets?|bowls?|ornaments?)\b|\b(?:wine|beer|gin|whisk(?:e)?y|champagne|prosecco|cider) (?:glass(?:es)?|racks?|coolers?|openers?|stoppers?|mugs?|steins?|stones?|tumblers?|decanters?|buckets?|charms?|aerators?|books?)\b|\bcigarette (?:lighters?|cases?|papers?|holders?)\b|\btobacco (?:pouch(?:es)?|pipes?)\b|\bcompost (?:bins?|caddies?|bags?)\b|\bplant (?:pots?|stands?|labels?|food|feed|sprayers?|misters?)\b|\b(?:glue|staple|massage|nail|spray|grease|caulking|heat|bubble|soldering) guns?\b|\bpistol grips?\b|\bpill (?:organi[sz]ers?|boxes?|cutters?)\b|\bmedicine (?:cabinets?|boxes?|cups?|spoons?|bags?)\b|\bseal(?:ant|ed|ing|s)?\b(?! ?(?:skin|fur|oil|leather|pelt))|\brubber seals?\b|\bknife (?:sharpeners?|blocks?|rolls?)\b/gi;
const ROAD_GOODS = [
  { id: 'animal', kind: 'permit', cat: 'products of animal origin (meat, dairy, fish, eggs, honey)', st: all('permit'),
    re: /\bbeef\b|\bpork\b|\blamb\b(?! ?swool)|\bchicken\b|\bpoultry\b|\bturkey (?:breast|meat|crown)s?\b|\bmeat\b|\bjerky\b|\bbiltong\b|\bsalami\b|\bchorizo\b|\bpepperoni\b|\bham\b|\bbacon\b|\bsausages?\b|\bpork pies?\b|\bpât[ée]\b|\bcheddar\b|\bcheeses?\b|\bbutter\b|\bbuttermilk\b|\bmilk powder\b|\bwhey\b|\byog(?:h)?urts?\b|\bcream cheese\b|\bsalmon\b|\bprawns?\b|\bshrimps?\b|\bfish (?:fillets?|fingers?|cakes?)\b|\bcod fillets?\b|\btuna\b|\bmackerel\b|\bsardines?\b|\bshellfish\b|\bmussels?\b|\boysters?\b|\beggs?\b|\bhoney\b|\bgelatine?\b|\bstock cubes?\b|\bbone broth\b|\blard\b|\bdripping\b/i,
    text: 'needs an export health certificate (EHC) and a check at the EU border control post (usually Calais, Dunkirk or Rotterdam on this road route). The EU importer must pre-notify in TRACES. Wild-caught fish also needs a UK catch certificate.',
    fix: 'Get the EHC before dispatch and give the importer the details to pre-notify. Shelf-stable products with no meat may only need a private attestation.',
    ref: 'Reg. (EU) 2017/625 Art. 47; gov.uk “Export or move food, drink and agricultural products”' },
  { id: 'composite', kind: 'permit', cat: 'shelf-stable composite food (may contain dairy or egg)', st: all('permit'), after: 'animal',
    re: /\b(?:milk )?chocolates?\b|\bbiscuits?\b|\bcookies\b|\bconfectionery\b|\bfudge\b|\btoffees?\b|\bdried pasta\b|\begg pasta\b|\bcakes?\b(?! (?:stands?|tins?|toppers?|boxes?|moulds?|molds?))/i,
    text: 'may contain dairy or egg. Shelf-stable composites with no meat need only a private attestation signed by the importer, not an EHC; anything chilled, frozen or with meat needs a composite EHC.',
    fix: 'Confirm the recipe. If it has dairy or egg, send a private attestation with the goods.',
    ref: 'Reg. (EU) 2021/630 Art. 3; gov.uk “Export or move composite food products”' },
  { id: 'petfood', kind: 'permit', cat: 'pet food and animal by-products', st: all('permit'),
    re: /\b(?:dog|cat|pet|puppy|kitten) (?:food|treats?|chews?|biscuits?|kibble)\b|\bkibble\b|\brawhide\b|\bpigs?'? ears?\b|\bbully sticks?\b|\bfish food\b|\bbone meal\b/i,
    text: 'needs an export health certificate (EHC) and a check at the EU border control post.',
    fix: 'Get the pet-food EHC before dispatch.',
    ref: 'gov.uk “Export food for animals: special rules”' },
  { id: 'soil', kind: 'ban', cat: 'soil, seed potatoes or grapevine plants', st: all('ban'),
    re: /\btop ?soil\b|\bpotting (?:soil|compost|mix)\b|\bcompost\b|\bgarden soil\b|\bsoil\b|\bseed potatoes\b|\bgrape ?vines?\b|\bvine plants?\b/i,
    text: 'cannot be imported into the EU from Great Britain (soil and growing media, seed potatoes and Vitis plants are prohibited).',
    fix: 'Remove it from the shipment. Ship plants bare-root or in a soil-free medium, with a phytosanitary certificate.',
    ref: 'Reg. (EU) 2016/2031 Art. 40; gov.uk “Export plants and plant products”' },
  { id: 'plants', kind: 'permit', cat: 'live plants and plant products', st: all('permit'), after: 'soil',
    re: /\blive plants?\b|\bpotted plants?\b|\bhouse ?plants?\b|\bseedlings?\b|\bsaplings?\b|\b(?:flower|tulip|plant|daffodil) bulbs\b|\bcut flowers\b|\bfresh flowers\b|\bbonsai(?: trees?)?\b|\bfruit trees?\b|\bchristmas trees?\b(?! (?:decorations?|lights?|ornaments?|baubles?|toppers?|stands?|skirts?))|\bpotatoes\b|\bplug plants\b/i,
    text: 'needs a phytosanitary certificate from APHA after an inspection, and a check at the EU border control post.',
    fix: 'Book the APHA inspection and certificate before dispatch.',
    ref: 'Reg. (EU) 2016/2031; gov.uk “Export plants and plant products”' },
  { id: 'cites', kind: 'permit', cat: 'CITES-listed species (ivory, rosewood, reptile skins, coral, caviar)', st: all('permit'),
    re: /\bivory\b|\belephant tusks?\b|\brosewood\b|\bdalbergia\b|\b(?:python|crocodile|alligator|caiman|lizard|snake) ?(?:skin|leather)\b|\b(?:real|red|black|precious) coral\b|\bcoral (?:jewell?ery|necklaces?|beads?|branch(?:es)?)\b|\btortoise ?shell\b|\bcaviar\b|\bsturgeon\b|\bagarwood\b|\boud wood\b|\blive (?:parrots?|birds?|tortoises?|reptiles?)\b/i,
    text: 'needs an EU import permit (Annex A/B species) and a UK CITES export permit from APHA, through a designated customs office. Ivory items are effectively barred from export for sale under the UK Ivory Act 2018 unless registered or exempt.',
    fix: 'Get both permits before booking, or confirm the material is not a listed species (e.g. imitation leather).',
    ref: 'Reg. (EC) 338/97 Art. 4; gov.uk “CITES imports and exports”; Ivory Act 2018' },
  { id: 'firearms', kind: 'permit', cat: 'firearms and gun parts', st: all('permit'),
    re: /\bfirearms?\b|\brifles?\b|\bshotguns?\b|\bpistols?\b|\bhandguns?\b|\brevolvers?\b|\bair ?(?:rifles?|pistols?|guns?)\b|\bgun (?:parts|barrels?)\b|\bsilencers?\b|\bsound moderators?\b|\bblank[- ]firing\b|\bflare guns?\b/i,
    text: { Germany: 'needs a permit from the German weapons authority before transport, and a UK export licence.', France: 'needs a French import authorisation (AIMG), and a UK export licence.', Netherlands: 'needs consent under the Wet wapens en munitie (Art. 14), and a UK export licence.' },
    fix: 'Do not book until you have the importer’s permit and the UK export licence.',
    ref: 'zoll.de “Waffen, Munition”; douane.gouv.fr AIMG; Wwm Art. 14' },
  { id: 'knives', kind: 'ban', cat: 'butterfly or switchblade knives', st: { Germany: 'ban', Netherlands: 'ban' },
    re: /\bbutterfly kni(?:fe|ves)\b|\bbalisongs?\b|\bswitch ?blades?\b|\bflick kni(?:fe|ves)\b|\bgravity kni(?:fe|ves)\b|\bOTF kni(?:fe|ves)\b|\bstilettos? knives?\b/i,
    text: { Germany: 'is a prohibited weapon (WaffG Anlage 2, 1.4.1 and 1.4.3). Only side-opening blades up to 8.5 cm, single-edged, for a legitimate need are exempt.', Netherlands: 'is a prohibited weapon (Wet wapens en munitie, category I).' },
    fix: 'Remove it from a shipment to this country.',
    ref: 'WaffG Anlage 2 Abschnitt 1; Wet wapens en munitie Art. 2 and 13' },
  { id: 'blunt', kind: 'ban', cat: 'knuckle dusters and throwing stars', st: { Germany: 'ban', Netherlands: 'ban' },
    re: /\bknuckle ?dusters?\b|\bbrass knuckles\b|\bthrowing stars?\b|\bshuriken\b/i,
    text: { Germany: 'is a prohibited weapon (WaffG Anlage 2, 1.3.2–1.3.3).', Netherlands: 'is a prohibited weapon (Wet wapens en munitie, category I).' },
    fix: 'Remove it from a shipment to this country.',
    ref: 'WaffG Anlage 2 Abschnitt 1; Wet wapens en munitie Art. 2' },
  { id: 'stun', kind: 'ban', cat: 'stun guns and tasers', st: { Germany: 'ban', Netherlands: 'ban' },
    re: /\bstun ?guns?\b|\btasers?\b|\belectroshock (?:weapons?|devices?)\b/i,
    text: { Germany: 'is a prohibited weapon unless officially approved and test-marked (WaffG Anlage 2, 1.3.6).', Netherlands: 'is a prohibited weapon (Wet wapens en munitie, category II).' },
    fix: 'Remove it from a shipment to this country.',
    ref: 'WaffG Anlage 2 Abschnitt 1; Wet wapens en munitie Art. 2' },
  { id: 'pepper', kind: 'ban', cat: 'pepper or CS spray', st: { Germany: 'ban' },
    re: /\bpepper sprays?\b|\bcs sprays?\b|\btear gas\b|\bdefen[cs]e sprays?\b/i,
    text: 'is a prohibited weapon unless it is approved, limited in range and carries an official test mark (WaffG Anlage 2, 1.3.5).',
    fix: 'Remove it, or confirm it carries the German official test mark.',
    ref: 'WaffG Anlage 2 Abschnitt 1, 1.3.5' },
  { id: 'snus', kind: 'ban', cat: 'snus (tobacco for oral use)', st: all('ban'),
    re: /\bsnus\b|\boral tobacco\b|\btobacco for oral use\b/i,
    text: 'cannot be placed on the EU market.',
    fix: 'Remove it from the shipment.',
    ref: 'Directive 2014/40/EU Art. 17' },
  { id: 'pouches', kind: 'ban', cat: 'nicotine pouches', st: { France: 'ban', Netherlands: 'ban' },
    re: /\bnicotine pouch(?:es)?\b|\bnic pouch(?:es)?\b|\bnicotine sachets?\b/i,
    text: { France: 'is banned: import and possession have been prohibited since 1 April 2026.', Netherlands: 'is banned outright (totaalverbod).' },
    fix: 'Remove them from a shipment to this country.',
    ref: 'France: décret, in force 1 Apr 2026 (service-public.gouv.fr); rijksoverheid.nl “Roken ontmoedigen”' },
  { id: 'puffs', kind: 'ban', cat: 'disposable vapes', st: { France: 'ban' },
    re: /\bdisposable (?:vapes?|e-?cig(?:arette)?s?)\b|\bpuff bars?\b|\bsingle[- ]use vapes?\b/i,
    text: 'cannot be sold or held for sale in France (Loi 2025-175), so a commercial import has no lawful buyer.',
    fix: 'Remove them from a shipment to France.',
    ref: 'Loi n° 2025-175' },
  { id: 'flavours', kind: 'ban', cat: 'flavoured e-liquids', st: { Netherlands: 'ban' },
    test: t => /\be-?liquids?\b|\bvape (?:juice|liquid)s?\b|\bvapes?\b|\be-?cig(?:arette)?s?\b/i.test(t) && /\b(?:mint|menthol|fruit|strawberry|mango|berry|berries|blueberry|watermelon|grape|apple|cherry|lemon|lime|peach|ice|cola|candy|vanilla|custard|dessert|tropical)\b/i.test(t),
    text: 'may only be sold with a tobacco flavour in the Netherlands since 1 January 2023.',
    fix: 'Send only tobacco-flavoured e-liquids to the Netherlands.',
    ref: 'rijksoverheid.nl “Roken ontmoedigen”' },
  { id: 'excise', kind: 'permit', cat: 'alcohol or tobacco (excise goods)', st: all('permit'),
    re: /\bbeers?\b|\blagers?\b|\bwines?\b|\bcider\b|\bperry\b|\bprosecco\b|\bchampagne\b|\bspirits\b|\bgin\b|\bvodka\b|\bwhisk(?:e)?y\b|\brum\b|\bbrandy\b|\bliqueurs?\b|\bcigarettes?\b|\bcigars?\b|\brolling tobacco\b|\btobacco\b|\bshisha\b|\be-?liquids?\b|\bvape juice\b/i,
    text: 'is an excise good: duty is due on import unless it goes straight into duty suspension, which needs a tax warehouse or registered consignee and an e-AD in EMCS.',
    fix: 'Get the consignee’s excise number and the EMCS reference before dispatch.',
    ref: 'Directive (EU) 2020/262 Art. 6' },
  { id: 'medicines', kind: 'permit', cat: 'medicines', st: all('permit'),
    re: /\bprescription (?:medicines?|drugs?)\b|\bmedicines?\b|\bmedicinal products?\b|\bpharmaceuticals?\b|\bantibiotics?\b|\binsulin\b|\bcodeine\b|\btramadol\b|\bdiazepam\b|\bmorphine\b|\boxycodone\b|\bparacetamol\b|\bibuprofen\b|\baspirin\b/i,
    text: 'needs an import authorisation and a marketing authorisation in the destination, and the consignee needs a wholesale licence. Controlled drugs also need a UK Home Office export licence.',
    fix: 'Get the consignee’s licences (and the Home Office licence for controlled drugs) before dispatch.',
    ref: 'Directive 2001/83/EC Art. 40(3); gov.uk “Controlled drugs: import and export licences”' },
  { id: 'catdogfur', kind: 'ban', cat: 'cat or dog fur', st: all('ban'),
    re: /\b(?:cat|dog)[- ](?:fur|skin|pelt)s?\b/i,
    text: 'cannot be imported into the EU.',
    fix: 'Remove it from the shipment.',
    ref: 'Reg. (EC) 1523/2007 Art. 3' },
  { id: 'seal', kind: 'ban', cat: 'seal products', st: all('ban'),
    re: /\bseal ?skins?\b|\bseal (?:fur|oil|leather|pelts?)\b/i,
    text: 'cannot be placed on the EU market (Inuit-hunt products with an attestation are the only exception).',
    fix: 'Remove it unless it has a recognised Inuit attestation.',
    ref: 'Reg. (EC) 1007/2009 Art. 3' },
  { id: 'mercury', kind: 'ban', cat: 'mercury-added measuring devices', st: all('ban'),
    re: /\bmercury (?:thermometers?|barometers?|sphygmomanometers?|manometers?|hygrometers?|switch(?:es)?)\b/i,
    text: 'cannot be imported into the EU.',
    fix: 'Remove it, or switch to a mercury-free (digital) version.',
    ref: 'Reg. (EU) 2017/852 Art. 5 and Annex II' },
  { id: 'torture', kind: 'ban', cat: 'restraint or torture goods', st: all('ban'),
    re: /\bthumb ?cuffs\b|\bthumb ?screws\b|\bleg irons\b|\bbar fetters\b|\b(?:electric )?(?:shock|stun) (?:belts?|cuffs|sleeves?)\b/i,
    text: 'cannot be imported into the EU.',
    fix: 'Remove it from the shipment.',
    ref: 'Reg. (EU) 2019/125 Art. 4' },
  { id: 'ods', kind: 'ban', cat: 'ozone-depleting refrigerants or halon', st: all('ban'),
    re: /\bR-?(?:22|12)\b(?= ?(?:refrigerant|gas|air ?con\w*|cylinders?|units?))|\bhalon\b|\bCFC\b/i,
    text: 'cannot be imported into the EU, including equipment that contains it.',
    fix: 'Remove it from the shipment.',
    ref: 'Reg. (EU) 2024/590 Art. 5' },
];
const COUNTRY_WORD = { Germany: 'Germany', France: 'France', Netherlands: 'the Netherlands' };
function roadMatch(desc, rule) {
  const t = clean(desc); if (!t) return null;
  const safe = t.replace(ROAD_SAFE, ' ');
  if (rule.test) return rule.test(safe) ? [] : null;
  const g = new RegExp(rule.re.source, 'gi'); let m; const words = [];
  while ((m = g.exec(safe))) {
    const before = safe.slice(0, m.index), after = safe.slice(m.index + m[0].length);
    if (NEG_BEFORE.test(before) || NEG_AFTER.test(after)) continue;
    words.push(m[0].toLowerCase());
  }
  return words.length ? [...new Set(words)] : null;
}
// Description parsers for the limits. Values are returned only when the description states them.
function parseVolumeMl(t) { const m = /(\d+(?:[.,]\d+)?)\s*(ml|cl|l|ltrs?|litres?|liters?)\b/i.exec(t); if (!m) return null; const v = parseFloat(m[1].replace(',', '.')); const u = m[2].toLowerCase(); return u === 'ml' ? v : u === 'cl' ? v * 10 : v * 1000; }
function parseAbv(t) { const m = /(\d+(?:[.,]\d+)?)\s*%\s*(?:abv|vol|alc|alcohol|proof)?/i.exec(t); return m ? parseFloat(m[1].replace(',', '.')) : null; }
function parseWh(t) { const m = /(\d+(?:[.,]\d+)?)\s*wh\b/i.exec(t); return m ? parseFloat(m[1].replace(',', '.')) : null; }
function parseMah(t) { const m = /(\d{1,3}(?:[,.]\d{3})+|\d+)\s*mah\b/i.exec(t); return m ? parseFloat(m[1].replace(/[,.]/g, '')) : null; }
const LQ_NOTE = 'Carriers A, B and C carry no dangerous goods (R-06); this is what a specialist ADR carrier could accept.';
// ADR 2025 limits for goods R-06 flags (and lighters). Every value: references/road-freight-rules.md.
function roadLimits(it, dg) {
  const out = [], t = clean(`${it.description}`), cartonKg = isNum(it.upc) && isNum(it.unitWeight) ? it.upc * it.unitWeight : null;
  const cats = new Set(dg.definite.map(d => d.cat)); // limits only for clear R-06 matches; spirits handled below
  if (dg.possible.some(d => d.cat === 'lithium batteries') && (parseWh(t) != null || parseMah(t) != null)) cats.add('lithium batteries');
  const lim = (title, text, fix, ref) => out.push({ kind: 'limit', title, text, fix, ref });
  const carton = (max, what) => (cartonKg != null && cartonKg > max
    ? ` Each carton already holds ${kg(cartonKg)} of goods (${it.upc} × ${kg(it.unitWeight)}) — over the ${max} kg gross ${what} limit, so re-pack into lighter cartons.`
    : ` Each carton must weigh ${max} kg gross or less${cartonKg != null ? ` (goods alone: ${kg(cartonKg)})` : ''}.`);
  const ml = parseVolumeMl(t);
  const isAlcohol = /\b(?:vodka|whisk(?:e)?y|gin|rum|brandy|liqueurs?|spirits|wine|beer|cider|prosecco|champagne|alcoholic)\b/i.test(t);
  if (cats.has('lithium batteries')) {
    const wh = parseWh(t), mah = parseMah(t);
    if (wh != null && wh > 100) lim('Over the road limit', `${it.sku} is ${wh} Wh — over the 100 Wh battery limit of ADR special provision 188, so it is fully regulated (UN 3480/3481, class 9: UN packaging, labels and a transport document).`, 'Use an ADR class 9 carrier, or remove it.', 'ADR 2025, special provision 188 (b)');
    else lim('Road limit', `${it.sku}: lithium-ion batteries move under the lighter ADR special provision 188 only if each cell is 20 Wh or less and each battery 100 Wh or less, UN 38.3-tested, in strong packaging with short-circuit protection.${wh != null ? ` It states ${wh} Wh (within the battery limit — check each cell is 20 Wh or less).` : mah != null ? ` It states ${PF_fmt(mah)} mAh, about ${Math.round(mah * 3.7 / 1000)} Wh at 3.7 V — read the Wh marked on the case; a single-cell pack over 20 Wh is fully regulated.` : ' The description gives no Wh rating — read it from the case.'}${carton(30, 'package')} (No 30 kg cap when batteries are installed in equipment.) ${LQ_NOTE}`, 'Add the Wh rating to the description and confirm UN 38.3 testing.', 'ADR 2025, special provision 188 (a), (b), (h)');
  }
  if (cats.has('aerosols')) {
    if (ml != null && ml <= 50) lim('Road limit', `${it.sku}: aerosols of 50 ml or less with only non-toxic contents are not subject to ADR (special provision 190).`, 'Confirm the contents are non-toxic.', 'ADR 2025, special provision 190');
    else if (ml != null && ml > 1000) lim('Over the road limit', `${it.sku} is ${ml / 1000} L per can — over the 1 L limited-quantity limit for aerosols, so it is fully regulated (UN 1950).`, 'Use an ADR carrier, or remove it.', 'ADR 2025, Table A UN 1950, column 7a');
    else lim('Road limit', `${it.sku}: aerosols can travel as a limited quantity if each can is 1 L or less${ml != null ? ` (it states ${ml} ml ✓)` : ' — check the can size'}.${carton(30, 'limited-quantity package')} Mark cartons with the LQ diamond. ${LQ_NOTE}`, 'Confirm the can size and use an LQ-capable carrier.', 'ADR 2025, Table A UN 1950 col. 7a; 3.4.2');
  }
  if (/\blighter (?:refills?|gas)\b|\bbutane refills?\b/i.test(t)) {
    lim('Over the road limit', `${it.sku}: lighter refills (UN 1057) cannot travel as a limited quantity (column 7a is 0); they need a full ADR consignment.`, 'Use an ADR carrier, or remove them.', 'ADR 2025, Table A UN 1057, column 7a; 3.4.1');
    cats.delete('flammable liquids');
  }
  if (cats.has('flammable liquids') && !isAlcohol) {
    const perfume = /\bperfumes?\b|\beau de\b|\bcolognes?\b|\bfragrance\b/i.test(t);
    const max = perfume ? 5000 : null;
    if (max && ml != null && ml > max) lim('Over the road limit', `${it.sku} is ${ml / 1000} L per bottle — over the 5 L limited-quantity limit for perfumery products (UN 1266).`, 'Use an ADR carrier, or ship smaller bottles.', 'ADR 2025, Table A UN 1266, column 7a');
    else if (perfume) lim('Road limit', `${it.sku}: perfumery products can travel as a limited quantity if each bottle is 5 L or less${ml != null ? ` (it states ${ml} ml ✓)` : ''}.${carton(30, 'limited-quantity package')} ${LQ_NOTE}`, 'Mark cartons with the LQ diamond and use an LQ-capable carrier.', 'ADR 2025, Table A UN 1266 col. 7a; 3.4.2');
    else lim('Road limit', `${it.sku}: flammable liquids can travel as a limited quantity only in small containers — 1 L each if packing group II, 5 L if packing group III (500 ml for paint of group I); the safety data sheet gives the group${ml != null ? `. It states ${ml >= 1000 ? ml / 1000 + ' L' : ml + ' ml'}${ml > 5000 ? ' — over every limit, so fully regulated' : ml > 1000 ? ' — over the group II limit' : ''}` : ''}.${carton(30, 'limited-quantity package')} ${LQ_NOTE}`, 'Check section 14 of the safety data sheet for the UN number and packing group.', 'ADR 2025, Table A col. 7a (UN 1263, 1993, 1090); 3.4.2');
  }
  if (isAlcohol && (cats.has('flammable liquids') || /\b(?:vodka|whisk(?:e)?y|gin|rum|brandy|liqueurs?|spirits)\b/i.test(t))) {
    const abv = parseAbv(t);
    if (abv != null && abv <= 24) lim('Road limit', `${it.sku} is ${abv}% ABV: not subject to ADR (special provision 144). R-06 still asks you to confirm it, as the rulebook says.`, 'Add the ABV to the description when you confirm R-06.', 'ADR 2025, special provision 144');
    else if (abv != null && abv <= 70) lim('Road limit', `${it.sku} is ${abv}% ABV: by road, alcoholic beverages of 70% ABV or less in containers of 250 L or less are not subject to ADR (special provision 145). R-06 still treats spirits as a possible flammable liquid, so confirm it there.`, 'Add the ABV to the description when you confirm R-06.', 'ADR 2025, special provision 145');
    else if (abv != null) lim('Road limit', `${it.sku} is ${abv}% ABV — over 70%, so it is regulated (UN 3065, packing group II); limited quantity allows 5 L per bottle.${carton(30, 'limited-quantity package')} ${LQ_NOTE}`, 'Use an LQ-capable carrier.', 'ADR 2025, Table A UN 3065 col. 7a');
    else lim('Road limit', `${it.sku}: spirits of 70% ABV or less in containers of 250 L or less are not subject to ADR by road (special provision 145); above 70%, 5 L per bottle as a limited quantity. The description gives no ABV.`, 'Add the ABV (e.g. “40% ABV”) to the description.', 'ADR 2025, special provisions 144 and 145');
  }
  if (dg.adr.some(d => d.cls === '2' && d.words.some(w => /lighter/.test(w)))) lim('Road limit', `${it.sku}: lighters made to EN ISO 9994 can travel with reduced rules if each package is 10 kg gross or less and the vehicle carries 100 kg or less, marked “UN 1057 LIGHTERS”.${cartonKg != null && cartonKg > 10 ? ` Each carton already holds ${kg(cartonKg)} of lighters — over the 10 kg limit.` : ''} ${LQ_NOTE}`, 'Re-pack into cartons of 10 kg or less and confirm EN ISO 9994.', 'ADR 2025, special provision 658');
  return out;
}
const PF_fmt = n => n.toLocaleString('en-GB');
// All road-freight warnings for a booking: bans and permits for its destination country, then ADR limits.
function roadWarnings(b) {
  const dest = b.destCountry, out = [];
  if (!DESTS.includes(dest)) return out;
  (b.items || []).forEach(it => {
    const hits = new Set();
    ROAD_GOODS.forEach(r => {
      const st = r.st[dest]; if (!st) return;
      if (r.after && hits.has(r.after)) return;
      const words = roadMatch(it.description, r); if (!words) return;
      hits.add(r.id);
      const where = Object.keys(r.st).length === DESTS.length && typeof r.text === 'string' ? 'into the EU' : `into ${COUNTRY_WORD[dest]}`;
      out.push({ kind: st, rule: r.id, country: dest, sku: it.sku,
        title: st === 'ban' ? `Banned in ${COUNTRY_WORD[dest]}` : 'Needs a certificate or permit',
        text: `${it.sku} (“${it.description}”) looks like ${r.cat}${words.length ? ` (matched “${words.join('”, “')}”)` : ''} — ${where}, it ${typeof r.text === 'string' ? r.text : r.text[dest]}`,
        fix: r.fix, ref: r.ref });
    });
    const dg = scanDG(`${it.description} ${it.sku}`);
    roadLimits(it, dg).forEach(l => out.push({ ...l, country: dest, sku: it.sku }));
  });
  return out;
}

// ---------- Outcomes (reporting only; never changes a booking's status) ----------
// Where a Red booking would most likely be stopped, in journey order. Each booking counts once, at its first stop.
const OUTCOME_STAGES = [
  { id: 'booking',    label: 'Bounced back as filed',     where: 'before booking — the details are missing or contradict each other', rules: [] },
  { id: 'collection', label: 'Refused at collection',     where: 'at collection — the carrier refuses the pallet or the goods', rules: ['R-05', 'R-06'] },
  { id: 'border',     label: 'Customs hold',              where: 'at the border — the commercial invoice does not hold up', rules: ['R-01', 'R-02'] },
  { id: 'receipt',    label: 'Rejected at delivery',      where: 'at delivery — the counts do not match what was declared', rules: ['R-03', 'R-04'] },
];
function firstStop(ev) {
  if (ev.dataIssues.some(d => d.sev === 'Red')) return 'booking';
  const failed = new Set(ev.checks.filter(c => c.status === 'fail' && c.sev === 'Red').map(c => c.id));
  const st = OUTCOME_STAGES.find(s => s.rules.some(r => failed.has(r)));
  return st ? st.id : null;
}
// before/after: arrays of evaluate() results in the same booking order (as uploaded, and now with fixes applied).
function outcomes(before, after = before) {
  const stages = OUTCOME_STAGES.map(s => ({ ...s, before: [], now: [], avoided: [] }));
  const byId = Object.fromEntries(stages.map(s => [s.id, s]));
  const atRisk = [], clean = [], rows = [];
  before.forEach((ev, i) => {
    const id = ev.b.id, stop = firstStop(ev), nowEv = after[i] || ev, nowStop = firstStop(nowEv);
    rows.push({ id, before: stop, now: nowStop, status: nowEv.status });
    if (stop) { byId[stop].before.push(id); if (!nowStop) byId[stop].avoided.push(id); }
    if (nowStop) byId[nowStop].now.push(id);
    if (!stop) (ev.status === 'Amber' ? atRisk : clean).push(id);
  });
  const stoppedBefore = stages.reduce((n, s) => n + s.before.length, 0);
  const stoppedNow = stages.reduce((n, s) => n + s.now.length, 0);
  const avoided = stages.reduce((n, s) => n + s.avoided.length, 0);
  return { total: before.length, stages, rows, stoppedBefore, stoppedNow, avoided, atRisk, clean };
}
// costs: { stageId: { low, high } } in GBP per booking, entered by the user. Blank stages are left out, never guessed.
// which: 'avoided' (fixed since upload, the default) or 'before' (everything at stake as uploaded).
function avoidedCost(out, costs = {}, which = 'avoided') {
  const lines = [];
  out.stages.forEach(s => {
    const c = costs[s.id] || {}, lo = num(c.low), hi = num(c.high), n = s[which].length;
    const has = v => isNum(v) && v >= 0;
    if (!n || (!has(lo) && !has(hi))) return;
    const low = has(lo) ? lo : hi, high = has(hi) ? Math.max(hi, low) : low;
    lines.push({ stage: s.id, label: s.label, n, low, high, totalLow: low * n, totalHigh: high * n });
  });
  return { lines, low: lines.reduce((t, l) => t + l.totalLow, 0), high: lines.reduce((t, l) => t + l.totalHigh, 0) };
}

const PF = { CARRIERS, RULES, PRICE_NOTE, ROAD_GOODS, roadWarnings, parseVolumeMl, parseAbv, parseWh, parseMah, OUTCOME_STAGES, outcomes, avoidedCost, CITY_COUNTRY, ORIGIN_CITIES, COO_LIST, PRIORITIES, EXAMPLE_BOOKING, EXAMPLE_ITEM,
  num, gbp, kg, fmtNum, fmtDate, fmtDateLong, todayISO, addDays, weekday, isoFromYMD, parseSheetDate, normCountry, normCity, normPriority, normDestType, normYesNo, normHS,
  DG_ADR, scanDG, hsHint, setHsIndex, getHsIndex, hsMeta, hsLookup, hsHeading, hsShort, hsRecommend, hsTokens, hsSuggest, hsSugText, hsMaterialsOf, HS_MATERIALS, parseSheets, normaliseBooking, recommend, palletPlan, evaluate, confirmation, label, isNum, clean, isBlank, MONTHS, DAY_NAMES };
if (typeof module !== 'undefined' && module.exports) module.exports = PF; else root.PF = PF;
})(typeof window !== 'undefined' ? window : globalThis);
