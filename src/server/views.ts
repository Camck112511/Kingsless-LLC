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
