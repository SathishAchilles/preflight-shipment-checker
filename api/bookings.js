// Saved bookings (one shared list): GET lists the newest, POST saves or updates a batch.
// Connects as preflight_app (scripts/db/002_bookings.sql) through BOOKINGS_DATABASE_URL; the browser never sees it.
// POST only accepts JSON from the app's own pages (Origin check). That stops other websites writing through a visitor's
// browser; it is not authentication — anyone can still send a request without an Origin header.
const { Pool } = require('pg');

const MAX_ROWS = 1000, MAX_JSON = 65536, LIST_LIMIT = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['Red', 'Amber', 'Green'];
const MODES = ['upsert', 'insert'];
// The app's own origins: production, the project URL, this team's preview URLs, and the local dev server.
const ORIGINS = [/^https:\/\/cargopass-uk\.vercel\.app$/, /^https:\/\/preflight-shipment-checker-five\.vercel\.app$/,
  /^https:\/\/preflight-shipment-checker-[a-z0-9-]+-curious-minds3\.vercel\.app$/, /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/];
const allowedOrigin = o => o == null || ORIGINS.some(re => re.test(o));

let pool = null;
function db() {
  if (!pool) {
    if (!process.env.BOOKINGS_DATABASE_URL) throw Object.assign(new Error('BOOKINGS_DATABASE_URL is not set'), { status: 503 });
    // Supabase's pooler certificate is not in Node's CA store; the connection is still encrypted.
    pool = new Pool({ connectionString: process.env.BOOKINGS_DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false }, idleTimeoutMillis: 10000 });
  }
  return pool;
}

const bad = msg => Object.assign(new Error(msg), { status: 400 });
const jsonSize = v => Buffer.byteLength(JSON.stringify(v));

// Checks one row and returns it in the shape the insert expects; throws a 400 on anything unexpected.
function clean(r, n) {
  const at = `bookings[${n}]`;
  if (!r || typeof r !== 'object') throw bad(`${at} is not an object`);
  if (!UUID.test(r.id || '')) throw bad(`${at}.id must be a UUID`);
  if (!['chat', 'file'].includes(r.source)) throw bad(`${at}.source must be chat or file`);
  if (r.source === 'file' ? !UUID.test(r.upload_id || '') : r.upload_id != null) throw bad(`${at}.upload_id must be a UUID for file rows and empty for chat rows`);
  const bookingId = String(r.booking_id ?? '').trim();
  if (!bookingId || bookingId.length > 80) throw bad(`${at}.booking_id must be 1–80 characters`);
  if (r.file_name != null && String(r.file_name).length > 200) throw bad(`${at}.file_name is too long`);
  for (const k of ['original', 'current']) if (!r[k] || typeof r[k] !== 'object' || Array.isArray(r[k])) throw bad(`${at}.${k} must be an object`);
  if (r.overrides != null && (typeof r.overrides !== 'object' || Array.isArray(r.overrides))) throw bad(`${at}.overrides must be an object`);
  for (const k of ['original', 'overrides', 'current']) if (r[k] != null && jsonSize(r[k]) > MAX_JSON) throw bad(`${at}.${k} is over 64 KB`);
  if (r.status != null && !STATUSES.includes(r.status)) throw bad(`${at}.status must be Red, Amber or Green`);
  if (r.cost != null && !(Number.isFinite(r.cost) && r.cost >= 0 && r.cost < 1e10)) throw bad(`${at}.cost must be a number`);
  if (r.carrier != null && String(r.carrier).length > 40) throw bad(`${at}.carrier is too long`);
  return {
    id: r.id, source: r.source, booking_id: bookingId, upload_id: r.upload_id || null, file_name: r.file_name == null ? null : String(r.file_name),
    original: r.original, overrides: r.overrides || null, current: r.current, status: r.status || null, carrier: r.carrier == null ? null : String(r.carrier), cost: r.cost ?? null,
  };
}

// Inserts new rows; for rows already saved, keeps where they came from and updates the rest.
// current = original + overrides. A file row's original stays as uploaded (the outcomes "before");
// a chat row's original follows the conversation, which is where chat bookings are edited.
const UPSERT = `
insert into preflight.bookings (id, source, booking_id, upload_id, file_name, original, overrides, current, status, carrier, cost)
select id, source, booking_id, upload_id, file_name, original, overrides, current, status, carrier, cost
from jsonb_to_recordset($1::jsonb) as x(id uuid, source text, booking_id text, upload_id uuid, file_name text,
  original jsonb, overrides jsonb, current jsonb, status text, carrier text, cost numeric)
on conflict (id) do update set booking_id = excluded.booking_id, overrides = excluded.overrides, current = excluded.current,
  original = case when bookings.source = 'chat' then excluded.original else bookings.original end,
  status = excluded.status, carrier = excluded.carrier, cost = excluded.cost, updated_at = now()`;

// First save of an uploaded file: rows already saved (the same file uploaded again) are left as they are, fixes included.
// Returns how many rows were new and the saved fixes of the rows that were already there (the outer select sees the
// table as it was before this statement, so it lists only rows that existed already).
const INSERT_NEW = `
with x as (select * from jsonb_to_recordset($1::jsonb) as x(id uuid, source text, booking_id text, upload_id uuid, file_name text,
  original jsonb, overrides jsonb, current jsonb, status text, carrier text, cost numeric)),
ins as (insert into preflight.bookings (id, source, booking_id, upload_id, file_name, original, overrides, current, status, carrier, cost)
  select id, source, booking_id, upload_id, file_name, original, overrides, current, status, carrier, cost from x
  on conflict (id) do nothing returning id)
select (select count(*) from ins)::int as inserted,
  coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'overrides', b.overrides)) from preflight.bookings b join x on x.id = b.id), '[]'::jsonb) as existing`;

const LIST = `
select id, source, booking_id, upload_id, file_name, original, overrides, current, status, carrier, cost::float8 as cost, created_at, updated_at
from preflight.bookings order by updated_at desc, id limit ${LIST_LIMIT}`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const { rows } = await db().query(LIST);
      return res.status(200).json({ bookings: rows, limit: LIST_LIMIT });
    }
    if (req.method === 'POST') {
      // Checked before the body is read.
      if (!allowedOrigin(req.headers.origin)) return res.status(403).json({ error: 'Saving is only allowed from the CargoPass app' });
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return res.status(415).json({ error: 'Send the bookings as application/json' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('the body must be a JSON object');
      const mode = body.mode ?? 'upsert';
      if (!MODES.includes(mode)) throw bad('mode must be upsert or insert');
      const list = body.bookings;
      if (!Array.isArray(list) || !list.length) throw bad('bookings must be a non-empty array');
      if (list.length > MAX_ROWS) throw bad(`at most ${MAX_ROWS} bookings per request`);
      const rows = list.map(clean);
      if (new Set(rows.map(r => r.id)).size !== rows.length) throw bad('booking ids repeat in one request');
      if (mode === 'insert') {
        const { rows: [r] } = await db().query(INSERT_NEW, [JSON.stringify(rows)]);
        return res.status(200).json({ saved: r.inserted, existing: r.existing });
      }
      await db().query(UPSERT, [JSON.stringify(rows)]);
      return res.status(200).json({ saved: rows.length });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST' });
  } catch (e) {
    const status = e.status || (e instanceof SyntaxError ? 400 : 500);
    if (status >= 500) console.error('bookings api:', e.message);
    return res.status(status).json({ error: status >= 500 ? 'Could not reach the bookings database' : e.message });
  }
};
