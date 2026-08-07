# PH X SFC ANONYMOUS

Production source for the PH × SFC anonymous messaging app.

## Features

- anonymous text, image and voice-note messages
- browser voice recording
- direct sharing of messages and media
- replies that generate shareable answer-card PNGs
- anonymous polls with shareable links and duplicate-vote protection
- Inbox / Polls owner dashboard tabs
- anonymous sender blocking and message deletion

## Production architecture

```text
Browser → Vercel frontend → Render API gateway → Supabase Edge Function `phx`
                                                   ├─ Postgres
                                                   └─ `phx-media` Storage
```

The existing Supabase project remains the database and object-storage backend. The Render service proxies the already-live `phx` API, so existing inboxes, polls, votes and media are preserved and no Supabase secret key has to be copied into Render.

## Render

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`

`render.yaml` includes the live Supabase Edge Function URL.

## Vercel

Set the Vercel project root to `frontend` and set:

```text
API_BASE_URL=https://<render-service-host>
```

The build writes that URL into `dist/config.js`. Direct visits to `/u/*`, `/dashboard/*` and `/poll/*` are rewritten to the SPA entry point.
