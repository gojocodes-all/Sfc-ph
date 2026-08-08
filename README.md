# PICNYM

PICNYM is an 18+ multimedia anonymous messaging product for text, photos, voice notes and polls. Users create an account, make one or more anonymous inbox links, receive content privately, reply, and share branded image cards.

## Production architecture

```text
Browser / installable PWA
    ├── Vercel static frontend
    ├── Supabase Auth (email/password + Google OAuth when enabled)
    └── Supabase Edge Function `picnym-api`
          ├── PostgreSQL
          └── `phx-media` Storage
```

`main` is the only release branch and source of truth.

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
The build ships canonical tags, Open Graph/Twitter metadata, JSON-LD, `robots.txt` and `sitemap.xml`.
Set `SITE_URL` during a build to move every canonical/site URL to a new domain without editing source files.

## Frontend

```bash
cd frontend
npm install
npm run check
npm run build
```

Optional build variables: `API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SITE_URL`, `SUPPORT_PHONE`.

## Supabase

Canonical Edge Function source: `supabase/functions/picnym-api/`.
Database changes are tracked in `supabase/migrations/`.
Public application tables use Row Level Security; privileged database access stays inside the Edge Function.

## Creator

Designed and developed by **Owojuyigbe Oluwajomiloju**.

GOJO.DEV: https://www.gojodev.name.ng/

Current production domain: https://anonymous.gojodev.name.ng/
