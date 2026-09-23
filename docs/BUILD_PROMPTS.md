# FLO Onboarding Portal: Netlify Build Prompts

Version 1.1 | September 22, 2026 | Domain: onboarding.hacflo.com | Repo: https://github.com/HacfloBD/Onboarding

---

## How to run this (Claude Code on the web)

**Never paste passwords or API keys into Claude Code or a chat.** Claude Code reaches GitHub through the Claude GitHub App. The Supabase and Resend keys live only in Netlify environment variables.

### Part 1: One-time connection (about 10 minutes)
1. Go to **claude.ai/code** and sign in with your Claude account. It needs a Pro, Max, Team or Enterprise plan.
2. When prompted, click **Sign in with GitHub** and approve the authorization. Use the GitHub account that owns or administers `HacfloBD`.
3. Install the Claude GitHub App (required for private repos): go to **github.com/apps/claude/installations/new** > choose **HacfloBD** > **Only select repositories** > `Onboarding` > **Install**. If HacfloBD is a GitHub organization, an owner has to approve this.
4. Environment: Pro/Max plans create a **Default** environment automatically. On Team/Enterprise, a "Create your first cloud environment" form appears; leave everything as is and click **Create & finish**. Don't add any environment variables or secrets here; Claude Code doesn't need them.
5. Check: click the repository selector under the input box. `HacfloBD/Onboarding` should be listed. If it isn't, redo step 3.

### Part 2: Before Prompt 1
- Finish **Step 0-A and 0-B** below (files in the repo, Netlify connected). Only these two are needed for Prompt 1.
- **Today**, send the webmaster the DNS email (Step 0-F). DNS and domain verification can take a few days, and Prompt 2 needs it.

### Part 3: Running each prompt (repeat 7 times)
1. At claude.ai/code, click **New session**. In the repository selector, pick `HacfloBD/Onboarding`, branch `main`.
2. Model: pick the most capable model in the model menu.
3. Mode dropdown next to the input: use **Plan** for Prompts 2, 3 and 4 (Claude proposes an approach and waits for your approval) and **Accept edits** for Prompts 1, 5, 6 and 7.
4. Paste **only the text inside the grey code block** of one prompt and press Enter.
5. In Plan mode, read the plan. Reply "Approved, proceed" or give corrections. Answer any questions Claude asks. You can close the tab; the session keeps running.
6. When Claude finishes, click the **+N -N** change counter to open the diff, then **Create PR** > full pull request.
7. Open the PR on GitHub. In the checks section, wait for **Deploy Preview ready** from Netlify (2 to 3 minutes) and click **Details** to open the preview site.
8. Test against the prompt's acceptance criteria. If something is wrong, go back to the **same session** and describe it in plain words (screenshots help). Claude pushes fixes to the same PR and the preview rebuilds.
9. Do the "Manual steps for Olivier" listed in the PR description (Supabase SQL, settings).
10. On GitHub, click **Merge pull request** > **Confirm merge**. Netlify publishes to onboarding.hacflo.com automatically.
11. Archive the session and start a **new** session for the next prompt. The shared context lives in `CLAUDE.md`, so nothing is lost.

If you get stuck, paste the exact error text into the session. Claude Code can diagnose most setup issues itself.

---

## Stack and running cost

| Need | Service | Cost at 2 to 4 new customers/month |
|---|---|---|
| Hosting, serverless functions, deploy previews | Netlify Free | $0 |
| Database, authentication (admin password + customer email code), file storage | Supabase Free | $0 to start |
| Sending email from onboarding@hacflo.com | Resend Free (3,000 emails/month, 100/day) | $0 |

**Storage math:** 4 customers x 3 spreadsheets x about 5 MB is about 60 MB a month, against 1 GB of free storage. That's roughly a year before storage becomes an issue.

**Two catches with Supabase Free. Don't ignore these:**
- **It pauses the database after about 7 days of low activity.** Between customer cohorts, a customer could log in and hit a dead portal. Prompt 7 adds a daily keep-alive as a stopgap.
- **It has no automatic backups.** This portal will hold customer compliance data and signed-off steps.

