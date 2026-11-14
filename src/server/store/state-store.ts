import "server-only";
/**
 * Where the autopilot's copy of the owner's data lives, so it can work while the console is closed.
 *
 * One private JSON document in Vercel Blob (the owner's single admin account means one document is enough). The browser
 * stays the editor: it pushes its whole state, and the server's autopilot hands changes back as `outbox` patches that the
 * browser applies and acknowledges. Writes use the blob's ETag (`ifMatch`), so two writers can never silently overwrite
 * each other: the loser retries from the fresh copy.
 *
 * Without BLOB_READ_WRITE_TOKEN the store is "off" and the console keeps working from the browser alone. A memory store
 * exists for tests and local runs only (STATE_STORE=memory outside production).
 *
 * PROTECTED. See AGENTS.project.md.
 */
import type { AppState, Patch } from "@/lib/types";

export interface Stored {
  /** Counts the browser's own pushes. A mismatch means another browser pushed in between. */
  clientRev: number;
  savedAt: string;
  state: AppState;
  /** Changes made by the autopilot that the browser has not acknowledged yet. */
  outbox: Patch[];
  /** Set while an autopilot pass is running, so two passes never overlap. */
  lock: { until: string } | null;
}

export type PutResult = { ok: true; etag: string } | { ok: false; reason: "conflict" };

export interface StateStore {
  kind: "blob" | "memory";
  /** The stored document plus the version tag to hand back to put(). null = nothing stored yet. */
  get(): Promise<{ stored: Stored; etag: string } | null>;
  /** Writes only if nothing changed since `etag` (null = only if nothing exists). */
  put(next: Stored, etag: string | null): Promise<PutResult>;
}

const PATH = "kingsless/state.json";

class MemoryStore implements StateStore {
  kind = "memory" as const;
  private cur: { stored: Stored; etag: string } | null = null;
  private n = 0;
  async get() {
    return this.cur ? { stored: structuredClone(this.cur.stored), etag: this.cur.etag } : null;
  }
  async put(next: Stored, etag: string | null): Promise<PutResult> {
    if ((this.cur?.etag ?? null) !== etag) return { ok: false, reason: "conflict" };
    this.n += 1;
    this.cur = { stored: structuredClone(next), etag: `m${this.n}` };
    return { ok: true, etag: this.cur.etag };
  }
}

class BlobStore implements StateStore {
  kind = "blob" as const;
  async get() {
    const { get } = await import("@vercel/blob");
    const res = await get(PATH, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const text = await new Response(res.stream).text();
    return { stored: JSON.parse(text) as Stored, etag: res.blob.etag };
  }
  async put(next: Stored, etag: string | null): Promise<PutResult> {
    const { put, BlobPreconditionFailedError } = await import("@vercel/blob");
    try {
      const out = await put(PATH, JSON.stringify(next), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: etag !== null,
        ...(etag !== null ? { ifMatch: etag } : {}),
      });
      return { ok: true, etag: (out as { etag?: string }).etag ?? "" };
    } catch (err) {
      if (err instanceof BlobPreconditionFailedError) return { ok: false, reason: "conflict" };
      // Creating when it already exists is also a lost race.
      if (etag === null && err instanceof Error && /already exists/i.test(err.message)) return { ok: false, reason: "conflict" };
      throw err;
    }
  }
}

// Held on globalThis so every route bundle in a dev server shares one memory store.
const holder = globalThis as unknown as { __klMemoryStore?: MemoryStore | null };

/** The configured store, or null when background mode is not set up. */
export function getStore(): StateStore | null {
  if (process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) return new BlobStore();
  if (process.env.STATE_STORE === "memory" && process.env.NODE_ENV !== "production") return (holder.__klMemoryStore ??= new MemoryStore());
  return null;
}

/** Test hook: forget everything in the memory store. */
export function resetMemoryStore(): void {
  holder.__klMemoryStore = null;
}

export const cloudConfigured = (): boolean => getStore() !== null;

/**
 * Read-modify-write with retries on a lost race. `change` receives the freshest copy and returns the next one (or null
 * to leave it alone). Returns the stored result.
 */
export async function update(store: StateStore, change: (cur: Stored | null) => Stored | null | Promise<Stored | null>, tries = 4): Promise<Stored | null> {
  for (let i = 0; i < tries; i++) {
    const cur = await store.get();
    const next = await change(cur ? cur.stored : null);
    if (next === null) return cur ? cur.stored : null;
    const res = await store.put(next, cur ? cur.etag : null);
    if (res.ok) return next;
  }
  throw new Error("The cloud copy kept changing; try again.");
}
