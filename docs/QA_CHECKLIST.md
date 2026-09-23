# QA checklist: legacy vs. current portal

Final regression pass before real customers (Prompt 7). Each row compares the
original single-file app (`legacy/flo_onboarding_portal.html`) with the current
portal.

- **Local**: verified by Claude against a local copy of the real database schema
  and security rules, in Chromium at 1280px and 375px wide
  (`tests/local/` suites: 192 browser and function checks, 69 SQL and 25 REST
  isolation checks, all passing, plus side-by-side screenshots and
  measured styles).
- **Preview**: to be ticked by a person on the Netlify deploy preview
  (`https://deploy-preview-1--hacflo-onboarding.netlify.app`) against the real
  Supabase project. Claude cannot reach the preview from its environment, so
  these boxes are intentionally left open.

"Intended" marks a difference that a prompt asked for. Everything else must look
and behave as in the legacy file.

## 1. Login

| # | Check | Legacy | Current | Local | Preview |
|---|---|---|---|---|---|
| 1.1 | Dark gradient background with the animated teal network canvas | Yes | Same | ✅ | [ ] |
| 1.2 | Left column: logo, "ONBOARDING PORTAL", pill, "Onboarding, *simplified.*", subtitle, 4 feature rows | Yes | Same. Logo is the new FLO image (intended, Prompt 1) | ✅ | [ ] |
| 1.3 | White card, 400px wide, 24px radius, heading "Sign in to your project" | Yes | Same size and radius (measured) | ✅ | [ ] |
| 1.4 | Fields | Project code + email + password, "Admin Setup" demo button | Work email then 6-digit code; "FLO staff sign in" link for password (intended, Prompt 2) | ✅ | [ ] |
| 1.5 | Wrong credentials show the red error box | Yes | Same box; unknown emails get the same neutral message as known ones (intended) | ✅ | [ ] |
| 1.6 | Fonts DM Sans (body) and Plus Jakarta Sans (headings) | Yes | Same (measured) | ✅ | [ ] |
| 1.7 | 375px: columns stack, card fills the width, no sideways scrolling | Yes | Same | ✅ | [ ] |

## 2. Navigation bar

| # | Check | Legacy | Current | Local | Preview |
|---|---|---|---|---|---|
| 2.1 | Dark bar 58px high, logo left, tabs, project badge and avatar right | Yes | Same (measured height and color) | ✅ | [ ] |
| 2.2 | Active tab highlighted in teal | Yes | Same | ✅ | [ ] |
| 2.3 | Admin tab only for FLO staff | Admin and CSM | Admin only (CSM is an admin, intended) | ✅ | [ ] |
| 2.4 | Project badge | Shows project name | Customers: name. Admins: a project switcher in the same badge (intended, Prompt 3) | ✅ | [ ] |
| 2.5 | Click the avatar to sign out | Yes | Same | ✅ | [ ] |
| 2.6 | 375px: project badge hidden, tabs and avatar fit | Badge hidden, but the page scrolled sideways | Badge hidden, no sideways scrolling (legacy overflow fixed) | ✅ | [ ] |

## 3. Your Journey

| # | Check | Legacy | Current | Local | Preview |
|---|---|---|---|---|---|
| 3.1 | Greeting "Good morning/afternoon/evening, {first name}! 👋" | Yes | Same | ✅ | [ ] |
| 3.2 | Resources strip (video and manual) under the greeting | Not present | Present when set (intended, Prompt 6) | ✅ | [ ] |
| 3.3 | Next-step card: teal border, ▶ icon, "NEXT STEP", step text, phase line, → | Yes | Same (measured border color) | ✅ | [ ] |
| 3.4 | Clicking the next-step card opens its phase and scrolls to the step | Yes | Same | ✅ | [ ] |
| 3.5 | Phase accordion: number circle, "Phase N: name", duration and lead, status tag, ▼ | Yes | Same markup and styles | ✅ | [ ] |
| 3.6 | Active phase open by default; clicking a header toggles it with the slide animation | Yes | Same | ✅ | [ ] |
| 3.7 | Tag colors: Your Turn (amber), FLO Working (teal), Joint (indigo), Complete (green), Upcoming (grey) | Yes | Same backgrounds; text one shade darker for readability (intended, Prompt 7 accessibility) | ✅ | [ ] |
| 3.8 | Step circles: empty (client), ⏳ (FLO), green ✓ (done) | Yes | Same | ✅ | [ ] |
| 3.9 | Customers cannot tick FLO steps | Yes | Same, and enforced by the database | ✅ | [ ] |
| 3.10 | Phase list and steps | 7 hard-coded phases | 5 phases from the manual, from the database, editable by admins (intended, Prompts 3 and 4) | ✅ | [ ] |
| 3.11 | Forms (org details, frequency, email) inside steps | Yes | Same look; auto-save with "Saved ✓"; more step types (intended) | ✅ | [ ] |
| 3.12 | Completed step hides its form | Yes | Same, plus "View submitted info" (intended) | ✅ | [ ] |
| 3.13 | Upload area: dashed drop zone, "Click to upload" | Yes | Same style; two options, share link, file list (intended) | ✅ | [ ] |
| 3.14 | Completed phase shows the dark 🎉 completion panel | Yes | Same; message from the phase's completion message (intended) | ✅ | [ ] |
| 3.15 | 375px: cards full width, forms usable, no sideways scrolling | Page scrolled sideways | No sideways scrolling | ✅ | [ ] |

