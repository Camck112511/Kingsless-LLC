import fs from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyze } from "@/engine/analyze";
import { buildBidPackage } from "@/engine/bid-docs";
import { emptyBid } from "@/engine/config";
import type { BidRecord } from "@/engine/types";
import { cleanOpp, goodInputs, quote, settings, sub, TODAY, world } from "@/engine/__tests__/helpers";
import { bodyToText } from "../net/html";
import { buildDocxFile, buildPacketPdf, buildZip, safeName } from "../docs/package";

const contact = { companyName: "Kingsless LLC", contactName: "Cullen McKinney", email: "cullen@kingsless.org", phone: "(512) 217-7788", title: "Owner", address: "1 Main St, Austin, TX 78701", capability: "We deliver facility services through vetted subcontractors." };

function pkg(over: { contact?: object; price?: number | null } = {}) {
  const s = settings({ contact: { ...contact, ...over.contact } });
  const opp = cleanOpp({ provenance: { verified: true, checkedOn: TODAY, note: "" } });
  const inputs = goodInputs({ plannedBidUsd: over.price === undefined ? 4000 : over.price });
  const analysis = analyze({ opportunity: opp, inputs }, world({ settings: s, quotes: [quote()], subcontractors: [sub({ willingToSubcontract: "yes" })] }));
  const bid: BidRecord = emptyBid();
  return buildBidPackage({ opp, analysis, inputs, bid, settings: s, today: TODAY });
}

const dump = (name: string, data: Uint8Array) => {
  if (process.env.DUMP_DIR) {
    fs.mkdirSync(process.env.DUMP_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.DUMP_DIR, name), data);
  }
};

describe("bid files", () => {
  it("renders the agency documents into one readable PDF", async () => {
    const f = await buildPacketPdf(pkg(), "Kingsless D-1");
    dump("packet.pdf", f.data);
    expect(f.mime).toBe("application/pdf");
    expect(Buffer.from(f.data.subarray(0, 5)).toString()).toBe("%PDF-");
    const { text } = await bodyToText(Buffer.from(f.data), "application/pdf", "https://x/y.pdf");
    expect(text).toContain("$4,000.00");
    expect(text).toContain("Compliance matrix");
    expect(text).toContain("Cullen McKinney");
    expect(text).not.toContain("Bid summary"); // internal papers stay out of the packet
    expect(text).not.toMatch(/DRAFT/);
  });

  it("flags a packet that still has blanks", async () => {
    const f = await buildPacketPdf(pkg({ contact: { address: "" }, price: null }), "Kingsless D-1");
    dump("packet-draft.pdf", f.data);
    const { text } = await bodyToText(Buffer.from(f.data), "application/pdf", "https://x/y.pdf");
    expect(text).toContain("DRAFT");
    expect(text).toContain("to complete]");
  });

  it("renders Word files with the blanks highlighted", async () => {
    const f = (await buildDocxFile(pkg({ contact: { address: "" } }), "qualifications", "Kingsless D-1"))!;
    dump("qualifications.docx", f.data);
    const xml = strFromU8(unzipSync(f.data)["word/document.xml"]!);
    expect(xml).toContain("Company qualifications");
    expect(xml).toContain("Company mailing address");
    expect(xml).toMatch(/w:highlight w:val="yellow"/);
    expect(await buildDocxFile(pkg(), "nope", "x")).toBeNull();
  });

  it("zips the agency files, the packet, and an internal folder that is clearly marked", async () => {
    const z = await buildZip(pkg(), "Kingsless D-1");
    dump("bid.zip", z.data);
    const names = Object.keys(unzipSync(z.data));
    expect(names).toContain("Kingsless-D-1/01-Cover-Letter.docx");
    expect(names).toContain("Kingsless-D-1/06-Compliance-Matrix.docx");
    expect(names).toContain("Kingsless-D-1/Kingsless-D-1-Bid-Packet.pdf");
    expect(names).toContain("Kingsless-D-1/INTERNAL - DO NOT SEND/Bid-Summary.docx");
    expect(names.filter((n) => n.includes("Bid-Summary")).every((n) => n.includes("INTERNAL"))).toBe(true);
    expect(names).toContain("Kingsless-D-1/READ-ME.txt");
  });

  it("makes safe file names", () => {
    expect(safeName("A/B\\C:D  26-0268")).toBe("A-B-C-D-26-0268");
    expect(safeName("")).toBe("Bid");
  });
});
