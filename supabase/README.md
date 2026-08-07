# Supabase backend

Production project: `ahvusnmuyfvdzjmdkgzj`

- API Edge Function: `phx-api`
- Legacy/canonical redirect UI function: `phx`
- Storage bucket: `phx-media`
- Core tables: `inboxes`, `messages`, `blocks`, `polls`, `poll_options`, `votes`
- Supporting moderation table: `reports`

The browser uses `phx-api` directly. Database tables have RLS enabled and no anonymous table policies; the Edge Function is the application boundary and uses the service role internally.
