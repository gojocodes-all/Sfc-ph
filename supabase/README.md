# Supabase backend

The production Supabase project is already live and must remain the data/storage backend.

- Project: `ahvusnmuyfvdzjmdkgzj`
- Edge Function: `phx`
- Storage bucket: `phx-media`
- Core tables: `inboxes`, `messages`, `blocks`, `polls`, `poll_options`, `votes`

This deployment does not migrate or recreate Supabase. Render proxies the existing Edge Function, preserving current data and stored media.
