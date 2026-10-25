import { describe, expect, it } from "vitest";
import { analyze, analyzeAll } from "../analyze";
import { DEFAULT_TARGETING } from "../config";
import { newInputs } from "../factory";
import { hasWord, scoreFit } from "../fit";
import type { Targeting } from "../types";
import { cleanOpp, cleanTerms, goodInputs, quote, settings, sub, TODAY, world } from "./helpers";

const target = (over: Partial<Targeting>): Targeting => ({ ...DEFAULT_TARGETING, ...over });
const withTargets = (over: Partial<Targeting>) => settings({ targeting: target(over) });

describe("word matching", () => {
  it("matches word prefixes but not the middle of a word", () => {
    expect(hasWord("Landscaping and mowing", "landscap")).toBe(true);
    expect(hasWord("Site clearing and grading", "grading")).toBe(true);
    expect(hasWord("Upgrading the HVAC", "grading")).toBe(false);
    expect(hasWord("anything", "")).toBe(false);
  });
});

describe("business fit", () => {
  it("is not configured, and says so, until the owner sets targets", () => {
    const fit = scoreFit(cleanOpp(), settings(), TODAY);
    expect(fit.configured).toBe(false);
    expect(fit.summary).toMatch(/Settings/);
  });

  it("scores a listing that matches the chosen services, size, place and timing highly", () => {
    const s = withTargets({ keywords: ["janitorial", "cleaning"], minValueUsd: 1000, maxValueUsd: 20000, maxDaysUntilDue: 60 });
    const opp = cleanOpp({ valueEstimate: { low: 3000, high: 5000 } });
    const fit = scoreFit(opp, { ...s, serviceArea: { scope: "selected", states: ["TX"], places: [] } }, TODAY);
    expect(fit.configured).toBe(true);
    expect(fit.score).toBeGreaterThanOrEqual(90);
    expect(fit.factors.find((f) => f.id === "service")?.outcome).toBe("match");
    expect(fit.factors.find((f) => f.id === "location")?.outcome).toBe("match");
  });

  it("scores a listing that matches nothing you want low", () => {
    const s = withTargets({ keywords: ["grading", "clearing"], categories: ["construction-general"] });
    const fit = scoreFit(cleanOpp(), s, TODAY);
    expect(fit.factors.find((f) => f.id === "service")?.outcome).toBe("miss");
    expect(fit.score).toBeLessThan(70);
  });

  it("matches NAICS by prefix and treats the same family as a partial match", () => {
    const s = withTargets({ naics: ["238910"] });
    expect(scoreFit(cleanOpp({ naics: "238910" }), s, TODAY).factors.find((f) => f.id === "service")?.outcome).toBe("match");
    expect(scoreFit(cleanOpp({ naics: "2389" }), s, TODAY).factors.find((f) => f.id === "service")?.outcome).toBe("partial");
    const broad = withTargets({ naics: ["238"] });
    expect(scoreFit(cleanOpp({ naics: "238910" }), broad, TODAY).factors.find((f) => f.id === "service")?.outcome).toBe("match");
  });

  it("does not call a thin listing a miss", () => {
    const s = withTargets({ keywords: ["grading"] });
    const thin = cleanOpp({ title: "Services", scope: "Services.", category: "unknown" });
    expect(scoreFit(thin, s, TODAY).factors.find((f) => f.id === "service")?.outcome).toBe("unknown");
  });

  it("an unstated contract value is unknown, an out-of-range one is a miss", () => {
    const s = withTargets({ minValueUsd: 10_000, maxValueUsd: 50_000 });
    expect(scoreFit(cleanOpp(), s, TODAY).factors.find((f) => f.id === "size")?.outcome).toBe("unknown");
    const small = cleanOpp({ valueEstimate: { low: 500, high: 900 } });
    expect(scoreFit(small, s, TODAY).factors.find((f) => f.id === "size")?.outcome).toBe("miss");
  });

  it("credentials: a required license you do not list is only a partial fit; one you list is a match", () => {
    const opp = cleanOpp({ terms: cleanTerms({ licensingRequired: "yes" }) });
    const none = scoreFit(opp, settings(), TODAY).factors.find((f) => f.id === "credentials");
    expect(none?.outcome).toBe("partial");
    const has = scoreFit(opp, settings({ profile: { ...settings().profile, licenses: ["TX DPS"] } }), TODAY).factors.find((f) => f.id === "credentials");
    expect(has?.outcome).toBe("match");
  });

  it("credentials: a set-aside you cannot hold is a miss", () => {
    const opp = cleanOpp({ terms: cleanTerms({ setAside: "sdvosb" }) });
    expect(scoreFit(opp, settings(), TODAY).factors.find((f) => f.id === "credentials")?.outcome).toBe("miss");
  });

  it("timing: too little time or too long a performance period lowers fit", () => {
    expect(scoreFit(cleanOpp({ dueDate: "2026-10-28" }), settings(), TODAY).factors.find((f) => f.id === "timeframe")?.outcome).toBe("miss");
    const s = withTargets({ maxDurationDays: 30 });
    expect(scoreFit(cleanOpp({ durationDays: 90 }), s, TODAY).factors.find((f) => f.id === "timeframe")?.outcome).not.toBe("match");
    expect(scoreFit(cleanOpp({ durationDays: 20 }), s, TODAY).factors.find((f) => f.id === "timeframe")?.outcome).toBe("match");
  });

  it("location: outside your chosen state is a miss", () => {
    const s = { ...settings(), serviceArea: { scope: "selected" as const, states: ["OK"], places: [] } };
    expect(scoreFit(cleanOpp(), s, TODAY).factors.find((f) => f.id === "location")?.outcome).toBe("miss");
  });
});