**My recommendation:** run on Free while you build and test. Upgrade Supabase to Pro (about $25/month; it never pauses and includes daily backups) **before the first real customer logs in**. $300 a year is cheap insurance against telling a utility you lost their data.

---

## Step 0: Manual setup (you do this once, before Prompt 1)

**A. Put these files in the repo** (GitHub web: "Add file" > "Upload files"):

| File | Put it at |
|---|---|
| `flo_onboarding_portal_new (1).html` (current app) | `legacy/flo_onboarding_portal.html` |
| `FLO_Onboarding_Forms.xlsx` | `legacy/FLO_Onboarding_Forms.xlsx` |
| `FLO_Onboarding_User_Manual_v2_20260412.docx.pdf` | `docs/FLO_Onboarding_User_Manual_v2.pdf` |
| `FLO_Onboarding_Overview_20260412b.pdf` | `docs/FLO_Onboarding_Overview.pdf` |
| This file | `docs/BUILD_PROMPTS.md` |
| `flo-logo-light.png`, `flo-logo-dark.png`, `flo-drop-512.png`, `favicon-32.png`, `apple-touch-icon.png` (provided) | `brand/` |
| `phase-template.json` (provided; the 5 phases from the manual) | `supabase/seed/phase-template.json` |

**B. Netlify.** Log in with GitHub > "Add new site" > "Import from Git" > pick `HacfloBD/Onboarding`. Leave the build settings blank; Prompt 1 adds `netlify.toml`. Make sure deploy previews for pull requests are on (they are by default).

**C. Supabase.** Create an account and a new project (region: US East or US Central). Save the database password. From Project Settings > API, copy the **Project URL**, the **anon public key** and the **service_role key**.

**D. Resend + DNS (with the hacflo.com webmaster).**
1. Create a Resend account > Domains > Add domain > `hacflo.com`.
2. Resend shows about 3 to 4 DNS records: DKIM, plus SPF/MX on a `send` subdomain. Send them to the webmaster along with the list in Step 0-F. They're scoped to the `send` subdomain and a DKIM selector, so they **don't interfere with hacflo.com's existing email**.
3. Ask the webmaster to also create **onboarding@hacflo.com** as a real mailbox or an alias forwarding to you, so customer replies land somewhere.
4. Once Resend shows "Verified", create an API key (Sending access).
5. In Supabase > Authentication > Emails > SMTP Settings, turn on custom SMTP. Host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key, sender email `onboarding@hacflo.com`, sender name `FLO Onboarding`.

**E. Netlify environment variables** (Site configuration > Environment variables):
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MAIL_FROM=FLO Onboarding <onboarding@hacflo.com>`, `PORTAL_URL=https://onboarding.hacflo.com`.

**F. Custom domain.** In Netlify: Domain management > Add a domain > `onboarding.hacflo.com`. Netlify shows the value for a **CNAME** record (`onboarding` pointing to `<your-site>.netlify.app`). The webmaster adds it, then Netlify issues the HTTPS certificate automatically, usually within an hour. Until then the site also works at its `.netlify.app` address.

**What to send the webmaster in one email:** the Resend DNS records (D2), the Netlify CNAME (F), the onboarding@hacflo.com alias (D3), and a DMARC record if hacflo.com doesn't have one yet (`_dmarc` TXT `v=DMARC1; p=none; rua=mailto:onboarding@hacflo.com`).

The service_role key bypasses all security rules. It goes **only** into Netlify environment variables: never into a chat, a file, or the repo.

---

## Prompt 1: Repo structure, Netlify deploy, new FLO logo

