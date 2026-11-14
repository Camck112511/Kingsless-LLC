import "server-only";
/**
 * Glue between the autopilot pass and the outside world: real dependencies, the stored copy of the owner's data, the
 * lock that stops two passes overlapping, and the outbox the browser later applies. PROTECTED.
 */
import { samAwardCheck } from "./award-watch";
import { notifyOwner } from "./notify";
import { readOfficial, refineFromText } from "./official";
import { runAutopilot, type Deps, type RunResult } from "./run";
import { applyPatches } from "@/lib/patches";
import type { AppState, Patch } from "@/lib/types";
import { researchSubs } from "../ai/sub-research";
import { aiConfigured } from "../ai/client";
import { emailConfigured, sendEmail } from "../email/resend";
import { searchPastAwards, searchSubawardees } from "../sources/usaspending";
import { update, type StateStore } from "../store/state-store";

/** The real outside world. Tests build their own. */
export function liveDeps(checkpoint?: Deps["checkpoint"]): Deps {
  const now = new Date();
  return {
    now: () => now,
    aiEnabled: aiConfigured(),
    emailEnabled: emailConfigured(),
    read: (opp) => readOfficial(opp),
    refine: refineFromText,
    comps: (q) => searchPastAwards(q, now),
    subawards: (q) => searchSubawardees(q, now),
    research: (opp, settings) => researchSubs(opp, settings, 8, ""),
    award: (opp, company, at) => samAwardCheck(opp, company, process.env.SAM_GOV_API_KEY, at),
    send: (mail) => sendEmail(mail),
    notify: notifyOwner,
    checkpoint,
    deadline: now.getTime() + 230_000,
  };
}

const LOCK_MS = 5 * 60_000;

export type ServiceResult = { ok: true; patches: Patch[]; processed: number } | { ok: false; error: string; status: number };

/**
 * Run a pass against the stored copy: take the lock, run, save the new state and the patches in the outbox, release.
 * The browser later applies the patches (and acknowledges them) the next time it syncs.
 */
export async function runStored(store: StateStore, deps: Deps, only?: { itemId?: string; briefingOnly?: boolean }): Promise<ServiceResult> {
  const nowIso = deps.now().toISOString();
  // 1. take the lock
  let taken = false;
  await update(store, (cur) => {
    if (!cur) return null;
    if (cur.lock && Date.parse(cur.lock.until) > deps.now().getTime()) return null;
    taken = true;
    return { ...cur, lock: { until: new Date(deps.now().getTime() + LOCK_MS).toISOString() } };
  });
  if (!taken) return { ok: false, status: 409, error: "Autopilot is already running (or nothing has been synced to the cloud yet). Try again in a few minutes." };

  // 2. run on the freshest state; save as we go after a send so a crash cannot lose the record
  try {
    const first = await store.get();
    if (!first) return { ok: false, status: 409, error: "Nothing has been synced to the cloud yet." };
    const checkpoint: Deps["checkpoint"] = async (_state, patches) => {
      await update(store, (cur) => (cur ? { ...cur, state: applyPatches(cur.state, patches), outbox: mergeOutbox(cur.outbox, patches) } : null));
    };
    const result: RunResult = await runAutopilot(first.stored.state, { ...deps, checkpoint }, only);
    await update(store, (cur) => (cur ? { ...cur, savedAt: nowIso, state: applyPatches(cur.state, result.patches), outbox: mergeOutbox(cur.outbox, result.patches), lock: null } : null));
    return { ok: true, patches: result.patches, processed: result.processed };
  } catch (err) {
    await update(store, (cur) => (cur ? { ...cur, lock: null } : null)).catch(() => null);
    return { ok: false, status: 500, error: err instanceof Error ? err.message.slice(0, 200) : "Autopilot failed." };
  }
}

/** Add patches to the outbox without duplicating any already there (a checkpoint and the final save carry the same ones). */
export function mergeOutbox(outbox: Patch[], more: Patch[]): Patch[] {
  const have = new Set(outbox.map((p) => p.id));
  return [...outbox, ...more.filter((p) => !have.has(p.id))].slice(-500);
}

/** Run a pass on state the browser posted (no cloud store). Nothing is saved on the server; the browser applies the patches. */
export async function runPosted(state: AppState, deps: Deps, only?: { itemId?: string; briefingOnly?: boolean }): Promise<ServiceResult> {
  try {
    const r = await runAutopilot(state, deps, only);
    return { ok: true, patches: r.patches, processed: r.processed };
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message.slice(0, 200) : "Autopilot failed." };
  }
}
