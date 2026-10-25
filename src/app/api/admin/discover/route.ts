import { z } from "zod";
import { adminGuard } from "@/server/auth";
import { fail, ok, readJson } from "@/server/http";
import { DiscoverRequestSchema } from "@/server/schemas";
import { discoverFromSam, SourceError } from "@/server/sources/sam";

const Schema = DiscoverRequestSchema.extend({ kind: z.enum(["solicitations", "awards"]).default("solicitations") });

/** Live federal discovery from SAM.gov. One API call per request. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, Schema, 10_000);
  if ("error" in body) return body.error;
  try {
    const result = await discoverFromSam(body.data, process.env.SAM_GOV_API_KEY, new Date().toISOString().slice(0, 10), body.data.serviceArea);
    return ok(result);
  } catch (err) {
    if (err instanceof SourceError) return fail(err.status, err.message);
    return fail(500, "Discovery failed.");
  }
}
