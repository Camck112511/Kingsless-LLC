/**
 * Rule-based reader for solicitation text. Deterministic, offline, and the baseline the AI reader is checked against.
 *
 * Every fact it reports carries the sentence it came from (`evidence`) so a human can verify it in seconds.
 * It reports only what the text says; silence means "unknown", never "no".
 *
 * PROTECTED engine file.
 */
import { EMPTY_TERMS } from "./config";
import type { PaymentKind, SetAside, Subcontracting, TermKey, Terms, Tri } from "./types";
import { unique } from "./util";

export type TermsPatch = Partial<Omit<Terms, "evidence">> & { evidence?: Partial<Record<TermKey, string[]>> };

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const PCT = String.raw`(\d{1,3}(?:\.\d+)?)\s?(?:%|percent)`;

export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?;])\s+|\n+|\s•\s|\s-\s(?=[A-Z])/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 3);
}

const clip = (s: string): string => (s.length > 360 ? `${s.slice(0, 357)}...` : s);

function toNumber(token: string): number | null {
  const lower = token.toLowerCase();
  if (lower in NUMBER_WORDS) return NUMBER_WORDS[lower] ?? null;
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

/** Parse "October 22, 2026" or "10/22/2026" into 2026-10-22. */
export function parseDate(s: string): string | null {
  const slash = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slash) {
    const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]);
    return `${year}-${String(slash[1]).padStart(2, "0")}-${String(slash[2]).padStart(2, "0")}`;
  }
  const named = s.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
  if (named) {
    const month = MONTHS.indexOf((named[1] ?? "").toLowerCase()) + 1;
    return `${named[3]}-${String(month).padStart(2, "0")}-${String(named[2]).padStart(2, "0")}`;
  }
  return null;
}

