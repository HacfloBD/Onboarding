# FLO Onboarding Portal: runbook

For Olivier and any FLO admin. No coding needed. Every task below happens in
the portal (https://onboarding.hacflo.com, or
https://hacflo-onboarding.netlify.app until the custom domain is connected), the Supabase dashboard
(https://supabase.com/dashboard) or the Netlify dashboard
(https://app.netlify.com).

Words used here:

- **Customer user**: someone at the utility. Roles: Client Lead, IT Contact, Utility Staff.
- **FLO admin**: FLO staff, including CSMs. Signs in with email and password and sees the Admin tab.
- **Project**: one customer (one utility). Every customer user belongs to exactly one project.

## Contents

1. [Onboard a new customer, end to end](#1-onboard-a-new-customer-end-to-end)
2. [Add a user](#2-add-a-user)
3. [Deactivate or reactivate a user](#3-deactivate-or-reactivate-a-user)
4. [Edit phases](#4-edit-phases)
5. [Update the video, manual, template or assessment link](#5-update-the-video-manual-template-or-assessment-link)
6. [A customer says the code email didn't arrive](#6-a-customer-says-the-code-email-didnt-arrive)
7. [Restore a template version](#7-restore-a-template-version)
8. [Where backups live](#8-where-backups-live)
9. [Upgrade Supabase to Pro](#9-upgrade-supabase-to-pro)
10. [Test a deploy preview](#10-test-a-deploy-preview)
11. [Other things you may need](#11-other-things-you-may-need)

---

## 1. Onboard a new customer, end to end

About 10 minutes of your time. The customer does the rest in the portal.

**Before you start:** have the utility's name, the CSM's name, the target
go-live date, and the full name and work email of the customer's project lead.

1. Sign in at https://onboarding.hacflo.com. Click **FLO staff sign in**, then
   use your email and password.
2. Open the **Admin** tab. Click **Project Setup**, then **+ New project**.
3. Fill in:
   - **Organization Name**: as the customer should see it, e.g. "City of Springfield".
   - **Project Code**: fills in by itself from the name. Leave it. Customers never see it.
   - **CSM Name**: type it exactly as the CSM's name appears in Admin > Users
     (FLO admins list). That person then gets the email notices for this
     customer (session requests, uploads). If it doesn't match anyone, every
     active FLO admin gets them.
   - **Target Go-Live**: drives the "Days Left" counter the customer sees.
   - **Create First Customer User**: the project lead's full name and work email.
4. Click **Create Project & Create User**.
5. You see "User created". Two cases:
   - The welcome email was sent. Nothing else to do.
   - It says the email could not be sent, or email is not configured. Click
     **Copy portal link** and send the link to the customer yourself. Tell them
     to sign in with their work email; the portal emails them a 6-digit code.
6. Ask the customer's IT team to **allowlist onboarding@hacflo.com** before
   they try to sign in. Most "no code" problems come from quarantine (see section 6).
7. Add their other people now or later (section 2). Typical: an IT Contact and one or two Utility Staff.
8. Check it worked: in **Admin > Projects** the new project shows 0% and the
   "Customer" tag. Once the customer signs in and fills in Step 1a, the
   progress goes up and **Admin > Activity** lists what they did.

**During onboarding:**

- The customer ticks their own steps. You tick FLO steps (the ⏳ ones) on
  their Journey: pick the project in the badge at the top right, open Your
  Journey, click the step circle.
- You can also fill in forms, upload files or tick customer steps for them
  (for example after a call). The portal labels those "on behalf of your team"
  so the customer sees who did it, and Admin > Activity can filter them.
- You get an email when the customer asks for a session or uploads data.
  The portal limits these notices to 20 per customer per hour, so a runaway
  upload can't flood your inbox.
- **Admin > Projects** is your daily view: progress, current phase, whose turn
  it is, days left. Use the search box to find a customer.

**When the customer goes live:** leave the project as it is (it is the
record of their onboarding). If you want it off the list, click **Archive**
in Admin > Projects. Archived projects keep all their data and can be
restored with **Restore**. Archiving does not block their users from signing
in; deactivate them too if needed (section 3).

## 2. Add a user

1. **Admin > Users**. For a customer user, first select their project in the
   badge at the top right (or click the project in Admin > Projects).
2. Click **+ Add** (Add User).
3. Enter name and email and pick a role:

   | Role | Who | What they can do |
   |---|---|---|
   | Client Lead | Customer's project lead | Everything on their project's Journey and Status |
   | IT Contact | Customer's IT person | Same as Client Lead |
   | Utility Staff | Other customer staff | Same as Client Lead |
   | FLO Admin | FLO staff, CSMs | Everything, all projects, Admin tab |

4. Click **Add**.
   - Customer users get the welcome email (or use **Copy portal link**, as in section 1).
   - FLO admins get an invitation email and set their own password. The link
     expires after 10 minutes (the Email OTP Expiration setting in Supabase); if it does, have them use **Forgot password?** on the FLO staff sign in page.

Notes:

- One email address = one user = one project. To move someone to another
  customer, deactivate them and ask a developer, or add them with a different email.
- Nobody can sign up by themselves. Only admins create users.
- Only FLO staff see the Admin tab, and the database enforces it; a customer
  cannot reach admin data even with technical tricks.

## 3. Deactivate or reactivate a user

1. **Admin > Users** (select the project first for customer users).
2. Click **Deactivate** next to the person, then confirm.
   - They lose access to the project's data right away and can't sign in again.
   - Everything they did stays in the project and in Activity.
3. To undo, click **Reactivate** on the same row. They can sign in again right away.

You can't deactivate yourself. There is no "delete user" button on purpose:
deactivation keeps the history.

## 4. Edit phases

There are two different things:

| Where | What it changes |
|---|---|
| **Admin > Phase Template** | The master that **new** projects start from. Existing customers are not touched. |
| **Admin > Phases** | The phases of the **selected customer only**. |

**Edit one customer's phases** (for example to add a step just for them):

1. Select the project, open **Admin > Phases**.
2. Change what you need: phase names, durations, descriptions, steps, step
   owner (Client, FLO, Joint) and step type (text, form, upload and so on).
   **+ Add step** and **+ Add phase** add items. The right-hand side shows a
   live preview of what the customer will see.
3. "Unsaved changes" appears at the top. Click **Save** (or **Discard**).
   The customer sees the change right away.
4. Removing a step that already has customer data asks you to type ARCHIVE.
   The data is kept, not deleted. **Archived items** lists it and lets you
   download archived files.
5. To change a phase's status by hand (Pending, Active, Complete), use the
   status dropdown on the phase.

**Edit the master template:**

1. **Admin > Phase Template**. Same editor.
2. Optional: type a short note in "What changed?".
3. Click **Save as new version**. Every save is a numbered version (v1, v2, ...).

**Bring an existing customer up to the latest template:** select the project,
**Admin > Phases > Apply latest template**. It shows what will be added,
removed and changed before anything happens. Customer answers on steps that
stay are kept.

**Reset a customer's progress** (rare, for example a test project):
**Admin > Project Setup > Reset project progress**, then type the project
code to confirm. This clears ticks, form answers and uploads for that one
project only. There is no global reset.

## 5. Update the video, manual, template or assessment link

All in **Admin > Resources**. Changes reach every customer immediately, no
redeploy needed. Each change is listed under "Recent changes" with who did it.

- **Overview video:** paste any YouTube link (normal, youtu.be, shorts or
  unlisted). Click **Preview** to check it plays, then **Save**. Clear the box and
  Save to hide the video card.
- **User manual:** choose the new PDF (up to 20 MB), click **Replace**.
  Customers see "Download the user manual (PDF)" with the new date.
- **Master data template:** choose the new .xlsx (up to 20 MB), click
  **Replace**. It is offered as "Option B: Use our master template" on upload
  steps. Until you upload one, the portal offers the built-in FLO_Onboarding_Forms.xlsx.
- **CCC Compliance Assessment tool:** paste the link, **Save**. Shown on the
  6-Pillar assessment step. Clear and Save to hide it.

Only PDF (manual) and .xlsx (template) files are accepted. Keep your own copy
of each file you upload; the portal keeps only the current one.

## 6. A customer says the code email didn't arrive

The code email comes from **onboarding@hacflo.com** with the subject "Your FLO sign-in code". Codes expire after 10 minutes, and each new request
replaces the old code.

Work through these in order:

1. **Right email?** In Admin > Users, check their email is spelled exactly
   right and their status is Active (not Inactive). The sign-in page always
   says "we sent a code" even for unknown emails, so a typo looks like a lost email.
2. **Spam and quarantine.** Ask them to check junk/spam, and "quarantine" if
   they use Microsoft 365. Utilities often quarantine new senders silently.
3. **Allowlist.** Ask their IT team to allowlist **onboarding@hacflo.com**
   (and the domain hacflo.com) in their mail filter. This fixes most cases for good.
4. **Wait and retry once.** Ask them to wait 60 seconds, click **Resend code**
   once, and use only the newest code. Too many requests in a row are
   rate-limited for a few minutes by Supabase.
5. **Check the sending logs.**
   - **Resend** (https://resend.com, **Emails**): search their address. "Delivered" means it
     reached their mail server, so the problem is on their side (steps 2 and 3).
     "Bounced" means the address is wrong or their server refused it.
     "Not listed" means it was never sent; go to the next bullet.
   - **Supabase**: dashboard > your project > **Logs > Auth logs**. Look for their
     email and an error around the time they tried.
   - If you use a mailbox (SMTP) instead of Resend, check that mailbox's Sent folder / sending log.
6. **Still stuck?** Sending them the portal link doesn't help, because they
   still need a code. Add them again with a second address (an alternate work
   or personal email) as a new user on the same project, and deactivate the
   first one later if it isn't needed.

**If nobody at all is receiving codes**, check Supabase > **Authentication >
Emails > SMTP Settings**: custom SMTP must be on, using Resend
(host smtp.resend.com, port 465, user `resend`, password = the Resend API key),
sender onboarding@hacflo.com. Without custom SMTP, Supabase only emails members
of your Supabase team and sends very few per hour. Also check in Resend that
the hacflo.com domain still shows "Verified".

## 7. Restore a template version

1. **Admin > Phase Template**. Save or discard any open changes first.
2. Scroll to **Version history**. Each row shows the version number, when it
   was saved, by whom and the note.
3. Click **Restore this version** on the one you want, then confirm.
4. The portal saves it as a **new** version (for example restoring v3 when
   the latest is v5 creates v6 with v3's content). Nothing is lost; you can
   always restore v5 again.

Restoring changes the master only. Existing customers keep their phases
until you use **Apply latest template** on them (section 4).

## 8. Where backups live

| What | Where it is kept | How to get it back |
|---|---|---|
| Customers, phases, answers, users, activity | Supabase database | **Pro plan:** daily backups kept 7 days, in Supabase > Database > Backups. Restore there (it replaces the whole database with that day's copy; talk to a developer first). **Free plan: no backups.** |
| Uploaded customer files and resource files | Supabase Storage | Not included in database backups. Download important files from the portal (or Supabase > Storage) and keep a copy on the FLO drive. |
| Earlier versions of the master template | Inside the database | Section 7, no backup needed. |
| Removed steps with customer data | Inside the database ("Archived items") | Admin > Phases > Archived items. |
| The portal's code, database setup and these documents | GitHub (HacfloBD/Onboarding) | Every change is kept. Netlify can redeploy any earlier version: Netlify > Deploys > pick one > **Publish deploy**. |

**Your own safety net (recommended monthly, 2 minutes):** Admin > Activity >
**Export CSV** for each active customer, and save it on the FLO drive.

## 9. Upgrade Supabase to Pro

Do this **before the first real customer**. On the Free plan the database
pauses after about a week without activity, has no backups, and sends limited
emails. The portal pings the database once a day to stop the pause (the
"keep-alive"), but that is a stopgap, not a plan.

1. Go to https://supabase.com/dashboard, open the organization that holds the portal's project.
2. **Organization settings > Billing** (the left-hand menu).
3. Click **Change subscription plan**, choose **Pro** (about $25 per month), and enter a card.
4. Nothing else changes: same URL, same keys, no downtime.
5. Check **Database > Backups**: after a day you should see a daily backup.
6. Tell a developer so they can remove the keep-alive (the file
   `netlify/functions/keep-alive.mjs`). Leaving it is harmless.

If the project was ever paused: Supabase dashboard > the project > **Restore project**.
It takes a few minutes; nothing is lost.

## 10. Test a deploy preview

Use this after a developer opens or updates a pull request, before merging.
About 30 minutes. Tick the "Preview" column of `docs/QA_CHECKLIST.md` as you go.

**Setup (once per test):**

1. On GitHub, open the pull request. Wait for the Netlify check to turn green,
   then click **Deploy Preview** (the link looks like
   `https://deploy-preview-1--hacflo-onboarding.netlify.app`).
2. If the pull request says there is a database update (a new file in
   `supabase/migrations/`), do this first: Supabase > **SQL Editor** > New query >
   paste the whole of `supabase/setup.sql` from the pull request > **Run**.
   It is safe to run again; it only adds what is missing.
3. Security check: in the same SQL Editor, paste `supabase/tests/rls_checks.sql`,
   Run. Every row must say PASS. It cleans up after itself.

**Walk-through:**

4. Open the preview in a private window. Sign in as FLO staff.
5. Create a test project, "QA Test Utility", with a first user using an email
   you can read (for example yourname+qa@hacflo.com).
6. In another private window (or your phone), sign in as that customer with
   the emailed code. Check against QA_CHECKLIST sections 1 to 5:
   the login page, Journey, Status, a form auto-saving, an upload, ticking a
   step, completing a phase (🎉 window), and the page on a phone.
7. Back as FLO staff, check section 6: Projects list, Users (deactivate and
   reactivate the test user), Phases (add a step, save, see it on the
   customer's screen), Activity, Phase Template, Resources.
8. Keyboard check (section 7): on the customer's Journey press Tab repeatedly.
   You should see a teal ring move through phase headers, step circles and fields.
9. Session check: as the customer, open the portal in two tabs of the same
   window. In tab 1, type something in a form. In tab 2, click the avatar to
   sign out. Tab 1 returns to sign-in with "Your session expired, please sign
   in again" and your email filled in. Sign in again in tab 1: the text you
   typed is still there.
10. Clean up: Admin > Users > deactivate the test user; Admin > Projects > Archive "QA Test Utility".

If anything on the checklist looks wrong, take a screenshot and note the
checklist number (for example "3.7") in the pull request.

**Optional, for a developer:** `supabase/tests/rest_isolation.mjs` runs 25
isolation checks against the real project through the public API (see the
README). It needs the service role key in a terminal, so don't run it yourself.

## 11. Other things you may need

- **Forgot your FLO staff password:** sign-in page > FLO staff sign in > **Forgot password?**
- **Customer wants a new session / has questions about a step:** you get an
  email; the details are also in Admin > Activity.
- **"Email limit reached for this project"** message: the 20 notices per hour
  cap was hit. Wait an hour; nothing is lost, uploads are still saved.
- **Environment settings** (Netlify > Site configuration > Environment variables):
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PORTAL_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `MAIL_FROM`, `RESEND_API_KEY`. After changing any of them, Netlify > Deploys >
  **Trigger deploy**. Never paste the service role key or the Resend key into
  the portal, an email or a chat.
- **Is the keep-alive running?** Netlify > Logs > Functions > `keep-alive`. A line
  "keep-alive ok" once a day means yes.