```
You are working in the GitHub repo HacfloBD/Onboarding. It will host the FLO Onboarding Portal on Netlify. FLO is a backflow prevention (BPA) and cross-connection control compliance SaaS for water utilities, built by HAC Texas (Hardin & Associates Consulting).

The current app is a single file: legacy/flo_onboarding_portal.html (vanilla HTML/CSS/JS, all state in localStorage). Over the next several prompts it becomes a multi-customer hosted app backed by Supabase. THIS prompt only restructures the repo, makes it deployable on Netlify, and swaps the logo. Behavior must stay identical to the legacy file (it still uses localStorage in this prompt).

1. Create CLAUDE.md at the repo root with this project context and these standing rules, which apply to every future prompt:
   - Stack: plain HTML, CSS and vanilla JavaScript (ES modules). No frameworks, no bundler, no TypeScript, no CSS frameworks. Netlify static hosting plus Netlify Functions (netlify/functions, .mjs). Supabase for Postgres, Auth and Storage (added in Prompt 2). Resend for app emails.
   - The only build step allowed is a tiny Node script that writes public/config.js from environment variables.
   - Preserve the existing visual design exactly: colors, CSS variables, fonts (DM Sans, Plus Jakarta Sans), layout, animations (the login-page network canvas), toasts, modals and copy. Change only what a prompt asks for.
   - UI copy: plain, friendly, no em dashes.
   - Security: the Supabase service_role key and the Resend key are used only inside Netlify Functions, read from environment variables. Never ship them to the browser, never commit them. The browser only gets SUPABASE_URL and SUPABASE_ANON_KEY.
   - Every user-supplied string rendered into innerHTML must be escaped through a shared escapeHtml() helper.
   - Work on a feature branch. Open a PR whose description includes: what changed, how to test it on the deploy preview, and a "Manual steps for Olivier" section (Supabase settings, env vars, anything he must click). If there are no manual steps, say so.
   - Source of truth for onboarding content is docs/FLO_Onboarding_User_Manual_v2.pdf and supabase/seed/phase-template.json (5 phases), not the 7 phases in the legacy file.
   - Roles: admin (FLO staff; CSM is treated as admin), client_lead, client_it, utility_staff.

2. Restructure into:
   public/index.html        (markup from the legacy file)
   public/css/app.css       (all CSS, extracted verbatim)
   public/js/app.js         (all JS, extracted, split into modules only where natural)
   public/assets/brand/     (logo files copied from /brand)
   public/assets/files/     (FLO_Onboarding_Forms.xlsx copied from /legacy, so the existing download link works)
   public/config.js         (generated, gitignored)
   scripts/write-config.mjs (writes public/config.js with window.FLO_CONFIG = { SUPABASE_URL, SUPABASE_ANON_KEY, PORTAL_URL } from env vars; tolerate missing vars in this prompt)
   netlify/functions/       (empty for now, add .gitkeep)
   netlify.toml             (build command: node scripts/write-config.mjs; publish: public; functions: netlify/functions; security headers: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, a Content-Security-Policy that allows self, Google Fonts, the Supabase project domain, and YouTube's youtube-nocookie.com embed domain for frames)
   Keep /legacy untouched as the reference.

3. Replace the logo everywhere:
   - The login page logo (.logo block with the inline SVG drop) and the nav logo (.nav-logo) both sit on dark backgrounds. Replace both with <img src="/assets/brand/flo-logo-light.png" alt="FLO">. Size: about 48px tall on login, 28px tall in the nav. Keep the "Onboarding Portal" subtitle under the login logo.
   - Keep flo-logo-dark.png available for any light-background use (none today).
   - Favicon: favicon-32.png; apple-touch-icon.png for iOS.
   - Do NOT change the app's teal accent palette. The logo drop is blue; that difference is intentional for now.

4. Add a README.md explaining local run (npx netlify dev), deploy, and the folder layout.

Acceptance criteria:
- Netlify deploy preview loads and looks and behaves identically to legacy/flo_onboarding_portal.html, except for the new logo and favicon.
- The master spreadsheet download still works.
- No console errors.
- config.js is gitignored and generated at build.
```

---

## Prompt 2: Database, security rules, and login (admin password, customer email code)

