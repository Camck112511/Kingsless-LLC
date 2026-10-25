import "server-only";
/**
 * Fetch a public web page on behalf of the admin, safely.
 *
 * The console is asked to read addresses the admin pastes (and ones an AI search returned), so this must not become a
 * way to reach the server's own network. Defences, in order:
 *   - http(s) only, ports 80/443 only, no credentials in the URL;
 *   - the host is resolved HERE and every address must be a public one (no loopback, private, link-local, metadata,
 *     carrier-grade NAT, multicast, documentation or transition ranges);
 *   - the connection is pinned to the address that was checked (no second DNS lookup, so DNS rebinding cannot swap it);
 *   - redirects are followed by hand, each hop re-checked, at most 4;
 *   - response size (after decompression) and time are capped; only text-like and PDF content is accepted.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

const v4Blocked = new net.BlockList();
for (const [net4, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  v4Blocked.addSubnet(net4, bits, "ipv4");
}

/** IPv6: only global unicast (2000::/3) is allowed, minus documentation, Teredo and 6to4 ranges. */
const v6Global = new net.BlockList();
v6Global.addSubnet("2000::", 3, "ipv6");
const v6Excluded = new net.BlockList();
v6Excluded.addSubnet("2001::", 32, "ipv6");
v6Excluded.addSubnet("2001:db8::", 32, "ipv6");
v6Excluded.addSubnet("2002::", 16, "ipv6");

/** True when the address must never be fetched. Anything that is not a valid IP is blocked. */
export function isBlockedAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return v4Blocked.check(ip, "ipv4");
  if (kind === 6) return !v6Global.check(ip, "ipv6") || v6Excluded.check(ip, "ipv6");
  return true;
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  accept?: string;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: Buffer;
}

const ALLOWED_TYPES = /^(text\/|application\/(xhtml\+xml|xml|rss\+xml|atom\+xml|rdf\+xml|json|pdf))/i;
const USER_AGENT = "KingslessBidScout/1.0 (+https://kingsless.com)";

type Lookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const systemLookup: Lookup = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

export interface SafeFetchDeps {
  isBlocked?: (ip: string) => boolean;
  lookup?: Lookup;
  /** Tests only: lets a local server on a random port be reached. The routes never set this. */
  allowAnyPort?: boolean;
}

export function createSafeFetch(deps: SafeFetchDeps = {}) {
  const isBlocked = deps.isBlocked ?? isBlockedAddress;
  const lookup = deps.lookup ?? systemLookup;
  async function resolve(host: string): Promise<{ address: string; family: 4 | 6 }> {
    const bare = host.replace(/^\[|\]$/g, "");
    const addrs = net.isIP(bare) ? [{ address: bare, family: net.isIP(bare) }] : await lookup(bare).catch(() => []);
    if (addrs.length === 0) throw new FetchError("Could not find that address (DNS lookup failed).", 502);
    // One bad answer poisons the lot: a name that resolves to both a public and a private address is refused.
    if (addrs.some((a) => isBlocked(a.address))) throw new FetchError("That address points to a private or reserved network and was not fetched.", 400);
    const pick = addrs[0]!;
    return { address: pick.address, family: pick.family === 6 ? 6 : 4 };
  }

  function once(url: URL, pinned: { address: string; family: 4 | 6 }, opts: Required<SafeFetchOptions>): Promise<{ res: http.IncomingMessage; req: http.ClientRequest }> {
    return new Promise((resolveP, rejectP) => {
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname.replace(/^\[|\]$/g, ""),
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: "GET",
          headers: { "User-Agent": USER_AGENT, Accept: opts.accept, "Accept-Encoding": "gzip, deflate, br", "Accept-Language": "en-US,en;q=0.9" },
          // Pin the connection to the address that was validated. Node may ask for one address or all of them.
          lookup: ((_host: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) => {
            if (options?.all) cb(null, [{ address: pinned.address, family: pinned.family }]);
            else cb(null, pinned.address, pinned.family);
          }) as net.LookupFunction,
          timeout: opts.timeoutMs,
        },
        (res) => resolveP({ res, req }),
      );
      req.on("timeout", () => req.destroy(new FetchError("The site took too long to answer.", 504)));
      req.on("error", (err) => rejectP(err instanceof FetchError ? err : new FetchError("Could not connect to that site.", 502)));
      req.end();
    });
  }

  async function readBody(res: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
    const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
    const stream: NodeJS.ReadableStream =
      enc === "gzip" || enc === "x-gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
    const chunks: Buffer[] = [];
    let size = 0;
    return new Promise((resolveP, rejectP) => {
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          res.destroy();
          rejectP(new FetchError(`That page is larger than ${Math.round(maxBytes / 1_000_000)} MB, so it was not read.`, 413));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => resolveP(Buffer.concat(chunks)));
      stream.on("error", () => rejectP(new FetchError("The site's answer could not be read.", 502)));
      res.on("error", () => rejectP(new FetchError("The connection dropped while reading.", 502)));
    });
  }

  return async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
    const opts: Required<SafeFetchOptions> = {
      maxBytes: options.maxBytes ?? 3_000_000,
      timeoutMs: options.timeoutMs ?? 15_000,
      maxRedirects: options.maxRedirects ?? 4,
      accept: options.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,text/plain;q=0.7,*/*;q=0.1",
    };
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      throw new FetchError("That is not a valid web address.", 400);
    }
    const deadline = Date.now() + opts.timeoutMs * 2;
    for (let hop = 0; hop <= opts.maxRedirects; hop++) {
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchError("Only http and https addresses can be read.", 400);
      if (url.username || url.password) throw new FetchError("Addresses with a username or password are not allowed.", 400);
      if (!deps.allowAnyPort && url.port && url.port !== "80" && url.port !== "443") throw new FetchError("Only the standard web ports (80 and 443) are allowed.", 400);
      if (!url.hostname) throw new FetchError("That is not a valid web address.", 400);
      if (Date.now() > deadline) throw new FetchError("The site took too long to answer.", 504);

      const pinned = await resolve(url.hostname);
      const { res } = await once(url, pinned, opts);
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        try {
          url = new URL(res.headers.location, url);
        } catch {
          throw new FetchError("The site redirected to an invalid address.", 502);
        }
        continue;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        throw new FetchError(status === 404 ? "That page was not found (404)." : status === 403 || status === 401 ? "That site refused automated access. Open it in your browser and paste the text instead." : `The site answered with HTTP ${status}.`, 502);
      }
      const contentType = String(res.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      if (contentType && !ALLOWED_TYPES.test(contentType)) {
        res.resume();
        throw new FetchError(`That link is a ${contentType} file, not a web page, document or feed.`, 415);
      }
      const body = await readBody(res, opts.maxBytes);
      return { finalUrl: url.toString(), status, contentType, body };
    }
    throw new FetchError("Too many redirects.", 502);
  };
}

export const safeFetch = createSafeFetch();
