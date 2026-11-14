/**
 * Applies autopilot patches to the app state. Pure and idempotent: applying the same patch twice changes nothing, so the
 * browser, the server and a second device can all replay the same list safely. PROTECTED.
 */
import type { AutoEvent } from "@/engine/types";
import { MAX_EVENTS, type AppState, type Patch } from "./types";

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function addEvent(state: AppState, event: AutoEvent): AppState {
  if (state.events.some((e) => e.id === event.id)) return state;
  return { ...state, events: [...state.events, event].slice(-MAX_EVENTS) };
}

export function applyPatch(state: AppState, patch: Patch): AppState {
  switch (patch.kind) {
    case "event":
      return addEvent(state, patch.event);
    case "sub": {
      if (state.subcontractors.some((s) => s.id === patch.sub.id || norm(s.name) === norm(patch.sub.name))) return state;
      return { ...state, subcontractors: [...state.subcontractors, patch.sub] };
    }
    case "item": {
      const cur = state.items.find((i) => i.opportunity.id === patch.itemId);
      if (!cur) return state; // the owner removed it
      if (cur.updatedAt === patch.item.updatedAt) return state; // already applied
      if (cur.updatedAt !== patch.baseUpdatedAt) {
        // The owner edited this bid after the autopilot read it. Their edit wins; the next pass starts from it.
        return addEvent(state, {
          id: `skip-${patch.id}`,
          at: patch.at,
          itemId: patch.itemId,
          kind: "info",
          title: "Autopilot skipped an update",
          detail: "You changed this bid at the same moment. Your change was kept; autopilot will look again on its next pass.",
        });
      }
      return { ...state, items: state.items.map((i) => (i.opportunity.id === patch.itemId ? patch.item : i)) };
    }
  }
}

export function applyPatches(state: AppState, patches: Patch[]): AppState {
  return patches.reduce(applyPatch, state);
}
