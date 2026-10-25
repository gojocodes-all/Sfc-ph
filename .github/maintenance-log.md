# Maintenance log

## 2026-10-25 — Align setup guidance with the production architecture

### Rationale

The frontend environment example still selected the retired `phx-api` endpoint while the build and CI require `picnym-api-v4`. It also omitted four supported build variables, and the repository guides described only the core Edge Function even though the browser uses the v4 function and its core fallback. This made a documented setup capable of producing a build against the wrong API.

### Files changed

- `frontend/.env.example` — use the current frontend-facing API and list every supported public build variable without adding secrets.
- `README.md` — document the Node.js requirement, deterministic install and validation flow, generated output, local static preview, build-variable handling, two-function backend, Vercel structure and repository map.
- `supabase/README.md` — explain the responsibilities and relationship of the v4 and core Edge Functions and keep server credentials out of frontend configuration.
- `.github/maintenance-log.md` — record this maintenance decision.

### Validation

- Ran `npm ci --no-audit --no-fund` and the complete `npm test` syntax, build and six-page static audit on Node.js 24.
- Verified the generated configuration selects `picnym-api-v4` and the documented production origin.
- Served the generated site locally and confirmed the entry page, public configuration and web manifest return HTTP 200.
- Verified every documented repository path, ran `git diff --check` and reviewed the complete diff for accuracy, security, compatibility and repository conventions.

### Risk

Low. Application source, API behavior, database migrations, dependencies, deployment rules and credentials are unchanged. The environment example contains only public endpoints and blank optional values.

### Rollback

Revert this pull request's squash commit to restore the previous environment example and repository guidance.
