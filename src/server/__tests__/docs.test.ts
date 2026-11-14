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
import { buildDocxFile, buildEml, buildPacketPdf, buildZip, safeName } from "../docs/package";

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

  it("builds an email draft with the PDF attached that desktop mail apps open ready to send", async () => {
    const packet = await buildPacketPdf(pkg(), "Kingsless D-1");
    const eml = buildEml({ to: "bids@county.gov", subject: "Bid D-1: Janitorial", text: "Please find attached our bid.\n\nThank you", attachment: { filename: packet.filename, data: packet.data } });
    dump("draft.eml", eml.data);
    expect(eml.mime).toBe("message/rfc822");
    expect(eml.filename).toMatch(/\.eml$/);
    const text = Buffer.from(eml.data).toString("utf8");
    expect(text).toMatch(/^X-Unsent: 1\r\nTo: bids@county\.gov\r\n/);
    expect(text).toContain("Content-Type: multipart/mixed");
    expect(text).toContain(`filename="${packet.filename}"`);
    // the attachment decodes back to the same PDF
    const b64 = text.split('Content-Disposition: attachment; filename="')[1]!.split("\r\n\r\n")[1]!.split("\r\n--")[0]!.replace(/\r\n/g, "");
    expect(Buffer.from(b64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    // and a body that decodes to what we wrote
    const body = text.split('charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1]!.split("\r\n--")[0]!.replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toContain("Please find attached our bid.");
  });

  it("cannot be used to inject extra email headers", () => {
    const eml = buildEml({ to: "a@b.gov\r\nBcc: evil@x.com", subject: "Hi\r\nBcc: evil@x.com", text: "x", attachment: { filename: 'a"\r\nX-Evil: 1.pdf', data: new Uint8Array([1]) } });
    const text = Buffer.from(eml.data).toString("utf8");
    expect(text.split("\r\n").some((l) => /^Bcc:/i.test(l) || /^X-Evil:/i.test(l))).toBe(false);
  });

  it("makes safe file names", () => {
    expect(safeName("A/B\\C:D  26-0268")).toBe("A-B-C-D-26-0268");
    expect(safeName("")).toBe("Bid");
  });
});
