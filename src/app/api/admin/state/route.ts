import { applyPatches } from "@/lib/patches";
import { adminGuard } from "@/server/auth";
import { fail, ok, readJson } from "@/server/http";
import { StatePutSchema } from "@/server/schemas";
import { getStore, type Stored } from "@/server/store/state-store";

/**
 * Cloud sync for the owner's data, so autopilot can work while the console is closed. The browser stays the editor: it
 * pushes its whole state; the server's autopilot hands changes back as an outbox of patches the browser applies and
 * acknowledges. A push from a stale browser is refused (409) rather than overwriting a newer one. PROTECTED.
 */
export async function GET(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const store = getStore();
  if (!store) return ok({ enabled: false });
  const cur = await store.get();
  if (!cur) return ok({ enabled: true, clientRev: 0, state: null, outbox: [] });
  return ok({ enabled: true, clientRev: cur.stored.clientRev, savedAt: cur.stored.savedAt, state: cur.stored.state, outbox: cur.stored.outbox });
}

export async function PUT(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const store = getStore();
  if (!store) return fail(503, "Background mode is not set up.");
  const body = await readJson(request, StatePutSchema, 4_000_000);
  if ("error" in body) return body.error;
  const { baseRev, state, acked } = body.data;
  const ackedSet = new Set(acked);

  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await store.get();
    if (cur && cur.stored.clientRev !== baseRev) {
      return fail(409, "Another browser saved newer data to the cloud.", { clientRev: cur.stored.clientRev, savedAt: cur.stored.savedAt, outbox: cur.stored.outbox });
    }
    // Changes the autopilot made that this browser has not applied yet stay in the outbox and are laid over its state.
    const unacked = (cur?.stored.outbox ?? []).filter((p) => !ackedSet.has(p.id));
    const next: Stored = {
      clientRev: (cur?.stored.clientRev ?? 0) + 1,
      savedAt: new Date().toISOString(),
      state: applyPatches(state, unacked),
      outbox: unacked,
      lock: cur?.stored.lock ?? null,
    };
    const res = await store.put(next, cur ? cur.etag : null);
    if (res.ok) return ok({ clientRev: next.clientRev, outbox: unacked });
    // the autopilot saved in between: read again and retry
  }
  return fail(503, "The cloud copy is busy. Try again in a moment.");
}
