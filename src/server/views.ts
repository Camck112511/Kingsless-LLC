import "server-only";
/** Read-only views of engine rules for UI pages. The UI may import from here; it may not import the engine itself. */
export { describeRules } from "@/engine/rules-view";
export type { RulesView } from "@/engine/rules-view";

import { readAdminConfig } from "./admin-config";

/** Whether the admin area is enabled, and why not. Never exposes the credentials themselves. */
export function adminStatus(): { ok: true } | { ok: false; reason: string } {
  const c = readAdminConfig();
  return c.ok ? { ok: true } : { ok: false, reason: c.reason };
}

export interface Capabilities {
  /** ANTHROPIC_API_KEY is set: AI web scout, AI review and AI subcontractor research can run. */
  ai: boolean;
  /** SAM_GOV_API_KEY is set. */
  sam: boolean;
  /** RESEND_API_KEY and BID_EMAIL_FROM are set: bids can be emailed from the console. */
  email: boolean;
}

/** Which optional services are configured. Booleans only; the keys themselves never leave the server. */
export function capabilities(): Capabilities {
  return {
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    sam: Boolean(process.env.SAM_GOV_API_KEY),
    email: Boolean(process.env.RESEND_API_KEY && process.env.BID_EMAIL_FROM),
  };
}
