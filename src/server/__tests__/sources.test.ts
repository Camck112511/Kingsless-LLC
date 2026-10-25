import { describe, expect, it } from "vitest";
import { OpportunitySchema, resolveToday } from "../schemas";
import { buildSamUrl } from "../sources/sam";
import { categoryFrom, normalizeAward, normalizeSolicitation, setAsideFromCode, type SamRecord } from "../sources/sam-normalize";
import { TEST_CASE_OPPORTUNITIES } from "@/engine";

const record: SamRecord = {
  noticeId: "abc123",
  title: "Grounds maintenance, Fort Example",
  solicitationNumber: "W912XX-26-R-0001",
  fullParentPathName: "DEPT OF DEFENSE.DEPT OF THE ARMY.US ARMY CORPS OF ENGINEERS",
  postedDate: "2026-10-20",
  responseDeadLine: "2026-11-12T17:00:00-05:00",
  typeOfSetAside: "SBA",
  typeOfSetAsideDescription: "Total Small Business Set-Aside (FAR 19.5)",
  naicsCode: "561730",
  classificationCode: "S208",
  uiLink: "https://sam.gov/opp/abc123/view",
  resourceLinks: ["https://sam.gov/api/prod/opps/v3/opportunities/resources/files/x/download"],
  placeOfPerformance: { city: { name: "Fort Example" }, state: { code: "TX" } },
};

describe("SAM.gov normalizer", () => {
  it("maps a record without inventing anything it does not state", () => {
    const o = normalizeSolicitation(record, "2026-10-25")!;
    expect(o.id).toBe("sam-abc123");
    expect(o.source).toBe("sam.gov");
    expect(o.dueDate).toBe("2026-11-12");
    expect(o.terms.setAside).toBe("small-business");
    expect(o.terms.subcontracting).toBe("unknown");
    expect(o.terms.paymentKind).toBe("unknown");
    expect(o.provenance.verified).toBe(false);
    expect(o.location).toEqual({ city: "Fort Example", state: "TX" });
    expect(OpportunitySchema.safeParse(o).success).toBe(true);
  });

  it("skips records with no id or title", () => {
    expect(normalizeSolicitation({ title: "x" }, "2026-10-25")).toBeNull();
  });

  it("treats an unrecognised set-aside code as unknown, never as 'none'", () => {
    expect(setAsideFromCode(undefined)).toBe("none");
    expect(setAsideFromCode("SBA")).toBe("small-business");
    expect(setAsideFromCode("8AN")).toBe("8a");
    expect(setAsideFromCode("EDWOSBSS")).toBe("wosb");
    expect(setAsideFromCode("ZZZ")).toBe("unknown");
  });

  it("classifies categories from NAICS / PSC", () => {
    expect(categoryFrom("561612", "")).toBe("security-guard");
    expect(categoryFrom("237310", "Y1JZ")).toBe("construction-general");
    expect(categoryFrom("238210", "")).toBe("construction-specialty");
    expect(categoryFrom("", "7510")).toBe("supply");
    expect(categoryFrom("", "")).toBe("unknown");
  });

  it("turns award notices into prime-contractor leads", () => {
    const lead = normalizeAward({ ...record, award: { date: "2026-10-01", amount: "$125,000.50", awardee: { name: "Acme Grounds LLC" } } });
    expect(lead).toMatchObject({ awardee: "Acme Grounds LLC", amountUsd: 125000.5, awardedOn: "2026-10-01" });
    expect(normalizeAward(record)).toBeNull();
  });

  it("builds the documented request URL", () => {
    const url = buildSamUrl({ daysBack: 14, keyword: "grading", ncode: "237310", state: "tx", limit: 25, kind: "solicitations" }, "KEY", new Date("2026-10-25T12:00:00Z"));
    expect(url.origin + url.pathname).toBe("https://api.sam.gov/opportunities/v2/search");
    expect(url.searchParams.get("postedFrom")).toBe("10/11/2026");
    expect(url.searchParams.get("postedTo")).toBe("10/25/2026");
    expect(url.searchParams.get("ptype")).toBe("o,k");
    expect(url.searchParams.get("state")).toBe("TX");
    expect(buildSamUrl({ daysBack: 5, limit: 5, kind: "awards" }, "KEY").searchParams.get("ptype")).toBe("a");
  });
});

describe("request validation", () => {
  it("the seeded test cases pass the same schema the API enforces", () => {
    for (const o of TEST_CASE_OPPORTUNITIES) expect(OpportunitySchema.safeParse(o).success, o.id).toBe(true);
  });

  it("rejects absurd values", () => {
    const bad = { ...TEST_CASE_OPPORTUNITIES[0]!, valueEstimate: { low: -1, high: null } };
    expect(OpportunitySchema.safeParse(bad).success).toBe(false);
  });

  it("uses the client's date only when it is close to the server's", () => {
    const now = new Date("2026-10-25T03:00:00Z");
    expect(resolveToday("2026-10-24", now)).toBe("2026-10-24");
    expect(resolveToday("2027-01-01", now)).toBe("2026-10-25");
    expect(resolveToday(undefined, now)).toBe("2026-10-25");
  });
});
