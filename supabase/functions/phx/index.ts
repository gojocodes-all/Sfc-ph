const ORIGIN = 'https://anonymous.gojodev.name.ng';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type,x-owner-token',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
};

function safePath(req: Request) {
  const url = new URL(req.url);
  const raw = url.pathname.replace(/^\/(?:functions\/v1\/)?phx(?=\/|$)/, '') || '/';
  if (/^\/(?:u|dashboard|poll)\/[a-z0-9-]+\/?$/i.test(raw)) return raw;
  return '/';
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  const target = new URL(safePath(req), ORIGIN);
  if (url.search) target.search = url.search;
  return new Response(null, {
    status: 302,
    headers: { ...cors, 'location': target.toString(), 'cache-control': 'no-store' }
  });
});
