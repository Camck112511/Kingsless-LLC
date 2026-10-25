/** Small, dependency-free HTML to text helpers for reading solicitation pages. PROTECTED. */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  bull: "•", hellip: "…", middot: "·", copy: "©", reg: "®", deg: "°", times: "×", sect: "§", para: "¶", frac12: "½",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function pageTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]!.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim().slice(0, 300) : "";
}

export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|head|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|ul|ol|table|h[1-6]|tr|form|pre|blockquote)\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(td|th)\s*>/gi, " | ")
    .replace(/<\/?(b|i|u|em|strong|span|a|font|small|sup|sub|mark|abbr|code|label)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/ ?\|\s*\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface PageLink {
  label: string;
  url: string;
}

/** Links to documents (PDF, Word, Excel, ZIP) on the page, resolved against its address. */
export function documentLinks(html: string, base: string, limit = 25): PageLink[] {
  const out: PageLink[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  for (let m = re.exec(html); m && out.length < limit; m = re.exec(html)) {
    const href = decodeEntities((m[1] ?? m[2] ?? "").trim());
    if (!/\.(pdf|docx?|xlsx?|zip)(\?|#|$)/i.test(href)) continue;
    let url: string;
    try {
      const u = new URL(href, base);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      url = u.toString();
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const label = decodeEntities((m[3] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    out.push({ label: (label || url.split("/").pop() || "Document").slice(0, 120), url });
  }
  return out;
}

/** Plain text from a fetched body, whatever it is. */
export async function bodyToText(body: Buffer, contentType: string, finalUrl: string): Promise<{ title: string; text: string; links: PageLink[] }> {
  if (contentType === "application/pdf" || body.subarray(0, 5).toString("latin1") === "%PDF-") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(body));
    const { text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : text;
    return { title: decodeURIComponent(finalUrl.split("/").pop()?.split("?")[0] ?? "").replace(/\.pdf$/i, ""), text: joined.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), links: [] };
  }
  const raw = body.toString("utf8");
  if (/html|xml/i.test(contentType) && /<html|<body|<!doctype html/i.test(raw.slice(0, 2000))) {
    return { title: pageTitle(raw), text: htmlToText(raw), links: documentLinks(raw, finalUrl) };
  }
  return { title: "", text: raw.trim(), links: [] };
}
