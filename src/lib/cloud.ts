"use client";
/**
 * Cloud sync and the "run autopilot now" call.
 *
 * The browser stays the editor. When a cloud store exists (background mode), every change is pushed (debounced) so the
 * server's autopilot works on the same data while the console is closed. The autopilot hands its changes back as patches;
 * the browser applies them, acknowledges them on its next push, and its own edits always win on conflict. If another
 * browser pushed in between, nothing is overwritten: the owner picks which copy to keep.
 *
 * Without a cloud store this module does nothing except let "Run now" send the browser's own state to the server.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { useSyncExternalStore } from "react";
import { autopilotRunApi, cloudGetApi, cloudPutApi, type CloudSnapshot } from "./api";
import { applyPatches } from "./patches";
import { applyServerPatches, getState, onCommit, replaceState } from "./store";
import type { AppState, Patch } from "./types";

export interface CloudStatus {
  /** unknown: not checked yet · off: no cloud store · on: syncing · conflict: needs the owner's choice · error: could not reach it */
  phase: "unknown" | "off" | "on" | "conflict" | "error";
  syncedAt: string | null;
  message: string;
  running: boolean;
  lastRunAt: string | null;
  lastRunMessage: string;
}

const REV_KEY = "kingsless.cloud.rev";
const RUN_KEY = "kingsless.autopilot.lastRun";
const AUTO_RUN_EVERY_MS = 30 * 60_000;

let status: CloudStatus = { phase: "unknown", syncedAt: null, message: "", running: false, lastRunAt: null, lastRunMessage: "" };
const subs = new Set<() => void>();
const set = (p: Partial<CloudStatus>) => {
  status = { ...status, ...p };
  subs.forEach((f) => f());
};

let started = false;
let rev = 0;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing: Promise<void> | null = null;
let conflict: { clientRev: number; state: AppState | null; outbox: Patch[] } | null = null;
const pendingAcks = new Set<string>();

const readRev = (): number | null => {
  try {
    const v = window.localStorage.getItem(REV_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
};
const writeRev = (n: number) => {
  rev = n;
  try {
    window.localStorage.setItem(REV_KEY, String(n));
  } catch {
    /* ignore */
  }
};

const isEmpty = (s: AppState) => s.items.length === 0 && s.subcontractors.length === 0 && s.events.length === 0;

function receive(patches: Patch[]): void {
  if (patches.length === 0) return;
  applyServerPatches(patches);
  for (const p of patches) pendingAcks.add(p.id);
  schedulePush();
}

function adopt(remote: { clientRev: number; state: AppState; outbox: Patch[] }): void {
  replaceState(applyPatches(remote.state, remote.outbox));
  writeRev(remote.clientRev);
  for (const p of remote.outbox) pendingAcks.add(p.id);
  conflict = null;
  set({ phase: "on", message: "", syncedAt: new Date().toISOString() });
  schedulePush();
}

async function push(): Promise<void> {
  if (status.phase !== "on") return;
  const sent = [...pendingAcks];
  const res = await cloudPutApi(rev, getState(), sent);
  if (res.ok) {
    writeRev(res.data.clientRev);
    for (const id of sent) pendingAcks.delete(id);
    set({ syncedAt: new Date().toISOString(), message: "" });
    // changes the autopilot made that this browser had not applied yet
    receive(res.data.outbox.filter((p) => !pendingAcks.has(p.id)));
    return;
  }
  if (res.status === 409) {
    const fresh = await cloudGetApi();
    conflict = fresh.ok && fresh.data.enabled ? { clientRev: fresh.data.clientRev ?? 0, state: fresh.data.state ?? null, outbox: fresh.data.outbox ?? [] } : null;
    set({ phase: "conflict", message: "Another browser saved newer data to the cloud." });
    return;
  }
  set({ message: `Could not save to the cloud: ${res.error}. Will try again.` });
  setTimeout(schedulePush, 30_000);
}

function schedulePush(): void {
  if (status.phase !== "on") return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushing = push().finally(() => {
      pushing = null;
    });
  }, 1500);
}

/** Push right now and wait for it (used before asking the server to run). */
export async function flushCloud(): Promise<void> {
  if (status.phase !== "on") return;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (pushing) await pushing;
  pushing = push().finally(() => {
    pushing = null;
  });
  await pushing;
}

