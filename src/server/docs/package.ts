import "server-only";
/** Turns a bid package into files: one Word file per document, one combined PDF, and a ZIP of everything. PROTECTED. */
import { strToU8, zipSync } from "fflate";
import type { BidPackage } from "@/engine/types";
import { renderDocx } from "./docx";
import { renderPdf } from "./pdf";

export const safeName = (s: string): string => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "Bid";

export interface BuiltFile {
  filename: string;
  mime: string;
  data: Uint8Array;
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function buildPacketPdf(pkg: BidPackage, label: string): Promise<BuiltFile> {
  const agency = pkg.documents.filter((d) => d.audience === "agency");
  const data = await renderPdf(agency, { footer: label, draft: pkg.placeholders.length > 0 });
  return { filename: `${safeName(label)}-Bid-Packet.pdf`, mime: "application/pdf", data };
}

export async function buildDocxFile(pkg: BidPackage, id: string, label: string): Promise<BuiltFile | null> {
  const d = pkg.documents.find((x) => x.id === id);
  if (!d) return null;
  return { filename: `${d.filename}.docx`, mime: DOCX, data: new Uint8Array(await renderDocx(d, label)) };
}

const clean = (s: string): string => s.replace(/[\r\n]+/g, " ").trim();
const wrap = (b64: string): string => (b64.match(/.{1,76}/g) ?? []).join("\r\n");

/**
 * An email draft as a .eml file: recipient, subject and message filled in, the PDF packet attached. Desktop mail apps open it
 * as a message ready to send (the X-Unsent header marks it a draft). Nothing is sent by us.
 */
export function buildEml(o: { to: string; subject: string; text: string; attachment: { filename: string; data: Uint8Array } }): BuiltFile {
  const boundary = `kl-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const body = Buffer.from(o.text, "utf8").toString("base64");
  const file = Buffer.from(o.attachment.data).toString("base64");
  const name = clean(o.attachment.filename).replace(/"/g, "");
  const eml = [
    "X-Unsent: 1",
    ...(clean(o.to) ? [`To: ${clean(o.to)}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(clean(o.subject), "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(body),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${name}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${name}"`,
    "",
    wrap(file),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return { filename: `${name.replace(/\.pdf$/i, "")}.eml`, mime: "message/rfc822", data: new Uint8Array(Buffer.from(eml, "utf8")) };
}

export async function buildZip(pkg: BidPackage, label: string): Promise<BuiltFile> {
  const base = safeName(label);
  const files: Record<string, Uint8Array> = {};
  for (const d of pkg.documents) {
    const bytes = new Uint8Array(await renderDocx(d, label));
    const folder = d.audience === "internal" ? "INTERNAL - DO NOT SEND/" : d.audience === "subcontractor" ? "FOR THE SUBCONTRACTOR/" : "";
    files[`${base}/${folder}${d.filename}.docx`] = bytes;
  }
  files[`${base}/${base}-Bid-Packet.pdf`] = (await buildPacketPdf(pkg, label)).data;
  files[`${base}/READ-ME.txt`] = strToU8(
    [
      `${label}`,
      "",
      "Send: the numbered Word files (edit them first) or Bid-Packet.pdf (same content, one file).",
      "Keep: everything in the INTERNAL - DO NOT SEND folder.",
      "FOR THE SUBCONTRACTOR (when present): the term sheet to send your subcontractor. It never shows what the agency pays you.",
      pkg.placeholders.length ? `\nStill to complete (highlighted in the Word files, red in the PDF):\n- ${pkg.placeholders.join("\n- ")}` : "\nNo blanks remain.",
      "",
      "These are drafts prepared from the facts in the console. You are responsible for reading and signing them.",
    ].join("\n"),
  );
  return { filename: `${base}.zip`, mime: "application/zip", data: zipSync(files, { level: 6 }) };
}
