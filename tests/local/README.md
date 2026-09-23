# Local end-to-end tests

Browser tests that run the real app (`public/`) against a local Postgres with
the real schema and RLS, served through PostgREST. Supabase Auth, Storage and
Realtime are faked in `harness.mjs` (JWTs are real and signed, so RLS is real).
Nothing here touches a hosted Supabase project, and nothing here is deployed.

The JWT secret in `pgrst.conf` and the fake keys are local test values only.

## One-time setup (Linux, Postgres 16, Node 20+)

1. Start Postgres on a unix socket at `/var/tmp/flopg`, port 5433.
2. `createdb flo`, then load `stubs.sql` (fake `auth` and `storage` schemas and
   the Supabase roles), then `supabase/setup.sql`.
3. `create role authenticator login password 'pw' noinherit; grant anon, authenticated, service_role to authenticator;`
4. Seed an admin: `olivier@hacflo.com` / id `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
   in `auth.users` and `public.profiles` (see `harness.mjs` for the test users).
5. Download PostgREST 12 and run `postgrest pgrst.conf` (port 3001).
6. From the repo root: `node tests/local/serve.mjs` (port 8787, applies the CSP from netlify.toml).

## Run

From the repo root (the scripts expect `harness.mjs` next to them):

```bash
bash tests/local/resetdb.sh            # clean data, config.js for the fake project
PLAYWRIGHT_PATH=/path/to/playwright/index.mjs OUT=/tmp node tests/local/e2e-p3-data.mjs
```

| Script | Covers |
|---|---|
| `e2e-p3-data.mjs` | projects, isolation, forms, uploads, realtime, reset, archive |
| `e2e-p4-editor.mjs` | phase template, versions, per-project editor, apply template, archiving |
| `e2e-p5-on-behalf.mjs` | on-behalf actions, attribution, spoofing, activity timeline |
| `e2e-p6-resources.mjs` | resources strip, video modal, manual/template uploads |
| `fn-notify*.mjs` | `notify-admins` function against the real schema |

`build-setup.sh` rebuilds `supabase/setup.sql` from the migrations.
SQL-level security checks live in `supabase/tests/rls_checks.sql`.
