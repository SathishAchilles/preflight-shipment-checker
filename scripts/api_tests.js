// Checks api/bookings.js without a database: pg is replaced by a stub that records each query.
// Usage: node scripts/api_tests.js   (needs the repo's npm ci for pg to resolve)
const path = require('path');
const API = path.join(__dirname, '..', 'api', 'bookings.js');
const calls = [];
let reply = { rows: [] };
require.cache[require.resolve('pg', { paths: [path.dirname(API)] })] = { exports: { Pool: class { query(sql, args) { calls.push({ sql, args }); return Promise.resolve(reply); } } } };
process.env.BOOKINGS_DATABASE_URL = 'postgresql://stub';
const handler = require(API);

const ID = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (n, extra) => ({ id: ID(n), source: 'file', upload_id: ID(900), booking_id: 'BK-' + n, file_name: 'x.xlsx', original: { id: 'BK-' + n }, current: { id: 'BK-' + n }, status: 'Green', ...extra });
function call(method, { origin, type = 'application/json', body } = {}) {
  const headers = {}; if (origin !== undefined) headers.origin = origin; if (type) headers['content-type'] = type;
  let readBody = false;
  const req = { method, headers, get body() { readBody = true; return body; } };
  return new Promise(done => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { done({ status: this.statusCode, body: o, readBody }); return this; } };
    handler(req, res);
  });
}

const tests = [];
const T = (name, fn) => tests.push({ name, fn });
T('GET lists the saved rows', async () => { calls.length = 0; reply = { rows: [{ id: ID(1) }] }; const r = await call('GET'); return r.status === 200 && r.body.bookings.length === 1 && /order by updated_at desc/.test(calls[0].sql); });
T('POST from a foreign Origin → 403 before the body is read; nothing written', async () => { calls.length = 0; const r = await call('POST', { origin: 'https://evil.example', body: { bookings: [row(1)] } }); return r.status === 403 && !r.readBody && !calls.length; });
T('POST from a look-alike preview of another team → 403', async () => (await call('POST', { origin: 'https://preflight-shipment-checker-abc123-someone-else.vercel.app', body: { bookings: [row(1)] } })).status === 403);
T('POST from http://cargopass-uk.vercel.app (not https) → 403', async () => (await call('POST', { origin: 'http://cargopass-uk.vercel.app', body: { bookings: [row(1)] } })).status === 403);
T('POST from the app’s own origins is allowed', async () => {
  const ok = ['https://cargopass-uk.vercel.app', 'https://preflight-shipment-checker-five.vercel.app', 'https://preflight-shipment-checker-git-feat-x-curious-minds3.vercel.app', 'https://preflight-shipment-checker-k2j3h4-curious-minds3.vercel.app', 'http://127.0.0.1:8787', 'http://localhost:3000'];
  reply = { rows: [] }; const rs = await Promise.all(ok.map(o => call('POST', { origin: o, body: { bookings: [row(1)] } }))); return rs.every(r => r.status === 200);
});
T('POST with no Origin (curl, server to server) is allowed', async () => (await call('POST', { body: { bookings: [row(1)] } })).status === 200);
T('POST that is not application/json → 415; nothing written', async () => { calls.length = 0; const r = await call('POST', { origin: 'https://cargopass-uk.vercel.app', type: 'text/plain', body: '{"bookings":[]}' }); return r.status === 415 && !calls.length; });
T('POST with no Content-Type → 415', async () => (await call('POST', { type: null, body: { bookings: [row(1)] } })).status === 415);
T('Empty body / empty list → 400', async () => (await call('POST', { body: {} })).status === 400 && (await call('POST', { body: { bookings: [] } })).status === 400);
T('Unknown mode → 400', async () => (await call('POST', { body: { mode: 'replace', bookings: [row(1)] } })).status === 400);
T('More than 1,000 rows → 400', async () => (await call('POST', { body: { bookings: Array.from({ length: 1001 }, (_, i) => row(i)) } })).status === 400);
T('Bad id, repeated ids, chat row with an upload id → 400', async () => (await call('POST', { body: { bookings: [row(1, { id: 'x' })] } })).status === 400 && (await call('POST', { body: { bookings: [row(1), row(1)] } })).status === 400 && (await call('POST', { body: { bookings: [row(1, { source: 'chat' })] } })).status === 400);
T('Default mode upserts (fixes saved later update the row)', async () => { calls.length = 0; reply = { rows: [] }; const r = await call('POST', { body: { bookings: [row(1), row(2)] } }); return r.status === 200 && r.body.saved === 2 && /on conflict \(id\) do update/.test(calls[0].sql); });
T('mode insert never overwrites: on conflict do nothing, returns new count and existing fixes', async () => {
  calls.length = 0; reply = { rows: [{ inserted: 1, existing: [{ id: ID(2), overrides: { patch: { pallets: 3 } } }] }] };
  const r = await call('POST', { body: { mode: 'insert', bookings: [row(1), row(2)] } });
  return r.status === 200 && r.body.saved === 1 && r.body.existing[0].id === ID(2) && /on conflict \(id\) do nothing/.test(calls[0].sql) && !/do update/.test(calls[0].sql);
});
T('PUT → 405', async () => (await call('PUT')).status === 405);

(async () => {
  let ok = 0;
  for (const t of tests) { let pass = false, err = ''; try { pass = await t.fn(); } catch (e) { err = e.message; } if (pass) ok++; else console.log('FAIL', t.name, err); }
  console.log(`${ok}/${tests.length} API checks passed`);
  process.exitCode = ok === tests.length ? 0 : 1;
})();
