import { calcPricing, marginFromMarkup, markupFromMargin } from "@/engine";
import { adminGuard } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { PricingRequestSchema } from "@/server/schemas";

/** The owner's pricing calculator. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, PricingRequestSchema, 10_000);
  if ("error" in body) return body.error;
  const { contractValueUsd, subPriceUsd, otherCostsUsd } = body.data;
  const pricing = calcPricing(contractValueUsd, subPriceUsd, otherCostsUsd);
  return ok({
    pricing,
    // the same profit shown both ways, so margin is never mistaken for markup
    marginAsMarkup: pricing.netMarginRate < 1 ? markupFromMargin(pricing.netMarginRate) : null,
    markupAsMargin: marginFromMarkup(pricing.markupOnCostRate),
  });
}
