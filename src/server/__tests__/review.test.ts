import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { DEFAULT_SETTINGS } from "@/engine/config";
import { newInputs, newOpportunity, newTerms } from "@/engine/factory";
import { reviewPrompt } from "../ai/review";

const opp = newOpportunity({
  id: "r1",
  title: "Mowing, county roads",
  agency: "Demo County",
  scope: "Mowing and trimming of county road rights-of-way.",
  category: "facility-services",
  location: { city: "Houston", state: "TX" },
  dueDate: "2026-12-01",
  terms: newTerms({ subcontracting: "allowed" }),
});
const a = analyze({ opportunity: opp, inputs: newInputs() }, { settings: DEFAULT_SETTINGS, subcontractors: [], quotes: [], today: "2026-10-25" });

describe("review prompt", () => {
  it("gives the model the engine's findings as ground truth and forbids overriding them", () => {
    const { system, user } = reviewPrompt(opp, a, DEFAULT_SETTINGS, "Section 4: payment within 30 days.", false);
    expect(system).toMatch(/ground truth/);
    expect(system).toMatch(/never restate a different verdict/);
    expect(user).toContain("ENGINE VERDICT: INVESTIGATE");
    expect(user).toContain("GATE Work may be subcontracted: PASS");
    expect(user).toContain("<solicitation_text>");
    expect(user).toContain("payment within 30 days");
    expect(user).not.toMatch(/search the web/i);
  });

  it("only asks for web research when it was requested", () => {
    expect(reviewPrompt(opp, a, DEFAULT_SETTINGS, "", true).user).toMatch(/Search the web/);
    expect(reviewPrompt(opp, a, DEFAULT_SETTINGS, "", false).user).toContain("No solicitation text was available");
  });

  it("clips very long documents", () => {
    const { user } = reviewPrompt(opp, a, DEFAULT_SETTINGS, "x".repeat(200_000), false);
    expect(user.length).toBeLessThan(80_000);
  });
});

import { subPrompt } from "../ai/sub-research";

describe("subcontractor research prompt", () => {
  it("asks for real businesses near the work and forbids inventing contact details or licenses", () => {
    const { system, user } = subPrompt({ ...opp, naics: "238910", terms: { ...opp.terms, licensingRequired: "yes" } }, DEFAULT_SETTINGS, 6, "must have a dump truck");
    expect(system).toMatch(/REAL businesses/);
    expect(system).toMatch(/ONLY if the page states it/);
    expect(system).toMatch(/Never invent license numbers/);
    expect(user).toContain("Houston, TX");
    expect(user).toContain("NAICS 238910");
    expect(user).toMatch(/requires a license/);
    expect(user).toContain("dump truck");
  });
});
