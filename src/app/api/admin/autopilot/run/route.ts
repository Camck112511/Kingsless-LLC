import { adminGuard } from "@/server/auth";
import { liveDeps, runPosted, runStored } from "@/server/autopilot/service";
import { fail, ok, readJson } from "@/server/http";
import { AutopilotRunSchema } from "@/server/schemas";
import { getStore } from "@/server/store/state-store";

export const maxDuration = 300;

/**
 * Run the autopilot now (or, with briefingOnly, just build the win briefing for one bid). With a cloud store it works on
 * the stored copy; without one it works on the state the browser sends. Either way it returns patches for the browser to
 * apply. PROTECTED.
 */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, AutopilotRunSchema, 4_000_000);
  if ("error" in body) return body.error;
  const only = { itemId: body.data.itemId, briefingOnly: body.data.briefingOnly };
  const store = getStore();
  const result = store ? await runStored(store, liveDeps(), only) : body.data.state ? await runPosted(body.data.state, liveDeps(), only) : null;
  if (result === null) return fail(400, "Send your state, or set up background mode.");
  if (!result.ok) return fail(result.status, result.error);
  return ok({ patches: result.patches, processed: result.processed, mode: store ? "cloud" : "browser" });
}
