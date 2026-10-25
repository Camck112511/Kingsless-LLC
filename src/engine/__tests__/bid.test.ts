import { describe, expect, it } from "vitest";
import { analyze } from "../analyze";
import { buildWorkflow, canSend, isEmail, preflight, type FlowInput } from "../bid";
import { buildBidPackage, findPlaceholders, ph } from "../bid-docs";
import { emptyBid } from "../config";
import type { BidDocument, BidRecord, DocBlock } from "../types";
import { cleanOpp, goodInputs, quote, settings, sub, TODAY, world } from "./helpers";

const contact = {
  companyName: "Kingsless LLC",
  contactName: "Cullen McKinney",
  email: "cullen@kingsless.org",
  phone: "(512) 217-7788",
  title: "Owner",
  address: "1 Main St, Austin, TX 78701",
  website: "https://kingsless.com",
  uei: "ABC123DEF456",
  cage: "1A2B3",
  capability: "Kingsless LLC delivers facility services through vetted subcontractors.",
};

const text = (d: BidDocument): string =>
  d.blocks
    .map((b: DocBlock) => (b.t === "bullets" ? b.items.join("\n") : b.t === "table" ? [...b.head, ...b.rows.flat()].join("\n") : b.t === "kv" ? b.rows.flat().join("\n") : b.t === "sig" ? b.lines.join("\n") : b.text))
    .join("\n");

function flow(over: { verified?: boolean; bidReady?: boolean; price?: number | null; bid?: Partial<BidRecord["prep"]>; contactOver?: Partial<typeof contact>; email?: boolean; sourceOver?: object } = {}): FlowInput {
  const s = settings({ contact: { ...contact, ...over.contactOver } });
  const opp = cleanOpp({ provenance: { verified: over.verified ?? true, checkedOn: TODAY, note: "" }, ...(over.sourceOver ?? {}) });
  const inputs = goodInputs({ plannedBidUsd: over.price === undefined ? 4000 : over.price });
  const w = over.bidReady === false ? world({ settings: s }) : world({ settings: s, quotes: [quote()], subcontractors: [sub({ willingToSubcontract: "yes" })] });
  const analysis = analyze({ opportunity: opp, inputs }, w);
  let bid: BidRecord = { ...emptyBid(), prep: { ...emptyBid().prep, ...over.bid } };
  const pkg = buildBidPackage({ opp, analysis, inputs, bid, settings: s, today: TODAY });
  // the owner confirmed the documents as they stand (unless the test says they did not)
  if (over.bid?.reviewedDigest === undefined) bid = { ...bid, prep: { ...bid.prep, reviewedDigest: pkg.digest } };
  return { opp, analysis, inputs, bid, settings: s, pkg, emailConfigured: over.email ?? true };
}

describe("placeholders", () => {
  it("are visible and findable", () => {
    expect(ph("Company mailing address")).toBe("[Company mailing address – to complete]");
    expect(findPlaceholders(`a ${ph("Bid price")} b ${ph("Signer name")} c ${ph("Bid price")}`)).toEqual(["Bid price", "Signer name", "Bid price"]);
    expect(findPlaceholders("[1] and [see note] are not markers")).toEqual([]);
  });
});

