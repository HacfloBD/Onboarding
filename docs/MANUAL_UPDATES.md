# User manual v2: sections to update

Compares `docs/FLO_Onboarding_User_Manual_v2.pdf` (Version 2.0, April 2026)
with the hosted portal as built in Prompts 1 to 7. Each entry quotes or
summarizes what the manual says now and gives replacement text you can paste.
Section numbers follow the manual.

Priority:

- **Must fix**: customers or admins would follow wrong instructions (sign-in, admin screens).
- **Should fix**: out of date but not misleading enough to block anyone.
- **Optional**: new features worth mentioning.

Once updated, upload the new PDF in **Admin > Resources > User manual**
(see `docs/RUNBOOK.md`, section 5) and bump the version to 2.1 on the cover
and in the page footer.

## Summary

| # | Section | Priority | What changed |
|---|---|---|---|
| 1 | 2.1 Receiving Your Invitation | Must fix | No project code; sign-in is email + 6-digit code |
| 2 | 2.2 Signing In | Must fix | New steps; old tip about case-sensitive code is wrong |
| 3 | 2.3 Portal Navigation | Must fix | Admin tab description; CSM is an admin; resources strip |
| 4 | 2.4 Signing Out | Should fix | Add session-expiry behavior |
| 5 | 3.1 Step 1b | Should fix | No "Schedule My Session" button; the form is inline and notifies the CSM |
| 6 | 1.2 Steps / 3 intro | Should fix | FLO can complete steps on your behalf, shown in the portal |
| 7 | 3.2 Step 2a | Optional | File size limit, file list |
| 8 | 4.1 Progress Banner | Should fix | "out of 5" is now the project's phase count |
| 9 | 6 Admin Panel intro | Must fix | Seven sections, not three; Admin role only |
| 10 | 6.1 Project Setup | Must fix | Project code is automatic; new button name; first-login behavior |
| 11 | 6.2 User Management | Must fix | Deactivate / Reactivate replaces the X; roles table; admin invitations |
| 12 | 6.3 Phase Management | Must fix | Full phase editor and master template with versions |
| 13 | 6.4 Reset Project | Must fix | Per-project "Reset project progress" with typed confirmation; no global reset |
| 14 | New 6.5 to 6.7 | Must fix | Projects list, Activity, Resources |
| 15 | 7 FAQ | Should fix | Add "I didn't get my code" and "session expired" |
| 16 | 8 Glossary | Optional | Add "Sign-in code", "On behalf" |
| 17 | 1.3 vs 3.4 | Should fix | Phase 4 duration/lead contradicts itself |

---

## 1. Section 2.1 Receiving Your Invitation (Must fix)

**Manual now:** the email contains "1. Your project code (e.g., SPR-2026-001)
2. Your login email address", and "No password required ... You sign in with
just your email and the project code. In the production hosted version, this
will likely be replaced with a magic link or single sign-on."

**Replace with:**

> ### 2.1 Receiving Your Invitation
>
> Your FLO Customer Success Manager (CSM) sets up your project in the Admin
> Panel and creates your user account. You will receive an email from
> **onboarding@hacflo.com** with the subject "Your FLO onboarding portal is
> ready". It contains a link to the portal.
>
> **No password required.** You sign in with your work email address. Each
> time, the portal emails you a 6-digit sign-in code. There is no project
> code to remember.
>
> **Tip:** ask your IT team to allowlist **onboarding@hacflo.com** before you
> sign in for the first time. Some email systems quarantine messages from new
> senders, which can hold up your sign-in code.

## 2. Section 2.2 Signing In (Must fix)

**Manual now:** steps 3 to 6: open the URL, "Enter your project code in the
first field", "Enter your email address in the second field", "Click Sign In";
Tip: "verify that your project code matches exactly (it is case-sensitive)".

**Replace with:**

> ### 2.2 Signing In
>
> 1. Open **https://onboarding.hacflo.com** in your browser. The portal works on desktop and mobile.
> 2. Enter your work email and click **Email me a code**.
> 3. Check your inbox for an email from onboarding@hacflo.com with a 6-digit code.
> 4. Enter the code and click **Verify**.
>
> The portal opens to the Your Journey tab, your main workspace.
>
> The code works once and expires after 10 minutes. If you request a new
> code, only the newest one works.
>
> **Tip:** for privacy, the portal shows the same message whether or not an
> email address has an account. If no code arrives within a couple of minutes:
> check your spam or quarantine folder, click **Resend code** once, and make
> sure you typed the same email your CSM registered. If it still doesn't
> arrive, contact your CSM.
>
> **FLO staff** sign in with **FLO staff sign in** (email and password) at the
> bottom of the sign-in card.

## 3. Section 2.3 Portal Navigation (Must fix)

**Manual now:** Admin row: "Project setup, user management, and phase status
controls | FLO Admin and CSM only". No mention of resources.

**Replace the Admin row with:**

