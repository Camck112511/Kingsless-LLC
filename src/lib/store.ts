"use client";
/**
 * The admin's working data (pipeline, directory, quotes, settings) lives in THIS BROWSER's localStorage.
 * There is no database in v1, so: export a backup from Settings regularly, and note that clearing site data erases it.
 * The engine itself is stateless: this state is posted to /api/admin/analyze whenever it needs numbers.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { useSyncExternalStore } from "react";
import { emptyBid, DEFAULT_INPUTS, DEFAULT_PROFILE, DEFAULT_SERVICE_AREA, DEFAULT_SETTINGS, DEFAULT_TARGETING, TEST_CASE_INPUTS, TEST_CASE_OPPORTUNITIES } from "@/engine";
import type { AutoAuthorization, AutoEvent, AutoEventKind, BidRecord, Inputs, Opportunity, Quote, Settings, Subcontractor } from "@/engine/types";
import { applyPatches } from "./patches";
import { MAX_EVENTS, type Patch } from "./types";

export type { AppState, PipelineItem, PipelineStatus } from "./types";
import type { AppState, PipelineItem, PipelineStatus } from "./types";

export const STATUS_LABELS: Record<PipelineStatus, string> = {
  new: "New",
  watching: "Watching",
  "quotes-requested": "Quotes requested",
  approved: "Approved",
  "bid-submitted": "Bid submitted",
  won: "Won",
  lost: "Lost",
  passed: "Passed",
};

export const bidOf = (item: PipelineItem): BidRecord => item.bid ?? emptyBid();

const KEY = "kingsless.admin.v1";
const nowIso = () => new Date().toISOString();

export function emptyState(): AppState {
  // Autopilot starts STOPPED. Nothing runs on its own until the owner presses Start (or authorizes a bid).
  return { version: 1, settings: structuredClone(DEFAULT_SETTINGS), items: [], subcontractors: [], quotes: [], events: [], autopilotPaused: true };
}

/** Fill any missing settings fields (e.g. from an older backup) from the defaults. */
function normalize(raw: Partial<AppState> | null | undefined): AppState {
  const base = emptyState();
  if (!raw || raw.version !== 1) return base;
  const s = (raw.settings ?? {}) as Partial<Settings>;
  return {
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      ...s,
      serviceArea: { ...DEFAULT_SERVICE_AREA, ...(s.serviceArea ?? {}) },
      targeting: { ...DEFAULT_TARGETING, ...(s.targeting ?? {}) },
      profile: { ...DEFAULT_PROFILE, ...(s.profile ?? {}) },
      contact: { ...DEFAULT_SETTINGS.contact, ...(s.contact ?? {}) },
    },
    items: Array.isArray(raw.items) ? raw.items : [],
    subcontractors: Array.isArray(raw.subcontractors) ? raw.subcontractors : [],
    quotes: Array.isArray(raw.quotes) ? raw.quotes : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    autopilotPaused: raw.autopilotPaused !== false,
  };
}

let state: AppState | null = null;
const listeners = new Set<() => void>();

function read(): AppState {
  try {
    const text = window.localStorage.getItem(KEY);
    return text ? normalize(JSON.parse(text) as Partial<AppState>) : emptyState();
  } catch {
    return emptyState();
  }
}

const commitHooks = new Set<(next: AppState) => void>();

/** Cloud sync listens here so every change the owner makes is pushed. Returns an unsubscribe function. */
export function onCommit(hook: (next: AppState) => void): () => void {
  commitHooks.add(hook);
  return () => commitHooks.delete(hook);
}

function commit(next: AppState, opts: { silent?: boolean } = {}): void {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the in-memory copy still works for this session */
  }
  listeners.forEach((l) => l());
  if (!opts.silent) commitHooks.forEach((h) => h(next));
}

/** Replace everything (used when adopting the cloud copy). Does not push back. */
export function replaceState(next: AppState): void {
  commit(normalize(next), { silent: true });
}