describe("bid package", () => {
  it("is complete when the owner supplied everything", () => {
    const f = flow();
    expect(f.pkg.placeholders).toEqual([]);
    const cover = f.pkg.documents.find((d) => d.id === "cover-letter")!;
    expect(text(cover)).toContain("$4,000.00");
    expect(text(cover)).toContain("Cullen McKinney");
    expect(f.pkg.documents.map((d) => d.id)).toEqual(["cover-letter", "price-proposal", "technical-approach", "qualifications", "subcontracting", "compliance-matrix", "bid-summary", "submission-checklist", "subcontract-term-sheet"]);
  });

  it("marks every missing fact instead of inventing it", () => {
    const f = flow({ price: null, contactOver: { address: "", capability: "", phone: "" } });
    expect(f.pkg.placeholders).toEqual(expect.arrayContaining(["Bid price", "Company mailing address", "Company phone", "Two or three sentences describing what the company does"]));
  });

  it("never tells the agency what you pay the subcontractor, your margin or your cash", () => {
    const f = flow();
    for (const d of f.pkg.documents.filter((x) => x.audience === "agency")) {
      const t = text(d).toLowerCase();
      expect(t, d.id).not.toMatch(/2,600|2600|margin|profit|walk-away|peak cash|markup/);
    }
    // while the internal summary does carry them
    expect(text(f.pkg.documents.find((d) => d.id === "bid-summary")!)).toMatch(/2,600/);
  });

  it("omits the subcontracting statement when subcontracting is prohibited", () => {
    const f = flow({ sourceOver: { terms: { ...cleanOpp().terms, subcontracting: "prohibited" } } });
    expect(f.pkg.documents.some((d) => d.id === "subcontracting")).toBe(false);
    expect(text(f.pkg.documents.find((d) => d.id === "cover-letter")!)).not.toMatch(/subcontractors whom we select/);
  });

  it("uses the owner's own approach text when given", () => {
    const f = flow({ bid: { approach: "We will do it our way.\n\nSecond paragraph." } });
    const tech = text(f.pkg.documents.find((d) => d.id === "technical-approach")!);
    expect(tech).toContain("We will do it our way.");
    expect(tech).toContain("Second paragraph.");
  });

  it("answers each requirement the listing states in the compliance matrix", () => {
    const f = flow({ sourceOver: { terms: { ...cleanOpp().terms, insuranceRequired: "yes", insuranceMinLimitUsd: 1_000_000, licensingRequired: "yes" } } });
    const m = text(f.pkg.documents.find((d) => d.id === "compliance-matrix")!);
    expect(m).toContain("Insurance");
    expect(m).toContain("$1,000,000");
    expect(m).toContain("Licensing");
    expect(f.pkg.placeholders).toContain("Attach certificate of insurance");
  });
});

describe("document fingerprint", () => {
  it("is stable for the same words and changes when any word changes", () => {
    expect(flow().pkg.digest).toBe(flow().pkg.digest);
    expect(flow({ price: 4100 }).pkg.digest).not.toBe(flow({ price: 4000 }).pkg.digest);
    expect(flow({ contactOver: { address: "2 Other St" } }).pkg.digest).not.toBe(flow().pkg.digest);
    // internal papers are not part of it: only what the agency reads
    expect(flow({ bidReady: false }).pkg.digest).toBe(flow().pkg.digest);
  });
});

describe("final check before sending", () => {
  it("passes only when everything is proven and complete", () => {
    const f = flow();
    const checks = preflight(f, "email", "bids@county.gov");
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(canSend(checks)).toBe(true);
  });

  it.each([
    ["an unverified listing", { verified: false }, "listing"],
    ["no firm quote", { bidReady: false }, "quote"],
    ["no price", { price: null }, "price"],
    ["a price below the walk-away line", { price: 3000 }, "floor"],
    ["a blank in the documents", { contactOver: { address: "" } }, "placeholders"],
    ["documents not reviewed", { bid: { reviewedDigest: "" } }, "reviewed"],
    ["a confirmation made against older documents", { bid: { reviewedDigest: "deadbeef" } }, "reviewed"],
    ["email not set up on the server", { email: false }, "email-ready"],
  ])("blocks sending with %s", (_name, over, id) => {
    const checks = preflight(flow(over), "email", "bids@county.gov");
    expect(checks.find((c) => c.id === id)?.ok).toBe(false);
    expect(canSend(checks)).toBe(false);
  });

  it("blocks a bad recipient address", () => {
    expect(canSend(preflight(flow(), "email", "not-an-email"))).toBe(false);
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a b@c.com")).toBe(false);
  });

  it("blocks sending when a rule fails (a past due date)", () => {
    const checks = preflight(flow({ sourceOver: { dueDate: "2026-10-01" } }), "email", "bids@county.gov");
    expect(checks.find((c) => c.id === "deadline")?.ok).toBe(false);
    expect(checks.find((c) => c.id === "rules")?.ok).toBe(false);
    expect(canSend(checks)).toBe(false);
  });

  it("only advises, never blocks, when you submit through the portal yourself", () => {
    const checks = preflight(flow({ bidReady: false }), "portal");
    expect(checks.some((c) => !c.ok)).toBe(true);
    expect(canSend(checks)).toBe(true);
  });
});

