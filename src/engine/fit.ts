/**
 * Business fit: does this listing match the work, credentials, size, timing and place YOU chose?
 *
 * Fit is ADVISORY. It orders the pipeline and words the recommendation; it can never turn a failed or unproven gate
 * into a pass, and a high score on a rejected listing is still a rejection (see recommend()).
 *
 * PROTECTED engine file.
 */
import { RULES } from "./config";
import { checkLocation } from "./locations";
import type { Fit, FitFactor, FitFactorId, FitOutcome, Opportunity, Recommendation, Settings, Verdict } from "./types";
import { daysBetween, isIsoDate, usd } from "./util";

const W = RULES.fit.weights;
const CREDIT = RULES.fit.credit;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Word-prefix match: "landscap" finds "landscaping"; "grading" does not match "upgrading". */
export function hasWord(text: string, word: string): boolean {
  const w = word.trim();
  if (!w) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRe(w.toLowerCase())}`, "i").test(text);
}

const digits = (s: string): string => s.replace(/\D/g, "");

function factor(id: FitFactorId, label: string, outcome: FitOutcome, detail: string): FitFactor {
  const max = W[id];
  return { id, label, max, earned: Math.round(max * CREDIT[outcome] * 100) / 100, outcome, detail };
}

/** Combine several sub-checks: the factor's outcome is the average credit, reported with the worst note. */
function average(id: FitFactorId, label: string, parts: Array<{ outcome: FitOutcome; detail: string }>): FitFactor | null {
  if (parts.length === 0) return null;
  const credit = parts.reduce((s, p) => s + CREDIT[p.outcome], 0) / parts.length;
  const max = W[id];
  const outcome: FitOutcome = credit >= 0.95 ? "match" : credit >= 0.55 ? "partial" : credit >= 0.3 ? "unknown" : "miss";
  return { id, label, max, earned: Math.round(max * credit * 100) / 100, outcome, detail: parts.map((p) => p.detail).join(" ") };
}

/* -------------------------------- service match -------------------------------- */

function serviceFactor(opp: Opportunity, settings: Settings): { factor: FitFactor | null; excluded: boolean; avoidHit: string | null } {
  const t = settings.targeting;
  const text = `${opp.title} ${opp.scope}`.toLowerCase();
  const avoidHit = t.avoidKeywords.find((k) => hasWord(text, k)) ?? null;
  const wants = t.naics.length + t.keywords.length + t.categories.length > 0;
  if (!wants) return { factor: null, excluded: avoidHit !== null, avoidHit };

  if (avoidHit) {
    return { factor: factor("service", "Work you want", "miss", `Matches a word on your avoid list: "${avoidHit}".`), excluded: true, avoidHit };
  }

  const hits: Array<{ outcome: FitOutcome; detail: string }> = [];
  const naics = digits(opp.naics ?? "");
  if (naics && t.naics.length > 0) {
    const targets = t.naics.map(digits).filter(Boolean);
    if (targets.some((n) => naics.startsWith(n))) hits.push({ outcome: "match", detail: `NAICS ${naics} is one you target.` });
    else if (naics.length >= 3 && targets.some((n) => n.startsWith(naics))) hits.push({ outcome: "partial", detail: `NAICS ${naics} is in the same family as one you target.` });
  }
  if (t.categories.length > 0 && opp.category !== "unknown" && t.categories.includes(opp.category)) {
    hits.push({ outcome: "match", detail: `It is ${opp.category.replace(/-/g, " ")} work, a category you chose.` });
  }
  const found = t.keywords.filter((k) => hasWord(text, k));
  if (found.length >= 2) hits.push({ outcome: "match", detail: `Mentions ${found.map((k) => `"${k}"`).join(", ")}.` });
  else if (found.length === 1) hits.push({ outcome: "partial", detail: `Mentions "${found[0]}".` });

  if (hits.length > 0) {
    const best = hits.find((h) => h.outcome === "match") ?? hits[0]!;
    return { factor: factor("service", "Work you want", best.outcome, hits.map((h) => h.detail).join(" ")), excluded: false, avoidHit };
  }
  // Nothing matched. If the listing says very little about itself, we cannot call that a miss.
  const thin = !naics && opp.category === "unknown" && opp.scope.trim().length < 80;
  return {
    factor: thin
      ? factor("service", "Work you want", "unknown", "The listing says too little to tell whether it is the work you want.")
      : factor("service", "Work you want", "miss", "Nothing in the listing matches the services, codes or categories you target."),
    excluded: false,
    avoidHit,
  };
}

/* ---------------------------------- credentials --------------------------------- */

function credentialsFactor(opp: Opportunity, settings: Settings): FitFactor | null {
  const t = opp.terms;
  const p = settings.profile;
  const parts: Array<{ outcome: FitOutcome; detail: string }> = [];

  if (t.licensingRequired === "yes") {
    parts.push(
      p.licenses.length > 0
        ? { outcome: "match", detail: `A license is required and you list ${p.licenses.length}.` }
        : { outcome: "partial", detail: "A license is required and you list none (a licensed sub may satisfy it; confirm)." },
    );
  } else if (t.licensingRequired === "no") {
    parts.push({ outcome: "match", detail: "No license required." });
  } else if (RULES.licenseRisk[opp.category as keyof typeof RULES.licenseRisk]) {
    parts.push({ outcome: "unknown", detail: "This kind of work is often licensed; the listing does not say." });
  }

  switch (t.setAside) {
    case "none":
      parts.push({ outcome: "match", detail: "Open competition." });
      break;
    case "small-business":
      parts.push(p.smallBusiness ? { outcome: "match", detail: "Small-business set-aside; you qualify." } : { outcome: "miss", detail: "Small-business set-aside; you are not a small business." });
      break;
    case "unknown":
      break;
    default:
      parts.push(p.certifications.includes(t.setAside) ? { outcome: "match", detail: `${t.setAside.toUpperCase()} set-aside; you hold it.` } : { outcome: "miss", detail: `${t.setAside.toUpperCase()} set-aside; you do not hold it.` });
  }

  if (t.pastPerformance === "required") {
    parts.push(p.pastPerformanceCount > 0 ? { outcome: "match", detail: "Past performance is required and you can cite some." } : { outcome: "miss", detail: "Past performance is required and you have none yet." });
  } else if (t.pastPerformance === "scored" && p.pastPerformanceCount === 0) {
    parts.push({ outcome: "partial", detail: "Past performance is scored and you have none yet." });
  }

  if (t.minYearsExperience !== null) {
    parts.push(p.yearsInBusiness >= t.minYearsExperience ? { outcome: "match", detail: `Experience requirement (${t.minYearsExperience} yrs) met.` } : { outcome: "miss", detail: `Needs ${t.minYearsExperience} years in business; you have ${p.yearsInBusiness}.` });
  }

  // Each "miss" here is something that stops the prime qualifying at all, so one miss is a miss.
  if (parts.some((p) => p.outcome === "miss")) return factor("credentials", "Licenses and credentials", "miss", parts.map((p) => p.detail).join(" "));
  return average("credentials", "Licenses and credentials", parts);
}

/* ------------------------------------ size ------------------------------------- */

function sizeFactor(opp: Opportunity, settings: Settings): FitFactor | null {
  const { minValueUsd: lo, maxValueUsd: hi } = settings.targeting;
  if (lo === null && hi === null) return null;
  const { low, high } = opp.valueEstimate;
  const mid = low !== null && high !== null ? (low + high) / 2 : (high ?? low);
  if (mid === null) return factor("size", "Contract size", "unknown", "The listing does not state a value.");
  const range = `${lo !== null ? usd(lo) : "any"} to ${hi !== null ? usd(hi) : "any"}`;
  if ((lo !== null && mid < lo) || (hi !== null && mid > hi)) return factor("size", "Contract size", "miss", `About ${usd(mid)} is outside your range (${range}).`);
  return factor("size", "Contract size", "match", `About ${usd(mid)} is inside your range (${range}).`);
}

/* ---------------------------------- timeframe ---------------------------------- */

function timeframeFactor(opp: Opportunity, settings: Settings, today: string): FitFactor | null {
  const t = settings.targeting;
  const parts: Array<{ outcome: FitOutcome; detail: string }> = [];
  if (isIsoDate(opp.dueDate)) {
    const days = daysBetween(today, opp.dueDate);
    if (days < settings.minDaysToDeadline) {
      parts.push({ outcome: "miss", detail: days < 0 ? "The due date has passed." : `Only ${days} day(s) left; you need ${settings.minDaysToDeadline}.` });
    } else if (t.maxDaysUntilDue !== null && days > t.maxDaysUntilDue) {
      parts.push({ outcome: "partial", detail: `Due in ${days} days, later than the ${t.maxDaysUntilDue}-day window you prefer.` });
    } else {
      parts.push({ outcome: "match", detail: `${days} days to prepare.` });
    }
  } else {
    parts.push({ outcome: "unknown", detail: "No due date recorded." });
  }
  if (t.maxDurationDays !== null && opp.durationDays !== null) {
    parts.push(
      opp.durationDays > t.maxDurationDays
        ? { outcome: "miss", detail: `Performance runs about ${opp.durationDays} days; your limit is ${t.maxDurationDays}.` }
        : { outcome: "match", detail: `Performance runs about ${opp.durationDays} days.` },
    );
  }
  return average("timeframe", "Timing", parts);
}

/* ---------------------------------- location ----------------------------------- */

function locationFactor(opp: Opportunity, settings: Settings): FitFactor | null {
  const area = settings.serviceArea;
  if (area.scope === "anywhere" || (area.states.length === 0 && area.places.length === 0)) return null;
  const m = checkLocation(opp.location, area);
  return factor("location", "Where the work is", m.status === "pass" ? "match" : m.status === "fail" ? "miss" : "unknown", m.detail);
}

/* ------------------------------------- fit -------------------------------------- */

export function scoreFit(opp: Opportunity, settings: Settings, today: string): Fit {
  const t = settings.targeting;
  const svc = serviceFactor(opp, settings);
  const factors = [svc.factor, credentialsFactor(opp, settings), sizeFactor(opp, settings), timeframeFactor(opp, settings, today), locationFactor(opp, settings)].filter(
    (f): f is FitFactor => f !== null,
  );
  const max = factors.reduce((s, f) => s + f.max, 0);
  const earned = factors.reduce((s, f) => s + f.earned, 0);
  const score = max > 0 ? Math.round((earned / max) * 100) : 0;
  const configured =
    t.naics.length + t.keywords.length + t.avoidKeywords.length + t.categories.length > 0 ||
    t.minValueUsd !== null ||
    t.maxValueUsd !== null ||
    settings.serviceArea.scope === "selected";

  const strong = factors.filter((f) => f.outcome === "match").map((f) => f.label.toLowerCase());
  const weak = factors.filter((f) => f.outcome === "miss").map((f) => f.label.toLowerCase());
  const summary = !configured
    ? "No targets set yet. Tell the console what work, size and place you want in Settings so it can rank by fit."
    : svc.excluded
      ? `Matches your avoid list ("${svc.avoidHit}").`
      : `${score}/100.${strong.length ? ` Strong on ${strong.join(", ")}.` : ""}${weak.length ? ` Weak on ${weak.join(", ")}.` : ""}`;
  return { score, configured, excluded: svc.excluded, factors, summary };
}

/* ------------------------------- recommendation -------------------------------- */

/**
 * The only place a listing becomes "recommended". Order of precedence:
 *   1. A failed gate  -> not recommended, whatever the fit.
 *   2. Avoid list     -> not recommended.
 *   3. An unproven gate -> research first (never recommended; fit only sets its priority).
 *   4. Every gate passes -> tier by fit.
 */
export function recommend(verdict: Verdict, verdictReason: string, fit: Fit): Recommendation {
  if (verdict === "reject") {
    return { tier: "not-recommended", headline: "Do not bid", reasons: [verdictReason] };
  }
  if (fit.excluded) {
    return { tier: "not-recommended", headline: "Not the work you want", reasons: [fit.summary] };
  }
  if (verdict === "investigate") {
    const promising = fit.configured && fit.score >= RULES.fit.recommended;
    return {
      tier: "research-first",
      headline: promising ? "Promising, but not provable yet" : "Research first, low priority",
      reasons: [verdictReason, fit.configured ? `Business fit ${fit.score}/100.` : fit.summary],
    };
  }
  const proof = verdict === "bid-ready" ? "Every rule is proven and a subcontractor has quoted." : "Every rule is proven; firm subcontractor quotes are the next step.";
  if (!fit.configured) {
    // No targets set: nothing to rank by except the proof itself.
    return { tier: verdict === "bid-ready" ? "top-pick" : "recommended", headline: verdict === "bid-ready" ? "Top pick" : "Recommended", reasons: [proof, fit.summary] };
  }
  if (fit.score >= RULES.fit.topPick) return { tier: "top-pick", headline: "Top pick", reasons: [proof, `Strong business fit (${fit.score}/100).`] };
  if (fit.score >= RULES.fit.recommended) return { tier: "recommended", headline: "Recommended", reasons: [proof, `Good business fit (${fit.score}/100).`] };
  return {
    tier: "consider",
    headline: "Qualifies, but a weaker fit",
    reasons: [proof, `Business fit ${fit.score}/100.`],
  };
}
