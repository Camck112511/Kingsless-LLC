import { prepareBid } from "@/server/bid-context";
import { adminGuard } from "@/server/auth";
import { buildDocxFile, buildPacketPdf, buildZip, safeName } from "@/server/docs/package";
import { fail, noStore, readJson } from "@/server/http";
import { BidDownloadRequestSchema } from "@/server/schemas";

export const maxDuration = 60;

/** Word file, combined PDF packet, or a ZIP of everything. These are drafts: nothing is sent anywhere. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, BidDownloadRequestSchema, 4_000_000);
  if ("error" in body) return body.error;
  const { pkg, label } = prepareBid(body.data);
  try {
    const file =
      body.data.format === "zip"
        ? await buildZip(pkg, label)
        : body.data.format === "pdf"
          ? await buildPacketPdf(pkg, label)
          : body.data.doc
            ? await buildDocxFile(pkg, body.data.doc, label)
            : null;
    if (!file) return fail(400, "Choose a document to download.");
    return new Response(Buffer.from(file.data), {
      headers: { ...noStore, "Content-Type": file.mime, "Content-Disposition": `attachment; filename="${safeName(file.filename.replace(/\.[^.]+$/, ""))}${file.filename.match(/\.[^.]+$/)?.[0] ?? ""}"` },
    });
  } catch {
    return fail(500, "Could not build the document. Try again.");
  }
}
