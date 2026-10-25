# Agent instructions

**The authoritative instructions for this repository are in [`AGENTS.project.md`](./AGENTS.project.md). Read it first.**

The short version, in case you read nothing else:

- This repo has a public website and an admin-only **contract bidding engine** that guides real money decisions.
- You may change **layout and UI only**: `src/app/globals.css`, `src/app/(site)/**`, `src/app/admin/**` (pages), `src/components/**`, `src/content/**`, `public/**`.
- You must **not** edit the engine or its calculations unless the owner explicitly asks in the current conversation: `src/engine/**`, `src/server/**`, `src/app/api/**`, `src/proxy.ts`, `src/lib/**`, `engine.lock.json`, `scripts/engine-lock.mjs`, `.github/**`, tooling config, and these instruction files.
- UI code never calculates money, margins, verdicts or probabilities. It displays what the engine returns (types-only imports from `@/engine`).
- `npm run build` runs an integrity check on the protected files and **fails the deploy** if they changed. Revert protected-file edits; never run `npm run engine:lock` yourself.
- Before committing: `npm run verify && npm run build`.
