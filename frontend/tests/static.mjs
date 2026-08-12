import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const publicPages = ['index.html', 'features.html', 'about.html', 'safety.html', 'privacy.html', 'terms.html'];
const expectedRoutes = new Set(['/', '/features', '/about', '/safety', '/privacy', '/terms', '/account', '/reset-password']);

const files = new Map();
for (const name of publicPages) files.set(name, await readFile(resolve(dist, name), 'utf8'));

const titles = new Set();
for (const [name, html] of files) {
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  assert.ok(title, `${name} needs a title`);
  assert.ok(!titles.has(title), `${name} title must be unique`);
  titles.add(title);
  assert.match(html, /<meta name="description" content="[^"]{40,}"/i, `${name} needs a useful description`);
  assert.match(html, /<link rel="canonical" href="https:\/\/anonymous\.gojodev\.name\.ng\//i, `${name} needs a production canonical`);
  assert.match(html, /<meta name="application-name" content="PICNYM"/i, `${name} needs the exact application name`);
  assert.match(html, /property="og:site_name" content="PICNYM"/i, `${name} needs the exact Open Graph site name`);
  assert.match(html, /href="\/favicon\.ico"[^>]*sizes="48x48"/i, `${name} needs the ICO favicon declaration`);
  assert.match(html, /href="\/favicon\.svg"/i, `${name} needs the SVG favicon declaration`);
  assert.match(html, /href="\/favicon-48x48\.png"/i, `${name} needs the 48px PNG favicon declaration`);
  assert.match(html, /href="\/apple-touch-icon\.png"/i, `${name} needs the Apple icon declaration`);

  for (const href of html.matchAll(/href="(\/[^"#?]*)/g)) {
    const route = href[1];
    if (/\.[a-z0-9]+$/i.test(route)) continue;
    assert.ok(expectedRoutes.has(route), `${name} links to an unknown internal route: ${route}`);
  }
}

const home = files.get('index.html');
assert.match(home, /"@type":"WebSite"[^}]*"name":"PICNYM"/i, 'home needs WebSite structured data with exact name');
assert.match(home, /"alternateName":\["Picnym"\]/i, 'home needs a stable alternate site name');
assert.doesNotMatch(home, /"price"|"Offer"/i, 'search structured data must not advertise inactive billing');

const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.name, 'PICNYM');
assert.equal(manifest.short_name, 'PICNYM');
assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'maskable'));
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));

for (const asset of ['favicon.ico', 'favicon.svg', 'favicon-48x48.png', 'favicon-96x96.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'og-image.png', '404.html', 'offline.html']) {
  await access(resolve(dist, asset));
}

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG', 'asset must be a PNG');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

assert.deepEqual(pngDimensions(await readFile(resolve(dist, 'favicon-48x48.png'))), [48, 48]);
assert.deepEqual(pngDimensions(await readFile(resolve(dist, 'og-image.png'))), [1200, 630]);

const marketCss = await readFile(resolve(dist, 'market.css'), 'utf8');
assert.match(marketCss, /prefers-reduced-motion/);
const allCss = await Promise.all(['style.css', 'pro.css', 'market.css', 'info.css'].map((name) => readFile(resolve(dist, name), 'utf8')));
assert.doesNotMatch(allCss.join('\n'), /(linear|radial)-gradient|backdrop-filter|glassmorphism/i, 'v3 CSS must keep the flat visual direction');

const vercel = await readFile(resolve(root, 'vercel.json'), 'utf8');
assert.match(vercel, /Strict-Transport-Security/);
assert.match(vercel, /X-Robots-Tag/);

console.log(`Static product audit passed for ${publicPages.length} public pages and the complete favicon package.`);