async function poll(): Promise<void> {
  if (status.phase !== "on" || pushing || pushTimer) return;
  const res = await cloudGetApi();
  if (!res.ok || !res.data.enabled) return;
  if ((res.data.clientRev ?? 0) !== rev) {
    conflict = { clientRev: res.data.clientRev ?? 0, state: res.data.state ?? null, outbox: res.data.outbox ?? [] };
    set({ phase: "conflict", message: "Another browser saved newer data to the cloud." });
    return;
  }
  receive((res.data.outbox ?? []).filter((p) => !pendingAcks.has(p.id)));
}

async function init(): Promise<void> {
  const res = await cloudGetApi();
  if (!res.ok) return set({ phase: "error", message: res.error });
  const remote: CloudSnapshot = res.data;
  if (!remote.enabled) return set({ phase: "off", message: "" });
  const local = getState();
  const mine = readRev();
  rev = remote.clientRev ?? 0;
  if (!remote.state) {
    set({ phase: "on" });
    writeRev(0);
    await push();
    return;
  }
  if (isEmpty(local)) return adopt({ clientRev: remote.clientRev ?? 0, state: remote.state, outbox: remote.outbox ?? [] });
  if (mine !== null && mine === (remote.clientRev ?? 0)) {
    set({ phase: "on", syncedAt: new Date().toISOString() });
    receive(remote.outbox ?? []);
    // Anything changed here while sync was not running (starting up, or the cloud was unreachable) is pushed now.
    if (JSON.stringify(getState()) !== JSON.stringify(applyPatches(remote.state, remote.outbox ?? []))) schedulePush();
    return;
  }
  conflict = { clientRev: remote.clientRev ?? 0, state: remote.state, outbox: remote.outbox ?? [] };
  set({ phase: "conflict", message: "This browser and the cloud both have data. Choose which to keep." });
}

/** The owner's choice after a conflict: keep the cloud copy, or overwrite it with this browser's. */
export async function resolveConflict(keep: "cloud" | "browser"): Promise<void> {
  if (!conflict) return;
  const c = conflict;
  if (keep === "cloud" && c.state) return adopt({ clientRev: c.clientRev, state: c.state, outbox: c.outbox });
  writeRev(c.clientRev);
  conflict = null;
  set({ phase: "on", message: "" });
  await push();
}

const hasActive = (s: AppState): boolean => s.items.some((i) => i.bid?.auto && !["stopped", "expired", "lost"].includes(i.bid.auto.progress.phase));

/** Run the autopilot now, for every authorized bid or one. Returns a message for the owner. */
export async function runAutopilotNow(opts: { itemId?: string; briefingOnly?: boolean } = {}): Promise<string> {
  if (status.running) return "Autopilot is already running.";
  set({ running: true });
  try {
    let msg: string;
    if (status.phase === "on") {
      await flushCloud();
      const r = await autopilotRunApi(opts);
      if (!r.ok) msg = r.error;
      else {
        receive(r.data.patches);
        msg = r.data.processed === 0 ? "Nothing needed doing." : `Checked ${r.data.processed} bid${r.data.processed === 1 ? "" : "s"}.`;
      }
    } else {
      const r = await autopilotRunApi({ ...opts, state: getState() });
      if (!r.ok) msg = r.error;
      else {
        applyServerPatches(r.data.patches);
        msg = r.data.processed === 0 ? "Nothing needed doing." : `Checked ${r.data.processed} bid${r.data.processed === 1 ? "" : "s"}.`;
      }
    }
    const at = new Date().toISOString();
    try {
      window.localStorage.setItem(RUN_KEY, at);
    } catch {
      /* ignore */
    }
    set({ lastRunAt: at, lastRunMessage: msg });
    return msg;
  } finally {
    set({ running: false });
  }
}

/** Called once when the console opens. Safe to call again. */
export function startCloud(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const last = window.localStorage.getItem(RUN_KEY);
    if (last) status = { ...status, lastRunAt: last };
  } catch {
    /* ignore */
  }
  onCommit(() => schedulePush());
  window.addEventListener("focus", () => void poll());
  setInterval(() => void poll(), 60_000);
  void init().then(() => {
    // Catch up on anything that needed doing while the console was closed, but not more than twice an hour.
    const last = status.lastRunAt ? Date.parse(status.lastRunAt) : 0;
    if ((status.phase === "on" || status.phase === "off") && hasActive(getState()) && Date.now() - last > AUTO_RUN_EVERY_MS) void runAutopilotNow();
  });
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => subs.delete(cb);
};
export const useCloud = (): CloudStatus => useSyncExternalStore(subscribe, () => status, () => status);
