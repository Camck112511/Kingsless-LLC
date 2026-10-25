import "server-only";
/**
 * RSS 2.0, Atom and RDF bid-notice feeds. Many city, county, state and agency portals publish one. The parser is pure
 * (parseFeed) so it can be tested on fixtures; readFeed adds the safe fetch.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { XMLParser } from "fast-xml-parser";
import { parseDate } from "@/engine/extract";
import { decodeEntities, htmlToText } from "../net/html";
import { safeFetch } from "../net/safe-fetch";
import { cleanDate, safeHttpUrl, type Lead } from "./leads";

export interface FeedItem {
  title: string;
  link: string;
  summary: string;
  published: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
});

const arr = <T,>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/** Text of an XML node that may be a string, an object with #text, or CDATA. */
function text(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("#text" in o) return text(o["#text"]);
  }
  return "";
}

function atomLink(link: unknown): string {
  const links = arr(link as Record<string, unknown> | string);
  for (const l of links) {
    if (typeof l === "string") return l;
    const rel = String((l as Record<string, unknown>)["@_rel"] ?? "alternate");
    const href = String((l as Record<string, unknown>)["@_href"] ?? "");
    if (href && (rel === "alternate" || rel === "")) return href;
  }
  const first = links[0];
  return first && typeof first === "object" ? String((first as Record<string, unknown>)["@_href"] ?? "") : "";
}

function isoFrom(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? cleanDate(raw) : d.toISOString().slice(0, 10);
}

export function parseFeed(xml: string): FeedItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  const out: FeedItem[] = [];
  const rss = doc.rss as { channel?: { item?: unknown } } | undefined;
  const rdf = doc["rdf:RDF"] as { item?: unknown } | undefined;
  const atom = doc.feed as { entry?: unknown } | undefined;

  for (const it of [...arr(rss?.channel?.item), ...arr(rdf?.item)] as Array<Record<string, unknown>>) {
    out.push({
      title: decodeEntities(text(it.title)).trim(),
      link: text(it.link).trim() || text(it.guid).trim(),
      summary: htmlToText(text(it.description) || text(it["content:encoded"])).slice(0, 3000),
      published: isoFrom(text(it.pubDate) || text(it["dc:date"])),
    });
  }
  for (const it of arr(atom?.entry) as Array<Record<string, unknown>>) {
    out.push({
      title: decodeEntities(text(it.title)).trim(),
      link: atomLink(it.link).trim(),
      summary: htmlToText(text(it.summary) || text(it.content)).slice(0, 3000),
      published: isoFrom(text(it.updated) || text(it.published)),
    });
  }
  return out.filter((i) => i.title && safeHttpUrl(i.link));
}

const DUE_CUE = /\b(?:due|closes?|closing|deadline|responses?\s+due|bids?\s+due|submit(?:tal)?s?\s+by|opening)\b[^.\n]{0,60}/i;

/** A due date only when the text pairs a deadline cue with a date. A bare date might be anything. */
export function dueDateFromText(s: string): string | null {
  const cue = DUE_CUE.exec(s);
  if (!cue) return null;
  const tail = s.slice(cue.index, cue.index + 140);
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(tail);
  return iso ? cleanDate(iso[1]!) : parseDate(tail);
}

export function feedItemToLead(item: FeedItem, feedName: string): Lead {
  const blob = `${item.title}. ${item.summary}`;
  return {
    title: item.title.slice(0, 300),
    agency: feedName,
    solicitationNumber: /\b(?:RFP|RFQ|IFB|ITB|RFB|Bid)\s*(?:No\.?|#|Number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-./]{2,30})/i.exec(blob)?.[1] ?? "",
    city: "",
    state: "",
    dueDate: dueDateFromText(blob),
    postedDate: item.published,
    estimatedValueUsd: null,
    naics: /\bNAICS\s*(?:code)?\s*[:#]?\s*(\d{6})\b/i.exec(blob)?.[1] ?? null,
    level: null,
    portal: feedName,
    sourceUrl: safeHttpUrl(item.link) ?? "",
    summary: item.summary || item.title,
    whyItFits: "",
    documents: [],
  };
}

export interface FeedRead {
  url: string;
  name: string;
  leads: Lead[];
  error: string | null;
}

export async function readFeed(url: string): Promise<FeedRead> {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep raw */
  }
  try {
    const res = await safeFetch(url, { maxBytes: 3_000_000, accept: "application/rss+xml,application/atom+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.1" });
    const raw = res.body.toString("utf8");
    if (!/<(rss|feed|rdf:RDF)\b/i.test(raw.slice(0, 5000))) {
      // Not a feed: say so, but still try to be useful by reading it as a page elsewhere.
      return { url, name: host, leads: [], error: "That address is a web page, not a feed. Use Import a link for pages." };
    }
    const items = parseFeed(raw).slice(0, 100);
    return { url, name: host, leads: items.map((i) => feedItemToLead(i, host)), error: null };
  } catch (err) {
    return { url, name: host, leads: [], error: err instanceof Error ? err.message : "Could not read that feed." };
  }
}
