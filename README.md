# PH X SFC ANONYMOUS

Production source for the PH × SFC anonymous messaging app.

## Features

- anonymous text, image and voice-note messages
- browser voice recording and audio uploads
- direct sharing of messages and media
- replies that generate shareable answer-card PNGs
- anonymous polls with shareable links and duplicate-vote protection
- private Inbox / Polls owner dashboard
- anonymous sender blocking and message deletion

## Canonical production architecture

```text
Browser → Vercel static frontend → Supabase Edge Function `phx-api`
                                    ├─ Postgres
                                    └─ `phx-media` Storage
```

The frontend calls `phx-api` directly over CORS. This avoids request-body proxy bugs for image and voice-note uploads. The existing Supabase project remains the only database/storage backend.

A Render gateway is retained as an optional fallback/diagnostic service, but it is not required by the browser path.

## Vercel

- Project root: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Canonical domain: `https://anonymous.gojodev.name.ng`
- API default: `https://ahvusnmuyfvdzjmdkgzj.supabase.co/functions/v1/phx-api`

`API_BASE_URL` can override the default. Direct visits to `/u/*`, `/dashboard/*` and `/poll/*` rewrite to the SPA entry point.

## Supabase

The deployable API source is stored at `supabase/functions/phx-api/index.ts`. Tables are protected with RLS and accessed from the Edge Function with the service-role client. Owner tokens are stored only as hashes in the database.

## Render fallback

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`

The gateway buffers request bodies before forwarding them so multipart image/voice uploads are not broken by Node stream conversion.
