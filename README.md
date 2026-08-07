# PICNYM

PICNYM is an anonymous messaging web app for text, photos, voice notes and polls. Users create one shareable inbox link, receive anonymous content, reply from a private dashboard and turn messages into branded shareable image cards.

> PICNYM V2 is currently developed on `v2/picnym-product`. The existing production release remains live while V2 is tested.

## Features

- anonymous text messages
- anonymous image messages with optional captions
- browser voice recording and audio-file uploads
- anonymous polls and duplicate-vote protection
- private inbox dashboard with automatic refresh
- replies and shareable PNG answer cards
- multi-select message sharing as separate image files
- sender blocking and message deletion
- installable PWA
- email/password accounts with portable inbox ownership
- legacy inbox claiming for pre-account users
- Google OAuth client flow, enabled when provider credentials are configured
- crawlable product, feature, safety, privacy, terms and about pages

## Architecture

```text
Browser / PWA
    │
    ├── Supabase Auth
    │     ├── email + password
    │     └── Google OAuth (provider credentials required)
    │
    └── Supabase Edge Function `picnym-api`
          ├── PostgreSQL
          └── `phx-media` Storage
```

The API keeps public anonymous-sending routes separate from protected account/inbox-owner routes. Protected routes accept a signed-in Supabase JWT or a legacy owner token where migration compatibility is required.

## Reliability and scale work in V2

- inbox message pagination, default 40 and capped at 80 per request
- batched poll/options/vote loading instead of per-message N+1 queries
- ownership lookup index prepared for rollout
- public/private cache separation
- visible-tab-only dashboard polling with interaction pauses
- upload size limits and MIME validation
- voice recording waits for `MediaRecorder` finalization before upload
- voice MIME parameters are normalized for mobile-browser compatibility
- CI builds the frontend, validates SEO output, type-checks the Edge Function and smoke-tests the deployed V2 API

## SEO

Indexable product pages:

- `/`
- `/features`
- `/about`
- `/safety`
- `/privacy`
- `/terms`

User-generated/private routes are deliberately excluded from search indexing:

- `/u/*`
- `/poll/*`
- `/dashboard/*`
- `/account`

The frontend includes canonical metadata, Open Graph/Twitter metadata, JSON-LD, `robots.txt` and `sitemap.xml`.

## Local frontend development

Requirements: Node.js 20+

```bash
cd frontend
npm install
npm run check
npm run build
```

Production output is generated in `frontend/dist`.

### Optional build environment variables

- `API_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SITE_URL`
- `SUPPORT_PHONE`
- `GOOGLE_OAUTH_ENABLED=true|false`

## Supabase

V2 API source:

`supabase/functions/picnym-api/index.ts`

The current production API is kept separately during migration. Core application tables use Row Level Security with no direct public table policies; the Edge Function uses server-side service-role access and applies application authorization itself.

## Legal and safety

PICNYM includes public Terms, Privacy and Safety pages. Anonymous means the sender's ordinary profile is not shown to the inbox owner; limited technical information can still be processed for abuse prevention, duplicate-vote protection and service security.

## Creator

Designed and developed by **Owojuyigbe Oluwajomiloju**.

GOJO.DEV: https://www.gojodev.name.ng/

Current project URL: https://anonymous.gojodev.name.ng/
