import { Readable } from 'node:stream';

const ORIGIN = 'https://ahvusnmuyfvdzjmdkgzj.supabase.co/functions/v1/phx-api';

export default async function handler(req, res) {
  try {
    const target = ORIGIN + req.url;
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers || {})) {
      if (value == null || ['host', 'connection', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }

    const method = req.method || 'GET';
    const hasBody = !['GET', 'HEAD'].includes(method);
    const upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: hasBody ? 'half' : undefined,
      redirect: 'manual'
    });

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (!['content-length', 'content-encoding', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error('PH X SFC API proxy error:', error);
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'API proxy failed.' }));
  }
}
