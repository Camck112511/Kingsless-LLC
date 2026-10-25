import "server-only";
/** Builds everything the bid routes need from one request: the analysis, the document package and the workflow inputs. PROTECTED. */
import type { z } from "zod";
import { analyze } from "@/engine/analyze";
import type { FlowInput } from "@/engine/bid";
import { buildBidPackage } from "@/engine/bid-docs";
import { emptyBid } from "@/engine/config";
import { emailConfigured } from "./email/resend";
import { resolveToday, type BidPlanRequestSchema } from "./schemas";

export function prepareBid(data: z.infer<typeof BidPlanRequestSchema>) {
  const today = resolveToday(data.today);
  const { settings, subcontractors } = data;
  const { opportunity: opp, inputs } = data.item;
  const bid = data.item.bid ?? emptyBid();
  const quotes = data.quotes.filter((q) => q.opportunityId === opp.id);
  const analysis = analyze({ opportunity: opp, inputs }, { settings, subcontractors, quotes, today });
  const pkg = buildBidPackage({ opp, analysis, inputs, bid, settings, today });
  const flow: FlowInput = { opp, analysis, inputs, bid, settings, pkg, emailConfigured: emailConfigured() };
  const label = `${settings.contact.companyName.trim() || "Bid"} ${opp.solicitationNumber.trim() || opp.title}`.slice(0, 60);
  return { today, analysis, pkg, flow, label, settings, opp, bid };
}
