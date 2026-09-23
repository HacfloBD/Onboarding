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
- Security headers and the CSP live in `netlify.toml`. `script-src` currently allows `'unsafe-inline'` only because the UI uses inline `onclick`/`onchange` handlers. New code should use `addEventListener`; drop `'unsafe-inline'` once the inline handlers are gone.

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
public/                 Netlify publish dir
  index.html            markup
  css/app.css           all styles
  js/app.js             app logic (ES module entry)
  js/network-canvas.js  login page background animation
  js/escape.js          escapeHtml()
  assets/brand/         logos, favicon, apple-touch-icon
  assets/files/         FLO_Onboarding_Forms.xlsx (master spreadsheet download)
  config.js             generated at build, gitignored
scripts/write-config.mjs
netlify/functions/      serverless functions (.mjs)
netlify.toml            build, functions, headers
legacy/                 original single-file app, reference only, do not edit
brand/                  original brand files
docs/                   manual, overview, build prompts
supabase/seed/          phase template seed
```

## Notes on the current JS
- `public/js/app.js` is an ES module. Inline handlers resolve names on `window`, so the functions they call are exposed via `Object.assign(window, {...})` at the bottom of the file, and the state object `D` via a `window` getter/setter. When adding a new function called from inline HTML, add it there (or better, use `addEventListener`).
- State still lives in localStorage under `flo_v3` until Supabase lands.
