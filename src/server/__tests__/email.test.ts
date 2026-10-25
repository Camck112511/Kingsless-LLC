import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailConfigured, sendEmail } from "../email/resend";

const mail = { to: "bids@county.gov", bcc: "owner@kingsless.org", replyTo: "owner@kingsless.org", subject: "Bid 26-1", text: "Please find our bid attached.", attachments: [{ filename: "Bid.pdf", data: new Uint8Array([1, 2, 3]) }] };
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("email sender", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("BID_EMAIL_FROM", "Kingsless LLC <bids@kingsless.org>");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is off until both settings exist", () => {
    expect(emailConfigured()).toBe(true);
    vi.stubEnv("BID_EMAIL_FROM", "");
    expect(emailConfigured()).toBe(false);
  });

  it("sends the packet with the right headers and body", async () => {
    const f = reply(200, { id: "msg_123" });
    const r = await sendEmail(mail, f);
    expect(r).toEqual({ ok: true, id: "msg_123" });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ from: "Kingsless LLC <bids@kingsless.org>", to: ["bids@county.gov"], bcc: ["owner@kingsless.org"], reply_to: "owner@kingsless.org", subject: "Bid 26-1" });
    expect(body.attachments).toEqual([{ filename: "Bid.pdf", content: "AQID" }]);
  });

  it("never claims success without a message id", async () => {
    const r = await sendEmail(mail, reply(200, {}));
    expect(r.ok).toBe(false);
  });

  it.each([
    [403, /refused|rejected/],
    [422, /could not accept/],
    [429, /rate limiting/],
    [500, /HTTP 500/],
  ])("explains a %i answer in plain language and reports it as not sent", async (status, text) => {
    const r = await sendEmail(mail, reply(status, { message: status === 422 ? "bad address" : undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(text);
  });

  it("reports a network failure as nothing sent", async () => {
    const r = await sendEmail(mail, vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, status: 502 });
    if (!r.ok) expect(r.error).toMatch(/Nothing was sent/);
  });

  it("refuses without configuration and never calls the network", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const f = reply(200, { id: "x" });
    const r = await sendEmail(mail, f);
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(f).not.toHaveBeenCalled();
  });
});