```
Read CLAUDE.md first. This prompt adds Supabase: the full database schema, row-level security, and the new login flows. The UI will still read phase and step data from localStorage after this prompt (Prompt 3 moves the data), but login must be real.

PART A: Schema. Create SQL migrations under supabase/migrations/ (runnable in the Supabase SQL editor in order; also include a single combined file supabase/setup.sql for Olivier to paste once).

Tables (uuid primary keys, created_at/updated_at timestamps, updated_at trigger):
- projects: id, code (text, unique, lowercase slug), name (customer corporate name), csm_name, target_go_live (date), status ('active' | 'archived'), created_by.
  The project code defaults to a slug of the corporate name (e.g. "City of Springfield" -> "city-of-springfield"), editable by admin, unique. Customers never type it.
- profiles: user_id (pk, references auth.users on delete cascade), email (unique, lowercase), full_name, role ('admin' | 'client_lead' | 'client_it' | 'utility_staff'), project_id (null for admin, required for all client roles), active (bool).
  One customer user belongs to exactly one project.
- template_phases: id, position, name, short, owner ('client' | 'flo' | 'both'), duration, description, completion_message.
- template_steps: id, template_phase_id, position, text, owner, type, detail, config (jsonb).
- project_phases: id, project_id, position, name, short, owner, duration, description, completion_message, status ('pending' | 'active' | 'complete'), source_template_phase_id (nullable).
- project_steps: id, project_id, project_phase_id, position, text, owner, type, detail, config (jsonb), done (bool), completed_by (uuid), completed_at, completed_on_behalf (bool).
- form_responses: id, project_id, project_step_id, form_type, data (jsonb), updated_by, updated_at, last_edit_on_behalf (bool). Unique (project_step_id).
- uploads: id, project_id, project_step_id, kind ('file' | 'link'), storage_path, file_name, size_bytes, link_url, uploaded_by, on_behalf (bool), created_at.
- activity_log: id, project_id, actor_id, actor_role, action (text), target (text), detail (jsonb), on_behalf (bool), created_at. Insert-only for everyone except admin.
- app_settings: key (pk text), value (jsonb), updated_by, updated_at.

Step type is one of: none, form_org_details, form_schedule_session, form_frequency, upload_files, form_api_integration, form_branding. Enforce with a check constraint.

Seed: load supabase/seed/phase-template.json into template_phases/template_steps (generate the INSERTs in the migration). Seed app_settings with keys overview_video_url (null), manual_file_path (null), master_template_path (null), ccc_assessment_url (null).

PART B: Row-level security. Enable RLS on every table. Create SECURITY DEFINER helpers is_admin() and my_project_id() (with a fixed search_path).
- Admin: full read/write on everything.
- Client roles: read their own project, its phases, steps, form_responses, uploads and activity_log. They can update project_steps.done only on steps where owner is 'client' or 'both' in their own project. They can insert and update form_responses and insert uploads for their own project. They can read app_settings. They cannot read other projects, profiles outside their project, or template tables.
- Nobody can change their own role or project_id.
- Storage: create a private bucket "customer-uploads" with policies keyed on the first path segment = project_id (clients: read/insert in their own folder; admin: all). Create a public-read bucket "resources" (admin write only) for the manual PDF and the master template.
Write a short SQL test script (supabase/tests/rls_checks.sql) with the queries Olivier can run to confirm that client A cannot see project B.

PART C: Login flows. Add supabase-js v2 as a pinned, vendored ES module in public/vendor/ (no runtime CDN dependency).
Replace the login card with two modes, keeping the existing look:
1. Customer sign-in (default view): one field, "Work email". Button "Email me a code". Call supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }). Then show a 6-digit code entry (numeric, auto-advance, paste support), "Verify", "Resend code" (disabled for 60 seconds), and "Use a different email". Verify with supabase.auth.verifyOtp({ email, token, type: 'email' }).
   Whether or not the email exists, always show the same message ("If this email is registered, we've sent a 6-digit code. It expires in 10 minutes."), so the form does not reveal who is a customer.
2. FLO staff sign-in: a small "FLO staff sign in" link under the card switches to email + password with signInWithPassword, plus "Forgot password" using resetPasswordForEmail and a set-new-password screen when the recovery link returns.
After sign-in, load the profile. If the profile is missing or inactive, sign out and show "Your account is not active. Contact your FLO Customer Success Manager." Admins land on the Admin tab; clients land on Your Journey. Session persists across reloads. Sign out via the existing avatar click.
Remove entirely: the "Admin Setup" demo button, demoLogin(), the hardcoded admin123 and welcome123 passwords, the project code field, and the Pass column in the Users table.

PART D: User creation (Netlify Functions, service role key server-side only). Every function verifies the caller's Supabase JWT and that the caller is an active admin; otherwise 403.
- admin-create-user: input { full_name, email, role, project_id }. Creates the auth user with email_confirm: true and no password (auth.admin.createUser), inserts the profile, and sends a welcome email through the Resend API from MAIL_FROM: subject "Your FLO onboarding portal is ready", body with the org name, PORTAL_URL, and "Sign in with this email address. We'll send you a one-time code; no password needed." For role admin, instead use auth.admin.inviteUserByEmail so the new admin sets a password.
- admin-deactivate-user: sets profiles.active = false and bans the auth user (reversible). Admins cannot deactivate themselves.
- Log both to activity_log.

PART E: Email templates. Write the HTML for the Supabase "Magic Link / OTP" email template in supabase/email-templates/otp.html using {{ .Token }} (the 6-digit code, large and centered), FLO branding (light logo on dark header, teal accents), "This code expires in 10 minutes. If you did not request it, ignore this email." Also write a matching Reset Password template.

In the PR "Manual steps for Olivier", include exactly: run supabase/setup.sql; in Supabase Auth settings set Email OTP length = 6 and OTP expiry = 600 seconds, disable public sign-ups, set Site URL to https://onboarding.hacflo.com and add redirect URLs for https://onboarding.hacflo.com/**, the <site>.netlify.app address, and the Netlify deploy-preview wildcard https://deploy-preview-*--<site>.netlify.app/**; paste the two email templates; create the first admin user in the Supabase dashboard (Authentication > Add user, with password) and run the provided one-line SQL to insert their admin profile.

Acceptance criteria:
- A customer created by an admin can sign in with email + 6-digit code, with no password and no project code.
- An unknown email gets the same neutral message and no email.
- Admin signs in with a password; the password reset works.
- A client user cannot see the Admin tab and gets a 403 from the admin functions.
- rls_checks.sql proves cross-project isolation.
- No secrets in the browser bundle (grep public/ for service_role and the Resend key prefix).
```

