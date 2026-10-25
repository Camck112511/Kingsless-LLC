import { describe, expect, it } from "vitest";
import { analyze } from "../analyze";
import { checkLocation, describeArea, normState, placeMatches } from "../locations";
import { newInputs } from "../factory";
import { TEST_CASE_INPUTS, TEST_CASE_OPPORTUNITIES } from "../seeds";
import type { Gate, ServiceArea } from "../types";
import { cleanOpp, goodInputs, settings, world } from "./helpers";

const area = (over: Partial<ServiceArea> = {}): ServiceArea => ({ scope: "selected", states: ["TX"], places: [], ...over });
const loc = (city: string, state: string) => ({ city, state });
const locationGate = (gates: Gate[]) => gates.find((g) => g.id === "location")!;

describe("state and place normalisation", () => {
  it("accepts codes and full names, and never guesses", () => {
    expect(normState("tx")).toBe("TX");
    expect(normState("Texas")).toBe("TX");
    expect(normState(" new  mexico ".replace(/\s+/g, " "))).toBe("NM");
    expect(normState("T.X.")).toBe("TX");
    expect(normState("Texs")).toBe("");
    expect(normState("")).toBe("");
  });

  it("matches counties and cities loosely but not unrelated places", () => {
    expect(placeMatches("Liberty County", "Liberty")).toBe(true);
    expect(placeMatches("Liberty", "Liberty County")).toBe(true);
    expect(placeMatches("City of Houston", "houston")).toBe(true);
    expect(placeMatches("Fort Worth", "Fort Worth")).toBe(true);
    expect(placeMatches("Houston; Dallas", "Dallas")).toBe(true);
    expect(placeMatches("Fort Worth", "Houston")).toBe(false);
    expect(placeMatches("Austin", "Aus")).toBe(false);
    expect(placeMatches("anything", "")).toBe(false);
  });
});

describe("checkLocation", () => {
  it("anywhere passes everything, including unknown places", () => {
    const a: ServiceArea = { scope: "anywhere", states: [], places: [] };
    expect(checkLocation(loc("", ""), a).status).toBe("pass");
    expect(checkLocation(loc("Columbus", "OH"), a).status).toBe("pass");
  });

  it("an empty 'selected' area cannot filter, so it passes", () => {
    expect(checkLocation(loc("Columbus", "OH"), area({ states: [] })).status).toBe("pass");
  });

  it("passes inside the chosen state, fails outside it", () => {
    expect(checkLocation(loc("Houston", "TX"), area()).status).toBe("pass");
    const out = checkLocation(loc("Columbus", "OH"), area());
    expect(out.status).toBe("fail");
    expect(out.detail).toMatch(/OH/);
  });

  it("an unstated place is unknown, never a pass", () => {
    const m = checkLocation(loc("", ""), area());
    expect(m.status).toBe("unknown");
    expect(m.question).toMatch(/Where will the work/);
    expect(checkLocation(loc("Houston", "not a state"), area()).status).toBe("unknown");
  });

  it("supports several states", () => {
    const a = area({ states: ["TX", "OK", "LA"] });
    expect(checkLocation(loc("Tulsa", "OK"), a).status).toBe("pass");
    expect(checkLocation(loc("Little Rock", "AR"), a).status).toBe("fail");
  });

  it("narrows to chosen cities or counties inside the state", () => {
    const a = area({ places: ["Houston", "Liberty County"] });
    expect(checkLocation(loc("Liberty County", "TX"), a).status).toBe("pass");
    expect(checkLocation(loc("Houston", "TX"), a).status).toBe("pass");
    expect(checkLocation(loc("Lubbock", "TX"), a).status).toBe("fail");
    // state matches but the listing names no city: cannot be proven
    expect(checkLocation(loc("", "TX"), a).status).toBe("unknown");
  });

  it("describes the area for display", () => {
    expect(describeArea({ scope: "anywhere", states: [], places: [] })).toBe("anywhere");
    expect(describeArea(area({ places: ["Houston"] }))).toBe("Houston · TX");
  });
});

describe("the location gate in the analysis", () => {
  const w = (a: ServiceArea) => world({ settings: settings({ serviceArea: a }) });
  const analyzeCase = (id: string, a: ServiceArea) => {
    const opportunity = TEST_CASE_OPPORTUNITIES.find((o) => o.id === id)!;
    return analyze({ opportunity, inputs: TEST_CASE_INPUTS[id] ?? newInputs() }, w(a));
  };

  it("with no location selected the gate passes and nothing changes", () => {
    const a = analyzeCase("lamp-rfp-0003", { scope: "anywhere", states: [], places: [] });
    expect(locationGate(a.gates).status).toBe("pass");
    expect(a.verdict).toBe("investigate");
    expect(a.gates).toHaveLength(7);
  });

  it("selecting Texas keeps the Texas test cases where they were", () => {
    expect(analyzeCase("lamp-rfp-0003", area()).verdict).toBe("investigate");
    expect(analyzeCase("fw-26-0268", area()).verdict).toBe("reject");
    expect(locationGate(analyzeCase("lamp-rfp-0003", area()).gates).status).toBe("pass");
  });

  it("selecting Ohio rejects every Texas contract, however good it looks", () => {
    for (const id of ["lamp-rfp-0003", "lamp-rfp-0005", "fw-26-0268"]) {
      const a = analyzeCase(id, area({ states: ["OH"] }));
      expect(locationGate(a.gates).status, id).toBe("fail");
      expect(a.verdict, id).toBe("reject");
    }
    const a = analyzeCase("lamp-rfp-0003", area({ states: ["OH"] }));
    expect(a.verdictReason).toMatch(/selected location/i);
    expect(a.nextActions.join(" ")).toMatch(/Add this state or place/);
  });

  it("great economics cannot rescue a contract outside your location", () => {
    const opp = cleanOpp({ location: loc("Columbus", "OH") });
    const a = analyze({ opportunity: opp, inputs: goodInputs() }, w(area()));
    expect(a.pricing!.netMarginRate).toBeGreaterThan(0.3);
    expect(a.verdict).toBe("reject");
  });

  it("the same contract qualifies once its state is in your area", () => {
    const opp = cleanOpp({ location: loc("Columbus", "OH") });
    expect(analyze({ opportunity: opp, inputs: goodInputs() }, w(area({ states: ["TX", "OH"] }))).verdict).toBe("qualified");
  });

  it("a contract that does not say where the work is stays unproven, so it is never recommended", () => {
    const opp = cleanOpp({ location: loc("", "") });
    const a = analyze({ opportunity: opp, inputs: goodInputs() }, w(area()));
    expect(locationGate(a.gates).status).toBe("unknown");
    expect(a.verdict).toBe("investigate");
    expect(a.openQuestions.join(" ")).toMatch(/Where will the work/);
  });

  it("city and county selections are enforced too", () => {
    const opp = cleanOpp({ location: loc("Lubbock", "TX") });
    expect(analyze({ opportunity: opp, inputs: goodInputs() }, w(area({ places: ["Houston"] }))).verdict).toBe("reject");
    expect(analyze({ opportunity: opp, inputs: goodInputs() }, w(area({ places: ["Lubbock"] }))).verdict).toBe("qualified");
  });

  it("an out-of-area contract withholds outreach drafts", async () => {
    const { generateScripts } = await import("../scripts");
    const opp = cleanOpp({ location: loc("Columbus", "OH") });
    const a = analyze({ opportunity: opp, inputs: goodInputs() }, w(area()));
    expect(generateScripts(opp, a, goodInputs(), settings({ serviceArea: area() }), "2026-10-25").status).toBe("withheld");
  });
});
