import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

export const noStore = { "Cache-Control": "no-store" } as const;

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: noStore });

export const ok = <T>(body: T, init: ResponseInit = {}) =>
  NextResponse.json(body, { ...init, headers: { ...noStore, ...(init.headers ?? {}) } });

/** Read, size-limit and validate a JSON body. Returns the parsed value or a ready-to-send error response. */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = 4_000_000,
): Promise<{ data: z.infer<S> } | { error: NextResponse }> {
  const text = await request.text();
  if (text.length > maxBytes) return { error: fail(413, "Request too large.") };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: fail(400, "Body is not valid JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: fail(400, `Invalid request: ${issue?.path.join(".") || "body"} ${issue?.message ?? ""}`.trim()) };
  }
  return { data: parsed.data };
}