describe("workflow", () => {
  it("walks the steps in order and points at the first one that is open", () => {
    const early = buildWorkflow(flow({ bidReady: false, price: null, verified: false }));
    expect(early.steps.map((s) => s.id)).toEqual(["fit", "prove", "quotes", "price", "docs", "check", "submit", "result", "win"]);
    expect(early.steps.find((s) => s.id === "prove")?.status).toBe("done");
    expect(early.currentId).toBe("quotes");
    expect(early.steps.find((s) => s.id === "price")?.status).toBe("locked");
    expect(early.steps.every((s) => s.why.length > 20)).toBe(true);
  });

  it("is on the submit step when everything before it is done", () => {
    const w = buildWorkflow(flow());
    expect(w.steps.filter((s) => s.status === "done").map((s) => s.id)).toEqual(["fit", "prove", "quotes", "price", "docs", "check"]);
    expect(w.currentId).toBe("submit");
    expect(w.steps.find((s) => s.id === "win")?.status).toBe("locked");
  });

  it("unlocks the subcontractor step only after a win", () => {
    const f = flow();
    const won: FlowInput = { ...f, bid: { ...f.bid, submission: { submittedOn: TODAY, method: "portal", confirmation: "X", priceUsd: 4000, note: "" }, outcome: { result: "won", decidedOn: TODAY, awardUsd: 4000, note: "" } } };
    const w = buildWorkflow(won);
    expect(w.steps.find((s) => s.id === "win")?.status).toBe("todo");
    expect(w.currentId).toBe("win");
    const lost: FlowInput = { ...won, bid: { ...won.bid, outcome: { ...won.bid.outcome!, result: "lost" } } };
    expect(buildWorkflow(lost).steps.find((s) => s.id === "win")?.status).toBe("locked");
  });

  it("stops at a rejected bid", () => {
    const w = buildWorkflow(flow({ sourceOver: { terms: { ...cleanOpp().terms, subcontracting: "prohibited" } } }));
    expect(w.steps.find((s) => s.id === "fit")?.status).toBe("blocked");
    expect(w.currentId).toBe("fit");
  });

  it("accepts a bid you submitted yourself even if earlier steps were not tidy", () => {
    const f = flow({ bidReady: false });
    const w = buildWorkflow({ ...f, bid: { ...f.bid, submission: { submittedOn: TODAY, method: "portal", confirmation: "", priceUsd: null, note: "" } } });
    expect(w.steps.find((s) => s.id === "submit")?.status).toBe("done");
    expect(w.steps.find((s) => s.id === "result")?.status).toBe("todo");
  });
});

describe("subcontract term sheet", () => {
  it("appears once a subcontractor has quoted, goes to the subcontractor, and never shows the agency price", () => {
    const f = flow();
    const t = f.pkg.documents.find((d) => d.id === "subcontract-term-sheet")!;
    expect(t.audience).toBe("subcontractor");
    const body = text(t);
    expect(body).toContain("Acme Cleaning");
    expect(body).toContain("$2,600.00");
    expect(body).toMatch(/pay-when-paid/);
    expect(body).not.toContain("4,000"); // what the agency pays stays private
    expect(f.pkg.placeholders.some((p) => /Subcontractor legal name/.test(p))).toBe(false); // not part of the agency check
  });

  it("is not offered before there is anyone to send it to", () => {
    expect(flow({ bidReady: false }).pkg.documents.some((d) => d.id === "subcontract-term-sheet")).toBe(false);
  });

  it("does not change the fingerprint of what the agency reads", () => {
    expect(flow().pkg.digest).toBe(flow({ bidReady: false }).pkg.digest);
  });
});
