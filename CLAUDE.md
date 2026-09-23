# FLO Onboarding Portal

FLO is a backflow prevention (BPA) and cross-connection control compliance SaaS for water utilities, built by HAC Texas (Hardin & Associates Consulting). This repo hosts the FLO Onboarding Portal on Netlify (onboarding.hacflo.com). It is being turned from a single-file localStorage prototype (`legacy/flo_onboarding_portal.html`) into a multi-customer hosted app backed by Supabase. `docs/BUILD_PROMPTS.md` holds the prompt sequence.

## Standing rules (apply to every prompt)

### Stack
- Plain HTML, CSS and vanilla JavaScript (ES modules). No frameworks, no bundler, no TypeScript, no CSS frameworks.
- Hosting: Netlify static hosting plus Netlify Functions in `netlify/functions` (`.mjs`).
- Data: Supabase for Postgres, Auth and Storage (added in Prompt 2).
- Email: Resend for app emails.
- The only build step allowed is `scripts/write-config.mjs`, which writes `public/config.js` from environment variables.

### Design
- Preserve the existing visual design exactly: colors, CSS variables, fonts (DM Sans, Plus Jakarta Sans), layout, animations (the login-page network canvas), toasts, modals and copy. Change only what a prompt asks for.
- Logo: `/assets/brand/flo-logo-light.png` on dark backgrounds (login, nav). `flo-logo-dark.png` is kept for light backgrounds. The blue logo drop vs. the teal app accent is intentional; do not change the teal palette.
- UI copy: plain, friendly, no em dashes.

### Security
- The Supabase `service_role` key and the Resend key are used only inside Netlify Functions, read from environment variables. Never ship them to the browser, never commit them.
- The browser only gets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (plus `PORTAL_URL`) via `window.FLO_CONFIG` in `public/config.js`.
- Every user-supplied string rendered into `innerHTML` must go through the shared `escapeHtml()` helper (`public/js/escape.js`).
- Security headers and the CSP live in `netlify.toml`. `script-src` is `'self'` only: no inline `<script>` and no inline `onclick`/`onchange` attributes. Use `data-action` / `data-change` attributes (dispatched by `ui.js`) or `addEventListener`.
- Only `http(s)` URLs may be rendered as links (`safeUrl()` in `ui.js`).

### Workflow
- Work on a feature branch. Open a PR whose description includes:
  - what changed,
  - how to test it on the Netlify deploy preview,
  - a "Manual steps for Olivier" section (Supabase settings, env vars, anything he must click). If there are none, say so.

### Content
- Source of truth for onboarding content is `docs/FLO_Onboarding_User_Manual_v2.pdf` and `supabase/seed/phase-template.json` (5 phases), not the 7 phases in the legacy file.

### Roles
- `admin` (FLO staff; CSM is treated as admin), `client_lead`, `client_it`, `utility_staff`.

## Layout

```
public/                   Netlify publish dir (everything here reaches the browser)
  index.html              markup
  css/app.css             all styles
  js/app.js               entry: session, project loading, realtime, Journey and Status rendering
  js/state.js             shared in-memory state (S) and late-bound hooks between modules
  js/ui.js                toast, modal, delegated data-action handling, formatting helpers
  js/widgets.js           step widgets by step.type (forms with auto-save, uploads, links)
  js/admin.js             admin panels: Projects, Project Setup, Users, Phases
  js/auth.js              sign-in flows (customer email code, staff password, reset, invite)
  js/data.js              the ONLY module that talks to Supabase data (tables, storage, RPC, realtime, functions)
  js/supabase.js          the one browser Supabase client (anon key only)
  js/network-canvas.js    login page background animation
  js/escape.js            escapeHtml()
  vendor/                 pinned, vendored libraries (supabase-js single-file ESM bundle)
  assets/brand/           logos, favicon, apple-touch-icon
  assets/files/           FLO_Onboarding_Forms.xlsx (master spreadsheet download)
  config.js               generated at build, gitignored
scripts/write-config.mjs
netlify/functions/        serverless functions (.mjs): admin-create-user, admin-deactivate-user, notify-admins
netlify/lib/              shared server code (service-role client + admin guard, mailer, email bodies)
netlify.toml              build, functions, headers
package.json              server-side deps for functions only (@supabase/supabase-js, nodemailer)
supabase/migrations/      SQL migrations, run in order
supabase/setup.sql        all migrations combined (regenerate after editing a migration)
supabase/tests/           rls_checks.sql
supabase/email-templates/ Supabase Auth email templates (OTP, reset password)
supabase/seed/            phase-template.json (source for 0004_seed.sql)
legacy/                   original single-file app, reference only, do not edit
brand/                    original brand files
docs/                     manual, overview, build prompts
```

## Auth and data model (from Prompt 2)
- Customers sign in with email + 6-digit code (`signInWithOtp` with `shouldCreateUser: false`). The UI always shows the same neutral message so it never reveals who is a customer. FLO staff sign in with email + password.
- Users are only created by admins through `netlify/functions/admin-create-user.mjs` (public sign-ups are disabled in Supabase). Deactivation goes through `admin-deactivate-user.mjs` (profile inactive + auth ban, reversible).
- Every admin function must call `requireAdmin(req)` from `netlify/lib/supabase-admin.mjs` first and log to `activity_log`. Functions any signed-in user may call (`notify-admins`) use `requireUser(req)` and must check the caller's project.
- RLS is the security boundary, not the UI. Helpers: `is_admin()`, `my_project_id()`, `my_role()` (SECURITY DEFINER, empty search_path). Guard triggers stop clients editing anything but `project_steps.done`, and stop anyone changing their own role, project or active flag.
- Storage: `customer-uploads` (private, first path segment = project_id) and `resources` (public read, admin write).
- Any schema change: add a new numbered migration, regenerate `supabase/setup.sql`, extend `supabase/tests/rls_checks.sql` if access rules change.

## Environment variables (Netlify)
- Browser (via config.js): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PORTAL_URL`.
- Functions only: `SUPABASE_SERVICE_ROLE_KEY`, `MAIL_FROM`, and either `RESEND_API_KEY` or `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` (optional `SMTP_SECURE`). With neither, welcome emails are skipped and the admin UI offers "Copy portal link".
- Before opening a PR, check that `grep -rIlE "service_role|RESEND|re_[A-Za-z0-9]{16,}" public/` finds nothing.

## Notes on the current JS (from Prompt 3)
- All app data lives in Supabase. The browser keeps only the Supabase session and the admin's last-open project id (`flo_admin_project`) in localStorage.
- `data.js` is the only module that reads or writes app data. Other modules call its functions.
- Rendering is string templates into `innerHTML`; every database or user string goes through `escapeHtml()`.
- Phase status, step/form/upload/phase activity logging and step completion stamps are done by database triggers (`0005_project_workflow.sql`), not by the browser. Projects are created with the `create_project_from_template` RPC and reset with `reset_project_progress`.
- Realtime: `subscribeProject()` listens to project_steps, project_phases, form_responses and uploads for the open project. `app.js` re-fetches on change and defers the re-render while the user is typing in a form.
- Step labels (1a, 1b...) are computed from phase position and step order, never stored.
