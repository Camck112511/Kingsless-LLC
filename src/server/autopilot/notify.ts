import "server-only";
/** Emails the owner about what the autopilot did. Only ever to the owner's own address. PROTECTED. */
import { isEmail } from "@/engine";
import type { Settings, WinBriefing } from "@/engine/types";
import { emailConfigured, sendEmail } from "../email/resend";

const usd = (n: number | null): string => (n === null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);

export const consoleUrl = (itemId: string): string => `${(process.env.NEXT_PUBLIC_SITE_URL || "https://kingsless.com").replace(/\/$/, "")}/admin/opportunities/${encodeURIComponent(itemId)}/bid`;

/** Sends one plain email to the owner. Returns false (and sends nothing) if email is not set up or the owner's address is missing. */
export async function notifyOwner(settings: Settings, subject: string, text: string): Promise<boolean> {
  const to = settings.contact.email.trim();
  if (!emailConfigured() || !isEmail(to)) return false;
  const r = await sendEmail({ to, subject: `[Kingsless] ${subject}`.slice(0, 200), text, attachments: [] });
  return r.ok;
}

/** The email that tells the owner a bid was won, with who to sell it to. */
export function winEmail(b: WinBriefing, itemId: string): { subject: string; text: string } {
  const top = b.subs.slice(0, 5);
  return {
    subject: b.headline,
    text: [
      b.headline,
      "",
      ...b.contract.map(([k, v]) => `${k}: ${v}`),
      "",
      "WHAT TO OFFER A SUBCONTRACTOR",
      `Open at ${usd(b.offer.openingOfferUsd)} (your profit about ${usd(b.offer.profitAtOpeningUsd)}). Never pay more than ${usd(b.offer.maxSubPriceUsd)} (profit about ${usd(b.offer.profitAtMaxUsd)}). Do not tell them what the agency pays.`,
      "",
      top.length ? "RECOMMENDED SUBCONTRACTORS, BEST FIRST" : "No subcontractors found yet: open the console and run Research subcontractors.",
      ...top.flatMap((s, i) => [`${i + 1}. ${s.name} (${s.label === "lead" ? "lead, unverified" : s.label.replace("-", " ")}, score ${s.score})`, `   ${s.reasons.slice(0, 2).join("; ")}`, ...(s.contact ? [`   ${s.contact.replace(/\n/g, " · ")}`] : [])]),
      "",
      "WHAT YOU NOW OWE",
      ...b.obligations.map((o) => `- ${o}`),
      "",
      "BIGGEST RISKS",
      ...b.risks.slice(0, 4).map((r) => `- ${r}`),
      "",
      `Full briefing, ranked list and a ready-to-send offer message: ${consoleUrl(itemId)}`,
    ].join("\n"),
  };
}
