# PICNYM Supabase backend

Canonical backend: `functions/picnym-api/`.

It handles account-aware inbox ownership, legacy owner-token compatibility, anonymous text/photo/voice/poll submission, paginated owner dashboards, replies, blocking, deletion and poll voting.

Database migrations live in `migrations/`. Media remains in the `phx-media` bucket for backward compatibility with existing uploads.
