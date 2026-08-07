import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const src = resolve(root, 'src');
const dist = resolve(root, 'dist');
const fallbackApi = 'https://ahvusnmuyfvdzjmdkgzj.supabase.co/functions/v1/picnym-api';
const fallbackSupabaseUrl = 'https://ahvusnmuyfvdzjmdkgzj.supabase.co';
const fallbackPublishableKey = 'sb_publishable_JODLl_4Ue29jwz2w8hSSSw_UO4l5OJZ';
const fallbackSiteUrl = 'https://anonymous.gojodev.name.ng';

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(src, dist, { recursive: true });

const apiBase = (process.env.API_BASE_URL || fallbackApi).replace(/\/$/, '');
const supabaseUrl = (process.env.SUPABASE_URL || fallbackSupabaseUrl).replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || fallbackPublishableKey;
const siteUrl = (process.env.SITE_URL || fallbackSiteUrl).replace(/\/$/, '');
const supportPhone = process.env.SUPPORT_PHONE || '+2349033056594';
const googleOAuthEnabled = String(process.env.GOOGLE_OAUTH_ENABLED || 'false').toLowerCase() === 'true';

const config = { apiBase, supabaseUrl, supabaseKey, siteUrl, supportPhone, googleOAuthEnabled };
await writeFile(
  resolve(dist, 'config.js'),
  `window.__PICNYM_CONFIG__ = ${JSON.stringify(config)};\nwindow.__PHX_CONFIG__ = ${JSON.stringify({ apiBase })};\n`,
  'utf8'
);

await build({
  entryPoints: [resolve(src, 'auth-client.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  outfile: resolve(dist, 'auth.js'),
  define: { 'process.env.NODE_ENV': '"production"' }
});

await rm(resolve(dist, 'auth-client.js'), { force: true });
