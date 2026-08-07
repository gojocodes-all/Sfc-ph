import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const src = resolve(root, 'src');
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(src, dist, { recursive: true });
const apiBase = (process.env.API_BASE_URL || '').replace(/\/$/, '');
await writeFile(resolve(dist, 'config.js'), `window.__PHX_CONFIG__ = ${JSON.stringify({ apiBase })};\n`, 'utf8');
