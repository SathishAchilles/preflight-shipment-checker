/* Preflight test suite — shared by Node and the in-app "Test cases" tab. */
(function (root) {
'use strict';
function runTests(PF, CHAT) {
  const TODAY = '2026-10-25';
  const results = [];
  const T = (group, name, fn) => { try { const r = fn(); results.push({ group, name, pass: r === true || (r && r.pass), detail: r && r.detail ? r.detail : (r === true ? '' : JSON.stringify(r)) }); } catch (e) { results.push({ group, name, pass: false, detail: 'Threw: ' + e.message }); } };
  const base = () => ({ id: 'BK-T', seller: 'Northfield Goods', originCity: 'Manchester', originCountry: 'United Kingdom', destCity: 'Frankfurt', destCountry: 'Germany', destType: 'Warehouse', ready: '05-11-2026', priority: 'Cheapest', pallets: 3, cartons: 90, declared: 5400, currency: 'GBP', gross: 620, appointment: 'Yes',
    items: [{ sku: 'MUG-01', description: 'Ceramic coffee mug, 350 ml', hs: 691200, qty: 1080, price: 5, upc: 12, cartons: 90, unitWeight: 0.5, coo: 'United Kingdom' }] });
  const ev = (mod) => { const b = base(); mod && mod(b); return PF.evaluate(b, { today: TODAY }); };
  const chk = (e, id) => e.checks.find(c => c.id === id);
  const expect = (cond, detail) => ({ pass: !!cond, detail });
  const st = (e, id) => chk(e, id).status;

  // ---------- Baseline ----------
  T('Baseline', 'Template example row is clean → Green, Carrier A recommended', () => { const e = ev(); return expect(e.status === 'Green' && e.rec.chosen.carrier === 'Carrier A' && e.checks.every(c => c.status === 'pass'), `status ${e.status}, ${e.rec.chosen.carrier}`); });
  T('Baseline', 'Cost = price per pallet × pallets (3 × £180 = £540)', () => { const e = ev(); return expect(e.rec.chosen.cost === 540, e.rec.chosen.cost); });
  T('Baseline', 'ETA: ready Thu 05-11 + 5 days → Tue 10-11', () => { const e = ev(); return expect(e.eta.collect === '2026-11-05' && e.eta.arrive === '2026-11-10', JSON.stringify(e.eta)); });

  // ---------- R-01 ----------
  T('R-01 HS code', 'Blank HS code → Red', () => { const e = ev(b => b.items[0].hs = ''); return expect(st(e, 'R-01') === 'fail' && e.status === 'Red', chk(e, 'R-01').detail); });
  T('R-01 HS code', '4-digit heading (6912) → Red', () => expect(st(ev(b => b.items[0].hs = 6912), 'R-01') === 'fail'));
  T('R-01 HS code', '“6912.00” written with a dot counts as 6 digits → pass', () => expect(st(ev(b => b.items[0].hs = '6912.00'), 'R-01') === 'pass'));
  T('R-01 HS code', '“6912 00” with a space → pass', () => expect(st(ev(b => b.items[0].hs = '6912 00'), 'R-01') === 'pass'));
  T('R-01 HS code', 'Numeric 30211 (leading zero lost) → Red with leading-zero hint', () => { const c = chk(ev(b => b.items[0].hs = 30211), 'R-01'); return expect(c.status === 'fail' && /leading zero/.test(c.detail), c.detail); });
  T('R-01 HS code', 'Text “030211” keeps its zero → pass', () => expect(st(ev(b => b.items[0].hs = '030211'), 'R-01') === 'pass'));
  T('R-01 HS code', 'Letters in code (69A200) → Red', () => expect(st(ev(b => b.items[0].hs = '69A200'), 'R-01') === 'fail'));
  T('R-01 HS code', '10-digit code → pass', () => expect(st(ev(b => b.items[0].hs = '6912001000'), 'R-01') === 'pass'));
  T('R-01 HS code', '12-digit code → pass, with advisory', () => { const e = ev(b => b.items[0].hs = '691200100099'); return expect(st(e, 'R-01') === 'pass' && e.advisories.filter(x => /HS code/.test(x)).length === 1, e.advisories.join()); });
  T('R-01 HS code', 'Fix suggests 691200 for a ceramic mug', () => { const c = chk(ev(b => b.items[0].hs = ''), 'R-01'); return expect(/691200/.test(c.fix), c.fix); });

  const hint = d => (PF.hsHint(d) || {}).code;
  T('R-01 HS suggestion', 'Suggestions by item name: mug 691200, porcelain plate 691110, T-shirt 610910, candle 340600', () => expect(hint('Ceramic coffee mug') === '691200' && hint('Porcelain dinner plate') === '691110' && hint('Organic cotton T-shirt') === '610910' && hint('Soy wax candle') === '340600'));
  T('R-01 HS suggestion', 'Specific beats general: tea towel 630291 (not towel 630260), green tea 090210 (not tea 090240)', () => expect(hint('Cotton tea towel') === '630291' && hint('Cotton bath towel') === '630260' && hint('Green tea, loose leaf') === '090210' && hint('Black tea') === '090240'));
  T('R-01 HS suggestion', 'Cast iron: enamelled 732392, plain skillet 732391', () => expect(hint('Enamelled cast iron casserole') === '732392' && hint('Cast iron skillet') === '732391'));
  T('R-01 HS suggestion', 'Unknown product → no guess (fix points to the Trade Tariff)', () => { const c = chk(ev(b => { b.items[0].hs = ''; b.items[0].description = 'Widget assembly kit'; }), 'R-01'); return expect(!hint('Widget assembly kit') && /trade-tariff/.test(c.fix), c.fix); });
  T('R-01 HS suggestion', 'Suggestion is never auto-applied: blank HS stays Red until accepted', () => expect(st(ev(b => b.items[0].hs = ''), 'R-01') === 'fail'));

  // ---------- UK tariff index (assets/hs_index.json) ----------
  const look = c => PF.hsLookup(c);
  T('HS index', 'Index is loaded (snapshot version and date in meta)', () => { const m = PF.hsMeta(); return expect(m && /^v\d/.test(m.version) && /^\d{4}-\d{2}-\d{2}$/.test(m.snapshotDate), JSON.stringify(m)); });
  T('HS index', 'Real subheadings are known: 691200, 090111, 850760, 330300, 610910', () => expect(['691200', '090111', '850760', '330300', '610910'].every(c => look(c).known === true)));
  T('HS index', 'Not subheadings: 999999 and heading-level 850700 are unknown', () => expect(look('999999').known === false && look('850700').known === false));
  T('HS index', 'Full UK code: 6912002310 ok, 6912001000 unknown', () => expect(look('6912002310').full === 'ok' && look('6912001000').full === 'unknown'));
  T('HS index', 'Headings: 6912 has one subheading (691200), 6115 has 9', () => expect(JSON.stringify(PF.hsHeading('6912').subs) === '["691200"]' && PF.hsHeading('6115').subs.length === 9, PF.hsHeading('6115').subs.length));
  T('HS index', 'No index loaded → { known: null }, never throws', () => { const saved = PF.getHsIndex(); PF.setHsIndex(null); try { return expect(look('691200').known === null && PF.hsHeading('6912').known === null); } finally { PF.setHsIndex(saved); } });

  // ---------- HS checks against the tariff index (recommend only, never auto-correct) ----------
  const hsAdv = e => e.advisories.filter(x => /HS code|HS subheading|commodity code/.test(x));
  const item0 = hs => PF.normaliseBooking({ ...base(), items: [{ ...base().items[0], hs }] }).items[0];
  T('HS tariff check', 'Codes are checked as entered: digits are never padded, trimmed or replaced', () => { const cases = [[90111, '90111'], [901110000, '901110000'], [6912, '6912'], ['6912.00', '691200'], ['HS 6912 00', '691200'], ['090111', '090111'], [691200.0, '691200'], ['999999', '999999']]; const bad = cases.filter(([v, d]) => item0(v).hs.digits !== d); return expect(!bad.length, JSON.stringify(bad)); });
  T('HS tariff check', 'Number 90111 → R-01 Red; fix recommends 090111 Coffee, not roasted (leading zero, store as text)', () => { const e = ev(b => b.items[0].hs = 90111), c = chk(e, 'R-01'); return expect(c.status === 'fail' && /090111/.test(c.fix) && /Coffee, not roasted/.test(c.fix) && /leading zero/.test(c.fix) && /store the code as text/.test(c.fix) && e.b.items[0].hs.digits === '90111' && e.b.items[0].hsRec[0].code === '090111', c.fix); });
  T('HS tariff check', 'Number 99999 → generic leading-zero advice, no code recommended', () => { const e = ev(b => b.items[0].hs = 99999), c = chk(e, 'R-01'); return expect(c.status === 'fail' && /leading zero/.test(c.detail) && !/099999/.test(c.fix) && !e.b.items[0].hsRec.length, c.fix); });
  T('HS tariff check', 'Number 901110000 → R-01 pass, one Advisory: reads as microscopes, recommends 0901110000; code unchanged', () => { const e = ev(b => b.items[0].hs = 901110000), a = hsAdv(e); return expect(st(e, 'R-01') === 'pass' && !e.dataIssues.length && e.status === ev().status && a.length === 1 && /microscopes/.test(a[0]) && /0901110000/.test(a[0]) && e.b.items[0].hs.digits === '901110000' && e.b.items[0].hsRec[0].code === '0901110000', a.join(' | ')); });
  T('HS tariff check', 'Number 902400000 → exactly one Advisory (not in tariff + recommend 0902400000), no data issue', () => { const e = ev(b => b.items[0].hs = 902400000), a = hsAdv(e); return expect(a.length === 1 && /not in the UK tariff/.test(a[0]) && /0902400000/.test(a[0]) && !e.dataIssues.length, a.join(' | ')); });
  T('HS tariff check', 'Text “901110000” → no leading-zero recommendation', () => expect(!item0('901110000').hsRec.length));
  T('HS tariff check', '4-digit 6912 → R-01 Red; recommends 691200 without changing the code', () => { const e = ev(b => b.items[0].hs = 6912), c = chk(e, 'R-01'); return expect(c.status === 'fail' && /recommended 6-digit code: 691200/.test(c.fix) && e.b.items[0].hs.digits === '6912', c.fix); });
  T('HS tariff check', '4-digit 6115 → “9 subheadings”, no single pick; 9999 → “not in the UK tariff”', () => { const a = chk(ev(b => b.items[0].hs = 6115), 'R-01'), z = chk(ev(b => b.items[0].hs = 9999), 'R-01'); return expect(a.status === 'fail' && /9 subheadings/.test(a.fix) && !item0(6115).hsRec.length && z.status === 'fail' && /not in the UK tariff/.test(z.fix), a.fix + ' | ' + z.fix); });
  T('HS tariff check', '999999 → one Advisory, no data issue, status unchanged (Green)', () => { const e = ev(b => b.items[0].hs = '999999'), a = hsAdv(e); return expect(a.length === 1 && /999999 is not an HS subheading/.test(a[0]) && !e.dataIssues.length && e.status === 'Green', a.join(' | ') + ' ' + e.status); });
  T('HS tariff check', '850700 → Advisory says heading 8507 has 7 subheadings', () => { const a = hsAdv(ev(b => b.items[0].hs = '850700')); return expect(a.length === 1 && /7 subheadings/.test(a[0]), a.join(' | ')); });
  T('HS tariff check', 'Items 691200 + 999999 → one Advisory naming only the second SKU; re-evaluating gives the same advisories', () => { const b = base(); b.items.push({ ...b.items[0], sku: 'BAD-02', hs: '999999' }); const n = PF.normaliseBooking(b), e1 = PF.evaluate(n, { today: TODAY }), e2 = PF.evaluate(n, { today: TODAY }), a = hsAdv(e1); return expect(a.length === 1 && /BAD-02/.test(a[0]) && !/MUG-01/.test(a[0]) && JSON.stringify(e1.advisories) === JSON.stringify(e2.advisories), a.join(' | ')); });
  T('HS tariff check', 'Full UK code: 6912002310 → no advisory; 6912001000 → one advisory, R-01 pass, no data issue', () => { const ok = ev(b => b.items[0].hs = '6912002310'), bad = ev(b => b.items[0].hs = '6912001000'), a = hsAdv(bad); return expect(!hsAdv(ok).length && a.length === 1 && /691200/.test(a[0]) && /6912001000 is not a current UK commodity code/.test(a[0]) && st(bad, 'R-01') === 'pass' && !bad.dataIssues.length, a.join(' | ')); });
  const sug = d => PF.hsSuggest(d);
  T('HS suggestion', 'hsTokens: “Cotton socks, 3-pack” → cotton, sock; “Ceramic mugs 350 ml” → ceramic, mug', () => expect(JSON.stringify(PF.hsTokens('Cotton socks, 3-pack')) === '["cotton","sock"]' && JSON.stringify(PF.hsTokens('Ceramic mugs 350 ml')) === '["ceramic","mug"]', JSON.stringify(PF.hsTokens('Cotton socks, 3-pack'))));
  T('HS suggestion', 'Organic cotton T-shirt → 610910; Ceramic mug, 350 ml → 691200; Cotton socks, 3-pack → 611595', () => expect(sug('Organic cotton T-shirt').codes[0] === '610910' && sug('Ceramic mug, 350 ml').codes[0] === '691200' && sug('Cotton socks, 3-pack').codes[0] === '611595' && ['Organic cotton T-shirt', 'Ceramic mug, 350 ml', 'Cotton socks, 3-pack'].every(d => sug(d).level === 'hs6')));
  T('HS suggestion', 'Perfume 50 ml → 330300 from an HMRC search reference, matched “perfume”', () => { const r = sug('Perfume 50 ml'); return expect(r.level === 'hs6' && r.codes[0] === '330300' && r.source === 'reference' && r.matched.includes('perfume'), JSON.stringify(r)); });
  T('HS suggestion', 'Black tea, 250 g → heading 0902 with 090230 and 090240, no single pick', () => { const r = sug('Black tea, 250 g'); return expect(r.level === 'heading' && r.heading === '0902' && r.codes.includes('090230') && r.codes.includes('090240'), JSON.stringify(r)); });
  T('HS suggestion', 'Material decides: wool socks → 611594 (not cotton 611595); porcelain mug → 691110', () => expect(sug('Wool socks').codes[0] === '611594' && sug('Porcelain mug').codes[0] === '691110', JSON.stringify(sug('Wool socks'))));
  T('HS suggestion', 'Misc stock / Widget assembly kit → no suggestion', () => expect(sug('Misc stock').level === 'none' && sug('Widget assembly kit').level === 'none'));
  T('HS suggestion', 'Same description twice → identical result', () => expect(JSON.stringify(sug('Organic cotton T-shirt')) === JSON.stringify(sug('Organic cotton T-shirt'))));
  T('HS suggestion', 'Workbook items TSH-01 (blank), SCK-01 (6115), MUG-01 (blank) → R-01 Red, fix suggests 610910 / 611595 / 691200, codes untouched', () => { const e = ev(b => { b.items = [{ ...b.items[0], sku: 'TSH-01', description: 'Organic cotton T-shirt', hs: '' }, { ...b.items[0], sku: 'SCK-01', description: 'Cotton socks, 3-pack', hs: 6115 }, { ...b.items[0], sku: 'MUG-01', description: 'Ceramic mug, 350 ml', hs: '' }]; }), c = chk(e, 'R-01'); return expect(c.status === 'fail' && /Suggested HS code 610910/.test(c.fix) && /Suggested HS code 611595/.test(c.fix) && /Suggested HS code 691200/.test(c.fix) && /verify on trade-tariff/.test(c.fix) && e.b.items[0].hs.blank && e.b.items[1].hs.digits === '6115' && e.b.items[2].hs.blank, c.fix); });
  T('HS suggestion', 'A valid code gets no suggestion', () => expect(ev().b.items[0].hsSug === null));
  T('HS suggestion', 'No index loaded → level none, never throws', () => { const saved = PF.getHsIndex(); PF.setHsIndex(null); try { return expect(sug('Organic cotton T-shirt').level === 'none'); } finally { PF.setHsIndex(saved); } });
  T('HS tariff check', 'No index loaded → no HS advisories and today’s fix text', () => { const saved = PF.getHsIndex(); PF.setHsIndex(null); try { const e = ev(b => b.items[0].hs = '999999'), c = chk(ev(b => b.items[0].hs = 90111), 'R-01'); return expect(!hsAdv(e).length && !/090111/.test(c.fix), c.fix); } finally { PF.setHsIndex(saved); } });

  // ---------- R-02 ----------
  T('R-02 Declared value', 'Exactly +1.00% (5454 vs 5400) → pass', () => expect(st(ev(b => b.declared = 5454), 'R-02') === 'pass'));
  T('R-02 Declared value', '+1.0002% (5454.01) → Red', () => expect(st(ev(b => b.declared = 5454.01), 'R-02') === 'fail'));
  T('R-02 Declared value', 'Exactly −1.00% (5346) → pass', () => expect(st(ev(b => b.declared = 5346), 'R-02') === 'pass'));
  T('R-02 Declared value', '−1.02% (5345) → Red', () => expect(st(ev(b => b.declared = 5345), 'R-02') === 'fail'));
  T('R-02 Declared value', 'Item left out of the total is pinpointed', () => { const c = chk(ev(b => { b.items.push({ sku: 'CAN-01', description: 'Soy wax candle', hs: '340600', qty: 200, price: 4, upc: 20, cartons: 10, unitWeight: 0.3, coo: 'India' }); b.cartons = 100; b.gross = 700; }), 'R-02'); return expect(c.status === 'fail' && /CAN-01/.test(c.detail), c.detail); });
  T('R-02 Declared value', 'Misplaced zero (540 vs 5400) is called out', () => { const c = chk(ev(b => b.declared = 540), 'R-02'); return expect(/factor of 10/.test(c.detail), c.detail); });
  T('R-02 Declared value', '“£5,400” text with symbol and comma parses', () => expect(st(ev(b => b.declared = '£5,400'), 'R-02') === 'pass'));

  // ---------- R-03 ----------
  T('R-03 Packing', '12 × 80 ≠ 1080 → Red with both fix options', () => { const c = chk(ev(b => { b.items[0].cartons = 80; b.cartons = 80; }), 'R-03'); return expect(c.status === 'fail' && /960/.test(c.detail) && /cartons to 90/.test(c.fix), c.fix); });
  T('R-03 Packing', 'Non-whole carton count suggested is flagged', () => { const c = chk(ev(b => { b.items[0].qty = 1000; b.declared = 5000; }), 'R-03'); return expect(c.status === 'fail' && /isn't whole/.test(c.fix), c.fix); });
  T('R-03 Packing', 'Units per carton = 0 → data issue + R-03 fail', () => { const e = ev(b => b.items[0].upc = 0); return expect(e.status === 'Red' && e.dataIssues.some(i => /units per carton/.test(i.text)), e.dataIssues.map(i => i.text).join()); });

  // ---------- R-04 ----------
  T('R-04 Cartons', 'Booking 95 vs items 90 → Red', () => expect(st(ev(b => b.cartons = 95), 'R-04') === 'fail'));
  T('R-04 Cartons', 'Multi-item: total missing one item’s cartons → pinpointed', () => { const c = chk(ev(b => { b.items.push({ sku: 'CAN-01', description: 'Soy wax candle', hs: '340600', qty: 200, price: 4, upc: 20, cartons: 10, unitWeight: 0.3, coo: 'India' }); b.declared = 6200; b.gross = 700; }), 'R-04'); return expect(c.status === 'fail' && /CAN-01/.test(c.detail), c.detail); });

  // ---------- R-05 ----------
  T('R-05 Pallet weight', 'Exactly 500 kg/pallet on Carrier A → pass (limit is inclusive)', () => expect(st(ev(b => b.gross = 1500), 'R-05') === 'pass'));
  T('R-05 Pallet weight', 'Cheapest, 550 kg/pallet → Red; cheaper fix is switching to B (£660 < re-pack A £720)', () => { const e = ev(b => b.gross = 1650); const c = chk(e, 'R-05'); return expect(c.status === 'fail' && c.fixes[0].type === 'switch' && c.fixes[0].carrier === 'Carrier B' && c.fixes[1].cost === 720, c.fix); });
  T('R-05 Pallet weight', 'Fastest, 450 kg/pallet → Carrier C (400 kg) refuses; fixes offered', () => { const e = ev(b => { b.priority = 'Fastest'; b.gross = 1350; }); const c = chk(e, 'R-05'); return expect(c.status === 'fail' && e.rec.chosen.carrier === 'Carrier C' && c.fixes.some(f => f.type === 'repack' && f.pallets === 4), c.fix); });
  T('R-05 Pallet weight', '800 kg/pallet → over every limit; cheapest fix = Carrier B on 4 pallets (£880 < A on 5 = £900)', () => { const c = chk(ev(b => b.gross = 2400), 'R-05'); return expect(c.status === 'fail' && /every carrier/.test(c.detail) && c.fixes[0].carrier === 'Carrier B' && c.fixes[0].pallets === 4 && c.fixes[0].cost === 880, c.fix); });
  T('R-05 Pallet weight', 'Choosing Carrier B explicitly clears the 550 kg/pallet problem', () => { const e = ev(b => { b.gross = 1650; b.carrierOverride = 'Carrier B'; }); return expect(st(e, 'R-05') === 'pass' && e.rec.chosen.carrier === 'Carrier B', chk(e, 'R-05').detail); });
  T('R-05 Pallet weight', 'Pallets = 0 → data issue, R-05 cannot be checked', () => { const e = ev(b => b.pallets = 0); return expect(st(e, 'R-05') === 'cannot' && e.status === 'Red'); });

  // ---------- R-06 ----------
  const dg = (desc) => st(ev(b => b.items[0].description = desc), 'R-06');
  T('R-06 Dangerous goods', '“Lithium-ion power bank 10000mAh” → Red', () => expect(dg('Lithium-ion power bank 10000mAh') === 'fail'));
  T('R-06 Dangerous goods', '“Aerosol hairspray 250ml” → Red', () => expect(dg('Aerosol hairspray 250ml') === 'fail'));
  T('R-06 Dangerous goods', '“Eau de parfum 50ml” → Red (flammable liquid)', () => expect(dg('Eau de parfum 50ml') === 'fail'));
  T('R-06 Dangerous goods', '“Nail polish set” → Red', () => expect(dg('Nail polish set') === 'fail'));
  T('R-06 Dangerous goods', '“Vape pen starter kit” → Red', () => expect(dg('Vape pen starter kit') === 'fail'));
  T('R-06 Dangerous goods', '“Wall clock, batteries not included” → pass', () => expect(dg('Wall clock, batteries not included') === 'pass'));
  T('R-06 Dangerous goods', '“Battery-free kitchen timer” → pass', () => expect(dg('Battery-free kitchen timer') === 'pass'));
  T('R-06 Dangerous goods', '“Non-aerosol hair spray” → pass', () => expect(dg('Non-aerosol hair spray') === 'pass'));
  T('R-06 Dangerous goods', '“Alcohol-free hand cream” → pass', () => expect(dg('Alcohol-free hand cream') === 'pass'));
  T('R-06 Dangerous goods', '“Bluetooth speaker” → needs confirmation (Amber)', () => { const e = ev(b => b.items[0].description = 'Bluetooth speaker'); return expect(st(e, 'R-06') === 'check' && e.status === 'Amber'); });
  T('R-06 Dangerous goods', '“Silicone phone case” → pass (accessory, no battery)', () => expect(dg('Silicone phone case') === 'pass'));
  T('R-06 Dangerous goods', '“Empty glass spray bottle” → pass', () => expect(dg('Empty glass spray bottle') === 'pass'));
  T('R-06 Dangerous goods', '“Reed diffuser, lavender” → needs confirmation', () => expect(dg('Reed diffuser, lavender') === 'check'));
  T('R-06 Dangerous goods', '“Scented soy candle” → pass', () => expect(dg('Scented soy candle') === 'pass'));
  T('R-06 Dangerous goods', 'Lighter-weight wording is not a lighter', () => expect(dg('Lighter weight cotton tote') === 'pass'));
  T('R-06 Dangerous goods', 'Keyword in SKU only (LIION-PB) is still caught', () => expect(st(ev(b => { b.items[0].sku = 'PB-LI-ION'; b.items[0].description = 'Portable charger'; }), 'R-06') === 'fail'));

  // ---------- R-07 ----------
  T('R-07 Gross weight', 'Gross 500 kg < goods 540 kg → Amber', () => { const e = ev(b => b.gross = 500); return expect(st(e, 'R-07') === 'fail' && e.status === 'Amber', chk(e, 'R-07').detail); });
  T('R-07 Gross weight', 'Gross exactly = goods → pass, advisory that it looks like net weight', () => { const e = ev(b => b.gross = 540); return expect(st(e, 'R-07') === 'pass' && e.advisories.some(a => /net weight/.test(a))); });

  // ---------- R-08 ----------
  T('R-08 Appointment', 'Warehouse + No → Amber', () => expect(st(ev(b => b.appointment = 'No'), 'R-08') === 'fail'));
  T('R-08 Appointment', 'Business address + No → not applicable', () => expect(st(ev(b => { b.destType = 'Business address'; b.appointment = 'No'; }), 'R-08') === 'na'));
  T('R-08 Appointment', 'Warehouse + blank → Amber (treated as not booked)', () => expect(st(ev(b => b.appointment = ''), 'R-08') === 'fail'));
  T('R-08 Appointment', '“yes ” lower-case with space → Yes', () => expect(st(ev(b => b.appointment = 'yes '), 'R-08') === 'pass'));
  T('R-08 Appointment', 'Warehouse, not booked → still Amber; delivery = 5 days transit + 2 days buffer (Thu 05-11 → Thu 12-11)', () => { const e = ev(b => b.appointment = 'No'); return expect(st(e, 'R-08') === 'fail' && chk(e, 'R-08').sev === 'Amber' && e.status === 'Amber' && e.eta.bufferDays === 2 && e.eta.arrive === '2026-11-12', JSON.stringify(e.eta)); });
  T('R-08 Appointment', 'Blank appointment → same 2-day buffer; booked → no buffer (Tue 10-11)', () => { const n = ev(b => b.appointment = ''), y = ev(); return expect(n.eta.arrive === '2026-11-12' && y.eta.bufferDays === 0 && y.eta.arrive === '2026-11-10', JSON.stringify([n.eta, y.eta])); });
  T('R-08 Appointment', 'Business address → no buffer', () => { const e = ev(b => { b.destType = 'Business address'; b.appointment = 'No'; }); return expect(e.eta.bufferDays === 0, JSON.stringify(e.eta)); });
  T('R-08 Appointment', 'Ready Wed 04-11, not booked → delivery Wed 11-11; summary explains 5 days transit + 2 days for the slot', () => { const e = ev(b => { b.appointment = 'No'; b.ready = '04-11-2026'; }), c = PF.confirmation(e); return expect(e.eta.arrive === '2026-11-11' && c.lines.some(l => /5 days in transit \+ 2 days to book the warehouse slot/.test(l)), JSON.stringify(e.eta) + ' ' + c.lines.join(' | ')); });

  // ---------- R-09 ----------
  T('R-09 Origin', 'Blank country of origin → Amber', () => { const e = ev(b => b.items[0].coo = ''); return expect(st(e, 'R-09') === 'fail' && e.status === 'Amber'); });
  T('R-09 Origin', '“UK” is read as United Kingdom → pass, no data warning', () => { const e = ev(b => b.items[0].coo = 'UK'); return expect(st(e, 'R-09') === 'pass' && e.status === 'Green'); });

  // ---------- R-10 ----------
  T('R-10 Date', 'Yesterday → Amber', () => expect(st(ev(b => b.ready = '24-10-2026'), 'R-10') === 'fail'));
  T('R-10 Date', 'Today → pass', () => expect(st(ev(b => b.ready = '25-10-2026'), 'R-10') === 'pass'));
  T('R-10 Date', 'Past date: ETA counted from today, not from the past date', () => { const e = ev(b => b.ready = '01-10-2026'); return expect(e.eta.collect === '2026-10-26' && e.eta.fromToday, JSON.stringify(e.eta)); });
  T('R-10 Date', 'Excel serial date 46331 → 05-11-2026', () => expect(PF.parseSheetDate(46331).iso === '2026-11-05', PF.parseSheetDate(46331)));
  T('R-10 Date', 'Day-first “05/11/2026” → 5 November (not 11 May)', () => expect(PF.parseSheetDate('05/11/2026').iso === '2026-11-05'));
  T('R-10 Date', '“5-11-26” two-digit year → 2026-11-05', () => expect(PF.parseSheetDate('5-11-26').iso === '2026-11-05'));
  T('R-10 Date', '“31-02-2026” is impossible → Red data issue', () => { const e = ev(b => b.ready = '31-02-2026'); return expect(e.status === 'Red' && st(e, 'R-10') === 'cannot'); });
  T('R-10 Date', '“11-31-2026” (US order) → rejected, not guessed', () => expect(!!PF.parseSheetDate('11-31-2026').error));
  T('R-10 Date', 'Weekend ready date → collection moves to Monday', () => { const e = ev(b => b.ready = '07-11-2026'); return expect(e.eta.collect === '2026-11-09', JSON.stringify(e.eta)); });

  // ---------- Carrier choice ----------
  T('Carrier choice', 'Cheapest → Carrier A on every route', () => expect(['Frankfurt', 'Paris', 'Amsterdam'].every(c => ev(b => { b.destCity = c; b.destCountry = PF.CITY_COUNTRY[c]; }).rec.chosen.carrier === 'Carrier A')));
  T('Carrier choice', 'Fastest → Carrier C', () => expect(ev(b => { b.priority = 'Fastest'; b.gross = 600; }).rec.chosen.carrier === 'Carrier C'));
  T('Carrier choice', 'Most reliable → Carrier C', () => expect(ev(b => { b.priority = 'Most reliable'; b.gross = 600; }).rec.chosen.carrier === 'Carrier C'));
  T('Carrier choice', 'Balanced → Carrier B on every route (B buys speed cheaply, C does not)', () => expect(['Frankfurt', 'Lyon', 'Rotterdam'].every(c => ev(b => { b.priority = 'Balanced'; b.destCity = c; b.destCountry = PF.CITY_COUNTRY[c]; }).rec.chosen.carrier === 'Carrier B')));
  T('Carrier choice', 'Missing priority → Balanced, with an Amber note', () => { const e = ev(b => b.priority = ''); return expect(e.rec.chosen.carrier === 'Carrier B' && e.status === 'Amber'); });
  T('Carrier choice', 'Netherlands prices used for Rotterdam (3 × £160 = £480)', () => expect(ev(b => { b.destCity = 'Rotterdam'; b.destCountry = 'Netherlands'; }).rec.chosen.cost === 480));

  // ---------- Data quality ----------
  T('Data quality', 'Paris with country Germany → Red mismatch', () => { const e = ev(b => b.destCity = 'Paris'); return expect(e.status === 'Red' && e.dataIssues.some(i => /Paris is in France/.test(i.text))); });
  T('Data quality', 'Currency EUR → Red', () => expect(ev(b => b.currency = 'EUR').status === 'Red'));
  T('Data quality', 'Booking with no items → Red', () => expect(ev(b => b.items = []).status === 'Red'));
  T('Data quality', '2.5 pallets → Red (must be whole)', () => expect(ev(b => b.pallets = 2.5).dataIssues.some(i => /whole number/.test(i.text))));
  T('Data quality', 'Pallets “three” (text) → Red, not a number', () => expect(ev(b => b.pallets = 'three').dataIssues.some(i => /isn't a number/.test(i.text))));
  T('Data quality', 'Unknown destination city (Munich) → Red', () => expect(ev(b => b.destCity = 'Munich').dataIssues.some(i => /Munich/.test(i.text))));
  T('Data quality', 'Several planted mistakes → each reported separately', () => { const e = ev(b => { b.items[0].hs = ''; b.declared = 6000; b.appointment = 'No'; b.ready = '01-10-2026'; }); return expect(e.reds === 2 && e.ambers === 2, `reds ${e.reds}, ambers ${e.ambers}`); });

  // ---------- DG grey area (ADR classes outside R-06; Advisory only) ----------
  const adrOf = d => PF.scanDG(d).adr.map(a => a.cls);
  const dgAdv = e => e.advisories.filter(a => /^Possible dangerous goods/.test(a));
  [['Party poppers, box of 50', '1'], ['Butane gas cartridges, 4-pack', '2'], ['Fire extinguisher 1 kg', '2'], ['Chlorine gas cylinder', '2 (toxic, label 2.3)'], ['Fuel tablets (hexamine)', '4.1'], ['Pool chlorine tablets 5 kg', '5.1'], ['Safety matches, 10 boxes', '4.1'], ['Lumpwood BBQ charcoal 5 kg', '4.2'], ['Calcium carbide 1 kg', '4.3'], ['Pool chlorine tablets 5 kg', '5.1'], ['Body filler hardener tube', '5.2'], ['Rat poison bait blocks', '6.1'], ['Clinical waste bags (used)', '6.2'], ['Ionisation smoke alarm', '7'], ['12V car battery', '8'], ['Drain unblocker 1 L', '8'], ['Mercury thermometer', '8'], ['Sodium-ion battery pack', '9'], ['Chainsaw, 40 cm bar', '9'], ['Dry ice pellets 10 kg', '9'], ['Auto-inflating lifejacket', '9'], ['Steering wheel airbag module', '9'], ['Environmentally hazardous wood preserver', '9']].forEach(([d, cls]) =>
    T('DG grey area', `“${d}” → ADR class ${cls} advisory`, () => expect(adrOf(d).includes(cls), adrOf(d))));
  ['Spirit level 60 cm', 'Matchbox car set', 'Charcoal grey wool scarf', 'Chlorine-free pool float', 'Battery-free wall clock', 'Optical smoke alarm', 'Flared jeans', 'Ink cartridges, black', 'Fire pit, steel', 'Hyaluronic acid serum', 'Mercury-free thermometer', '3% hydrogen peroxide solution', 'Fridge magnets, set of 6', 'Soy wax candle', 'Acrylic paint set', 'Red wine, 75 cl'].forEach(d =>
    T('DG grey area', `Safe phrase “${d}” → no ADR advisory`, () => expect(adrOf(d).length === 0, PF.scanDG(d).adr)));
  T('DG grey area', 'Party poppers in an otherwise clean booking → one advisory, status stays Green', () => { const e = ev(b => { b.items[0].description = 'Party poppers, box of 50'; }); return expect(dgAdv(e).length === 1 && /ADR class 1/.test(dgAdv(e)[0]) && e.status === 'Green' && st(e, 'R-06') === 'pass', [e.status, dgAdv(e)]); });
  T('DG grey area', 'Car battery → R-06 possible-lithium check stays, plus a class 8 advisory', () => { const e = ev(b => { b.items[0].description = '12V car battery'; }); return expect(st(e, 'R-06') === 'check' && dgAdv(e).length === 1 && /ADR class 8/.test(dgAdv(e)[0]), [st(e, 'R-06'), dgAdv(e)]); });
  T('R-06 Dangerous goods', 'Methanol is a flammable liquid → R-06 Red', () => expect(st(ev(b => { b.items[0].description = 'Methanol 1 L'; }), 'R-06') === 'fail'));
  T('R-06 Dangerous goods', '“Pool chlorine tablets” and “Paracetamol tablets” are not lithium devices → R-06 pass', () => expect(st(ev(b => { b.items[0].description = 'Pool chlorine tablets 5 kg'; }), 'R-06') === 'pass' && st(ev(b => { b.items[0].description = 'Paracetamol tablets, 16-pack'; }), 'R-06') === 'pass'));
  T('R-06 Dangerous goods', 'Device tablets still need confirming: “Android tablet 10 inch”, “iPad”, “tablet computer” → check', () => expect(['Android tablet 10 inch', 'iPad Air', 'Kids tablet with 7 inch screen', 'Tablet computer'].every(d => st(ev(b => { b.items[0].description = d; }), 'R-06') === 'check')));
  T('R-06 Dangerous goods', '“Fuel tablets” → not R-06 Red; class 4.1 advisory instead', () => { const e = ev(b => { b.items[0].description = 'Fuel tablets (hexamine), 24-pack'; }); return expect(st(e, 'R-06') === 'pass' && dgAdv(e).length === 1 && /ADR class 4\.1/.test(dgAdv(e)[0]), [st(e, 'R-06'), dgAdv(e)]); });
  T('DG grey area', 'Lithium e-bike → R-06 Red, no extra ADR advisory', () => { const e = ev(b => { b.items[0].description = 'Lithium e-bike'; }); return expect(st(e, 'R-06') === 'fail' && dgAdv(e).length === 0, dgAdv(e)); });
  T('DG grey area', 'Same booking twice → identical DG advisories', () => { const m = b => { b.items[0].description = 'Pool chlorine tablets 5 kg'; }; return expect(JSON.stringify(dgAdv(ev(m))) === JSON.stringify(dgAdv(ev(m)))); });

  // ---------- Corrections (audit trail) ----------
  const cor = e => e.corrections.map(c => `${c.field}${c.sku ? '@' + c.sku : ''}:${c.entered}->${c.used}:${c.kind}`);
  T('Corrections', 'Clean template booking → no corrections', () => expect(ev().corrections.length === 0, cor(ev())));
  T('Corrections', 'TB-16 shape: HS 6912.00, origin UK, Excel date, “yes” → exactly 4 corrections, status Green', () => { const e = ev(b => { b.ready = 46350; b.appointment = 'yes'; b.items[0].hs = '6912.00'; b.items[0].coo = 'UK'; }); const c = cor(e); return expect(c.length === 4 && c.includes('ready:46350->24-11-2026:date') && c.includes('appointment:yes->Yes:format') && c.includes('hs@MUG-01:6912.00->691200:format') && c.includes('coo@MUG-01:UK->United Kingdom:alias') && e.status === 'Green', [e.status, c]); });
  T('Corrections', 'Values already canonical (HS text 090240, date 18-11-2026, pallets 2) → none', () => { const e = ev(b => { b.items[0].hs = '090240'; b.ready = '18-11-2026'; b.pallets = 2; }); return expect(e.corrections.length === 0, cor(e)); });
  T('Corrections', '“£5,400” declared value → format correction to 5400', () => expect(cor(ev(b => { b.declared = '£5,400'; })).includes('declared:£5,400->5400:format'), cor(ev(b => { b.declared = '£5,400'; }))));
  T('Corrections', 'Blank currency → default GBP', () => expect(cor(ev(b => { b.currency = ''; })).includes('currency:->GBP:default')));
  T('Corrections', 'Destination type “Amazon FC” → alias Warehouse', () => expect(cor(ev(b => { b.destType = 'Amazon FC'; })).includes('destType:Amazon FC->Warehouse:alias')));
  T('Corrections', 'Leading-zero number 90111 is NOT corrected (recommendation only)', () => expect(!cor(ev(b => { b.items[0].hs = 90111; })).some(x => /^hs@/.test(x))));
  T('Corrections', 'Same input twice → identical corrections', () => { const m = b => { b.ready = 46350; b.items[0].coo = 'UK'; }; return expect(JSON.stringify(ev(m).corrections) === JSON.stringify(ev(m).corrections)); });
  T('Corrections', 'Corrections never change status, reds or ambers', () => { const a = ev(), c = ev(b => { b.destType = 'Amazon FC'; b.declared = '£5,400'; b.appointment = 'yes'; }); return expect(c.corrections.length === 3 && a.status === c.status && a.reds === c.reds && a.ambers === c.ambers, [c.status, c.corrections.length]); });
  T('Corrections', 'Confirmation says how many are not yet reviewed', () => { const e = ev(b => { b.appointment = 'yes'; b.items[0].coo = 'UK'; }); return expect(PF.confirmation(e).lines.some(l => /^2 automatic corrections not yet reviewed/.test(l)) && !PF.confirmation(e, 2).lines.some(l => /not yet reviewed/.test(l))); });

  // ---------- Pallet plan ----------
  const pb = (o) => ({ destCountry: 'Germany', gross: 900, pallets: 2, items: [], ...o });
  T('Pallet plan', 'Germany at 900 kg → A 2×450 kg £360, B 2×450 kg £440, C 3×300 kg £1,020', () => { const p = PF.palletPlan(pb(), 'Carrier A'); const g = c => p.perCarrier.find(x => x.carrier === c); return expect(g('Carrier A').minPallets === 2 && g('Carrier A').perPallet === 450 && g('Carrier A').cost === 360 && g('Carrier B').minPallets === 2 && g('Carrier B').cost === 440 && g('Carrier C').minPallets === 3 && g('Carrier C').perPallet === 300 && g('Carrier C').cost === 1020, JSON.stringify(p.perCarrier)); });
  T('Pallet plan', 'France, Carrier A, 4 pallets, 600 kg → 2 are enough, saving £340', () => { const p = PF.palletPlan(pb({ destCountry: 'France', gross: 600, pallets: 4 }), 'Carrier A'); return expect(p.fewer && p.fewer.from === 4 && p.fewer.to === 2 && p.fewer.saving === 340, JSON.stringify(p.fewer)); });
  T('Pallet plan', 'Minimal pallet count → no fewer-pallets recommendation', () => expect(PF.palletPlan(pb(), 'Carrier A').fewer === null));
  T('Pallet plan', 'Gross blank, goods 400 kg, 2 pallets → 450 kg, marked estimated', () => { const p = PF.palletPlan(pb({ gross: null, items: [{ sku: 'A', qty: 800, unitWeight: 0.5, upc: 10, cartons: 80 }] }), 'Carrier A'); return expect(p.weight === 450 && p.estimated === true, JSON.stringify([p.weight, p.estimated])); });
  T('Pallet plan', '30 cartons of 12 kg + 10 of 6 kg on 2 pallets → 210 kg each', () => { const p = PF.palletPlan(pb({ gross: 900, items: [{ sku: 'HEAVY', qty: 360, unitWeight: 1, upc: 12, cartons: 30 }, { sku: 'LIGHT', qty: 60, unitWeight: 1, upc: 6, cartons: 10 }] }), 'Carrier A'); return expect(p.split.length === 2 && p.split.every(x => x.kg === 210), JSON.stringify(p.split)); });
  T('Pallet plan', 'Same booking twice → identical plan', () => { const b = pb({ items: [{ sku: 'B', qty: 120, unitWeight: 2, upc: 6, cartons: 20 }, { sku: 'A', qty: 120, unitWeight: 2, upc: 6, cartons: 20 }] }); return expect(JSON.stringify(PF.palletPlan(b, 'Carrier B')) === JSON.stringify(PF.palletPlan(b, 'Carrier B'))); });
  T('Pallet plan', 'Fewer-pallets advisory: France, 4 pallets, 600 kg on Carrier A → advisory, status unchanged', () => { const e = ev(b => { b.destCity = 'Paris'; b.destCountry = 'France'; b.pallets = 4; b.gross = 600; b.carrierOverride = 'Carrier A'; }); const a = e.advisories.find(x => /^By weight, 2 pallets are enough on Carrier A/.test(x)); return expect(a && /saving £340/.test(a) && /check volume and stacking height/.test(a) && e.status === 'Green', [e.status, a]); });

  // ---------- File parsing ----------
  const H1 = ['Booking ID', 'Seller name', 'Origin city', 'Origin country', 'Destination city', 'Destination country', 'Destination type', 'Ready to ship date', 'Seller priority', 'Pallets', 'Cartons', 'Total declared value', 'Currency', 'Total gross weight (kg)', 'Delivery appointment booked'];
  const H2 = ['Booking ID', 'SKU', 'Description', 'HS code', 'Quantity (units)', 'Unit price', 'Units per carton', 'Cartons', 'Unit weight (kg)', 'Country of origin'];
  const sheets = (bRows, iRows, title = true) => [{ name: 'Bookings', rows: [...(title ? [['Bookings — one row per record…']] : []), H1, ...bRows] }, { name: 'Items', rows: [...(title ? [['Items — one row per record…']] : []), H2, ...iRows] }];
  T('File parsing', 'Grey example row is skipped; real rows start at row 4', () => { const r = PF.parseSheets(sheets([PF.EXAMPLE_BOOKING, ['BK-101', ...PF.EXAMPLE_BOOKING.slice(1)]], [PF.EXAMPLE_ITEM, ['BK-101', ...PF.EXAMPLE_ITEM.slice(1)]])); return expect(r.bookings.length === 1 && r.bookings[0].id === 'BK-101' && r.bookings[0].items.length === 1, r.bookings.map(b => b.id)); });
  T('File parsing', 'Example row kept when the toggle is off', () => expect(PF.parseSheets(sheets([PF.EXAMPLE_BOOKING], [PF.EXAMPLE_ITEM]), { skipExample: false }).bookings.length === 1));
  T('File parsing', 'Header on row 1 (no title row) is found', () => expect(PF.parseSheets(sheets([['BK-9', ...PF.EXAMPLE_BOOKING.slice(1)]], [['BK-9', ...PF.EXAMPLE_ITEM.slice(1)]], false)).bookings[0].items.length === 1));
  T('File parsing', 'Item IDs matched despite case/spaces (“ bk-9 ”)', () => expect(PF.parseSheets(sheets([['BK-9', ...PF.EXAMPLE_BOOKING.slice(1)]], [[' bk-9 ', ...PF.EXAMPLE_ITEM.slice(1)]])).bookings[0].items.length === 1));
  T('File parsing', 'Items for an unknown booking are reported, not silently dropped', () => { const r = PF.parseSheets(sheets([['BK-9', ...PF.EXAMPLE_BOOKING.slice(1)]], [['BK-99', ...PF.EXAMPLE_ITEM.slice(1)]])); return expect(r.notices.some(n => /BK-99/.test(n.text))); });
  T('File parsing', 'Duplicate Booking ID → Red on the second row', () => { const r = PF.parseSheets(sheets([['BK-9', ...PF.EXAMPLE_BOOKING.slice(1)], ['BK-9', ...PF.EXAMPLE_BOOKING.slice(1)]], [])); return expect(PF.evaluate(r.bookings[1], { today: TODAY }).dataIssues.some(i => /more than once/.test(i.text))); });
  const dupIssues = (r, i) => PF.evaluate(r.bookings[i], { today: TODAY }).dataIssues.filter(x => /more than once/.test(x.text));
  T('File parsing', 'Duplicate ID with different case and spaces (“ tb-05 ” after “TB-05”) → Red naming the first row', () => { const r = PF.parseSheets(sheets([['TB-05', ...PF.EXAMPLE_BOOKING.slice(1)], [' tb-05 ', ...PF.EXAMPLE_BOOKING.slice(1)]], [])); const d = dupIssues(r, 1); return expect(d.length === 1 && d[0].sev === 'Red' && /row 3/.test(d[0].text), d.map(x => x.text)); });
  T('File parsing', 'Three copies of one ID → the 2nd and 3rd each get exactly one duplicate issue', () => { const row = ['TB-05', ...PF.EXAMPLE_BOOKING.slice(1)]; const r = PF.parseSheets(sheets([row, row, row], [])); return expect(dupIssues(r, 0).length === 0 && dupIssues(r, 1).length === 1 && dupIssues(r, 2).length === 1); });
  T('File parsing', 'Similar but different IDs (TB05 vs TB-05) → no duplicate issue', () => { const r = PF.parseSheets(sheets([['TB-05', ...PF.EXAMPLE_BOOKING.slice(1)], ['TB05', ...PF.EXAMPLE_BOOKING.slice(1)]], [])); return expect(dupIssues(r, 0).length === 0 && dupIssues(r, 1).length === 0); });
  T('File parsing', 'Blank rows between bookings are ignored', () => expect(PF.parseSheets(sheets([['BK-1', ...PF.EXAMPLE_BOOKING.slice(1)], [], [null, null], ['BK-2', ...PF.EXAMPLE_BOOKING.slice(1)]], [])).bookings.length === 2));
  T('File parsing', 'Columns in a different order are mapped by header name', () => { const rows = [['x'], [...H1].reverse(), [...PF.EXAMPLE_BOOKING].reverse().map((v, i) => (i === 14 ? 'BK-7' : v))]; const r = PF.parseSheets([{ name: 'Sheet1', rows }, { name: 'Items', rows: [H2, ['BK-7', ...PF.EXAMPLE_ITEM.slice(1)]] }]); return expect(r.bookings[0].id === 'BK-7' && PF.evaluate(r.bookings[0], { today: TODAY }).status === 'Green'); });

  // ---------- Conversation ----------
  if (CHAT) {
    const talk = (msgs) => { let s = CHAT.newState(); let last; for (const m of msgs) { const r = CHAT.turn(s, m, TODAY); s = r.st; last = r.reply; } return { s, r: last, ev: s.complete ? PF.evaluate(CHAT.toRaw(s), { today: TODAY }) : null }; };
    const FULL = "Hi, I'm Priya from Northfield Goods. We need to send 3 pallets from Manchester to our Amazon warehouse in Frankfurt, ready 5 Nov. 1080 ceramic mugs at £5 each, 12 per carton, 0.5kg each, HS 691200, made in the UK. Total weight 620kg. Delivery slot is booked. Cheapest please.";
    T('Corrections', 'Chat lists unreviewed corrections when the booking completes; “looks right” accepts them without changing the booking', () => { let st = CHAT.newState(); const r1 = CHAT.turn(st, FULL, TODAY); const before = JSON.stringify(CHAT.toRaw(r1.st)); const r2 = CHAT.turn(r1.st, 'Looks right', TODAY); const r3 = CHAT.turn(r2.st, "what's wrong?", TODAY); return expect(r1.reply.corrections.length === 3 && r2.reply.accepted.length === 3 && JSON.stringify(CHAT.toRaw(r2.st)) === before && Object.keys(r2.st.reviewed).length === 3 && r3.reply.corrections.length === 0 && !r2.reply.nothing, [r1.reply.corrections.length, r2.reply.accepted && r2.reply.accepted.length, r3.reply.corrections && r3.reply.corrections.length]); });
    T('Corrections', 'Chat worked-out values → derived corrections (item cartons 90, total cartons 90, declared 5400), no date noise', () => { const { s: st } = talk([FULL]); const e = PF.evaluate(CHAT.toRaw(st), { today: TODAY }); const c = cor(e); return expect(c.includes('cartons@MUG-01:->90:derived') && c.includes('cartons:->90:derived') && c.includes('declared:->5400:derived') && !c.some(x => /^ready/.test(x)), c); });
    const TEE = '200 t-shirts to Berlin from Leeds, £6 each, 20 per carton, 0.2 kg each, made in Turkey';
    T('Conversation', 'HS: T-shirts with no material → asks once what they are mainly made of; “cotton” → suggests 610910 (not recorded yet)', () => { const a = talk([TEE]), b = talk([TEE, 'cotton']); return expect(/mainly made of/.test(a.r.ask) && a.r.chips.includes('Cotton') && /610910/.test(b.r.ask) && b.r.chips.includes('Use 610910') && b.s.booking.items[0].hs == null, b.r.ask); });
    T('Conversation', 'HS: the suggestion is recorded only after the seller accepts it (“use 610910”)', () => { const t = talk([TEE, 'cotton', 'use 610910']); return expect(String(t.s.booking.items[0].hs) === '610910', JSON.stringify(t.s.booking.items[0].hs)); });
    T('Conversation', 'HS: “Other” material → 610990, not the cotton code; “not sure” → asked once, then the plain HS question', () => { const o = talk([TEE, 'other']), n = talk([TEE, 'not sure']); return expect(/610990/.test(o.r.ask) && !/610910/.test(o.r.ask) && !/made of/.test(n.r.ask) && /HS code/.test(n.r.ask), o.r.ask + ' | ' + n.r.ask); });
    T('Conversation', 'HS: material in the description → no material question', () => expect(!/made of/.test(talk(['200 cotton t-shirts to Berlin from Leeds, £6 each, 20 per carton, 0.2 kg each, made in Turkey']).r.ask)));
    T('Conversation', 'Price disclaimer on the first priced reply only', () => { let s = CHAT.newState(); const r1 = CHAT.turn(s, FULL, TODAY); const r2 = CHAT.turn(r1.st, 'Actually, add a pallet', TODAY); return expect(/Indicative rate/.test(r1.reply.priceNote || '') && !r2.reply.priceNote, [r1.reply.priceNote, r2.reply.priceNote]); });
    T('Conversation', 'Everything in one message → complete booking, Green, nothing asked', () => { const { s, r, ev: e } = talk([FULL]); return expect(s.complete && !r.ask && e.status === 'Green' && s.booking.seller === 'Northfield Goods', `${s.booking.seller} / ${r.ask} / ${e && e.status}`); });
    T('Conversation', 'Cartons (90) and declared value (£5,400) are worked out, not asked', () => { const { s } = talk([FULL]); const raw = CHAT.toRaw(s); return expect(raw.cartons === 90 && raw.declared === 5400, `${raw.cartons} ${raw.declared}`); });
    T('Conversation', '“add a pallet” → 4 pallets, checks re-run', () => { const { s, r } = talk([FULL, 'Actually, add a pallet']); return expect(s.booking.pallets === 4 && r.changes.some(c => c.field === 'pallets') && r.showReport, s.booking.pallets); });
    T('Conversation', '“make it 2 pallets” → R-05 Red (310 kg ok) — then 1,300 kg gross triggers it', () => { const { ev: e } = talk([FULL, 'make it 2 pallets', 'gross weight is 1300kg']); return expect(e.checks.find(c => c.id === 'R-05').status === 'fail', e.checks.find(c => c.id === 'R-05').detail); });
    T('Conversation', 'R-05 resolves after “add another pallet”', () => { const { ev: e } = talk([FULL, 'make it 2 pallets', 'gross weight is 1300kg', 'add another pallet']); return expect(e.checks.find(c => c.id === 'R-05').status === 'pass' && e.b.pallets === 3); });
    T('Conversation', 'Sparse start asks only for what is missing, in order', () => { const { s, r } = talk(['I need to ship some candles to Paris']); return expect(s.booking.destCity === 'Paris' && s.booking.items.length === 1 && s.pending.field === 'originCity', `${r.ask}`); });
    T('Conversation', 'Bare answers fill the pending question', () => { const { s } = talk(['I need to ship some candles to Paris', 'Leeds', '500', '4', '20', '0.3', '340600', 'India']); const it = s.booking.items[0]; return expect(s.booking.originCity === 'Leeds' && it.qty === 500 && it.price === 4 && it.upc === 20 && it.cartons === 25 && it.unitWeight === 0.3 && it.hs === '340600' && it.coo === 'India', JSON.stringify(it)); });
    T('Conversation', '“Don’t know” for HS code is accepted and flagged as R-01 Red at the end', () => { const { ev: e } = talk(['Send 200 cotton t-shirts at £6 each, 20 per carton, 0.2kg each from London to a shop in Lyon', "don't know", 'China', '1 pallet', '60kg', 'tomorrow', 'balanced', 'Thread & Co']); return expect(e && e.checks.find(c => c.id === 'R-01').status === 'fail' && /610910/.test(e.checks.find(c => c.id === 'R-01').fix), e ? e.checks.find(c => c.id === 'R-01').fix : 'incomplete'); });
    T('Conversation', 'Destination change mid-way updates country and price', () => { const { s, ev: e } = talk([FULL, 'actually send it to Rotterdam instead']); return expect(s.booking.destCountry === 'Netherlands' && e.rec.chosen.cost === 480); });
    T('Conversation', '“switch to carrier B” overrides the recommendation', () => { const { ev: e } = talk([FULL, 'switch to carrier B']); return expect(e.rec.chosen.carrier === 'Carrier B'); });
    T('Conversation', 'Changing priority clears a manual carrier choice', () => { const { ev: e } = talk([FULL, 'switch to carrier B', 'actually make it the fastest']); return expect(e.rec.chosen.carrier === 'Carrier C'); });
    T('Conversation', 'Unserved city (Munich) gets a helpful redirect', () => { const { r } = talk(['Shipping 3 pallets to Munich']); return expect(r.notes.some(n => /Munich isn't on a carrier route/.test(n))); });
    T('Conversation', 'Two products in one message become two items', () => { const { s } = talk(['500 scented candles at £4 each, 20 per carton, made in India and 200 reed diffusers at £12 each, 10 per carton, made in China']); return expect(s.booking.items.length === 2 && s.booking.items[1].price === 12 && s.booking.items[1].coo === 'China' && s.booking.items[0].coo === 'India', JSON.stringify(s.booking.items.map(i => [i.description, i.qty, i.price, i.upc, i.coo]))); });
    T('Conversation', '“make it 1200 mugs” updates the item and re-derives cartons', () => { const { s, ev: e } = talk([FULL, 'make it 1200 mugs']); return expect(s.booking.items.length === 1 && s.booking.items[0].qty === 1200 && s.booking.items[0].cartons === 100 && e.checks.find(c => c.id === 'R-03').status === 'pass'); });
    T('Conversation', 'Stated declared value is checked against items (R-02)', () => { const { ev: e } = talk([FULL, 'declared value is £6,000']); return expect(e.checks.find(c => c.id === 'R-02').status === 'fail'); });
    T('Conversation', 'Lithium item → R-06 Red and confirmation is blocked', () => { const { r, ev: e } = talk([FULL.replace('1080 ceramic mugs', '1080 lithium power banks').replace('HS 691200', 'HS 850760'), 'confirm the booking']); return expect(e.status === 'Red' && r.intent === 'confirm-blocked'); });
    T('Conversation', 'Clean booking + “confirm” → booking reference issued', () => { const { r } = talk([FULL, 'confirm']); return expect(r.intent === 'confirmed' && /^PF-\d{6}$/.test(r.ref), r.ref); });
    T('Conversation', '“remove the candles” drops that item', () => { const { s } = talk(['500 scented candles at £4 each and 200 reed diffusers at £12 each', 'remove the candles']); return expect(s.booking.items.length === 1 && /diffuser/i.test(s.booking.items[0].description)); });
    T('Conversation', 'Business address → appointment question is skipped', () => { const { s } = talk(['Send 200 cotton t-shirts at £6 each, 20 per carton, 0.2kg each, HS 610910, made in Turkey, from London to a shop in Lyon. 1 pallet, 60kg total, ready tomorrow, cheapest. We are Thread & Co Ltd']); return expect(s.complete && s.booking.appointment == null, s.pending && s.pending.q); });
    T('Conversation', '“no appointment yet” → R-08 Amber', () => { const { ev: e } = talk([FULL.replace('Delivery slot is booked.', 'We have no appointment yet.')]); return expect(e.checks.find(c => c.id === 'R-08').status === 'fail'); });
    T('Conversation', 'Grams are converted to kg (“500g each”)', () => { const { s } = talk(['100 notebooks at £3 each, 500g each']); return expect(s.booking.items[0].unitWeight === 0.5); });
    T('Conversation', '“1.2 tonnes” gross → 1,200 kg', () => { const { s } = talk(['total weight 1.2 tonnes']); return expect(s.booking.gross === 1200); });
    T('Conversation', 'Relative date “next Monday” → 26-10-2026', () => { const { s } = talk(['ready next monday']); return expect(s.booking.ready === '2026-10-26', s.booking.ready); });
    T('Conversation', '“ready 20 October” (5 days ago) is kept and flagged by R-10', () => { const { ev: e } = talk([FULL.replace('ready 5 Nov', 'ready 20 October')]); return expect(e.checks.find(c => c.id === 'R-10').status === 'fail'); });
    T('Conversation', '“350 ml” inside a description is not read as a quantity', () => { const { s } = talk(['1080 ceramic mugs, 350 ml, at £5 each']); return expect(s.booking.items.length === 1 && s.booking.items[0].qty === 1080); });
    T('Conversation', 'HS question offers the suggested code as a tap option', () => { const { s } = talk(['500 scented candles at £4 each, 20 per carton, 0.3kg each, made in India, from Leeds to Paris']); return expect(s.pending.field === 'hs' && s.pending.chips[0] === 'Use 340600' && /340600/.test(s.pending.q), s.pending.q); });
    T('Conversation', 'Tapping “Use 340600” fills the HS code', () => { const { s } = talk(['500 scented candles at £4 each, 20 per carton, 0.3kg each, made in India, from Leeds to Paris', 'Use 340600']); return expect(s.booking.items[0].hs === '340600'); });
    T('Conversation', '“Don’t know” → suggestion offered; “use 340600” later accepts it', () => { const a = talk(['500 scented candles at £4 each, 20 per carton, 0.3kg each, made in India, from Leeds to Paris', "don't know"]); const b = talk(['500 scented candles at £4 each, 20 per carton, 0.3kg each, made in India, from Leeds to Paris', "don't know", 'use 340600']); return expect(a.r.notes.some(n => /340600/.test(n)) && b.s.booking.items[0].hs === '340600' && !b.s.booking.items[0].hsUnknown); });
    T('Conversation', '“start over” resets everything', () => { const { s } = talk([FULL, 'start over']); return expect(!s.complete && s.booking.items.length === 0); });
  }
  return results;
}
if (typeof module !== 'undefined' && module.exports) module.exports = runTests; else root.PFTests = runTests;
})(typeof window !== 'undefined' ? window : globalThis);