---

## Prompt 3: Move all data to the database, multiple customers, 5-phase journey

```
Read CLAUDE.md first. Replace localStorage entirely with Supabase. After this prompt, the admin and all users of one customer see the same live data, and customers are fully isolated from each other.

1. Data layer: create public/js/data.js as the only module that talks to Supabase (loadProject, loadPhasesAndSteps, setStepDone, saveForm, uploadFile, addLink, logActivity, etc.). Remove every localStorage read or write of app data. Keeping small UI preferences in localStorage (e.g. last admin project) is fine.

2. Creating a project copies the template: when an admin creates a project, copy template_phases/template_steps into project_phases/project_steps (Phase 1 status 'active', the rest 'pending'). Do this in a Postgres function create_project_from_template(name, code, csm_name, target_go_live) called via RPC so it is atomic.

3. Admin side, multi-project:
   - Admin > Projects: a list of all projects (name, code, CSM, % complete, current phase, go-live date, days left, ball-in-court), searchable, with "New project" and "Archive".
   - Selecting a project sets it as the active context. A project switcher sits in the nav badge area (where the project name shows today). The Journey and Status tabs then show that project, exactly as the customer sees it.
   - Project Setup keeps the existing fields (Organization Name, CSM Name, Target Go-Live) plus a Project Code that auto-fills from the name as a slug and stays editable. Keep "Create first customer user" (name + email) in the same form; it calls admin-create-user.
   - Users: the users of the selected project plus a separate list of FLO admins. Add user (role dropdown: Client Lead, IT Contact, Utility Staff, or FLO Admin) and Deactivate. No password column.
   - Replace the global "Reset" with "Reset project progress" (admin only, requires typing the project code to confirm): it clears done flags, form_responses and uploads for that project only, and writes an activity_log entry.

4. Customer side: the Journey and Status tabs render the customer's single project from the database. Keep the next-step card, the phase accordion, the ball-in-court indicator, the progress ring, the phase-complete modal and the celebration exactly as they look today.

5. Step widgets. Render by step.type; each saves to form_responses (debounced auto-save about 800 ms, with a small "Saved" indicator):
   - form_org_details: the existing kick-off form fields (org name, service area, state, project lead name/title/email/phone, IT contact name/email, approx tester companies, approx facilities, current system, team roles, jurisdictional notes).
   - form_schedule_session: preferred date, preferred time, alternate date/time, mode (In-person: HAC Texas comes to you / Virtual: Teams or Zoom), attendees, notes. Plus a secondary link button to the CCC Compliance Assessment tool, using app_settings.ccc_assessment_url, hidden if empty. On save, email the assigned CSM (admins) via a Netlify function "notify-admins" with the requested slot.
   - form_frequency: dropdown and help text from step.config.options (5 options including "Not sure"), plus a notes/regulatory references field.
   - upload_files: two side-by-side cards, "Option A: Send what you have" (multi-file upload, any type, up to 10 files, 50 MB each, to customer-uploads/{project_id}/{step_id}/) and "Option B: Use our master template" (download from app_settings.master_template_path, falling back to /assets/files/FLO_Onboarding_Forms.xlsx, then upload). Below them: "Or share a link" (URL field + Save). List everything uploaded with file name, size, who uploaded it and when, and a download link (signed URL, 10 minutes). Clients can delete their own uploads until the step is marked done; admins always can. Notify admins by email on each new upload.
   - form_api_integration: yes/no toggle; if yes, billing system name, technical contact name, technical contact email.
   - form_branding: sender display name, reply-to email, logo upload (PNG/JPG, 5 MB max, stored like other uploads, preview thumbnail).
   - none: text only.
   Keep today's rule: a completed step hides its form (with a "View submitted info" toggle so data is still visible).

6. Remove the hardcoded assumptions: Status must compute "Phases x/N" and "Forms x/N" from the data (N = count of phases; forms = steps with a form or upload type). The phase-complete modal uses project_phases.completion_message. Phases are labeled by position, not id. Step labels are generated as {phase position}{letter} (1a, 1b...).

7. Realtime: subscribe to changes on project_steps and form_responses for the open project so the admin and the customer see each other's updates without reloading.

8. Log every step toggle, form save (throttled to one entry per form per 10 minutes), upload and phase status change to activity_log.

Acceptance criteria:
- Two test customers in two browsers see only their own project.
- The admin sees both and can switch between them.
- A customer checks a step and the admin's screen updates within a few seconds.
- Uploaded files land in Supabase Storage under the right project folder and download via signed URLs.
- A client cannot toggle FLO-owned steps (enforced by RLS, not just the UI).
- Journey shows the 5 phases and steps from the manual.
- No localStorage app data remains.
```

