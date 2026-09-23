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

## Keep-alive (stopgap)

Supabase's free tier pauses a project after about 7 days without activity, which would leave a customer facing a dead portal between cohorts. `netlify/functions/keep-alive.mjs` is a Netlify Scheduled Function that runs once a day (`@daily`, UTC) and does one trivial read with the service role. You can see its runs in Netlify under **Logs > Functions > keep-alive**.

This is a stopgap. **Upgrade Supabase to Pro before the first real customer signs in**: Pro projects never pause and include daily backups. Once on Pro you can delete `keep-alive.mjs`.

## Database (Supabase)

- First-time setup: paste `supabase/setup.sql` into the Supabase SQL editor and run it. It creates the tables, row-level security, storage buckets and the 5-phase template. It is safe to re-run.
- Changes: add a new numbered file in `supabase/migrations/`, then rebuild the combined file:
  ```bash
  for f in supabase/migrations/*.sql; do cat "$f"; echo; done > supabase/setup.sql
  ```
  (keep the header comment at the top of `setup.sql`).
- Security check: run `supabase/tests/rls_checks.sql` in the SQL editor. Every row should say PASS.
- Isolation check through the real API (two throwaway customers, real sign-ins, cleans up after itself):
  ```bash
  npm install
  SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> SUPABASE_SERVICE_ROLE_KEY=<service_role> \
    FUNCTIONS_URL=https://<site>/.netlify/functions node supabase/tests/rest_isolation.mjs
  ```
  It prints a PASS/FAIL table and exits non-zero on any failure. Paste the keys into your terminal only for this command.
- Email templates for Supabase Auth live in `supabase/email-templates/`.

## Sign-in

- Customers: work email, then a 6-digit code from their inbox. No password, no project code.
- FLO staff: "FLO staff sign in" under the card, email and password, with "Forgot password".
- Accounts are created only by admins (Admin > Project Setup or Admin > Users), through the `admin-create-user` Netlify Function.

## How the data flows

- Admin > Resources manages the overview video (YouTube link), the user manual PDF, the master data template and the CCC Assessment link. Everyone sees the video and manual at the top of Your Journey.
- Admin > Phase Template edits the master for new projects. Every save is a numbered version with a note, and any version can be restored.
- Admins can fill in forms, upload and complete steps for a customer. Everything they do on customer-owned steps is recorded "on behalf of your team", shown to the customer, and listed in Admin > Activity (filterable, CSV export).
- Admin > Phases edits the selected customer's phases only. Steps with customer data are archived rather than deleted (see "Archived items"). "Apply latest template" shows a diff before changing anything.

- Admin > Projects > New project calls the `create_project_from_template` database function, which copies the 5-phase master template into the new project.
- Customers and admins see the same project data live (Supabase Realtime). Forms auto-save about a second after typing stops.
- Uploads go to the private `customer-uploads` bucket under `{project_id}/{step_id}/` and download through 10-minute signed links.
- Session requests and new uploads email the project's CSM (the admin whose name matches the project's CSM Name) or, if none matches, every active admin, through `notify-admins`.

## Folder layout

```
public/                  what Netlify serves
  index.html
  css/app.css
  js/app.js              app entry: session, project loading, realtime, Journey/Status
  js/state.js            shared in-memory state
  js/ui.js               toast, modal, event delegation, formatting
  js/widgets.js          step forms, auto-save, uploads
  js/admin.js            admin panels (Projects, Project Setup, Users, Phases, Phase Template)
  js/phase-editor.js     phase and step editor (template + per project), template diff
  js/render.js           phase card shared by the Journey and the editor preview
  js/attribution.js      "Completed by ..." attribution lines
  js/resources.js        overview video and user manual strip on the Journey
  js/auth.js             sign-in flows
  js/data.js             all database, storage and function calls
  js/supabase.js         browser Supabase client (anon key)
  js/network-canvas.js   login page animation
  js/escape.js           escapeHtml() helper
  vendor/                supabase-js, pinned and vendored
  assets/brand/          logos, favicon, apple-touch-icon
  assets/files/          FLO_Onboarding_Forms.xlsx
  config.js              generated at build (gitignored)
scripts/write-config.mjs writes public/config.js from env vars
netlify/functions/       Netlify Functions (.mjs): admin-create-user, admin-deactivate-user, notify-admins, keep-alive (daily)
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
