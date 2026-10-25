import { canSend, isEmail, preflight } from "@/engine/bid";
import { prepareBid } from "@/server/bid-context";
import { adminGuard } from "@/server/auth";
import { buildPacketPdf } from "@/server/docs/package";
import { sendEmail } from "@/server/email/resend";
import { fail, ok, readJson } from "@/server/http";
import { BidSendRequestSchema } from "@/server/schemas";

export const maxDuration = 60;
const MAX_EXTRA_BYTES = 3_000_000;

/**
 * Emails the bid packet to the agency. The only action in the console that reaches an outside party, so it is guarded
 * three ways: the owner typed SEND, the engine's final check is re-run HERE (the browser's copy is never trusted), and
 * every blocking check must pass. PROTECTED.
 */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, BidSendRequestSchema, 6_000_000);
  if ("error" in body) return body.error;
  const { to, subject, message, attachments } = body.data;
  if (!isEmail(to)) return fail(400, "That is not a valid email address.");

  const { flow, pkg, label, settings } = prepareBid({ ...body.data, recipient: to });
  const checks = preflight(flow, "email", to);
  if (!canSend(checks)) {
    return fail(409, "The final check has not passed, so nothing was sent.", { failing: checks.filter((c) => c.blocking && !c.ok).map((c) => ({ id: c.id, label: c.label, detail: c.detail })) });
  }

  const extras = attachments.map((a) => ({ filename: a.filename.replace(/[\\/:*?"<>|\r\n]+/g, "-"), data: new Uint8Array(Buffer.from(a.contentBase64, "base64")) }));
  if (extras.reduce((s, a) => s + a.data.length, 0) > MAX_EXTRA_BYTES) return fail(413, "Attachments are over 3 MB in total. Send the larger files through the portal.");
  if (extras.some((a) => a.data.length === 0)) return fail(400, "An attachment was empty.");

  const packet = await buildPacketPdf(pkg, label);
  const owner = settings.contact.email.trim();
  const sent = await sendEmail({
    to: to.trim(),
    bcc: isEmail(owner) && owner.toLowerCase() !== to.trim().toLowerCase() ? owner : undefined,
    replyTo: isEmail(owner) ? owner : undefined,
    subject,
    text: message,
    attachments: [{ filename: packet.filename, data: packet.data }, ...extras],
  });
  if (!sent.ok) return fail(sent.status, sent.error);
  return ok({ id: sent.id, to: to.trim(), attachments: [packet.filename, ...extras.map((a) => a.filename)] });
}
