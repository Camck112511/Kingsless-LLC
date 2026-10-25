import "server-only";
/** Renders a BidDocument to an editable Word file. Blanks the owner must fill in are highlighted yellow. PROTECTED. */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { BidDocument, DocBlock } from "@/engine/types";

const PLACEHOLDER = /(\[[^\]\n]{2,80} – to complete\])/g;
const LINE = { style: BorderStyle.SINGLE, size: 4, color: "B8B8B8" } as const;
const BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE } as const;

/** Text with line breaks and highlighted blanks. */
function runs(text: string, base: { bold?: boolean; italics?: boolean; size?: number } = {}): TextRun[] {
  const out: TextRun[] = [];
  text.split("\n").forEach((line, li) => {
    line.split(PLACEHOLDER).forEach((part, pi) => {
      if (part === "") return;
      const blank = pi % 2 === 1;
      out.push(new TextRun({ text: part, bold: base.bold || blank, italics: base.italics, size: base.size, highlight: blank ? "yellow" : undefined, break: li > 0 && pi === 0 ? 1 : undefined }));
    });
  });
  return out.length ? out : [new TextRun({ text: "" })];
}

const HEADING = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 } as const;

function cell(text: string, widthPct: number, opts: { header?: boolean } = {}): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: BORDERS,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: opts.header ? { type: ShadingType.CLEAR, fill: "EDEDED", color: "auto" } : undefined,
    children: [new Paragraph({ children: runs(text, { bold: opts.header, size: 20 }) })],
  });
}

function block(b: DocBlock): Array<Paragraph | Table> {
  switch (b.t) {
    case "h":
      return [new Paragraph({ heading: HEADING[b.level], spacing: { before: b.level === 1 ? 0 : 240, after: 120 }, children: runs(b.text, { bold: true, size: b.level === 1 ? 32 : b.level === 2 ? 26 : 23 }) })];
    case "p":
      return [new Paragraph({ spacing: { after: 140 }, children: runs(b.text) })];
    case "note":
      return [new Paragraph({ spacing: { before: 120, after: 140 }, shading: { type: ShadingType.CLEAR, fill: "F3F3F3", color: "auto" }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: "B8860B", space: 8 } }, children: runs(b.text, { italics: true, size: 20 }) })];
    case "bullets":
      return b.items.map((item) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: runs(item) }));
    case "sig":
      return b.lines.map((line, i) => new Paragraph({ spacing: { before: i === 0 ? 240 : 0, after: 40 }, children: runs(line) }));
    case "kv": {
      const kw = 30;
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: b.rows.map(([k, v]) => new TableRow({ children: [cell(k, kw, { header: true }), cell(v, 100 - kw)] })),
        }),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
    }
    case "table": {
      const n = b.head.length;
      const widths = b.widths && b.widths.length === n ? b.widths : b.head.map(() => Math.floor(100 / n));
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: b.head.map((h, i) => cell(h, widths[i]!, { header: true })) }),
            ...b.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i]!)) })),
          ],
        }),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
    }
  }
}

export async function renderDocx(doc: BidDocument, footerText: string): Promise<Buffer> {
  const d = new Document({
    creator: "Kingsless LLC",
    title: doc.title,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: "Calibri" } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: "Calibri" } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, font: "Calibri" } },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1260, bottom: 1260, left: 1300, right: 1300 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${footerText}  ·  Page `, size: 16, color: "777777" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "777777" })] })],
          }),
        },
        children: doc.blocks.flatMap(block),
      },
    ],
  });
  return Packer.toBuffer(d);
}
