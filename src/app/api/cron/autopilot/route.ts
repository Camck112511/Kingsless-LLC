import { timingSafeEqual } from "node:crypto";
import { liveDeps, runStored } from "@/server/autopilot/service";
import { getStore } from "@/server/store/state-store";

export const maxDuration = 300;

const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The scheduled pass (Vercel Cron). Not an admin route: it has no session, so it is refused unless the request carries
 * the CRON_SECRET that Vercel adds to its own scheduled calls. With no cloud store there is nothing to run. PROTECTED.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const noStore = { "Cache-Control": "no-store" };
  // Background mode is optional. Without a cloud store and a secret there is nothing to run, and nothing here can be triggered.
  if (!secret || !getStore()) return Response.json({ skipped: "Background mode is not set up." }, { headers: noStore });
  const header = request.headers.get("authorization") ?? "";
  if (secret.length < 16 || !same(header, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401, headers: noStore });
  const store = getStore()!;
  const result = await runStored(store, liveDeps());
  return Response.json(result.ok ? { ok: true, processed: result.processed, changes: result.patches.length } : { ok: false, error: result.error }, { status: result.ok ? 200 : result.status === 409 ? 200 : 500, headers: { "Cache-Control": "no-store" } });
}
