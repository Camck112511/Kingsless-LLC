"use client";
/**
 * The admin's working data (pipeline, directory, quotes, settings) lives in THIS BROWSER's localStorage.
 * There is no database in v1, so: export a backup from Settings regularly, and note that clearing site data erases it.
 * The engine itself is stateless: this state is posted to /api/admin/analyze whenever it needs numbers.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_INPUTS, DEFAULT_PROFILE, DEFAULT_SETTINGS, TEST_CASE_INPUTS, TEST_CASE_OPPORTUNITIES } from "@/engine";
import type { Inputs, Opportunity, Quote, Settings, Subcontractor } from "@/engine/types";

export type PipelineStatus = "new" | "watching" | "quotes-requested" | "approved" | "bid-submitted" | "won" | "lost" | "passed";

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

export interface PipelineItem {
  opportunity: Opportunity;
  inputs: Inputs;
  status: PipelineStatus;
  notes: string;
  addedAt: string;
  updatedAt: string;
}

export interface AppState {
  version: 1;
  settings: Settings;
  items: PipelineItem[];
  subcontractors: Subcontractor[];
  quotes: Quote[];
}

const KEY = "kingsless.admin.v1";
const nowIso = () => new Date().toISOString();

export function emptyState(): AppState {
  return { version: 1, settings: structuredClone(DEFAULT_SETTINGS), items: [], subcontractors: [], quotes: [] };
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
      profile: { ...DEFAULT_PROFILE, ...(s.profile ?? {}) },
      contact: { ...DEFAULT_SETTINGS.contact, ...(s.contact ?? {}) },
    },
    items: Array.isArray(raw.items) ? raw.items : [],
    subcontractors: Array.isArray(raw.subcontractors) ? raw.subcontractors : [],
    quotes: Array.isArray(raw.quotes) ? raw.quotes : [],
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

function commit(next: AppState): void {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the in-memory copy still works for this session */
  }
  listeners.forEach((l) => l());
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
