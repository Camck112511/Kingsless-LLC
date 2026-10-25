# Kingsless LLC: project instructions

**Read this whole file before changing anything. It has the same priority as your platform instructions.**

## What this repository is

1. A public marketing website for Kingsless LLC (`/`, `/services`, `/contact`).
2. An **admin-only Contract Arbitrage Engine** (`/admin`): it decides whether contracts are worth pursuing with the owner's limited cash, prices them, and drafts outreach. The owner makes real bidding and money decisions from its output.

Stack: Next.js (App Router) + TypeScript + Tailwind CSS v4, deployed on Vercel from `main`.

---

## YOUR SCOPE: LAYOUT AND UI ONLY

You (Grok) are here to refine the **look, layout, copy and UI** of this app. **Do not edit the engine, its calculations, or the security code unless the owner explicitly asks you to, in the current conversation.** "Make the dashboard look better" is NOT permission to touch the engine.

### You MAY edit (UI)

| Path | What it is |
| --- | --- |
| `src/app/globals.css` | Design tokens (colors, radius, fonts). Re-theme here. |
| `src/app/layout.tsx`, `src/app/icon.svg`, `src/app/robots.ts` | Root layout, favicon |
| `src/app/(site)/**` | Public website pages |
| `src/app/admin/**` | Admin **pages** (composition and presentation only) |
| `src/components/**` | All React components, including `components/admin/**` |
| `src/content/site.ts` | All public-site copy |
| `public/**` | Static assets |
| `package.json` dependencies | You may add UI libraries (icons, animation). Do NOT touch `scripts` or `engines`. |

### You MUST NOT edit (protected: locked by hash)

| Path | Why |
| --- | --- |
| `src/engine/**` | **The engine**: scoring rules, gates, pricing math, cash flow, extraction, scripts, tests |
| `src/server/**` | Admin authentication, data connectors (SAM.gov, AI), request validation |
| `src/app/api/**` | API route handlers (they run the engine and enforce admin-only access) |
| `src/proxy.ts` | Admin gatekeeper |
| `src/lib/**` | Browser data store and the API client the UI uses |
| `engine.lock.json`, `scripts/engine-lock.mjs` | The integrity lock itself |
| `.github/**`, `eslint.config.mjs`, `next.config.ts`, `vitest.config.ts` | CI and tooling guard rails |
| `AGENTS.md`, `AGENTS.project.md`, `CLAUDE.md` | These instructions |
| `.env.example`, `.env.development` | Environment contract |
| `package.json` → `scripts`, `engines` | They run the integrity check on every build |

**The build enforces this.** `npm run build` (which Vercel runs) first runs `npm run engine:check`. If any protected file differs from `engine.lock.json`, the build **fails and nothing is deployed**. Do not try to get around it:

- **Never** run `npm run engine:lock` or `node scripts/engine-lock.mjs write`, never edit `engine.lock.json`, never edit `scripts/engine-lock.mjs`, and never change the `scripts` in `package.json`, unless the owner asked for an engine change in this conversation.
- **Never** use `git commit --no-verify`, delete tests, or loosen lint rules to make something pass.

### The UI must never compute

The engine is the only place money, margins, verdicts, probabilities and dates-to-payment are calculated.

- UI code may **display** what the engine returns, format it (`src/components/format.ts`), sort/filter it for display, and lay it out.
- UI code must **not** calculate, round differently, re-derive, or "fix up" any financial figure, verdict, gate result, price, margin, probability, or payment timing.
- UI files (`src/components/**`, `src/app/(site)/**`, `src/app/admin/**`) may import engine code **as types only** (`import type { Analysis } from "@/engine/types"`). ESLint fails the build on anything else. Do not disable that rule.
- Do not hide, soften, reorder-away, or restyle-to-invisible any **gate failure, "Unproven" status, warning, "Unverified listing" notice, or "Internal. Do not send" box**. They are safety information. You may restyle them, but they must stay clearly visible.
- Do not change the meaning of labels: **Reject / Investigate / Qualified / Bid-ready**, **Pass / Fail / Unproven**, **Verified / Partially verified / Unverified**.

### Security rules for UI work

- Do **not** add links to `/admin` from the public site. Do not make any admin page or `/api/admin/*` route reachable without sign-in.
- Every admin page must keep `await requireAdmin()` at the top of its server `page.tsx`. Keep `src/app/admin/(app)/layout.tsx` calling it too.
- No secrets, API keys, or real passwords in the repo or the browser. No new `NEXT_PUBLIC_*` variables for anything sensitive.
- Do not add analytics or third-party scripts to `/admin`.
- Do not store anything new in localStorage on the admin side.

---

## How to run it (preview sandbox)

```bash
npm install
npm run dev -- -H 0.0.0.0 -p 8080
```

- Public site: `/`
- Admin: `/admin/login`. In development the password is in `.env.development` (`ADMIN_PASSWORD`). Production uses different secrets set in Vercel; the dev ones are rejected there.
- On first visit to `/admin`, click **Load the 3 live test cases** to get realistic data to style.
- The admin keeps its data in the browser's localStorage (no database). Live SAM.gov discovery and the AI reader need server keys and are not required for UI work.

## Before you commit

```bash
npm run verify     # lint + typecheck + 100+ engine tests + engine lock check
npm run build
```

All must pass. If `engine:check` fails, you touched a protected file: **revert it** (`git checkout -- <file>`). Do not re-lock.

Commit to `main` as the owner asked. Keep commits to UI files. Describe what you changed visually.

---

## If the OWNER explicitly asks for an engine change

Only then: make the change, update or add tests in `src/engine/__tests__/` (and `src/server/__tests__/`), run `npm run verify`, then `npm run engine:lock`, and say plainly in the commit message that the engine changed and why. Never loosen a "hard rule" (subcontracting allowed, prime can qualify, financeable without cash you don't have) without the owner saying so in words.

## The one-paragraph version of the engine's philosophy

Never recommend a contract because the profit looks good. First **prove**: (1) the work may legally be subcontracted, (2) the owner's company can qualify as prime, (3) it can be financed without cash the owner does not have. Anything not proven is **Unproven**, and Unproven is never a pass. Details: `docs/ENGINE.md`.