---

## Prompt 4: Phase editor (master template and per-customer)

```
Read CLAUDE.md first. The onboarding process will change over time. Give admins full control of the phase content without touching code.

1. Admin > Phase Template (the master used for NEW projects):
   - Phases: add, delete (with confirmation), reorder (drag handle plus up/down buttons for accessibility), and edit name, short name, owner (Client / FLO / Joint), duration, description and completion message.
   - Steps inside each phase: add, delete, reorder, and move to another phase; edit text, owner, detail and type (dropdown of the 7 step types with a one-line explanation of each). For form_frequency, edit the options list (label, value, help text). For upload_files, toggle the master template download and the share link.
   - A live preview panel shows the phase exactly as a customer will see it.
   - Save writes a template version: add a template_versions table (id, version number, snapshot jsonb, note, created_by, created_at). Show the version history with "Restore this version".

2. Admin > selected project > Phases (per-customer override):
   - The same editor, but acting on that project's project_phases/project_steps. Keep the existing status dropdown (pending / active / complete) per phase.
   - Rules to protect data: deleting a step that is done or has form data/uploads requires a typed confirmation and archives the form data/uploads rather than deleting them (add archived_at columns). Changing a step's type when it has data shows a warning.
   - "Apply latest template": shows a diff (added / removed / changed phases and steps) and lets the admin apply it. Steps already completed are kept; matching uses source_template ids.

3. Numbering is always derived from position (Phase 1..N, steps 1a, 1b...), so reordering renumbers automatically everywhere: Journey, Status, next-step card and modals.

4. Phase completion logic stays as today (all steps done -> phase complete, next phase activates, celebration modal), but works for any number of phases. If a phase is edited so it has zero steps, it cannot auto-complete; the admin sets its status manually.

5. Log all template and project-phase edits to activity_log.

Acceptance criteria:
- Admin adds a 6th phase to the template. New projects get 6 phases; existing projects are unchanged until "Apply latest template" is used.
- Admin reorders two steps in one customer's project; the labels and the next-step card update.
- Deleting a completed step with an upload archives the upload (still downloadable by the admin from an "Archived items" view).
- Status counters are correct with 3, 5 and 7 phases.
```

