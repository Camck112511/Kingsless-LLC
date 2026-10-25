import "server-only";
/**
 * Sends one email through Resend (https://resend.com/docs/api-reference/emails/send-email). Used only after the owner
 * typed SEND on a bid that passed the final check. RESEND_API_KEY authenticates; BID_EMAIL_FROM must be an address on a
 * domain verified in Resend (for example "Kingsless LLC <bids@kingsless.org>").
 *
 * NOTE: written from the public API reference; the build environment could not reach api.resend.com, so it is tested with
 * a stubbed fetch only. Send a test to yourself first.
 *
 * PROTECTED. See AGENTS.project.md.
 */
export interface OutboundEmail {
  to: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  subject: string;
  text: string;
  attachments: Array<{ filename: string; data: Uint8Array }>;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string; status: number };

export const emailConfigured = (): boolean => Boolean(process.env.RESEND_API_KEY && process.env.BID_EMAIL_FROM);

export async function sendEmail(mail: OutboundEmail, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.BID_EMAIL_FROM;
  if (!key || !from) return { ok: false, status: 503, error: "Email sending is not set up. Add RESEND_API_KEY and BID_EMAIL_FROM to the server environment." };

  let res: Response;
  try {
    res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        from,
        to: [mail.to],
        ...(mail.cc ? { cc: [mail.cc] } : {}),
        ...(mail.bcc ? { bcc: [mail.bcc] } : {}),
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        subject: mail.subject,
        text: mail.text,
        attachments: mail.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.data).toString("base64") })),
      }),
    });
  } catch {
    return { ok: false, status: 502, error: "Could not reach the email service. Nothing was sent." };
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (res.ok && body.id) return { ok: true, id: body.id };
  if (res.status === 401 || res.status === 403) return { ok: false, status: 502, error: body.message ? `The email service refused it: ${body.message}` : "The email service rejected the API key or the sending domain. Check RESEND_API_KEY and that BID_EMAIL_FROM uses a verified domain." };
  if (res.status === 422 || res.status === 400) return { ok: false, status: 400, error: body.message ? `The email service could not accept it: ${body.message}` : "The email service could not accept that message." };
  if (res.status === 429) return { ok: false, status: 429, error: "The email service is rate limiting. Wait a minute and try again." };
  return { ok: false, status: 502, error: `The email service returned HTTP ${res.status}. Nothing was confirmed sent.` };
}
