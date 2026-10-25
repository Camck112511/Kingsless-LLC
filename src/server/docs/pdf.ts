import "server-only";
/**
 * Renders bid documents into one PDF packet with pdf-lib (no browser, no fonts to ship). Plain, readable layout:
 * headings, paragraphs, bullets, key/value tables and bordered tables that paginate. Blanks the owner must fill in are
 * shown in red, and a page header says DRAFT while any remain.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { BidDocument, DocBlock } from "@/engine/types";

const W = 612;
const H = 792;
const ML = 64;
const MR = 64;
const MT = 70;
const MB = 70;
const CONTENT = W - ML - MR;
const PLACEHOLDER = /\[[^\]\n]{2,80} – to complete\]/g;

const REPLACE: Array<[RegExp, string]> = [
  [/≥/g, ">="], [/≤/g, "<="], [/→/g, "->"], [/✓/g, "x"], [/×/g, "x"], [/[   ]/g, " "], [/[‐‑‒]/g, "-"], [/[‘’]/g, "'"], [/[“”]/g, '"'],
];

/** Make text safe for the standard PDF fonts: map a few symbols, replace anything else they cannot draw with "?". */
function safe(font: PDFFont, text: string): string {
  let t = text;
  for (const [re, to] of REPLACE) t = t.replace(re, to);
  const set = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of t) out += ch === "\n" || set.has(ch.codePointAt(0)!) ? ch : "?";
  return out;
}

interface Word {
  text: string;
  blank: boolean;
}

/** Split a paragraph into words, remembering which belong to a [ … – to complete] marker. */
function words(text: string): Word[][] {
  return text.split("\n").map((line) => {
    const out: Word[] = [];
    let last = 0;
    const push = (chunk: string, blank: boolean) => chunk.split(/\s+/).filter(Boolean).forEach((w) => out.push({ text: w, blank }));
    for (const m of line.matchAll(PLACEHOLDER)) {
      push(line.slice(last, m.index), false);
      push(m[0], true);
      last = (m.index ?? 0) + m[0].length;
    }
    push(line.slice(last), false);
    return out;
  });
}