---

## Prompt 5: Admin completes phases on behalf of the customer

```
Read CLAUDE.md first. Admins must be able to fill in forms, upload files and complete client-owned steps on behalf of a customer, with a clear record that they did so.

1. When an admin is viewing a customer's project (Journey tab), show a persistent banner: "You are viewing [Org Name] as FLO Admin. Changes you make are recorded as on behalf of the customer." Use the existing amber palette.

2. Admins can edit every form widget, upload files, add links and toggle every step (client, joint and FLO-owned) in that project. Every such action sets on_behalf = true (completed_on_behalf, last_edit_on_behalf, uploads.on_behalf, activity_log.on_behalf) when the actor is an admin and the step owner is 'client' or 'both'. FLO-owned steps completed by admins are normal, not "on behalf".

3. Attribution shown to everyone (customer and admin):
   - Under a completed step: "Completed by Jane Smith, Sep 22, 2026" or "Completed by FLO (Olivier) on behalf of your team, Sep 22, 2026".
   - Under a form: "Last updated by ... on behalf of your team ..." when applicable.
   - Uploads list: "Uploaded by FLO on behalf of your team".

4. Admin > selected project > Activity: a filterable timeline of activity_log (all / on-behalf only / by user / by phase), with CSV export.

5. Optional per-action choice: when an admin completes a client-owned step, show a small modal: "Mark complete on behalf of the customer?" with a checkbox "Email the customer's Client Lead a note that FLO completed this step" (uses notify function, sends from MAIL_FROM). Default unchecked.

6. RLS: confirm the admin policies allow all of this, and that clients still cannot write on_behalf = true or spoof completed_by (set completed_by server-side with a trigger using auth.uid(); ignore client-supplied values).

Acceptance criteria:
- The admin fills the org details form for a customer; the customer sees the data plus "on behalf" attribution.
- The activity timeline shows it.
- A client trying to set completed_by to another user via the API is overwritten by the trigger.
```

---

## Prompt 6: Journey tab: overview video and user manual (admin-managed)

```
Read CLAUDE.md first. Add a resources strip to the top of the Your Journey tab, and let admins manage those resources.

1. Journey tab: directly under the greeting ("Good afternoon, Jane!"), above the next-step card, add a compact resources row with two cards in the existing card style:
   - "Watch the 3-minute overview" with a play icon. It opens a modal (reuse the existing modal shell, widened to 880px, 16:9 responsive) that embeds the YouTube video from app_settings.overview_video_url. Accept any YouTube URL format (watch?v=, youtu.be/, embed/, shorts/) and convert it to https://www.youtube-nocookie.com/embed/{id}?rel=0&modestbranding=1. Closing the modal stops playback (remove the iframe). Escape closes it. Keyboard focus is trapped while open.
   - "Download the user manual (PDF)" with a download icon, linking to the public URL of app_settings.manual_file_path in the "resources" bucket. Show the file's last-updated date under the label.
   Hide a card if its setting is empty. On mobile, stack the cards. Both customers and admins see the row.

2. Admin > Resources (new sidebar item):
   - Overview video URL: input + "Preview" (opens the same modal) + Save. Validate that it is a YouTube URL.
   - User manual: upload a PDF (20 MB max) to resources/manual/, replacing the current one. Show the current file name, size and upload date, with "Download current".
   - Master data template: upload an .xlsx to resources/templates/ (used by the upload_files widget's Option B), same controls.
   - CCC Compliance Assessment tool URL (used by the form_schedule_session widget).
   - Log changes to activity_log (project_id null).

3. Seed: in the PR's manual steps, tell Olivier to paste the YouTube link and upload docs/FLO_Onboarding_User_Manual_v2.pdf and the xlsx through Admin > Resources after deploy.

Acceptance criteria:
- A customer clicks the video card and the unlisted YouTube video plays in a popup (it must work with the CSP from Prompt 1; adjust the CSP if needed).
- The manual downloads.
- The admin replaces the manual and customers get the new file right away.
- With no video URL set, the video card is hidden.
```

