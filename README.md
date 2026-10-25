# PICNYM

PICNYM is an 18+ multimedia anonymous messaging product for text, photos, voice notes and polls. Users create an account, make one or more anonymous inbox links, receive content privately, reply, and share branded image cards.

## Production architecture

```text
Browser / installable PWA
    ├── Vercel static frontend
    ├── Supabase Auth (email/password + Google OAuth when enabled)
    └── Supabase Edge Function `picnym-api-v4`
          ├── account, social and inbox routes
          ├── PostgreSQL and `phx-media` Storage
          └── legacy/core fallback → `picnym-api`
```

`main` is the only release branch and source of truth.

### Why this architecture stays small

- Static HTML, CSS and JavaScript keep the public pages crawlable and the first render independent of client hydration.
- The frontend-facing `picnym-api-v4` Edge Function keeps privileged Supabase access off the browser and delegates established core routes to `picnym-api`, preserving the API contract used by web and Android.
- Vercel serves the static shell and security headers; Supabase remains responsible for Auth, PostgreSQL and media storage.

The only frontend runtime dependency is `@supabase/supabase-js` for supported browser authentication flows. `esbuild` is a development-only dependency used to bundle that client into one browser script.

## Product features

- anonymous text, photo and voice-note messages
- anonymous polls with duplicate-vote protection
- account-based inbox ownership across devices
- legacy inbox claiming for pre-account users
- email/password sign-up and sign-in
- password recovery
- Google OAuth client support
- shareable conversation prompts and pre-filled prompt links
- paginated private inbox with automatic refresh
- replies and branded PNG answer cards
- multi-select sharing as separate image files
- hidden-word filtering, link pausing, sender blocking, reports and message deletion
- account-only and friend-only inbox modes
- redesigned light/dark themes, compact inbox and reduced-motion preference
- installable PWA
- public Terms, Privacy, Safety, Features and About pages

## Reliability and scale

- message pagination (40 default, 80 maximum per API request)
- batched poll/options/vote queries instead of N+1 loading
- indexed inbox ownership and message/poll lookup paths
- CDN-served static frontend and short caching for safe public reads
- jittered, visibility-aware dashboard refresh
- 12 MB media limits, MIME validation and failed-upload cleanup
- Android/mobile voice recording waits for MediaRecorder finalization before upload
- CI syntax-checks/builds the frontend and type-checks/smoke-tests the API

## SEO

Indexable pages: `/`, `/features`, `/about`, `/safety`, `/privacy`, `/terms`.
Private/user-generated routes (`/account`, `/reset-password`, `/dashboard/*`, `/u/*`, `/poll/*`) are excluded from indexing.
The build ships canonical tags, Open Graph/Twitter metadata, WebSite JSON-LD, `robots.txt`, `sitemap.xml`, a 1200×630 preview image and a complete root favicon package (ICO, SVG, 48/96 PNG, Apple and maskable PWA icons).
The exact site name is consistently declared as `PICNYM`. Google ultimately controls whether and when a favicon or preferred site name appears in search; the repository implements all supported signals but does not claim to override that decision.
Set `SITE_URL` during a build to move every canonical/site URL to a new domain without editing source files.

## Frontend

The frontend requires Node.js 24, matching `frontend/package.json` and CI.

```bash
cd frontend
npm ci
npm test
```

`npm test` syntax-checks the browser and build scripts, creates `frontend/dist/`,
and audits the generated static pages and assets. To build without running the
checks, use `npm run build`. Do not edit `dist/` directly; it is generated and
ignored by Git.

To inspect the built site over HTTP with Python available:

```bash
python3 -m http.server 8000 --directory dist
```

Then open <http://localhost:8000/>. API and authentication requests still use
the configured Supabase project.

### Build configuration

The build reads these optional environment variables and writes their public
browser values to `dist/config.js`:

| Variable | Purpose |
| --- | --- |
| `API_BASE_URL` | Frontend-facing Edge Function base URL; production uses `picnym-api-v4`. |
| `SUPABASE_URL` | Supabase project URL used by browser authentication. |
| `SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase publishable key; never substitute a service-role key. |
| `SITE_URL` | Public origin used for canonical links, the sitemap and other site URLs. |
| `SUPPORT_PHONE` | Public support number written into generated pages. |

`frontend/.env.example` records the supported names and current public
endpoints, but `build.mjs` does not load `.env` files itself. Supply overrides
through the shell, CI, or the deployment provider. Omitted values use the
production fallbacks declared in `build.mjs`.

## Supabase

The browser calls `supabase/functions/picnym-api-v4/`. That function implements
the account and expanded product routes, then forwards established core routes
to `supabase/functions/picnym-api/`. Both functions are part of the production
backend and are type-checked and smoke-tested in CI.

Database changes are tracked in `supabase/migrations/`.
Public application tables use Row Level Security; privileged database access stays inside the Edge Function.

## Project structure

| Path | Purpose |
| --- | --- |
| `frontend/src/` | Static pages, styles, browser modules, PWA assets and metadata. |
| `frontend/build.mjs` | Copies source assets, injects public configuration and bundles the Supabase auth client. |
| `frontend/tests/static.mjs` | Audits generated pages, routes, metadata, assets and deployment headers. |
| `frontend/vercel.json` | Static output, clean-route rewrites and response security headers. |
| `supabase/functions/picnym-api-v4/` | Frontend-facing account, social, inbox and message API. |
| `supabase/functions/picnym-api/` | Established core API used directly and through the v4 fallback. |
| `supabase/migrations/` | Versioned database schema and index changes. |
| `.github/workflows/ci.yml` | Frontend validation plus Edge Function type and deployed-health checks. |

## Creator

Designed and developed by **Owojuyigbe Oluwajomiloju**.

GOJO.DEV: https://www.gojodev.name.ng/

Current production domain: https://anonymous.gojodev.name.ng/
