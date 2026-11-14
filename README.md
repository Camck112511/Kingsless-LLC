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
| `SAM_GOV_API_KEY` | optional | Live federal discovery. Free: SAM.gov → your profile → Public API Key. Daily request limits apply (a non-federal key is limited to a handful of requests a day, so "Find bids" uses at most two). |
| `ANTHROPIC_API_KEY` | optional | Turns on every AI feature: the **web scout** (searches procurement sites across the web), the **AI second opinion** on a bid, **subcontractor research**, and the clause reader. Default model `claude-opus-5-5`; override with `ANTHROPIC_MODEL`. Web search must be enabled for your key in the Anthropic Console. A scout or research run uses several searches and costs real money (roughly tens of cents each at Opus rates), so each runs only when you press its button. |
| `RESEND_API_KEY` + `BID_EMAIL_FROM` | optional | Lets the bid workspace **email a finished bid** to an agency. Both are needed. `BID_EMAIL_FROM` must be on a domain you verified in [Resend](https://resend.com), e.g. `Kingsless LLC <bids@kingsless.org>`. Without them everything else works: you download the packet and submit through the agency's portal or your own email. |
| `CONTACT_PHONE` | optional | Overrides the public phone number. The default, (512) 217-7788, is in `src/content/phone.ts`. Visitors only see the number after pressing the **Phone** button; it is never in the page HTML. A malformed value shows "unavailable" rather than a wrong number. Redeploy after setting it. |
| `NEXT_PUBLIC_SITE_URL` | optional | Overrides the site's public address, used for link previews. Default: `https://kingsless.com`. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | optional | Overrides the public email. Default: `Cullenmckinney@kingsless.org`. Read at build time. |

**If `ADMIN_PASSWORD` or `AUTH_SECRET` is missing or too short, the admin is disabled and nobody can sign in** (fails closed). The development credentials in `.env.development` are rejected in production.

## Custom domain (kingsless.com)

The site is set up to be served at **https://kingsless.com**. Connecting the domain happens in Vercel and at the domain registrar, not in this repo:

1. Vercel → your Kingsless project → **Settings → Domains** → add `kingsless.com`, then add `www.kingsless.com` and set it to redirect to `kingsless.com`.
2. At the registrar, add the DNS records Vercel shows on that screen. Typically an **A** record `@` → `76.76.21.21` and a **CNAME** `www` → `cname.vercel-dns.com`. Prefer these over switching nameservers, which would wipe any existing records (such as email MX records).
3. Wait for Vercel to show **Valid Configuration**. HTTPS is issued automatically.

## Using the console

1. **Settings** (do this once): your **location**, **what work you want** (words, NAICS codes, size, timing; the quick-start buttons add whole trades), your real **capital** and **company profile**, and the **company details** that go on bid documents. Everything is judged against these, so be honest.
2. **Find bids**: one button searches the open web with AI, SAM.gov and any bid feeds you added, then ranks the results by how well they fit your business. *Import a link or paste* handles anything you found yourself. *Market research* shows what federal agencies actually paid for similar work and which subcontractors primes hired.
3. **My bids**: everything you added, ranked by what is proven, then by fit, then by profit per dollar and day at risk. **Top picks** are listed first. Nothing is recommended until the three hard rules are proven.
4. Open a bid for the **fit breakdown**, the **gates**, an optional **AI second opinion** (advisory only; quotes are checked against the document), and the economics.
5. **Bid workspace** walks nine short steps, each with a one-line reason: check fit → prove the rules → lock in a subcontractor → set the price → prepare the documents → final check → submit → record the result → (if you win) line up the subcontractor. It drafts the cover letter, price proposal, approach, qualifications, subcontracting statement and compliance matrix as Word files and one PDF, plus private papers (bid summary, submission checklist) and a subcontract term sheet that never show the agency price.
6. **Submitting**: agency portals have no way for software to submit for you, so for most bids you upload the packet yourself and record it. If a solicitation says to email bids, the workspace can send it (needs Resend, above) after a final check **re-run on the server**, with a typed `SEND`. The console only ever emails the final bid packet; it never sends quote requests, inquiries or anything to a subcontractor.
7. After a win, the workspace finds subcontractors (AI web research plus federal subaward records), files them in your directory as **unverified**, and gives you the term sheet to send.

### Autopilot: let the engine go after the bids you pick (no keys needed)

**Start and Stop.** Autopilot is **stopped** until you press **Start** (top right, always visible; also under Settings). Stop halts everything at once. Authorizing a bid also starts it. While started, any open console tab checks your authorized bids every 10 minutes; turn on *Keep this screen awake* in Settings and leave the console open on a plugged-in laptop, tablet or old phone and it keeps working while you are away. Run it from one device at a time.

Select bids on **My bids** and press **Let the engine go after them**. You set the limits once (price floor and ceiling, whether it may bid on your sub-price estimate), tick that you read each official solicitation, and type `AUTHORIZE`. Then, for each bid, the engine:

1. **Reads the official solicitation** (the page and linked PDFs) and fills in what it can prove; every rule-reader fact keeps its source sentence and every AI fact must quote the text verbatim.
2. **Chooses the price.** It tries every price from your walk-away line up to the expected market price, re-runs every rule at each one, and keeps the price with the best *expected profit* (win chance × profit). The win chance is the engine's transparent heuristic, shown with the table of prices it weighed. With no price in the listing it uses the median of at least 5 federal comparables, and says so.
3. **Checks it can be staffed.** To bid on an estimate it needs at least 2 subcontractors on file who offer the work in the area (and list the license if one is required). When too few are on file it finds companies that primes have actually hired for similar federal work in that state (USAspending.gov, **free, no key**), and with an Anthropic key it also researches the open web. Everything it adds is marked unverified.
4. **Gets the bid out.** If every rule is proven (even with the sub costing 25% more), the price is inside your limits and nothing in the documents is blank:
   - **With email set up** (optional, see below) and an address the listing clearly states, it emails the bid itself with the PDF packet and copies you. Never more than 5 a day.
   - **Without email set up (the default)** it puts the finished bid in your **Needs you → Ready to send** queue: one tap for an **email draft with the PDF already attached** (a `.eml` file that opens ready to send in Outlook, Apple Mail and Thunderbird), or **Open my email app** (then attach the downloaded PDF, for Gmail and phones), or open the agency's page for a portal. Then tap **I sent it** and it carries on from there.
5. **Watches for the result.** Federal bids: SAM.gov award notices (needs the free SAM.gov key; a name match is recorded as a win or loss). Everything else: if the agency's page starts naming you near an award, it asks you to confirm.
6. **After a win** it builds the **briefing**: what you now owe, what to offer a subcontractor (open at your estimate; never pay more than your maximum; never reveal the award), and **every candidate ranked best first** (your directory, federal subaward records, and AI web research if on), plus a ready-to-send offer message.

**Alerts, free and with no account** (Settings → Alerts): a notification from your browser, and an optional push to the free **ntfy** phone app (subscribe to the random topic shown; the push says only what happened, never an amount or a contact). They fire while a console tab is open.

It stops and tells you when a rule fails, when something only you can supply is missing (a blank company detail, a missing estimate), or the deadline passes. It never emails a subcontractor, never invents a fact, and never goes outside the limits you set. You can stop any one bid, or everything, at any time; **a bid that has been emailed cannot be recalled.**

### Optional extras (all skippable)

The **only** things you must set in Vercel are `ADMIN_PASSWORD` and `AUTH_SECRET`. Everything below is optional and adds capability; autopilot, pricing, documents, the ready-to-send queue, alerts and federal research work without any of it.

| Add this | You get |
| --- | --- |
| `RESEND_API_KEY` + `BID_EMAIL_FROM` | The engine emails bids itself (instead of the Ready to send queue) and emails you. |
| `ANTHROPIC_API_KEY` | AI web search for bids and subcontractors, the AI second opinion, the AI clause reader. |
| `SAM_GOV_API_KEY` (free) | SAM.gov bid search and federal award detection. |
| A private **Vercel Blob** store + `CRON_SECRET` | *Cloud mode*: autopilot keeps working while every tab is closed. Your data is also kept in a private cloud copy (the browser stays the editor; if two browsers disagree it asks you which to keep). `vercel.json` schedules a daily pass, the most a Hobby plan allows. Settings → *Optional: keep working while every tab is closed* shows the status. |

### What the console will not do

Sending from the bid workspace needs every rule proven, a subcontractor who quoted and confirmed, the listing confirmed against the official solicitation, a price above your walk-away line, no blank in the documents, you confirming you read them, and the due date not passed. **Autopilot** applies its own, equally strict set (above) under the authorization you gave. You can always submit yourself and record it. It never invents a due date, price, license, contact detail or link: anything it does not know is a highlighted blank or "unverified".

### Not yet tested against the live services

The sandbox this was built in could not reach SAM.gov, USAspending.gov, Resend or any procurement portal, and had no Anthropic key. The code for those is written to the public API documentation and unit-tested with fixtures and stubs; the AI features were exercised in a browser with their API responses faked. **Before relying on them, run each once**: Find bids (AI), the SAM.gov search, Market research, a test email to yourself, and the AI second opinion. If a field name has changed upstream, the fix is small and local (`src/server/sources/`).

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
src/app/globals.css UI        design tokens (black / gold / silver, from the logo)
public/brand/      UI         logo files (see docs/BRAND.md)
```
