import http from 'node:http';
import { Readable } from 'node:stream';

const port = Number(process.env.PORT || 8787);
const supabaseFunctionUrl = (
  process.env.SUPABASE_FUNCTION_URL ||
  'https://ahvusnmuyfvdzjmdkgzj.supabase.co/functions/v1/phx'
).replace(/\/$/, '');

const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 180;
function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}
function allowed(req) {
  const now = Date.now(), key = clientIp(req), current = hits.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    hits.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= LIMIT;
}
function baseHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,x-client-info,apikey,content-type',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  };
}
function sendJson(res, status, payload) {
  res.writeHead(status, { ...baseHeaders(), 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}
async function proxy(req, res) {
  const target = `${supabaseFunctionUrl}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || key.toLowerCase() === 'host') continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  headers.set('x-forwarded-for', clientIp(req));
  headers.set('x-forwarded-proto', String(req.headers['x-forwarded-proto'] || 'https'));
  const hasBody = !['GET', 'HEAD'].includes(req.method || 'GET');
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? 'half' : undefined,
    redirect: 'manual'
  });
  const responseHeaders = { ...baseHeaders() };
  upstream.headers.forEach((value, key) => {
    if (['content-length','content-encoding','connection','transfer-encoding'].includes(key.toLowerCase())) return;
    responseHeaders[key.toLowerCase()] = value;
  });
  res.writeHead(upstream.status, responseHeaders);
  if (!upstream.body) return res.end();
  Readable.fromWeb(upstream.body).pipe(res);
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, baseHeaders()); return res.end(); }
  if (req.url === '/health' && req.method === 'GET') return sendJson(res, 200, { ok: true, service: 'ph-x-sfc-anonymous-api', backend: 'supabase' });
  if (!req.url?.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found.' });
  if (!allowed(req)) return sendJson(res, 429, { error: 'Too many requests. Try again shortly.' });
  try { await proxy(req, res); }
  catch (error) {
    console.error('Supabase proxy error:', error?.message || error);
    if (!res.headersSent) return sendJson(res, 502, { error: 'Backend temporarily unavailable.' });
    res.destroy();
  }
});
server.requestTimeout = 35_000;
server.headersTimeout = 40_000;
server.listen(port, '0.0.0.0', () => console.log(`PH X SFC API gateway listening on :${port}`));
