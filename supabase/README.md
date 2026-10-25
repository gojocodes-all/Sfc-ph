# PICNYM Supabase backend

The production backend has two cooperating Edge Functions:

- `functions/picnym-api-v4/` is the frontend-facing API. It owns account,
  social, inbox-setting and expanded message routes.
- `functions/picnym-api/` retains the established core message, poll and
  legacy owner-token routes. The v4 function forwards unhandled core routes to
  it.

Together they handle account-aware inbox ownership, legacy owner-token
compatibility, anonymous text/photo/voice/poll submission, paginated owner
dashboards, replies, blocking, deletion and poll voting. Both functions require
the Supabase project URL and service-role key in the Edge Function environment;
those server credentials must never be placed in frontend configuration.

Database migrations live in `migrations/`. Media remains in the `phx-media` bucket for backward compatibility with existing uploads.
