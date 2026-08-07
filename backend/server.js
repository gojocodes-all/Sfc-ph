import http from 'node:http';

const port = Number(process.env.PORT || 8787);
const supabaseFunctionUrl = (
  process.env.SUPABASE_FUNCTION_URL ||
  'https://ahvusnmuyfvdzjmdkgzj.supabase.co/functions/v1/phx-api'
).replace(/\/$/, '');
const MAX_BODY = 13 * 1024 * 1024;
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 180;
const hits = new Map();

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}
function allowed(req) {
  const now = Date.now();
  const key = clientIp(req);
  const current = hits.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    hits.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of hits) if (now - value.startedAt > WINDOW_MS * 2) hits.delete(key);
}, WINDOW_MS).unref();

function baseHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,x-client-info,apikey,content-type,x-owner-token',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  };
}
function sendJson(res, status, payload) {
  res.writeHead(status, { ...baseHeaders(), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}
async function readBody(req) {
  if (['GET', 'HEAD'].includes(req.method || 'GET')) return undefined;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Request body too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function proxy(req, res) {
  const target = `${supabaseFunctionUrl}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (value == null || ['host', 'connection', 'content-length', 'transfer-encoding'].includes(lower)) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  headers.set('x-forwarded-for', clientIp(req));
  headers.set('x-forwarded-proto', String(req.headers['x-forwarded-proto'] || 'https'));
  const body = await readBody(req);
  if (body) headers.set('content-length', String(body.length));
  const upstream = await fetch(target, { method: req.method, headers, body, redirect: 'manual' });
  const responseHeaders = { ...baseHeaders() };
  upstream.headers.forEach((value, key) => {
    if (!['content-length', 'content-encoding', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) responseHeaders[key.toLowerCase()] = value;
  });
  const buffer = Buffer.from(await upstream.arrayBuffer());
  responseHeaders['content-length'] = String(buffer.length);
  res.writeHead(upstream.status, responseHeaders);
  res.end(buffer);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, baseHeaders()); return res.end(); }
  if (req.url === '/health' && req.method === 'GET') return sendJson(res, 200, { ok: true, service: 'ph-x-sfc-anonymous-api', backend: 'supabase-phx-api' });
  if (!req.url?.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found.' });
  if (!allowed(req)) return sendJson(res, 429, { error: 'Too many requests. Try again shortly.' });
  try {
    await proxy(req, res);
  } catch (error) {
    console.error('Supabase proxy error:', error?.message || error);
    if (!res.headersSent) return sendJson(res, error?.statusCode || 502, { error: error?.statusCode === 413 ? 'Request body too large.' : 'Backend temporarily unavailable.' });
    res.destroy();
  }
});
server.requestTimeout = 65_000;
server.headersTimeout = 70_000;
server.listen(port, '0.0.0.0', () => console.log(`PH X SFC API gateway listening on :${port}`));