## 4. Status

| # | Check | Legacy | Current | Local | Preview |
|---|---|---|---|---|---|
| 4.1 | Dark banner, 24px radius | Yes | Same (measured) | ✅ | [ ] |
| 4.2 | Progress ring animates to the % complete | Yes | Same (same stroke color and transition) | ✅ | [ ] |
| 4.3 | "Phase N: name" under Onboarding Progress | Yes | Same | ✅ | [ ] |
| 4.4 | Forms / Days Left / Phases counters | Hard-coded "x/1" and "x/7" | Computed from the project for any number of phases (intended, Prompt 3); checked with 3, 5 and 7 phases | ✅ | [ ] |
| 4.5 | Ball-in-court box: 🏐, Your Turn (amber) / FLO's Turn (teal) / Done (green), item count | Yes | Same rule and colors (box width measured equal) | ✅ | [ ] |
| 4.6 | Next-step card repeated | Yes | Same | ✅ | [ ] |
| 4.7 | "Your Items" and "Waiting on FLO" cards | Yes | Same; each item also shows its step label, e.g. "Phase 1 · Step 1a" (intended) | ✅ | [ ] |
| 4.8 | 375px: banner stacks vertically | Yes, but the page scrolled sideways | Stacks, no sideways scrolling | ✅ | [ ] |

## 5. Modals and toasts

| # | Check | Legacy | Current | Local | Preview |
|---|---|---|---|---|---|
| 5.1 | Phase-complete modal: 🎉, "Phase N Complete!", message, "Continue →" | Yes | Same | ✅ | [ ] |
| 5.2 | Modal backdrop darkens and blurs; clicking outside closes | Yes | Same | ✅ | [ ] |
| 5.3 | Escape closes any modal; keyboard focus stays inside | No | Yes (intended, Prompts 6 and 7) | ✅ | [ ] |
| 5.4 | Toasts bottom right: green ✓, red ✕, dark ℹ; fade out after about 3.5 s | Yes | Same | ✅ | [ ] |
| 5.5 | Network problem shows "We couldn't reach the server..." | No | Yes (intended, Prompt 7) | ✅ | [ ] |
| 5.6 | Expired session returns to sign-in with "Your session expired, please sign in again"; typed form input is saved after signing back in | No | Yes (intended, Prompt 7) | ✅ | [ ] |

## 6. Admin

| # | Check | Legacy | Current | Local | Preview |
|---|---|---|---|---|---|
| 6.1 | Sidebar and panel layout, teal highlight on the active item | Yes | Same styles; items: Projects, Project Setup, Users, Phases, Activity, Phase Template, Resources (intended) | ✅ | [ ] |
| 6.2 | Project Setup: name, CSM, go-live, first customer user | Yes (plus project code typed by hand) | Same fields; code fills in from the name; no passwords (intended) | ✅ | [ ] |
| 6.3 | Users table | Showed passwords | No password column; deactivate and reactivate (intended) | ✅ | [ ] |
| 6.4 | Global "Reset" | Wiped everything | Replaced by "Reset project progress" with typed confirmation (intended) | ✅ | [ ] |
| 6.5 | Phases | Status dropdowns only | Full phase editor, template versions, apply template, archived items (intended) | ✅ | [ ] |
| 6.6 | On-behalf banner and attribution lines | No | Yes (intended, Prompt 5) | ✅ | [ ] |

## 7. Accessibility and security basics

| # | Check | Local | Preview |
|---|---|---|---|
| 7.1 | Every visible field on login, journey and all admin panels has a label | ✅ | [ ] |
| 7.2 | Keyboard: Tab reaches phase headers, step circles and the next-step card; Enter/Space activates them; focus ring is visible | ✅ | [ ] |
| 7.3 | Collapsed phases don't trap Tab in hidden fields | ✅ | [ ] |
| 7.4 | Status tags meet 4.5:1 contrast | ✅ (5.2 to 6.9:1) | [ ] |
| 7.5 | No red errors or CSP violations in the browser console on any screen | ✅ | [ ] |
| 7.6 | `supabase/tests/rls_checks.sql` in the SQL editor: all rows PASS | ✅ (69/69 locally) | [ ] |
| 7.7 | `supabase/tests/rest_isolation.mjs` against the real project: all checks pass | ✅ (25/25 locally) | [ ] |

## Drift found and fixed in this pass

- **Keyboard access:** phase headers, step circles and the next-step card could not be reached with the keyboard (legacy had the same gap). They are now buttons for keyboard and screen-reader users, with no visual change.
- **Hidden fields:** collapsed phases let Tab move into their hidden fields. They are now skipped.
- **Tag contrast:** tag text was below the 4.5:1 minimum. It now uses a darker shade of the same color.
- **Mobile overflow:** at 375px the legacy page scrolled sideways on Journey and Status; the current portal doesn't.
- No other visual drift. Measured styles (fonts, card sizes, radii, colors, nav height, ring stroke, ball-in-court width, step circle size) are identical to legacy.

## How to tick the Preview column

Follow `docs/RUNBOOK.md`, section "Test a deploy preview", with one test customer. It takes about 30 minutes.