describe("recommendation: fit never overrides the proof", () => {
  const perfect = withTargets({ keywords: ["janitorial"] });

  it("a qualified listing with strong fit is a top pick", () => {
    const a = analyze({ opportunity: cleanOpp(), inputs: goodInputs() }, world({ settings: perfect }));
    expect(a.verdict).toBe("qualified");
    expect(a.recommendation.tier).toBe("top-pick");
  });

  it("a qualified listing with a weak fit is only worth considering", () => {
    const s = withTargets({ keywords: ["grading"], minValueUsd: 50_000, categories: ["construction-general"] });
    const a = analyze({ opportunity: cleanOpp({ valueEstimate: { low: 100, high: 200 } }), inputs: goodInputs() }, world({ settings: s }));
    expect(a.verdict).toBe("qualified");
    expect(["consider", "recommended"]).toContain(a.recommendation.tier);
    expect(a.recommendation.tier).not.toBe("top-pick");
  });

  it("a perfect fit that fails a hard rule is still not recommended", () => {
    const opp = cleanOpp({ terms: cleanTerms({ subcontracting: "prohibited" }) });
    const a = analyze({ opportunity: opp, inputs: goodInputs() }, world({ settings: perfect }));
    expect(a.fit.score).toBeGreaterThan(70);
    expect(a.verdict).toBe("reject");
    expect(a.recommendation.tier).toBe("not-recommended");
  });

  it("a perfect fit with an unproven rule is research-first, never recommended", () => {
    const opp = cleanOpp({ terms: cleanTerms({ subcontracting: "unknown" }) });
    const a = analyze({ opportunity: opp, inputs: goodInputs() }, world({ settings: perfect }));
    expect(a.verdict).toBe("investigate");
    expect(a.recommendation.tier).toBe("research-first");
    expect(a.recommendation.headline).toMatch(/Promising/);
  });

  it("a listing on your avoid list is not recommended even if every gate passes", () => {
    const s = withTargets({ keywords: ["janitorial"], avoidKeywords: ["annex"] });
    const a = analyze({ opportunity: cleanOpp(), inputs: goodInputs() }, world({ settings: s }));
    expect(a.verdict).toBe("qualified");
    expect(a.fit.excluded).toBe(true);
    expect(a.recommendation.tier).toBe("not-recommended");
  });

  it("with no targets set, a qualified listing is simply 'recommended' and bid-ready is a top pick", () => {
    const w = world({ quotes: [quote()], subcontractors: [sub({ willingToSubcontract: "yes" })] });
    expect(analyze({ opportunity: cleanOpp(), inputs: goodInputs() }, world()).recommendation.tier).toBe("recommended");
    expect(analyze({ opportunity: cleanOpp(), inputs: goodInputs() }, w).recommendation.tier).toBe("top-pick");
  });
});

describe("ranking by fit", () => {
  it("between two otherwise identical qualified listings, the better business fit ranks first", () => {
    const s = withTargets({ keywords: ["grading"] });
    const match = cleanOpp({ id: "match", title: "Site grading", scope: "Site clearing and grading for a county road." });
    const other = cleanOpp({ id: "other", title: "Janitorial services", scope: "Janitorial cleaning for an office." });
    const ranked = analyzeAll(
      [
        { opportunity: other, inputs: goodInputs() },
        { opportunity: match, inputs: goodInputs() },
      ],
      world({ settings: s }),
    );
    expect(ranked.map((r) => r.opportunityId)).toEqual(["match", "other"]);
  });

  it("an unproven listing that fits your business is researched before one that does not", () => {
    const s = withTargets({ keywords: ["grading"] });
    const unknownTerms = cleanTerms({ subcontracting: "unknown" });
    const fits = cleanOpp({ id: "fits", title: "Grading", scope: "Site clearing and grading.", terms: unknownTerms, dueDate: "2026-12-30" });
    const misses = cleanOpp({ id: "misses", title: "Janitorial", terms: unknownTerms, dueDate: "2026-11-15" });
    const ranked = analyzeAll(
      [
        { opportunity: misses, inputs: newInputs() },
        { opportunity: fits, inputs: newInputs() },
      ],
      world({ settings: s }),
    );
    expect(ranked.map((r) => r.opportunityId)).toEqual(["fits", "misses"]);
  });
});

describe("federal listings found outside SAM.gov", () => {
  it("still need a SAM.gov registration", () => {
    const opp = cleanOpp({ source: "web", level: "federal" });
    const a = analyze({ opportunity: opp, inputs: goodInputs() }, world());
    expect(a.gates.find((g) => g.id === "prime-eligibility")?.status).toBe("fail");
    const registered = world({ settings: settings({ profile: { ...settings().profile, samRegistered: true } }) });
    expect(analyze({ opportunity: opp, inputs: goodInputs() }, registered).gates.find((g) => g.id === "prime-eligibility")?.status).toBe("pass");
  });
});
