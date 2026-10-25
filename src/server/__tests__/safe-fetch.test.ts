import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bodyToText, documentLinks, htmlToText, pageTitle } from "../net/html";
import { createSafeFetch, isBlockedAddress, safeFetch } from "../net/safe-fetch";

describe("address filter", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "240.0.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "2001:db8::1", "2002:7f00:1::", "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"])("allows the public address %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe("safeFetch refuses unsafe targets before connecting", () => {
  it.each([
    ["http://127.0.0.1/", /private or reserved/],
    ["http://localhost/", /private or reserved/],
    ["http://169.254.169.254/latest/meta-data/", /private or reserved/],
    ["http://[::1]/", /private or reserved/],
    ["http://10.0.0.5:80/", /private or reserved/],
    ["file:///etc/passwd", /Only http/],
    ["ftp://example.com/", /Only http/],
    ["https://user:pw@example.com/", /username or password/],
    ["https://example.com:8080/", /standard web ports/],
    ["not a url", /not a valid web address/],
  ])("%s", async (url, message) => {
    await expect(safeFetch(url)).rejects.toThrow(message);
  });

  it("refuses a name that resolves to a mix of public and private addresses", async () => {
    const f = createSafeFetch({
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
    });
    await expect(f("https://rebind.example/")).rejects.toThrow(/private or reserved/);
  });
});

describe("safeFetch against a local server (guard disabled for the test only)", () => {
  let server: http.Server;
  let base: string;
  const big = Buffer.alloc(200_000, "a");

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? "/";
      if (url === "/page") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end("<html><head><title>Bid &amp; Notice</title></head><body><h1>Grading</h1><p>Due Nov 5.</p></body></html>");
      } else if (url === "/gzip") {
        res.setHeader("content-type", "text/plain");
        res.setHeader("content-encoding", "gzip");
        res.end(zlib.gzipSync("zipped text"));
      } else if (url === "/bomb") {
        res.setHeader("content-type", "text/plain");
        res.setHeader("content-encoding", "gzip");
        res.end(zlib.gzipSync(Buffer.alloc(5_000_000, "a")));
      } else if (url === "/big") {
        res.setHeader("content-type", "text/plain");
        res.end(big);
      } else if (url === "/redir") {
        res.statusCode = 302;
        res.setHeader("location", "/page");
        res.end();
      } else if (url === "/loop") {
        res.statusCode = 302;
        res.setHeader("location", "/loop");
        res.end();
      } else if (url === "/image") {
        res.setHeader("content-type", "image/png");
        res.end("x");
      } else if (url === "/denied") {
        res.statusCode = 403;
        res.end("no");
      } else {
        res.statusCode = 404;
        res.end("nope");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const open = () => createSafeFetch({ isBlocked: () => false, allowAnyPort: true });
  const get = (path: string, opts = {}) => open()(`${base}${path}`, opts);

  it("reads a page", async () => {
    const r = await get("/page");
    expect(r.status).toBe(200);
    expect(r.contentType).toBe("text/html");
    const t = await bodyToText(r.body, r.contentType, r.finalUrl);
    expect(t.title).toBe("Bid & Notice");
    expect(t.text).toContain("Due Nov 5.");
  });

  it("follows a redirect and reports the final address", async () => {
    const r = await get("/redir");
    expect(r.finalUrl).toBe(`${base}/page`);
  });

  it("gives up on a redirect loop", async () => {
    await expect(get("/loop")).rejects.toThrow(/Too many redirects/);
  });

  it("decompresses gzip", async () => {
    expect((await get("/gzip")).body.toString()).toBe("zipped text");
  });

  it("caps the size of what it reads, including after decompression", async () => {
    await expect(get("/big", { maxBytes: 100_000 })).rejects.toThrow(/larger than/);
    await expect(get("/bomb", { maxBytes: 1_000_000 })).rejects.toThrow(/larger than/);
  });

  it("refuses non-document content types and explains refusals", async () => {
    await expect(get("/image")).rejects.toThrow(/image\/png/);
    await expect(get("/denied")).rejects.toThrow(/refused automated access/);
    await expect(get("/missing")).rejects.toThrow(/404/);
  });

  it("the default guard refuses to follow a redirect into a private network", async () => {
    const hop = http.createServer((_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", "http://169.254.169.254/latest/meta-data/");
      res.end();
    });
    await new Promise<void>((r) => hop.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(hop.address() as AddressInfo).port}/`;
    // Only the first host is allowed by this test fetch; the redirect target is checked by the real filter.
    const f = createSafeFetch({ isBlocked: (ip) => ip !== "127.0.0.1" && isBlockedAddress(ip), allowAnyPort: true });
    await expect(f(url)).rejects.toThrow(/private or reserved/);
    await new Promise<void>((r) => hop.close(() => r()));
  });
});

describe("HTML to text", () => {
  const html = `<html><head><title>Bid &amp; Notice &#8211; Grading</title><style>.x{}</style></head>
    <body><script>var x=1</script><h1>Site Grading</h1><p>Due <b>Nov&nbsp;5</b>, 2026.</p>
    <ul><li>Clearing</li><li>Grading</li></ul><table><tr><td>Pay</td><td>Net 30</td></tr></table>
    <a href="/docs/spec.pdf">Specifications (PDF)</a> <a href="mailto:a@b.c">mail</a> <a href="/x.zip?v=2">Plans</a> <a href="/docs/spec.pdf">dup</a></body></html>`;

  it("strips scripts and styles, keeps structure and decodes entities", () => {
    const t = htmlToText(html);
    expect(t).toContain("Site Grading");
    expect(t).toContain("Due Nov 5, 2026.");
    expect(t).toMatch(/- Clearing\n- Grading/);
    expect(t).toContain("Pay | Net 30");
    expect(t).not.toContain("var x");
    expect(t).not.toContain(".x{}");
    expect(pageTitle(html)).toBe("Bid & Notice – Grading");
  });

  it("lists document links once, resolved against the page", () => {
    expect(documentLinks(html, "https://city.example/bids/12")).toEqual([
      { label: "Specifications (PDF)", url: "https://city.example/docs/spec.pdf" },
      { label: "Plans", url: "https://city.example/x.zip?v=2" },
    ]);
  });

  it("treats plain text as text", async () => {
    const r = await bodyToText(Buffer.from("Just text."), "text/plain", "https://x.example/a.txt");
    expect(r.text).toBe("Just text.");
  });

  it("reads text out of a PDF", async () => {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage().drawText("Subcontracting is not permitted under this solicitation.", { x: 40, y: 700, size: 12, font });
    const bytes = Buffer.from(await doc.save());
    const r = await bodyToText(bytes, "application/pdf", "https://x.example/Solicitation%20A.pdf");
    expect(r.text).toContain("Subcontracting is not permitted");
    expect(r.title).toBe("Solicitation A");
  });
});