export async function renderPdf(docs: BidDocument[], opts: { footer: string; draft: boolean }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  pdf.setTitle(docs[0]?.title ?? "Bid");
  pdf.setCreator("Kingsless LLC");

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - MT;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - MT;
  };
  const ensure = (h: number) => {
    if (y - h < MB) newPage();
  };

  /**
   * Draw wrapped text; returns the height used. Set `measure` to only measure.
   * Words are measured with the font they will be drawn in, and each line is drawn in as few pieces as possible (one per
   * change between normal text and a red blank) so letter spacing stays natural.
   */
  function flow(text: string, o: { x: number; width: number; size: number; font?: PDFFont; color?: [number, number, number]; lead?: number; measure?: boolean; top?: number }): number {
    const f = o.font ?? font;
    const lead = o.lead ?? o.size * 1.38;
    let used = 0;
    let cy = o.top ?? y;
    const body = rgb(...(o.color ?? [0.1, 0.1, 0.1]));
    const red = rgb(0.75, 0.1, 0.1);

    const draw = (lineWords: Word[]) => {
      if (o.measure || lineWords.length === 0) return;
      if (cy - lead < MB && o.top === undefined) {
        newPage();
        cy = y;
      }
      const runs: Array<{ text: string; blank: boolean }> = [];
      for (const w of lineWords) {
        const last = runs[runs.length - 1];
        if (last && last.blank === w.blank) last.text += ` ${w.text}`;
        else runs.push({ text: w.text, blank: w.blank });
      }
      let cx = o.x;
      runs.forEach((r, i) => {
        const rf = r.blank ? bold : f;
        page.drawText(r.text, { x: cx, y: cy - o.size, size: o.size, font: rf, color: r.blank ? red : body });
        cx += rf.widthOfTextAtSize(r.text, o.size) + (i < runs.length - 1 ? f.widthOfTextAtSize(" ", o.size) : 0);
      });
    };

    for (const line of words(safe(f, text))) {
      let current: Word[] = [];
      let cx = 0;
      for (const w of line) {
        const wf = w.blank ? bold : f;
        const ww = wf.widthOfTextAtSize(w.text, o.size);
        const sp = f.widthOfTextAtSize(" ", o.size);
        if (current.length > 0 && cx + sp + ww > o.width) {
          draw(current);
          cy -= lead;
          used += lead;
          current = [];
          cx = 0;
        }
        cx += (current.length > 0 ? sp : 0) + ww;
        current.push(w);
      }
      draw(current);
      cy -= lead;
      used += lead;
    }
    if (!o.measure && o.top === undefined) y = cy;
    return used;
  }

  const height = (text: string, width: number, size: number, f: PDFFont = font) => flow(text, { x: 0, width, size, font: f, measure: true });

  function table(head: string[] | null, rows: string[][], widths: number[], size = 9.5) {
    const total = widths.reduce((s, x) => s + x, 0);
    const cols = widths.map((w) => (w / total) * CONTENT);
    const pad = 5;
    const drawRow = (cells: string[], header: boolean) => {
      const h = Math.max(...cells.map((c, i) => height(c, cols[i]! - pad * 2, size, header ? bold : font))) + pad * 2;
      ensure(h);
      let x = ML;
      cells.forEach((c, i) => {
        page.drawRectangle({ x, y: y - h, width: cols[i]!, height: h, borderColor: rgb(0.72, 0.72, 0.72), borderWidth: 0.6, color: header ? rgb(0.93, 0.93, 0.93) : undefined });
        flow(c, { x: x + pad, width: cols[i]! - pad * 2, size, font: header ? bold : font, top: y - pad });
        x += cols[i]!;
      });
      y -= h;
    };
    if (head) drawRow(head, true);
    for (const r of rows) {
      const h = Math.max(...r.map((c, i) => height(c, cols[i]! - pad * 2, size))) + pad * 2;
      if (y - h < MB) {
        newPage();
        if (head) drawRow(head, true);
      }
      drawRow(r, false);
    }
    y -= 10;
  }

  function render(b: DocBlock) {
    switch (b.t) {
      case "h": {
        const size = b.level === 1 ? 17 : b.level === 2 ? 13 : 11.5;
        ensure(size * 3 + 8);
        if (b.level > 1) y -= 8;
        flow(b.text, { x: ML, width: CONTENT, size, font: bold, color: [0.05, 0.05, 0.05] });
        y -= 4;
        break;
      }
      case "p":
        flow(b.text, { x: ML, width: CONTENT, size: 10.5 });
        y -= 6;
        break;
      case "note": {
        const h = height(b.text, CONTENT - 18, 9.5, italic) + 12;
        ensure(h);
        page.drawRectangle({ x: ML, y: y - h, width: CONTENT, height: h, color: rgb(0.955, 0.955, 0.955) });
        page.drawRectangle({ x: ML, y: y - h, width: 3, height: h, color: rgb(0.72, 0.53, 0.04) });
        flow(b.text, { x: ML + 12, width: CONTENT - 18, size: 9.5, font: italic, top: y - 6 });
        y -= h + 8;
        break;
      }
      case "bullets":
        for (const item of b.items) {
          ensure(16);
          page.drawText("•", { x: ML + 4, y: y - 10.5, size: 10.5, font, color: rgb(0.1, 0.1, 0.1) });
          flow(item, { x: ML + 18, width: CONTENT - 18, size: 10.5 });
          y -= 2;
        }
        y -= 4;
        break;
      case "sig":
        y -= 14;
        for (const line of b.lines) {
          ensure(16);
          flow(line, { x: ML, width: CONTENT, size: 10.5 });
        }
        y -= 6;
        break;
      case "kv":
        table(null, b.rows.map(([k, v]) => [k, v]), [30, 70]);
        break;
      case "table":
        table(b.head, b.rows, b.widths && b.widths.length === b.head.length ? b.widths : b.head.map(() => 1));
        break;
    }
  }

  const startPages: number[] = [];
  docs.forEach((d, i) => {
    if (i > 0) newPage();
    startPages.push(pdf.getPageCount() - 1);
    d.blocks.forEach(render);
  });

  // Header and footer on every page, once the page count is known.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `${opts.footer}  ·  Page ${i + 1} of ${pages.length}`;
    p.drawText(safe(font, label), { x: (W - font.widthOfTextAtSize(safe(font, label), 8)) / 2, y: 36, size: 8, font, color: rgb(0.45, 0.45, 0.45) });
    if (opts.draft) {
      const t = "DRAFT: blanks remain";
      p.drawText(t, { x: W - MR - bold.widthOfTextAtSize(t, 9), y: H - 40, size: 9, font: bold, color: rgb(0.75, 0.1, 0.1) });
    }
  });
  return pdf.save();
}
