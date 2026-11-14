"use client";
/**
 * Alerts that need no account and no key:
 *   - a desktop/phone notification from the browser (the owner allows it once), and
 *   - an optional push to the free ntfy app: install it, subscribe to the random topic shown in Settings, done.
 * Both fire from the owner's own browser while the console is open. The ntfy message is deliberately bare (what happened to
 * which bid, never an amount or a contact), because ntfy.sh is a public service and the topic name is the only secret.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import type { AutoEvent } from "@/engine/types";
import type { AppState } from "./types";

const TOPIC_KEY = "kingsless.ntfy.topic";
const WORTH_AN_ALERT = new Set<AutoEvent["kind"]>(["submitted", "needs-you", "ready", "won", "lost", "stopped", "error", "award"]);

export const getTopic = (): string => {
  try {
    return window.localStorage.getItem(TOPIC_KEY) ?? "";
  } catch {
    return "";
  }
};

/** A new unguessable topic name. */
export function newTopic(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const t = `kingsless-${[...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 18)}`;
  try {
    window.localStorage.setItem(TOPIC_KEY, t);
  } catch {
    /* ignore */
  }
  return t;
}

export function clearTopic(): void {
  try {
    window.localStorage.removeItem(TOPIC_KEY);
  } catch {
    /* ignore */
  }
}

export const alertPermission = (): NotificationPermission | "unsupported" => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

export async function requestAlertPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.requestPermission();
}

/** Strip dollar amounts: the push goes through a public service. */
export const stripAmounts = (s: string): string => s.replace(/\s*(?:for|at)\s+\$[\d,]+(?:\.\d+)?/gi, "").replace(/\$[\d,]+(?:\.\d+)?/g, "").replace(/\s{2,}/g, " ").trim();

async function push(title: string, body: string, urgent: boolean): Promise<boolean> {
  const topic = getTopic();
  if (!topic) return false;
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, { method: "POST", headers: { Title: "Kingsless", Priority: urgent ? "high" : "default" }, body: `${stripAmounts(title)}${body ? `\n${stripAmounts(body)}` : ""}`.slice(0, 400) });
    return res.ok;
  } catch {
    return false;
  }
}

export const sendTestAlert = (): Promise<boolean> => push("Test alert: this is how Kingsless will reach you.", "", false);

function show(e: AutoEvent): void {
  if (alertPermission() === "granted") {
    try {
      new Notification(`Kingsless: ${e.title}`, { body: e.detail.slice(0, 160), tag: e.id });
    } catch {
      /* some mobile browsers only allow notifications from a service worker */
    }
  }
  void push(e.title, "", e.kind === "won" || e.kind === "needs-you" || e.kind === "error");
}

let seen: Set<string> | null = null;

/** Call on every state change. The first call only records what already exists, so opening the console never replays old news. */
export function watchEvents(state: AppState): void {
  if (seen === null) {
    seen = new Set(state.events.map((e) => e.id));
    return;
  }
  for (const e of state.events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (WORTH_AN_ALERT.has(e.kind)) show(e);
  }
}