> | Admin | Projects list, project setup, users, per-customer phases, activity history, master phase template and shared resources | FLO staff only (CSMs are FLO admins) |

**Add after the table:**

> At the top of Your Journey you may see two cards: **Watch the 3-minute overview**
> (a short video) and **Download the user manual (PDF)**. FLO keeps these up
> to date.

## 4. Section 2.4 Signing Out (Should fix)

**Add:**

> For your security, the portal signs you out if your session expires. You
> will see "Your session expired, please sign in again" with your email filled
> in. Anything you were typing is kept and saved as soon as you sign back in.
> If your connection drops, the portal says "We couldn't reach the server.
> Check your connection and try again." and nothing is lost.

## 5. Section 3.1 Step 1b: Schedule Your 6-Pillar Assessment Session (Should fix)

**Manual now:** "Click Schedule My Session to open a scheduling form. Pick a
preferred date and time, and choose between in-person ... or virtual".

**Replace the first two sentences with:**

> The scheduling form is right in the step. Enter a preferred date and time
> (and an alternate if you like), choose in-person (HAC Texas comes to you)
> or virtual (Teams or Zoom), and list who will attend. As soon as a date and
> time are filled in, your CSM is notified by email and will confirm.

(The "Self-Service Alternative" paragraph stays; the button reads **Open the
CCC Compliance Assessment tool**.)

## 6. Section 1.2 Key Concepts, Steps (Should fix)

**Manual now:** "FLO steps show a clock icon and can only be marked complete
by FLO administrators."

**Add after it:**

> Your CSM can also fill in a form, upload a file or tick one of your steps
> for you, for example after a call. When they do, the portal shows it
> clearly, for example "FLO (Maria) on behalf of your team", so
> you always know who did what.

## 7. Section 3.2 Step 2a: Send Us Your Data (Optional)

**Add to Option A:**

> Each file can be up to 50 MB. Your uploaded files are listed under the
> upload area, where you can download or delete them. Your CSM is notified
> when you upload.

## 8. Section 4.1 Progress Banner (Should fix)

**Manual now:** "percentage of all steps completed across all 5 phases" and
"Number of completed phases out of 5".

**Replace with:** "across all phases" and "Number of completed phases out of
the total". (FLO can tailor the phases for a customer, so the count is not
always 5.)

## 9. Section 6 Admin Panel intro (Must fix)

**Manual now:** "visible only to users with the Admin or CSM role. It
provides three management sections accessed via the left sidebar."

**Replace with:**

> The Admin tab is visible only to FLO staff (the FLO Admin role; CSMs are
> FLO admins). It has seven sections in the left sidebar:
>
> - **Management:** Projects, Project Setup, Users, Phases, Activity
> - **Master:** Phase Template, Resources
>
> Project Setup, Users, Phases and Activity work on the selected project.
> Choose a project from the project badge at the top right of the navigation
> bar, or click it in the Projects list.

## 10. Section 6.1 Project Setup (Must fix)

**Manual now:** "Project Code (required): A unique identifier like
SPR-2026-001"; "Click Save & Create User"; "The user can then sign in with
their email plus the project code"; "First Login Behavior: When a new project
has not yet been saved, the portal automatically opens to the Admin tab".

**Replace Project Fields with:**

> - **Organization Name** (required): the customer's name as displayed in the portal
> - **Project Code**: filled in automatically from the name (for example
>   city-of-springfield). Used internally and to confirm a reset. Customers
>   never see or type it.
> - **CSM Name**: the assigned Customer Success Manager. Type it exactly as it
>   appears in the FLO admins list: that person receives this customer's email
>   notices (session requests and uploads).
> - **Target Go-Live Date**: drives the "Days Left" counter on the Status tab

**Replace "Creating the First Customer User" last paragraph with:**

> Click **Create Project & Create User**. The project starts with the current
> master Phase Template. A welcome email is sent to the user. If email is not
> available, the portal shows **Copy portal link** so you can send the link
> yourself. The user signs in with their email and a 6-digit code. No password
> or project code is needed.

**Replace "First Login Behavior" with:**

> FLO staff land on **Admin > Projects** after signing in. Customers land on Your Journey.

To start another customer, click **+ New project** on Project Setup.

## 11. Section 6.2 User Management (Must fix)

**Manual now:** "Click the X button next to any user (except yourself) to
remove them." Roles table lists "CSM (FLO)" and "Admin (FLO)" separately.

**Replace "Adding Users" step 4 with:**

> 4. Click **Add**. Customer users receive the welcome email. FLO admins
> receive an invitation email to set their own password.

**Replace the roles table with:**

> | Role | Access level |
> |---|---|
> | Client Lead | Full customer access to Journey and Status for their project |
> | IT Contact | Same as Client Lead, designated for technical coordination |
> | Utility Staff | Same as Client Lead, for general staff members |
> | FLO Admin | FLO staff and CSMs: all projects, Admin tab, can complete FLO-owned steps and act on behalf of the customer |

**Replace "Removing Users" with:**

