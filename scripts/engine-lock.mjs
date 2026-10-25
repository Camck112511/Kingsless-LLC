#!/usr/bin/env node
/**
 * Engine integrity lock.
 *
 * The files listed in PROTECTED hold the money math, the verdict rules, the admin security, and the guard rails
 * themselves. `npm run build` (and therefore every Vercel deploy) runs `check` first, so a commit that changes any of
 * them without the owner re-locking FAILS THE BUILD and the previous deployment stays live.
 *
 *   node scripts/engine-lock.mjs check                          compare files to engine.lock.json
 *   node scripts/engine-lock.mjs write --i-am-the-owner         record the current files as the new baseline
 *
 * Only the owner re-locks, and only after deliberately changing the engine. See AGENTS.project.md.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LOCK = join(ROOT, "engine.lock.json");

/** Directories are protected recursively; plain entries are single files. */
const PROTECTED = [
  "src/engine",
  "src/server",
  "src/lib",
  "src/proxy.ts",
  "src/app/api",
  "scripts/engine-lock.mjs",
  ".github",
  "AGENTS.md",
  "AGENTS.project.md",
  "CLAUDE.md",
  "eslint.config.mjs",
  "next.config.ts",
  "vitest.config.ts",
  ".env.example",
  ".env.development",
];
/** package.json is only partly protected: dependencies may change, but the scripts (which run this check) may not. */
const PACKAGE_JSON_KEYS = ["scripts", "engines"];

const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

function walk(path, out) {
  const abs = join(ROOT, path);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isFile()) {
    out.push(path);
    return;
  }
  for (const name of readdirSync(abs).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    walk(`${path}/${name}`, out);
  }
}

const sha = (text) => createHash("sha256").update(text).digest("hex");
/** Line endings must not matter (Windows checkouts). */
const normalize = (buf) => buf.toString("utf8").replace(/\r\n/g, "\n");

function snapshot() {
  const files = [];
  for (const p of PROTECTED) walk(p, files);
  const result = {};
  for (const f of [...new Set(files)].sort()) result[f] = sha(normalize(readFileSync(join(ROOT, f))));
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const picked = Object.fromEntries(PACKAGE_JSON_KEYS.map((k) => [k, pkg[k] ?? null]));
  result["package.json#" + PACKAGE_JSON_KEYS.join(",")] = sha(JSON.stringify(picked));
  return result;
}

const [, , command, ...flags] = process.argv;

if (command === "write") {
  if (!flags.includes("--i-am-the-owner")) {
    console.error(
      "Refusing to re-lock. Re-locking accepts changes to the engine, security and guard-rail files.\n" +
        "Only the owner may do this, after deliberately changing them. If you are an AI assistant: STOP, and ask the owner.",
    );
    process.exit(2);
  }
  const files = snapshot();
  writeFileSync(LOCK, JSON.stringify({ version: 1, files }, null, 2) + "\n");
  console.log(`Locked ${Object.keys(files).length} protected files into ${relative(ROOT, LOCK)}.`);
  process.exit(0);
}

if (command === "check") {
  if (!existsSync(LOCK)) {
    console.error("engine.lock.json is missing. The owner must run `npm run engine:lock`.");
    process.exit(1);
  }
  const locked = JSON.parse(readFileSync(LOCK, "utf8")).files ?? {};
  const now = snapshot();
  const modified = Object.keys(now).filter((f) => f in locked && locked[f] !== now[f]);
  const added = Object.keys(now).filter((f) => !(f in locked));
  const deleted = Object.keys(locked).filter((f) => !(f in now));
  if (modified.length + added.length + deleted.length === 0) {
    console.log(`Engine lock OK (${Object.keys(now).length} protected files unchanged).`);
    process.exit(0);
  }
  console.error("\nENGINE LOCK FAILED: protected files differ from the owner's locked baseline.\n");
  for (const [label, list] of [["Modified", modified], ["Added", added], ["Deleted", deleted]]) {
    if (list.length) console.error(`${label}:\n${list.map((f) => `  - ${f}`).join("\n")}\n`);
  }
  console.error(
    "These files contain the engine's calculations, the admin security and the guard rails.\n" +
      "Layout/UI work must not touch them. Revert these changes (git checkout -- <file>).\n" +
      "If the OWNER explicitly asked for an engine change: update the tests, run `npm run verify`, then `npm run engine:lock`.\n",
  );
  process.exit(1);
}

console.error("Usage: node scripts/engine-lock.mjs <check | write --i-am-the-owner>");
process.exit(2);
