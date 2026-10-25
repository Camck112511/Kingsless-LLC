/**
 * Reads and validates the admin credentials from the environment. FAILS CLOSED: if anything is missing, too short,
 * or equals a development default while running in production, the admin area is disabled (nobody can log in).
 *
 * PROTECTED (security). See AGENTS.project.md.
 */

/** Values shipped in .env.development. Never accepted in production. */
const DEV_PASSWORD = "dev-only-admin-password";
const DEV_SECRET = "dev-only-auth-secret-not-for-production-0123456789abcdef";

export type AdminConfig = { ok: true; password: string; secret: string } | { ok: false; reason: string };

export function readAdminConfig(env: Record<string, string | undefined> = process.env): AdminConfig {
  const password = env.ADMIN_PASSWORD ?? "";
  const secret = env.AUTH_SECRET ?? "";
  const production = env.NODE_ENV === "production";

  if (!password || !secret) {
    return { ok: false, reason: "Admin is disabled: set ADMIN_PASSWORD and AUTH_SECRET in the environment." };
  }
  if (password.length < 12) return { ok: false, reason: "Admin is disabled: ADMIN_PASSWORD must be at least 12 characters." };
  if (secret.length < 32) return { ok: false, reason: "Admin is disabled: AUTH_SECRET must be at least 32 characters." };
  if (production && (password === DEV_PASSWORD || secret === DEV_SECRET)) {
    return { ok: false, reason: "Admin is disabled: development credentials are not accepted in production." };
  }
  return { ok: true, password, secret };
}
