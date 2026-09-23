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
  js/admin.js             admin panels: Projects, Project Setup, Users, Phases, Phase Template
  js/phase-editor.js      phase/step editor for the master template and per-project phases, template diff
  js/render.js            phase card markup shared by the Journey and the editor's live preview
  js/attribution.js       "Completed by / Last updated by / Uploaded by" lines
  js/resources.js         Journey resources strip (overview video modal, manual download), YouTube URL parsing
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
netlify/functions/        serverless functions (.mjs): admin-create-user, admin-deactivate-user, notify-admins (also emails a Client Lead when FLO completes a step on their behalf), keep-alive (daily schedule)
netlify/lib/              shared server code (service-role client + admin guard, mailer, email bodies)
netlify.toml              build, functions, headers
package.json              server-side deps for functions only (@supabase/supabase-js, nodemailer)
supabase/migrations/      SQL migrations, run in order
supabase/setup.sql        all migrations combined (regenerate after editing a migration)
supabase/tests/           rls_checks.sql (SQL editor), rest_isolation.mjs (REST isolation with client JWTs)
supabase/email-templates/ Supabase Auth email templates (OTP, reset password)
supabase/seed/            phase-template.json (source for 0004_seed.sql)
legacy/                   original single-file app, reference only, do not edit
brand/                    original brand files
docs/                     manual, overview, build prompts, RUNBOOK, QA_CHECKLIST, MANUAL_UPDATES
tests/local/              local test harness and e2e suites (not deployed)
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
- Numbering is never stored or shown from ids: "Phase N" is the phase's index among live phases, step labels are N + letter (1a, 1b...). Reordering renumbers everywhere. Use `phaseCard()` / `stepLabel()` from `render.js`.

## Phase content (from Prompt 4)
- Master template: `template_phases`/`template_steps`, saved only through the `save_template` RPC, which also writes a `template_versions` snapshot. `restore_template_version` saves an old snapshot as a new version. Template ids are stable across saves.
- New projects copy the template (`create_project_from_template`) and record `source_template_phase_id`/`source_template_step_id` plus `projects.template_version`. Source ids have no FK on purpose, so removed template items can still be matched.
- Per-project edits go through `save_project_phases` (whole draft, atomic). It never changes `done` or phase status. A removed step that is done or has form data/uploads is archived (`archived_at` on the step, its form_responses and uploads), never deleted. Archived rows are hidden from customers by RLS and ignored by progress, labels and `project_overview`.
- "Apply latest template" is computed in the browser (`computeApply` in `phase-editor.js`) and saved with the same RPC: completed steps and project-only items are kept.
- A phase with no live steps never auto-completes; admins set its status in the Phases editor.

## Acting on behalf of a customer (from Prompt 5)
- Admins can edit every form, upload, add links and toggle every step in any project. The Journey shows an amber banner while an admin views a customer project.
- `on_behalf` (completed_on_behalf, last_edit_on_behalf, uploads.on_behalf, activity_log.on_behalf) is true only when the actor is an admin AND the step owner is `client` or `both`. FLO-owned steps done by admins are normal work.
- All stamps (completed_by/at, updated_by, uploaded_by, actor_id, on_behalf) are set by triggers from `auth.uid()` (`0007_on_behalf.sql`). Never trust or send them from the browser; client-supplied values are overwritten.
- Names in attribution lines come from the `people_directory()` RPC: customers see admins' first names only, and full names of people in their own project.
- Admin > Activity is the project timeline (filters: on-behalf only, by user, by phase; CSV export with formula-injection protection).
- Form-save logging is throttled per form per person (10 minutes), so an admin edit is never hidden behind a recent customer edit.

## Resources (from Prompt 6)
- `app_settings` keys: `overview_video_url` and `ccc_assessment_url` (text), `manual_file_path` and `master_template_path` (object `{ path, file_name, size_bytes, uploaded_at }` in the public `resources` bucket). Read them with `settingText()` / `resourceFile()` from `resources.js`, never by hand.
- Admin > Resources is the only writer. Each file upload gets a new unique path (so CDN caches can't serve the old file); the old object is deleted after the setting is saved. Changes are logged by a trigger (`resource_updated`, project_id null) and pushed to every signed-in browser through Realtime.
- The video embed always uses `https://www.youtube-nocookie.com/embed/{id}?rel=0&modestbranding=1` (allowed by `frame-src` in the CSP). The shared modal (`ui.js`) traps focus, closes on Escape and empties itself on close, which stops playback. Keys pressed inside the cross-origin player never reach the page, so the modal always shows a Close button.

## Hardening (from Prompt 7)
- Errors: call `reportError(e, 'Could not X')` from `ui.js` instead of building an error toast. It shows `NETWORK_MSG` for network failures, sends session failures (401, PGRST301/303, refresh-token errors) to the sign-in page with "Your session expired, please sign in again", and escapes everything else. `errorKind(e)` returns `'network' | 'session' | 'other'`. `callFunction` errors carry `err.status`.
- Session expiry: `auth.js` tells an expiry apart from a user sign-out. Unsaved form input stays in memory (`widgets.js` drafts, tagged with user and project) and is saved by `resumeDrafts()` only if the same user signs back in to the same project; otherwise it is dropped. A normal sign-out clears drafts.
- Accessibility: clickable non-buttons get `role="button"`, `tabindex="0"`, an `aria-label` and a `data-action`; Enter/Space then runs the action. `.fg > label` is linked to its field automatically (`linkLabels` in `ui.js`), so keep that markup shape or add `aria-label`. Collapsed phases use `visibility:hidden` so their fields leave the tab order. Tag text colors are darkened for 4.5:1 contrast; don't revert them. `:focus-visible` shows a teal ring.
- `notify-admins` sends at most 20 emails per project per hour (counted from `activity_log` rows `session_request_emailed`, `upload_emailed`, `customer_notified`, field `detail.sent`); over the limit it returns 429. Any new email-sending kind must log one of these actions with `sent`.
- `0009_hardening.sql` revokes EXECUTE on trigger functions from API roles. New trigger functions must be revoked the same way; new RPCs must be granted to `authenticated` only.
- `netlify/functions/keep-alive.mjs` runs daily (Scheduled Function) with a trivial service-role select so the free-tier database doesn't pause. Delete it once Supabase is on Pro.
- Tests: `supabase/tests/rls_checks.sql` (SQL editor) and `supabase/tests/rest_isolation.mjs` (two throwaway projects, checks isolation through REST/RPC/Storage with real client JWTs). Extend both when access rules change. `tests/local/` holds the local harness (Postgres + PostgREST + `supabase-proxy.mjs`) and the e2e suites.
- Docs for non-developers: `docs/RUNBOOK.md`, `docs/QA_CHECKLIST.md`, `docs/MANUAL_UPDATES.md`. Keep the runbook in step with any UI label you change.
