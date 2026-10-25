import { buildWorkflow, canSend, preflight } from "@/engine/bid";
import { prepareBid } from "@/server/bid-context";
import { adminGuard } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { BidPlanRequestSchema } from "@/server/schemas";

/** The bid workspace's one read: analysis, the guided steps, the document drafts and both final checks. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, BidPlanRequestSchema, 4_000_000);
  if ("error" in body) return body.error;
  const { analysis, pkg, flow } = prepareBid(body.data);
  const { steps, currentId } = buildWorkflow(flow);
  const email = preflight(flow, "email", body.data.recipient);
  return ok({
    analysis,
    steps,
    currentId,
    documents: pkg.documents,
    placeholders: pkg.placeholders,
    digest: pkg.digest,
    checks: { email, portal: preflight(flow, "portal") },
    canSendEmail: canSend(email),
    emailConfigured: flow.emailConfigured,
  });
}
