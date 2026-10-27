// Local stand-in for Vercel: serves scripts/preflight.html at /, assets/og-image.png at /og-image.png and runs api/bookings.js at /api/bookings.
// Usage: node scripts/dev_server.js [port]   (BOOKINGS_DATABASE_URL from the environment or .env.local)
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

const envFile = path.join(ROOT, '.env.local');
if (!process.env.BOOKINGS_DATABASE_URL && fs.existsSync(envFile)) {
  const line = fs.readFileSync(envFile, 'utf8').split('\n').find(l => l.startsWith('BOOKINGS_DATABASE_URL='));
  if (line) process.env.BOOKINGS_DATABASE_URL = line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
}
const api = require(path.join(ROOT, 'api', 'bookings.js'));

// The parts of Vercel's response helpers the function uses.
function wrap(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  return res;
}

const port = Number(process.argv[2]) || 8787;
http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/api/bookings') {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 4.5e6) req.destroy(); });
    req.on('end', () => {
      try { req.body = data ? JSON.parse(data) : {}; } catch (e) { req.body = data; }
      api(req, wrap(res));
    });
    return;
  }
  if (req.url.split('?')[0] === '/og-image.png') {
    res.setHeader('Content-Type', 'image/png');
    return fs.createReadStream(path.join(ROOT, 'assets', 'og-image.png')).pipe(res);
  }
  fs.readFile(path.join(__dirname, 'preflight.html'), (err, buf) => {
    if (err) { res.statusCode = 500; return res.end('Run python3 build.py first.'); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(buf);
  });
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