/** Apply changes handed back by the server's autopilot. They are idempotent, so replaying them is safe. */
export function applyServerPatches(patches: Patch[]): void {
  if (patches.length === 0) return;
  commit(applyPatches(cur(), patches));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = read();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function snapshot(): AppState | null {
  if (state === null && typeof window !== "undefined") state = read();
  return state;
}

/** null on the server and during hydration; the loaded state afterwards. */
export function useAppState(): AppState | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

const cur = (): AppState => snapshot() ?? emptyState();
export const getState = cur;

const localId = (p: string): string => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const auth0 = (a: AutoAuthorization): AutoAuthorization => a;

const blankAutoProgress = () => ({ phase: "authorized" as const, lastRunAt: null, summary: "Authorized. Waiting for the first pass.", needs: [] as string[], notifiedKey: "", pageHash: "", subResearchAt: null, compsAt: null, pricing: null });

function withEvent(s: AppState, itemId: string | null, kind: AutoEventKind, title: string, detail: string): AppState {
  const e: AutoEvent = { id: localId("evt"), at: nowIso(), itemId, kind, title, detail };
  return { ...s, events: [...s.events, e].slice(-MAX_EVENTS) };
}

export interface AuthorizeOptions {
  /** The owner ticked "I read the official solicitation and the facts shown match it". Without it nothing is authorized. */
  attested: boolean;
  allowEstimateOnly: boolean;
  floorUsd: number | null;
  ceilingUsd: number | null;
  submissionEmail: string;
  /** What a subcontractor is likely to charge, for bids that have no estimate or quote yet. */
  subEstimates?: Record<string, number>;
}

export const actions = {
  addItems(opps: Opportunity[], inputs: Record<string, Inputs> = {}): { added: number; skipped: number } {
    const s = cur();
    const have = new Set(s.items.map((i) => i.opportunity.id));
    const fresh = opps.filter((o) => !have.has(o.id));
    const stamp = nowIso();
    commit({
      ...s,
      items: [
        ...s.items,
        ...fresh.map((o): PipelineItem => ({ opportunity: o, inputs: inputs[o.id] ?? structuredClone(DEFAULT_INPUTS), status: "new", notes: "", addedAt: stamp, updatedAt: stamp })),
      ],
    });
    return { added: fresh.length, skipped: opps.length - fresh.length };
  },
  loadTestCases() {
    return actions.addItems(TEST_CASE_OPPORTUNITIES, TEST_CASE_INPUTS);
  },
  updateItem(id: string, patch: Partial<Omit<PipelineItem, "opportunity" | "inputs">> & { opportunity?: Opportunity; inputs?: Inputs }) {
    const s = cur();
    commit({ ...s, items: s.items.map((i) => (i.opportunity.id === id ? { ...i, ...patch, updatedAt: nowIso() } : i)) });
  },
  removeItem(id: string) {
    const s = cur();
    commit({ ...s, items: s.items.filter((i) => i.opportunity.id !== id), quotes: s.quotes.filter((q) => q.opportunityId !== id) });
  },
  patchBid(id: string, change: (b: BidRecord) => BidRecord) {
    const s = cur();
    commit({ ...s, items: s.items.map((i) => (i.opportunity.id === id ? { ...i, bid: change(bidOf(i)), updatedAt: nowIso() } : i)) });
  },
  /** Let the engine pursue these bids on its own, within limits. Returns how many were authorized. */
  authorizeBids(ids: string[], o: AuthorizeOptions): number {
    if (!o.attested) return 0;
    let s = cur();
    const stamp = nowIso();
    let n = 0;
    for (const id of ids) {
      const item = s.items.find((i) => i.opportunity.id === id);
      if (!item) continue;
      const auth: AutoAuthorization = { authorizedAt: stamp, floorUsd: o.floorUsd, ceilingUsd: o.ceilingUsd, allowEstimateOnly: o.allowEstimateOnly, attestedListing: true, submissionEmail: o.submissionEmail.trim(), paused: false };
      const estimate = o.subEstimates?.[id];
      const next: PipelineItem = {
        ...item,
        status: item.status === "new" || item.status === "watching" || item.status === "quotes-requested" ? "approved" : item.status,
        updatedAt: stamp,
        inputs: estimate !== undefined && estimate > 0 ? { ...item.inputs, subPriceEstimateUsd: estimate } : item.inputs,
        opportunity: { ...item.opportunity, provenance: { ...item.opportunity.provenance, verified: true, checkedOn: stamp.slice(0, 10), note: `Confirmed by the owner against the official solicitation when authorizing autopilot (${stamp.slice(0, 10)}).` } },
        bid: { ...bidOf(item), auto: { auth, progress: blankAutoProgress() } },
      };
      s = withEvent(
        { ...s, items: s.items.map((i) => (i.opportunity.id === id ? next : i)) },
        id,
        "authorized",
        `You authorized autopilot: ${item.opportunity.title}`,
        `${o.allowEstimateOnly ? "May bid on your sub-price estimate." : "Waits for a firm subcontractor quote."} Price floor ${o.floorUsd ? `$${o.floorUsd}` : "your walk-away line"}, ceiling ${o.ceilingUsd ? `$${o.ceilingUsd}` : "the expected market price"}.`,
      );
      n += 1;
    }
    if (n > 0) {
      // Authorizing a bid is the owner saying "go": it also starts autopilot if it was stopped.
      if (s.autopilotPaused) s = withEvent({ ...s, autopilotPaused: false }, null, "info", "Autopilot started", "You authorized a bid, which starts autopilot. Press Stop at any time.");
      commit(s);
    }
    return n;
  },
  setAutoPaused(id: string, paused: boolean) {
    const s = cur();
    const item = s.items.find((i) => i.opportunity.id === id);
    const auto = item?.bid?.auto;
    if (!item || !auto) return;
    const next: PipelineItem = { ...item, updatedAt: nowIso(), bid: { ...bidOf(item), auto: { ...auto, auth: { ...auto.auth, paused }, progress: { ...auto.progress, summary: paused ? "Paused by you." : "Resumed." } } } };
    commit(withEvent({ ...s, items: s.items.map((i) => (i.opportunity.id === id ? next : i)) }, id, "info", paused ? "You paused autopilot" : "You resumed autopilot", item.opportunity.title));
  },
  /** End autopilot for this bid. Nothing already sent can be recalled; this only stops further action. */
  stopAuto(id: string) {
    const s = cur();
    const item = s.items.find((i) => i.opportunity.id === id);
    const auto = item?.bid?.auto;
    if (!item || !auto) return;
    const next: PipelineItem = { ...item, updatedAt: nowIso(), bid: { ...bidOf(item), auto: { auth: { ...auto.auth, paused: true }, progress: { ...auto.progress, phase: "stopped", summary: "Stopped by you.", needs: [] } } } };
    commit(withEvent({ ...s, items: s.items.map((i) => (i.opportunity.id === id ? next : i)) }, id, "stopped", "You stopped autopilot", item.opportunity.title));
  },
  /** The master switch. Off = nothing runs, for any bid. A bid already emailed cannot be recalled. */
  setAutopilotOn(on: boolean) {
    const s = cur();
    if (s.autopilotPaused === !on) return;
    commit(withEvent({ ...s, autopilotPaused: !on }, null, "info", on ? "Autopilot started" : "Autopilot stopped", on ? "It will check your authorized bids while this console is open." : "Nothing will run until you press Start."));
  },
  /** Bring a stopped bid back, keeping the limits you set. */
  restartAuto(id: string) {
    const s = cur();
    const item = s.items.find((i) => i.opportunity.id === id);
    const auto = item?.bid?.auto;
    if (!item || !auto) return;
    const next: PipelineItem = { ...item, updatedAt: nowIso(), bid: { ...bidOf(item), auto: { auth: { ...auth0(auto.auth), paused: false }, progress: { ...auto.progress, phase: "authorized", summary: "Restarted by you.", needs: [], notifiedKey: "" } } } };
    commit(withEvent({ ...s, autopilotPaused: false, items: s.items.map((i) => (i.opportunity.id === id ? next : i)) }, id, "authorized", "You restarted autopilot", item.opportunity.title));
  },
  /** "I sent it": you sent the prepared bid yourself (own email, portal, mail). Autopilot then watches for the result. */
  recordSent(id: string, method: "own-email" | "portal" | "mail-or-hand", confirmation: string) {
    const s = cur();
    const item = s.items.find((i) => i.opportunity.id === id);
    if (!item) return;
    const b = bidOf(item);
    const next: PipelineItem = {
      ...item,
      status: "bid-submitted",
      updatedAt: nowIso(),
      bid: { ...b, submission: { submittedOn: nowIso().slice(0, 10), method, confirmation: confirmation.trim(), priceUsd: item.inputs.plannedBidUsd, note: "Sent by you from the autopilot queue." }, auto: b.auto ? { ...b.auto, progress: { ...b.auto.progress, phase: "submitted", summary: "You sent it. Watching for the result.", needs: [] } } : b.auto },
    };
    commit(withEvent({ ...s, items: s.items.map((i) => (i.opportunity.id === id ? next : i)) }, id, "submitted", `You sent the bid for ${item.opportunity.title}`, `By ${method.replace(/-/g, " ")}${confirmation.trim() ? `, reference ${confirmation.trim()}` : ""}. Autopilot will watch for the result.`));
  },
  setSettings(settings: Settings) {
    commit({ ...cur(), settings });
  },
  upsertSub(sub: Subcontractor) {
    const s = cur();
    const exists = s.subcontractors.some((x) => x.id === sub.id);
    commit({ ...s, subcontractors: exists ? s.subcontractors.map((x) => (x.id === sub.id ? sub : x)) : [...s.subcontractors, sub] });
  },
  removeSub(id: string) {
    const s = cur();
    commit({ ...s, subcontractors: s.subcontractors.filter((x) => x.id !== id), quotes: s.quotes.filter((q) => q.subcontractorId !== id) });
  },
  upsertQuote(q: Quote) {
    const s = cur();
    const exists = s.quotes.some((x) => x.id === q.id);
    commit({ ...s, quotes: exists ? s.quotes.map((x) => (x.id === q.id ? q : x)) : [...s.quotes, q] });
  },
  removeQuote(id: string) {
    const s = cur();
    commit({ ...s, quotes: s.quotes.filter((q) => q.id !== id) });
  },
  exportJson(): string {
    return JSON.stringify(cur(), null, 2);
  },
  importJson(text: string): { ok: true } | { ok: false; error: string } {
    try {
      const parsed = JSON.parse(text) as Partial<AppState>;
      if (parsed.version !== 1 || !Array.isArray(parsed.items)) return { ok: false, error: "This does not look like a Kingsless backup file." };
      commit(normalize(parsed));
      return { ok: true };
    } catch {
      return { ok: false, error: "The file is not valid JSON." };
    }
  },
  reset() {
    commit(emptyState());
  },
};

export const newId = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