> ### Deactivating Users
>
> Click **Deactivate** next to a user, then confirm. They lose access right
> away and can no longer sign in. Their history stays in the project and in
> Activity. Click **Reactivate** to restore access. You cannot deactivate
> your own account.

## 12. Section 6.3 Phase Management (Must fix)

**Manual now:** "A table showing all 5 phases with a dropdown to change each
phase's status: Pending / Active / Complete ..."

**Replace with:**

> ### 6.3 Phases (per customer)
>
> Edits the phases of the selected customer only. You can rename phases,
> change durations, descriptions and completion messages, add, remove,
> reorder and move steps, and set each step's owner (Client, FLO or Joint) and
> type (text, organization details, session scheduling, testing frequency,
> file upload, API integration, branding). A live preview shows exactly what
> the customer will see. Click **Save** to apply; the customer sees the change
> immediately.
>
> Each phase still has a status dropdown (Pending, Active, Complete). Use it
> to activate a phase early, for example to start Phase 2 work in parallel,
> or to mark a phase complete when work was confirmed outside the portal.
> Phases also complete automatically when all their steps are done, and the
> next phase becomes active.
>
> Removing a step that already holds customer data archives it instead of
> deleting it. **Archived items** lists archived steps and files.
>
> **Apply latest template** brings this customer up to the current master
> template. It shows what will be added, removed and changed before you confirm.
>
> ### Phase Template (master)
>
> The master that every **new** project starts from. Same editor. Each save
> becomes a numbered version with an optional note. **Version history** lists
> all versions; **Restore this version** saves an older one as the newest
> version. Existing customers are not changed until you apply the template to them.

## 13. Section 6.4 Reset Project (Must fix)

**Manual now:** "The Reset button on the Project Setup page clears all data
and returns the portal to its initial empty state."

**Replace with:**

> ### 6.4 Reset Project Progress
>
> **Reset project progress** on the Project Setup page clears the checked
> steps, form answers and uploaded files of the **selected project only**.
> Phases, users and the activity history are kept. To confirm, type the
> project code. This cannot be undone; use it for test projects or a genuine
> restart. There is no reset for the whole portal.

## 14. New sections 6.5 to 6.7 (Must fix)

**Add:**

> ### 6.5 Projects
>
> The first admin screen. Lists every customer with progress, current phase,
> whose turn it is (Customer, FLO, Ready, Done), target go-live and days left.
> Search by name. **Archive** hides a finished or cancelled project from the
> list without deleting anything; **Restore** brings it back.
>
> ### 6.6 Activity
>
> A timeline of everything that happened on the selected project: steps
> completed or reopened, forms saved, uploads, phase edits, users added or
> deactivated, and emails sent. Filter by person, phase, or actions taken on
> behalf of the customer. **Export CSV** downloads the list.
>
> ### 6.7 Resources
>
> Shared with every customer; changes appear on their Journey immediately.
>
> - **Overview video**: any YouTube link. Shown as "Watch the 3-minute overview".
> - **User manual**: PDF, up to 20 MB. Shown as "Download the user manual (PDF)".
> - **Master data template**: .xlsx, up to 20 MB. Offered as Option B on upload steps.
> - **CCC Compliance Assessment tool**: link shown on the 6-Pillar assessment step.
>
> Recent changes lists who changed what and when.

## 15. Section 7 FAQ (Should fix)

**Add:**

> **I didn't get my sign-in code. What should I do?**
> Check your spam or quarantine folder, then click Resend code once and use
> the newest code. Ask your IT team to allowlist onboarding@hacflo.com. If it
> still doesn't arrive, contact your CSM, who can check the email logs.
>
> **Why was I sent back to the sign-in page?**
> Your session expired. Sign in again with a new code. Anything you were typing
> is kept and saved when you sign back in.

**Update "Can multiple people from my organization use the portal?":** add
"Each person signs in with their own email and code."

## 16. Section 8 Glossary (Optional)

**Add:**

> | Sign-in code | The 6-digit code emailed to you each time you sign in. Works once. |
> | On behalf | A step, form or upload completed by FLO for your team, shown with FLO's name. |

## 17. Sections 1.3 and 3.4: Phase 4 duration (Should fix)

The manual contradicts itself. Section 1.3 (Typical Timeline) says Phase 4
Training is "Half Day (Joint Session), Joint"; section 3.4 says "Duration:
1 Week | Lead: FLO". The portal uses **1 Week** (from
`supabase/seed/phase-template.json`). Decide which is right; then change the
other place in the manual, or change the phase in Admin > Phase Template.

## Sections checked and still accurate

1.1, 1.2 (except the addition above), 1.3 (except Phase 4), 3 (all phases
and steps match the seeded template), 3.1 Steps 1a, 1c, 1d and Phase
Completion, 3.2 Steps 2b to 2e, 3.3, 3.4 Steps 4a to 4e, 3.5, 4.2 to 4.4, 5.1
to 5.3, the rest of section 7 and section 8.
