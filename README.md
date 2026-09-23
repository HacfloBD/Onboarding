# FLO Onboarding Portal

Customer onboarding portal for FLO, the backflow prevention and cross-connection control compliance platform by HAC Texas. Hosted on Netlify at onboarding.hacflo.com.

Plain HTML, CSS and vanilla JavaScript. No framework, no bundler. See `CLAUDE.md` for the project rules.

## Run locally

Requires Node 18 or newer.

```bash
npx netlify dev
```

This runs the build command (`node scripts/write-config.mjs`), serves `public/` and any functions in `netlify/functions`, and applies the headers from `netlify.toml`. Open the URL it prints (usually http://localhost:8888).

To pass config values locally, set them in your shell or a `.env` file (gitignored):

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon public key>
PORTAL_URL=http://localhost:8888
```

Missing values are allowed for now; the script warns and writes empty strings.

Quick alternative without the Netlify CLI (no headers or functions):

```bash
node scripts/write-config.mjs && npx serve public
```

## Deploy

Netlify is connected to this repo:

- Every pull request gets a deploy preview (link in the PR checks).
- Merging to `main` publishes to production.

Build settings come from `netlify.toml`, so nothing needs to be set in the Netlify UI except environment variables (Site configuration > Environment variables). Only `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `PORTAL_URL` reach the browser. Server-only secrets (Supabase service_role, Resend) are read inside Netlify Functions and must never be added to `write-config.mjs`.

## Folder layout

```
public/                  what Netlify serves
  index.html
  css/app.css
  js/app.js              app entry (ES module)
  js/network-canvas.js   login page animation
  js/escape.js           escapeHtml() helper
  assets/brand/          logos, favicon, apple-touch-icon
  assets/files/          FLO_Onboarding_Forms.xlsx
  config.js              generated at build (gitignored)
scripts/write-config.mjs writes public/config.js from env vars
netlify/functions/       Netlify Functions (.mjs)
netlify.toml             build, functions and security headers
legacy/                  original single-file app (reference only)
brand/                   source brand files
docs/                    user manual, overview, build prompts
supabase/seed/           phase template seed data
```