---

## Prompt 7: Hardening, QA pass, and runbook

```
Read CLAUDE.md first. Final pass before real customers. Do not add features.

1. Regression check against legacy/flo_onboarding_portal.html: produce docs/QA_CHECKLIST.md comparing every screen and behavior (login visuals, journey accordion, next-step card, status ring, ball-in-court, modals, toasts, mobile layout at 375px) and fix anything that drifted unintentionally.

2. Security review: confirm RLS on every table and bucket; re-run supabase/tests/rls_checks.sql with a script that creates two test projects and verifies isolation through the REST API using client JWTs. Confirm escapeHtml is used for all user content, there are no secrets in public/, the functions verify admin role, and the CSP is tight. Add rate limiting to the notify functions (max 20 emails per project per hour).

3. Keep-alive: add a Netlify Scheduled Function (daily) that runs a trivial select via the service role, so a free-tier Supabase project is not paused. Note in the README that this is a stopgap and Supabase Pro is recommended once customers are live.

4. Error handling: friendly toasts for network or session errors; if the session expires, return to sign-in with "Your session expired, please sign in again" and keep unsaved form input in memory until they're back.

5. Accessibility basics: labels on all inputs, visible focus states, modal focus trap, color contrast on the tags.

6. docs/RUNBOOK.md for Olivier (non-developer): how to onboard a new customer end to end; add/deactivate users; edit phases; update the video, manual and template; what to do if a customer says the code email didn't arrive (check spam, ask their IT to allowlist onboarding@hacflo.com, check the Resend logs); how to restore a template version; where backups live; how to upgrade Supabase to Pro.

7. docs/MANUAL_UPDATES.md: list every section of the user manual v2 that is now inaccurate (sign-in in 2.1/2.2 is now email + 6-digit code with no project code; Admin Panel 6.1 to 6.4 changed: project list, phase editor, resources, activity, no global reset) with suggested replacement text, so the manual can be revised.

Acceptance criteria: the QA checklist is fully ticked on the deploy preview, the RLS script passes, and the runbook lets a non-developer onboard a customer without help.
```

---

## Decisions I made on your behalf (change them before you paste if you disagree)

1. **Supabase instead of Clerk.** One vendor covers the database, logins, email codes and file storage, and it's free at your volume. Clerk would have added a second vendor and cost without adding anything you need.
2. **6-digit code.** It's within your 4 to 6 range. Codes expire after 10 minutes, and you can request a new one every 60 seconds.
3. **The phase template is copied into each new project.** Editing the master template doesn't change customers already in progress until you apply it on purpose.
4. **The project code is a slug of the corporate name** (for example `city-of-springfield`). You can edit it, and customers never see or type it.
5. **New step types from the manual.** The manual describes things the current app doesn't have: session scheduling, a free-form upload option, the API-integration toggle, and a branding form with a logo upload. Prompt 3 builds them. That's the real scope increase in this plan, and it comes from making the manual the baseline.
6. **The "Reset" button is now scoped to one project and needs a typed confirmation.** The global one would wipe every customer.

## Open items to settle

1. **Domain: settled.** The portal is at `onboarding.hacflo.com` and email comes from `onboarding@hacflo.com`. The link and the sender are on the same domain, which is the clean setup for deliverability.
2. **Deliverability to .gov inboxes.** Municipal mail servers often quarantine emails from new senders. Set up DMARC (Step 0-F), and add a line to the welcome email and the kick-off call asking the customer's IT to allowlist onboarding@hacflo.com. Otherwise your first customer's sign-in code ends up in quarantine.
3. **CCC Compliance Assessment tool URL.** Phase 1 links to it. Enter it in Admin > Resources once it's live (it's hidden until then).
4. **Supabase Pro upgrade date.** Tie it to the first live customer, not to "later".
