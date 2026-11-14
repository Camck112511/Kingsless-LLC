/**
 * Shapes shared by the browser store and the server (autopilot, cloud sync). No side effects here, so both can import it.
 * PROTECTED. See AGENTS.project.md.
 */
import type { AutoEvent, BidRecord, Inputs, Opportunity, Quote, Settings, Subcontractor } from "@/engine/types";
import type { ReviewResult } from "@/server/ai/review";

export type PipelineStatus = "new" | "watching" | "quotes-requested" | "approved" | "bid-submitted" | "won" | "lost" | "passed";

export interface PipelineItem {
  opportunity: Opportunity;
  inputs: Inputs;
  status: PipelineStatus;
  notes: string;
  addedAt: string;
  updatedAt: string;
  /** Latest AI second opinion, kept so it survives navigation. Advisory only. */
  aiReview?: ReviewResult | null;
  /** Everything about the bid you are preparing: your wording, the submission, the result, the autopilot's state. */
  bid?: BidRecord;
}

export interface AppState {
  version: 1;
  settings: Settings;
  items: PipelineItem[];
  subcontractors: Subcontractor[];
  quotes: Quote[];
  /** Autopilot activity log, newest last. Capped. */
  events: AutoEvent[];
  /** Global stop: while true, autopilot does nothing for any bid. */
  autopilotPaused: boolean;
}

/**
 * A change the server's autopilot wants the browser to apply. The browser's own state always wins on conflict: an item
 * patch applies only if the bid has not been edited since the autopilot read it.
 */
export type Patch =
  | { id: string; at: string; kind: "item"; itemId: string; baseUpdatedAt: string; item: PipelineItem }
  | { id: string; at: string; kind: "sub"; sub: Subcontractor }
  | { id: string; at: string; kind: "event"; event: AutoEvent };

export const MAX_EVENTS = 300;
