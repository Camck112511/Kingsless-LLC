import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { newInputs } from "@/engine/factory";
import { scoreFit } from "@/engine/fit";
import { DEFAULT_SETTINGS } from "@/engine/config";
import { extractJson } from "../ai/client";
import { dueDateFromText, feedItemToLead, parseFeed } from "../sources/feeds";
import { inferCategory, leadToOpportunity, stableId, type Lead } from "../sources/leads";
import { groupSubawards, marketStats, parseAwards } from "../sources/usaspending";
import { scoutPrompt } from "../sources/web-scout";
import { OpportunitySchema, ScoutWebRequestSchema, SettingsSchema } from "../schemas";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>City Bids</title>
<item><title>RFP 26-114 Site Grading &amp; Drainage</title><link>https://city.example/bids/114</link>
<description><![CDATA[<p>Site clearing and grading. Proposals are due November 12, 2026 at 2:00 PM. NAICS 238910.</p>]]></description>
<pubDate>Mon, 19 Oct 2026 12:00:00 GMT</pubDate></item>
<item><title>Janitorial Services</title><link>javascript:alert(1)</link><description>bad link</description></item>
<item><title>Mowing</title><link>https://city.example/bids/115</link><description>Mowing. Posted 10/01/2026.</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>County</title>
<entry><title>IFB 7 Roofing</title><link rel="alternate" href="https://county.example/b/7"/><link rel="self" href="https://county.example/feed"/>
<summary type="html">&lt;b&gt;Roof replacement&lt;/b&gt;. Closing date: 2026-11-30.</summary><updated>2026-10-20T10:00:00Z</updated></entry></feed>`;

describe("feeds", () => {
  it("parses RSS, decodes entities and CDATA, and drops unsafe links", () => {
    const items = parseFeed(RSS);
    expect(items.map((i) => i.title)).toEqual(["RFP 26-114 Site Grading & Drainage", "Mowing"]);
    expect(items[0]!.summary).toContain("Site clearing and grading.");
    expect(items[0]!.summary).not.toContain("<p>");
    expect(items[0]!.published).toBe("2026-10-19");
  });

  it("parses Atom and chooses the alternate link", () => {
    const [e] = parseFeed(ATOM);
    expect(e!.link).toBe("https://county.example/b/7");
    expect(e!.summary).toBe("Roof replacement. Closing date: 2026-11-30.");
  });

  it("returns nothing for garbage", () => {
    expect(parseFeed("not xml at all")).toEqual([]);
    expect(parseFeed("<html><body>hi</body></html>")).toEqual([]);
  });

  it("finds a due date only next to a deadline cue", () => {
    expect(dueDateFromText("Proposals are due November 12, 2026 at 2:00 PM.")).toBe("2026-11-12");
    expect(dueDateFromText("Closing date: 2026-11-30.")).toBe("2026-11-30");
    expect(dueDateFromText("Posted 10/01/2026. Mowing services.")).toBeNull();
  });

  it("turns a feed item into a lead that states only what the item states", () => {
    const lead = feedItemToLead(parseFeed(RSS)[0]!, "city.example");
    expect(lead).toMatchObject({ solicitationNumber: "26-114", dueDate: "2026-11-12", naics: "238910", agency: "city.example", city: "", state: "" });
  });
});

describe("leads become ordinary, unverified opportunities", () => {
  const lead: Lead = {
    title: "Site Grading", agency: "City of X", solicitationNumber: "26-1", city: "Houston", state: "TX", dueDate: "2026-12-01", postedDate: null,
    estimatedValueUsd: 50_000, naics: "238910", level: "local", portal: "city.example", sourceUrl: "https://city.example/b/1",
    summary: "Subcontracting is not permitted under this solicitation. Site clearing and grading.", whyItFits: "", documents: [],
  };

  it("is never verified, keeps the portal in its note, and reads rule-based terms from the summary", () => {
    const o = leadToOpportunity(lead, "web", "2026-10-25");
    expect(o.provenance.verified).toBe(false);
    expect(o.provenance.note).toMatch(/AI web scout \(city\.example\)/);
    expect(o.terms.subcontracting).toBe("prohibited");
    expect(o.category).toBe("construction-specialty"); // NAICS 238xxx = specialty trade contractors
    expect(OpportunitySchema.safeParse(o).success).toBe(true);
    // and the engine rejects it, whatever the scout thought of it
    expect(analyze({ opportunity: o, inputs: newInputs() }, { settings: DEFAULT_SETTINGS, subcontractors: [], quotes: [], today: "2026-10-25" }).verdict).toBe("reject");
  });

  it("has a stable id so the same listing never enters the pipeline twice", () => {
    expect(leadToOpportunity(lead, "web", "2026-10-25").id).toBe(leadToOpportunity({ ...lead, title: "changed" }, "web", "2026-10-26").id);
    expect(stableId("web", "A  B")).toBe(stableId("web", "a b"));
    expect(leadToOpportunity(lead, "web", "x").id).not.toBe(leadToOpportunity({ ...lead, sourceUrl: "https://city.example/b/2" }, "web", "x").id);
  });

  it("infers a category from a code first, then from words", () => {
    expect(inferCategory("x", "y", "561612")).toBe("security-guard");
    expect(inferCategory("Janitorial services", "", null)).toBe("facility-services");
    expect(inferCategory("Armed guard services", "", null)).toBe("security-guard");
    expect(inferCategory("Thing", "Stuff", null)).toBe("unknown");
  });

  it("a scouted federal lead needs SAM registration like any other", () => {
    const o = leadToOpportunity({ ...lead, level: "federal", summary: "Site grading." }, "web", "2026-10-25");
    const a = analyze({ opportunity: o, inputs: newInputs() }, { settings: DEFAULT_SETTINGS, subcontractors: [], quotes: [], today: "2026-10-25" });
    expect(a.gates.find((g) => g.id === "prime-eligibility")?.status).toBe("fail");
    expect(scoreFit(o, DEFAULT_SETTINGS, "2026-10-25").score).toBeGreaterThanOrEqual(0);
  });
});

describe("AI plumbing", () => {
  it("extracts JSON from fenced or chatty model text", () => {
    expect(extractJson('Here you go:\n```json\n{"a":[1,2]}\n```\nDone.')).toEqual({ a: [1, 2] });
    expect(extractJson('I found these {"leads":[{"x":1}],"notes":"ok"} thanks')).toEqual({ leads: [{ x: 1 }], notes: "ok" });
    expect(extractJson("[1,2,3]")).toEqual([1, 2, 3]);
    expect(() => extractJson("no json here")).toThrow();
  });

  it("the scout prompt carries the owner's targets and forbids inventing facts", () => {
    const settings = SettingsSchema.parse({
      ...DEFAULT_SETTINGS,
      serviceArea: { scope: "selected", states: ["TX"], places: ["Houston"] },
      targeting: { ...DEFAULT_SETTINGS.targeting, keywords: ["grading"], avoidKeywords: ["asbestos"], naics: ["238910"], minValueUsd: 5000, maxValueUsd: null },
    });
    const { system, user } = scoutPrompt(settings, "2026-10-25", "prefer school districts", 10);
    expect(user).toContain("Houston");
    expect(user).toContain("grading");
    expect(user).toContain("asbestos");
    expect(user).toContain("NOT registered in SAM.gov");
    expect(user).toContain("prefer school districts");
    expect(system).toMatch(/NEVER invent/);
    expect(system).toMatch(/exact address/);
  });

  it("a half-typed feed address does not invalidate the owner's settings", () => {
    const withFeed = (feeds: string[]) => SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, targeting: { ...DEFAULT_SETTINGS.targeting, feeds } }).success;
    expect(withFeed(["htt"])).toBe(true);
    expect(withFeed(["https://city.example/rss.xml", ""])).toBe(true);
  });

  it("validates scout requests", () => {
    expect(ScoutWebRequestSchema.safeParse({ settings: DEFAULT_SETTINGS }).success).toBe(true);
    expect(ScoutWebRequestSchema.safeParse({ settings: DEFAULT_SETTINGS, maxLeads: 500 }).success).toBe(false);
  });
});

describe("USAspending parsing", () => {
  const rows = [
    { "Award ID": "A1", "Recipient Name": "ACME GRADING LLC", "Award Amount": 120000, "Start Date": "2025-01-01", "End Date": "2025-06-01", "Awarding Agency": "Dept of X", Description: "Site grading", NAICS: { code: "238910" }, "Primary Place of Performance": { city_name: "Houston", state_code: "TX" }, generated_internal_id: "CONT_AWD_1" },
    { "Award ID": "A2", "Recipient Name": "BOB'S DIRT", "Award Amount": "80,000.50" },
    { "Award ID": "A3", "Recipient Name": "", "Award Amount": 5 },
    { "Award ID": "A4", "Recipient Name": "BIG CO", "Award Amount": 300000 },
    { "Award ID": "A5", "Recipient Name": "MID CO", "Award Amount": 100000 },
  ];

  it("reads awards defensively and builds a real award link", () => {
    const awards = parseAwards(rows);
    expect(awards).toHaveLength(4);
    expect(awards[0]).toMatchObject({ recipient: "ACME GRADING LLC", amountUsd: 120000, naics: "238910", place: "Houston, TX", url: "https://www.usaspending.gov/award/CONT_AWD_1" });
    expect(awards[1]!.amountUsd).toBe(80000.5);
    expect(awards[1]!.place).toBe("");
  });

  it("summarises prices as quartiles of what was actually paid", () => {
    expect(marketStats(parseAwards(rows))).toEqual({ count: 4, medianUsd: 110000, lowUsd: 95000, highUsd: 165000 });
    expect(marketStats([])).toEqual({ count: 0, medianUsd: null, lowUsd: null, highUsd: null });
  });

  it("groups subawards by company", () => {
    const subs = groupSubawards([
      { "Sub-Awardee Name": "Dirt Works Inc", "Sub-Award Amount": 50000, "Sub-Award Date": "2025-03-01", "Prime Recipient Name": "Prime A", "Sub-Recipient Location": { city_name: "Katy", state_code: "TX" }, "Awarding Agency": "USACE", "Sub-Recipient UEI": "U1" },
      { "Sub-Awardee Name": "DIRT WORKS INC", "Sub-Award Amount": 25000, "Sub-Award Date": "2025-09-01", "Prime Recipient Name": "Prime B" },
      { "Sub-Awardee Name": "Other LLC", "Sub-Award Amount": 1000 },
      { "Sub-Awardee Name": "" },
    ]);
    expect(subs.map((s) => [s.name, s.count, s.totalUsd, s.latest, s.states])).toEqual([["Dirt Works Inc", 2, 75000, "2025-09-01", ["TX"]], ["Other LLC", 1, 1000, null, []]]);
  });
});