const PROHIBIT: RegExp[] = [
  /\b(?:intermediar(?:y|ies)|brokers?|resellers?|middlem[ae]n)\b.{0,80}?\b(?:not\s+(?:be\s+)?(?:permitted|allowed|accepted|considered|eligible)|prohibited|will\s+not\s+be\s+(?:accepted|considered|permitted))/i,
  /\bsub-?contract\w*\b.{0,80}?\b(?:not\s+(?:be\s+)?(?:permitted|allowed|authorized|acceptable)|prohibited|forbidden)/i,
  /\b(?:shall|must|may|will|can)\s+not\s+(?:be\s+)?(?:sub-?contract|sub-?let|assign(?:ed)?\s+or\s+sub-?contract)/i,
  /\bno\s+sub-?contract(?:ing|ors)?\b/i,
  /\b(?:must|shall)\s+be\s+performed\s+(?:solely\s+|entirely\s+)?by\s+(?:the\s+)?(?:contractor|offeror|proposer|vendor|prime)(?:'s)?\s+(?:own\s+)?(?:employees|personnel|forces|workforce)/i,
  /\b(?:contractor|offeror|vendor|proposer)\s+(?:shall|must)\s+perform\s+(?:all|100\s?%|the\s+entire)\b/i,
];

const CONDITIONAL = /\b(?:without|unless|except|absent)\b.{0,40}?\b(?:approval|consent|permission|written|authorization)|\bprior\s+(?:written\s+)?(?:approval|consent)/i;

const ALLOW: RegExp[] = [
  /\b(?:may|can|is\s+permitted\s+to|are\s+permitted\s+to|is\s+allowed\s+to|are\s+allowed\s+to|allowed\s+to)\s+(?:use\s+|utilize\s+|engage\s+|hire\s+|employ\s+)?(?:qualified\s+|licensed\s+)?sub-?contract/i,
  /\bsub-?contract(?:ing|ors?)?\b.{0,40}?\b(?:is|are|will\s+be)\s+(?:permitted|allowed|acceptable|authorized)/i,
];

const CAP_PATTERNS: Array<{ re: RegExp; kind: "max-sub" | "min-prime" }> = [
  { re: new RegExp(String.raw`\b(?:not|never)\s+(?:pay|subcontract)\b.{0,80}?(?:more\s+than|in\s+excess\s+of|exceed)\s+${PCT}`, "i"), kind: "max-sub" },
  { re: new RegExp(String.raw`(?:no\s+more\s+than|not\s+(?:to\s+)?exceed|up\s+to|maximum\s+of)\s+${PCT}.{0,60}?sub-?contract`, "i"), kind: "max-sub" },
  { re: new RegExp(String.raw`(?:at\s+least|no\s+less\s+than|not\s+less\s+than|minimum\s+of)\s+${PCT}\s+of\s+.{0,80}?(?:perform|incurred|(?:by|with)\s+(?:its|the\s+prime|the\s+offeror|the\s+contractor|own))`, "i"), kind: "min-prime" },
  { re: new RegExp(String.raw`\bperform\w*\b.{0,40}?(?:at\s+least|no\s+less\s+than|not\s+less\s+than|minimum\s+of)\s+${PCT}`, "i"), kind: "min-prime" },
];

function setAsideOf(sentence: string): SetAside | null {
  if (!/set[- ]?aside|reserved\s+for|restricted\s+to|limited\s+to/i.test(sentence)) {
    return /full\s+and\s+open|unrestricted/i.test(sentence) ? "none" : null;
  }
  if (/\bno\s+set[- ]?aside|not\s+(?:a\s+)?set[- ]?aside|full\s+and\s+open/i.test(sentence)) return "none";
  if (/8\s?\(a\)/i.test(sentence)) return "8a";
  if (/service[- ]disabled\s+veteran|SDVOSB/i.test(sentence)) return "sdvosb";
  if (/women[- ]owned|WOSB/i.test(sentence)) return "wosb";
  if (/HUBZone/i.test(sentence)) return "hubzone";
  if (/small\s+business/i.test(sentence)) return "small-business";
  return null;
}

/** Extract everything the rules can find. `patch.evidence` maps each reported field to its source sentences. */
export function extractTerms(text: string): TermsPatch {
  const sentences = splitSentences(text);
  const patch: TermsPatch = {};
  const evidence: Partial<Record<TermKey, string[]>> = {};
  const note = (key: TermKey, s: string) => {
    evidence[key] = unique([...(evidence[key] ?? []), clip(s)]);
  };

  /* ---- subcontracting ---- */
  let prohibited = false;
  let limited = false;
  let allowed = false;
  let cap: number | null = null;
  for (const s of sentences) {
    const hardNo = PROHIBIT.some((re) => re.test(s));
    if (hardNo && CONDITIONAL.test(s)) {
      limited = true;
      note("subcontracting", s);
    } else if (hardNo) {
      prohibited = true;
      note("subcontracting", s);
    }
    if (/limitations?\s+on\s+sub-?contracting|52\.219-14|13\s+CFR\s+125\.6/i.test(s)) {
      limited = true;
      note("subcontracting", s);
    }
    for (const { re, kind } of CAP_PATTERNS) {
      const m = s.match(re);
      if (m?.[1]) {
        const x = Number(m[1]) / 100;
        const candidate = kind === "max-sub" ? x : 1 - x;
        if (x > 0 && x <= 1) {
          cap = cap === null ? candidate : Math.min(cap, candidate);
          limited = true;
          note("subcontracting", s);
          note("subcontractShareCap", s);
        }
      }
    }
    if (ALLOW.some((re) => re.test(s))) {
      allowed = true;
      note("subcontracting", s);
    }
  }
  const sub: Subcontracting = prohibited ? "prohibited" : limited ? "limited" : allowed ? "allowed" : "unknown";
  if (sub !== "unknown") patch.subcontracting = sub;
  if (cap !== null && !prohibited) patch.subcontractShareCap = Math.round(cap * 1000) / 1000;

  /* ---- set-aside ---- */
  for (const s of sentences) {
    const sa = setAsideOf(s);
    if (sa) {
      patch.setAside = sa;
      note("setAside", s);
      break;
    }
  }

  /* ---- payment ---- */
  let netDays: number | null = null;
  let kind: PaymentKind = "unknown";
  let cycle: number | null = null;
  for (const s of sentences) {
    const ret = s.match(new RegExp(String.raw`retain(?:age|ed|ing)?\b.{0,80}?${PCT}`, "i")) ?? s.match(new RegExp(String.raw`${PCT}\s+(?:of\s+.{0,40}?)?retain(?:age|ed)`, "i"));
    if (ret?.[1] && patch.retainageRate === undefined) {
      patch.retainageRate = Number(ret[1]) / 100;
      note("retainageRate", s);
    }
    const acc = s.match(/(?:accept|review|inspect)\w*\b.{0,60}?within\s+(\d{1,3})\s*(?:calendar\s+|business\s+)?days/i);
    if (acc?.[1] && patch.acceptanceDays === undefined) {
      patch.acceptanceDays = Number(acc[1]);
      note("acceptanceDays", s);
    }

    const paymentish = /pay(?:ment|s|ed)?|invoice|remit/i.test(s);
    if (!paymentish) continue;
    const n1 = s.match(/\bnet\s*[- ]?(\d{1,3})\b/i);
    const n2 = s.match(/(?:payment|pay|paid|invoices?)\b.{0,80}?within\s+(\d{1,3})\s*(?:calendar\s+|business\s+)?days/i);
    const n3 = s.match(/(\d{1,3})\s*(?:calendar\s+)?days\s+(?:after|from|following)\s+(?:the\s+)?(?:date\s+of\s+)?(?:receipt\s+of\s+(?:a\s+)?(?:proper\s+|correct\s+|valid\s+)?invoice|invoice|acceptance|approval|delivery)/i);
    const found = n1?.[1] ?? n2?.[1] ?? n3?.[1];
    if (found && netDays === null) {
      netDays = Number(found);
      note("paymentNetDays", s);
    }
    if (/milestone/i.test(s)) {
      kind = "milestone";
      note("paymentKind", s);
    } else if (/progress\s+payments?|monthly\s+invoic|invoices?\s+(?:will\s+be\s+|shall\s+be\s+)?(?:submitted\s+|issued\s+)?monthly|bi-?weekly\s+invoic|recurring\s+(?:invoice|payment)/i.test(s)) {
      kind = "progress";
      cycle = /bi-?weekly/i.test(s) ? 14 : /weekly/i.test(s) ? 7 : 30;
      note("paymentKind", s);
    } else if (kind === "unknown" && /(?:upon|after|following)\s+(?:final\s+|formal\s+)?(?:written\s+)?(?:acceptance|approval)\b/i.test(s)) {
      kind = "after-acceptance";
      note("paymentKind", s);
    }
  }
  if (netDays !== null) {
    patch.paymentNetDays = netDays;
    if (kind === "unknown") {
      kind = "net-after-invoice";
      note("paymentKind", (evidence.paymentNetDays ?? [])[0] ?? "");
    }
  }
  if (kind !== "unknown") patch.paymentKind = kind;
  if (cycle !== null) patch.invoiceCycleDays = cycle;

  /* ---- bonds ---- */
  const bondFlag = (key: "bidBond" | "performanceBond" | "paymentBond", value: Tri, s: string) => {
    const prior = patch[key];
    // "yes" is the stricter reading; never let a later "no" erase an earlier "yes".
    if (prior === "yes" && value === "no") return;
    patch[key] = value;
    note(key, s);
  };
  for (const s of sentences) {
    if (!/\bbond|surety|bid\s+security/i.test(s)) continue;
    const negated = /not\s+required|no\s+(?:bid|performance|payment)\s+bond|not\s+needed|waived|is\s+not\s+necessary/i.test(s);
    const required = /required|shall|must|submit|furnish|provide|accompanied|bid\s+security\s+of|will\s+be\s+required/i.test(s);
    const value: Tri = negated ? "no" : required ? "yes" : "unknown";
    if (value === "unknown") continue;
    if (/bid\s+(?:bond|security|guarantee)/i.test(s)) bondFlag("bidBond", value, s);
    if (/performance\s+(?:and\s+payment\s+)?(?:bond|security)/i.test(s)) bondFlag("performanceBond", value, s);
    if (/payment\s+bond|performance\s+and\s+payment\s+bond|labor\s+and\s+material/i.test(s)) bondFlag("paymentBond", value, s);
  }

  /* ---- insurance ---- */
  let maxLimit = 0;
  for (const s of sentences) {
    if (!/insurance|general\s+liability|workers['’]?\s+comp|certificate\s+of\s+insurance/i.test(s)) continue;
    const negated = /no\s+insurance\s+(?:is\s+)?required|insurance\s+is\s+not\s+required/i.test(s);
    if (negated) {
      if (patch.insuranceRequired === undefined) {
        patch.insuranceRequired = "no";
        note("insuranceRequired", s);
      }
      continue;
    }
    if (/require|shall|must|provide|maintain|carry|submit|evidence\s+of|certificate|substantial/i.test(s)) {
      patch.insuranceRequired = "yes";
      note("insuranceRequired", s);
    }
    for (const m of s.matchAll(/\$\s?([\d,]+(?:\.\d+)?)\s*(million|m\b)?/gi)) {
      let amount = Number((m[1] ?? "").replace(/,/g, ""));
      if (m[2]) amount *= 1_000_000;
      if (Number.isFinite(amount) && amount >= 10_000 && /per\s+occurrence|aggregate|each\s+(?:occurrence|claim)|limit|coverage|liability/i.test(s)) {
        maxLimit = Math.max(maxLimit, amount);
        note("insuranceMinLimitUsd", s);
      }
    }
  }
  if (maxLimit > 0) {
    patch.insuranceMinLimitUsd = maxLimit;
    patch.insuranceRequired = "yes";
  }

  /* ---- past performance / experience ---- */
  let ppRequired = false;
  let ppScored = false;
  for (const s of sentences) {
    if (/past\s+performance|prior\s+experience|relevant\s+experience|similar\s+(?:projects|contracts|products)|references/i.test(s)) {
      if (/score|scored|evaluat|points|criteria|weight|rated/i.test(s)) {
        ppScored = true;
        note("pastPerformance", s);
      } else if (/must|shall|required|minimum/i.test(s)) {
        ppRequired = true;
        note("pastPerformance", s);
      }
    }
    const yrs = s.match(/(?:at\s+least|minimum\s+(?:of\s+)?|no\s+less\s+than|not\s+less\s+than)\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\(\d+\)\s*)?years?/i);
    if (yrs?.[1] && /experience|in\s+business|providing|performing|operat/i.test(s)) {
      const n = toNumber(yrs[1]);
      if (n !== null && n > (patch.minYearsExperience ?? 0)) {
        patch.minYearsExperience = n;
        note("minYearsExperience", s);
      }
    }
  }
  if (ppRequired) patch.pastPerformance = "required";
  else if (ppScored) patch.pastPerformance = "scored";

  /* ---- licensing ---- */
  const notes: string[] = [];
  for (const s of sentences) {
    if (/licen[sc](?:e|ed|ing|ure)|Chapter\s+1702|private\s+security|TDLR|certification\s+required/i.test(s) && /must|shall|required|hold|possess|valid|maintain|current/i.test(s)) {
      notes.push(clip(s));
      note("licensingRequired", s);
    }
  }
  if (notes.length) {
    patch.licensingRequired = "yes";
    patch.licensingNotes = unique(notes);
  }

  /* ---- mandatory pre-bid ---- */
  for (const s of sentences) {
    if (/mandatory\s+(?:pre-?(?:bid|proposal|submittal|solicitation)|site\s+(?:visit|walk)|conference|meeting)|pre-?(?:bid|proposal|submittal)\s+(?:meeting|conference).{0,40}\bmandatory/i.test(s)) {
      if (/non-?mandatory|not\s+mandatory|optional/i.test(s)) {
        patch.mandatoryPreBid = "no";
      } else {
        patch.mandatoryPreBid = "yes";
        const d = parseDate(s);
        if (d) patch.preBidDate = d;
      }
      note("mandatoryPreBid", s);
      break;
    }
  }

  /* ---- rapid turnaround ---- */
  for (const s of sentences) {
    if (/quick\s+quote|rapid(?:ly)?\s+ship|expedit\w+|rush\s+order|within\s+\d+\s*(?:hours?|hrs?)\b|same[- ]day|next[- ]day\s+delivery|24[- ]hour/i.test(s)) {
      patch.rapidTurnaround = "yes";
      note("rapidTurnaround", s);
      break;
    }
  }

  patch.evidence = evidence;
  return patch;
}

/**
 * Apply a patch to existing terms. A fact is only filled in where the existing value is unknown/empty,
 * so values the admin typed in are never overwritten. Evidence is unioned.
 */
export function applyPatch(base: Terms, patch: TermsPatch, opts: { overwrite?: boolean } = {}): Terms {
  const next: Terms = { ...EMPTY_TERMS, ...base, evidence: { ...base.evidence } };
  const isBlank = (v: unknown) => v === "unknown" || v === null || v === undefined || (Array.isArray(v) && v.length === 0);
  for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
    if (key === "evidence") continue;
    const incoming = patch[key];
    if (incoming === undefined) continue;
    if (opts.overwrite || isBlank((next as unknown as Record<string, unknown>)[key])) {
      (next as unknown as Record<string, unknown>)[key] = incoming;
    }
  }
  for (const [k, lines] of Object.entries(patch.evidence ?? {})) {
    const key = k as TermKey;
    next.evidence[key] = unique([...(next.evidence[key] ?? []), ...(lines ?? [])]);
  }
  return next;
}
