# Kingsless LLC

The public website for Kingsless LLC, plus an **admin-only contract arbitrage engine** at `/admin`.

* **Website**: `/`, `/services`, `/contact`. Copy lives in `src/content/site.ts`.
* **Engine**: finds contracts, decides which ones you can profitably fulfil through subcontractors with the cash you actually have, prices them, shortlists subcontractors, and drafts the quote request / inquiry / bid. Specification: [`docs/ENGINE.md`](docs/ENGINE.md).

Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS 4. Deploys on Vercel with no database.

## Deploy on Vercel

1. Merge the work branch into `main` on GitHub (or point Vercel's production branch at it).
2. In Vercel: **Add New → Project → import this repo**. Framework: Next.js (auto-detected). Node: 22.x. Build command: leave as `npm run build`.
3. Add environment variables (Project → Settings → Environment Variables), then **redeploy**:

| Variable | Required | What it does |
| --- | --- | --- |
| `ADMIN_PASSWORD` | **yes** | The one password for `/admin`. At least 12 characters. |
| `AUTH_SECRET` | **yes** | Signs the login cookie. At least 32 random characters: `openssl rand -base64 48`. |
| `SAM_GOV_API_KEY` | optional | Live federal discovery. Free: SAM.gov → your profile → Public API Key. Daily request limits apply. |
| `ANTHROPIC_API_KEY` | optional | Lets the AI reader pull clauses out of pasted solicitation text. Default model `claude-opus-5-5`; override with `ANTHROPIC_MODEL`. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | optional | The address shown on the Contact page. Read at build time, so redeploy after setting it. |

**If `ADMIN_PASSWORD` or `AUTH_SECRET` is missing or too short, the admin is disabled and nobody can sign in** (fails closed). The development credentials in `.env.development` are rejected in production.

## Using the engine

1. **Pick your location** (pipeline page → *Change location*, or Settings → *Where you work*): anywhere, or chosen states and optionally cities/counties. Discovery searches there, and contracts outside it are rejected.
2. **Settings**: enter your real capital and your company profile (insurance, bonding, licenses, SAM registration, past projects). The engine judges everything against this, so be honest.
3. **Pipeline → Load the 3 live test cases** to see it work, or **Discover** (SAM.gov) / **Add** (paste any solicitation).
4. Open an opportunity. Read the verdict and gates; confirm the facts against the official listing and tick the box.
5. Enter the expected price and a sub-price estimate. Send the **procurement inquiry** first. When the hard rules are proven, request **firm quotes**, enter them, and re-check.
6. You approve and bid. The engine never sends anything or spends anything.

**Your data lives in your browser** (localStorage): pipeline, directory, quotes, settings. There is no database yet. Use **Settings → Download backup** regularly; clearing site data erases it.

## Handing the repo to Grok (layout and UI only)

Paste this into Grok:

> Pull the Kingsless-LLC repo. Read `AGENTS.project.md` first and follow it exactly. You may change layout, styling, copy and UI components only. Do not edit the engine, its calculations, the admin security, or any protected file, and never run `npm run engine:lock`. Run `npm run verify && npm run build` before committing to main. Task: <what you want changed>.

How this is enforced, not just requested:

* `AGENTS.project.md` (and `AGENTS.md`, `CLAUDE.md`) tell Grok exactly which paths it may and may not touch.
* **`npm run build` first runs an integrity check** of the engine, server, security and guard-rail files against `engine.lock.json`. If Grok changes any of them, the **Vercel build fails and the previous deployment stays live**.
* ESLint fails the build if UI code imports engine *functions or constants* (types only), so the UI cannot recalculate money.
* The same checks run in GitHub Actions (`.github/workflows/ci.yml`).

Limits: this stops accidents and an assistant that follows the rules. It cannot stop someone who deliberately edits `engine.lock.json` and re-locks; review diffs that touch it. For stronger protection, turn on branch protection for `main` with required reviews (CODEOWNERS is already set).

## You want an engine change

Make it (or ask an assistant, in so many words), update the tests, then:

```bash
npm run verify        # lint, typecheck, tests, lock check
npm run engine:lock   # owner only: accepts the new engine as the baseline
```

Commit `engine.lock.json` with the change.

## Local development

```bash
npm install
npm run dev           # http://localhost:3000
```

Admin: `/admin/login`, password in `.env.development` (dev only). Tests: `npm test`. Everything CI runs: `npm run verify && npm run build`.

## Security notes

* Admin is protected twice: the proxy (`src/proxy.ts`) redirects visitors, and **every admin page and every `/api/admin/*` route re-checks the signed session itself**. State-changing calls must come from the site's own origin as JSON.
* The session is an HMAC-signed, `HttpOnly`, `SameSite=Strict`, `Secure` (in production) `__Host-` cookie that expires in 12 hours. Login attempts are throttled (best effort per server instance); the long password is the real defense.
* Admin pages send `noindex`/`no-store`; `robots.txt` disallows `/admin` and `/api`. The public site does not link to the admin.
* Secrets only ever live in Vercel environment variables, never in the browser or the repo.

## Map

```
src/engine/        PROTECTED  rules, gates, pricing, cash flow, extraction, scripts, tests
src/server/        PROTECTED  admin auth, SAM.gov + AI connectors, request validation
src/app/api/       PROTECTED  API routes (run the engine, enforce admin-only)
src/lib/           PROTECTED  browser data store + API client
src/proxy.ts       PROTECTED  admin gatekeeper
src/app/(site)/    UI         public website pages
src/app/admin/     UI         admin pages
src/components/    UI         components
src/content/       UI         site copy
src/app/globals.css UI        design tokens
```
