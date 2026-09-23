# FLO Onboarding Portal

Customer onboarding portal for FLO, the backflow prevention and cross-connection control compliance platform by HAC Texas. Hosted on Netlify at onboarding.hacflo.com.

Plain HTML, CSS and vanilla JavaScript. No framework, no bundler. See `CLAUDE.md` for the project rules.

## Run locally

Requires Node 20 or newer.

```bash
npx netlify dev
```

This runs the build command (`node scripts/write-config.mjs`), serves `public/` and any functions in `netlify/functions`, and applies the headers from `netlify.toml`. Open the URL it prints (usually http://localhost:8888).

Run `npm install` once first so the functions have their dependencies.

Set config values in your shell or a `.env` file (gitignored):

```
# reaches the browser via public/config.js
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon public key>
PORTAL_URL=http://localhost:8888

# functions only, never in the browser
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
MAIL_FROM=FLO Onboarding <onboarding@hacflo.com>
RESEND_API_KEY=<optional; or use SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS>
```

Missing browser values don't break the build; the login page then says sign-in isn't set up. Missing mail settings mean welcome emails are skipped and the admin gets a "Copy portal link" button instead.

Quick alternative without the Netlify CLI (no headers or functions):

```bash
node scripts/write-config.mjs && npx serve public
```

## Deploy

Netlify is connected to this repo:

- Every pull request gets a deploy preview (link in the PR checks).
- Merging to `main` publishes to production.

Build settings come from `netlify.toml`, so nothing needs to be set in the Netlify UI except environment variables (Site configuration > Environment variables). Only `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `PORTAL_URL` reach the browser. Server-only secrets (Supabase service_role, Resend) are read inside Netlify Functions and must never be added to `write-config.mjs`.

## Database (Supabase)

- First-time setup: paste `supabase/setup.sql` into the Supabase SQL editor and run it. It creates the tables, row-level security, storage buckets and the 5-phase template. It is safe to re-run.
- Changes: add a new numbered file in `supabase/migrations/`, then rebuild the combined file:
  ```bash
  for f in supabase/migrations/*.sql; do cat "$f"; echo; done > supabase/setup.sql
  ```
  (keep the header comment at the top of `setup.sql`).
- Security check: run `supabase/tests/rls_checks.sql` in the SQL editor. Every row should say PASS.
- Email templates for Supabase Auth live in `supabase/email-templates/`.

## Sign-in

- Customers: work email, then a 6-digit code from their inbox. No password, no project code.
- FLO staff: "FLO staff sign in" under the card, email and password, with "Forgot password".
- Accounts are created only by admins (Admin > Project Setup or Admin > Users), through the `admin-create-user` Netlify Function.

## Folder layout

```
public/                  what Netlify serves
  index.html
  css/app.css
  js/app.js              app entry (ES module)
  js/auth.js             sign-in flows
  js/data.js             database and function calls
  js/supabase.js         browser Supabase client (anon key)
  js/network-canvas.js   login page animation
  js/escape.js           escapeHtml() helper
  vendor/                supabase-js, pinned and vendored
  assets/brand/          logos, favicon, apple-touch-icon
  assets/files/          FLO_Onboarding_Forms.xlsx
  config.js              generated at build (gitignored)
scripts/write-config.mjs writes public/config.js from env vars
netlify/functions/       Netlify Functions (.mjs): admin-create-user, admin-deactivate-user
netlify/lib/             shared function code (admin guard, mailer, email bodies)
netlify.toml             build, functions and security headers
legacy/                  original single-file app (reference only)
brand/                   source brand files
docs/                    user manual, overview, build prompts
supabase/migrations/     SQL migrations (run in order)
supabase/setup.sql       all migrations combined, for a one-time paste
supabase/tests/          rls_checks.sql
supabase/email-templates/ OTP and reset-password emails for Supabase Auth
supabase/seed/           phase template seed data
```
