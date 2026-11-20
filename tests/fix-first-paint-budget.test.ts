// @vitest-environment node
// Red test for a chat-requested fix: first paint must not wait for the data chunk. TESTING.md budget:
// initial JS <= 250 KiB gzip; the scan (tests/hl-011a-fix1) counts only the entry's static imports.
// B1 moved run data to a lazy chunk, but the entry awaits it at module top level
// (`await import(...)`), so the page cannot render until that chunk has also downloaded. This test
// counts the initial scripts PLUS every chunk the entry awaits at top level (limit 256,000 bytes, the
// figure the request names). Same gzip method as scripts/perf-lib.ts. Builds into a temp outDir.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { gzipBytes, initialScriptPaths } from "../scripts/perf-lib.ts";

const repo = fileURLToPath(new URL("..", import.meta.url));
const LIMIT = 256_000;
let dist = "";
let initial: string[] = [];
const awaited: string[] = [];
const awaitedIn: string[] = [];

/**
 * Any top-level `await` in the file (module-level, brace depth 0), whatever it awaits: `await import()`,
 * `await H(async()=>...)`, or `await request`. An `await` straight after `=>` is the body of an async
 * arrow and is not top level. Returns the offsets.
 */
function topLevelAwaits(code: string): number[] {
  // Braces inside strings and template literals are balanced in minified output, so plain counting holds.
  const text = code;
  const out: number[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (depth <= 0 && text.startsWith("await", i) && !/[\w$]/.test(text[i - 1] ?? "") && !/[\w$]/.test(text[i + 5] ?? "")) {
      if (!text.slice(Math.max(0, i - 3), i).trimEnd().endsWith("=>")) out.push(i);
    }
  }
  return out;
}

/** Local chunks a file names with dynamic `import("./x.js")` or as Vite preload deps (`__vite__mapDeps` strings). */
function dynamicAndPreloaded(file: string, code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/import\(\s*[`"']([^`"']+)[`"']/g)) out.push(normalize(join(dirname(file), m[1])));
  for (const m of code.matchAll(/["'`](assets\/[^"'`]+\.js)["'`]/g)) out.push(normalize(m[1]));
  return out;
}

/** Static imports of a chunk: `from"./x.js"` and bare `import"./x.js"`. */
function staticImports(file: string, code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/(?:\bfrom|\bimport)\s*["'`](\.[^"'`]+\.js)["'`]/g)) out.push(normalize(join(dirname(file), m[1])));
  return out;
}

/** The awaited chunks plus everything they pull in statically, transitively. */
function awaitedClosure(files: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...files];
  while (queue.length) {
    const f = queue.pop() as string;
    if (seen.has(f)) continue;
    seen.add(f);
    try {
      queue.push(...staticImports(f, readFileSync(join(dist, f), "utf8")));
    } catch {
      continue;
    }
  }
  return [...seen];
}

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "fix-fp-"));
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build({ root: repo, mode: "production", logLevel: "silent", build: { outDir: dist, emptyOutDir: true } });
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
  initial = initialScriptPaths(readFileSync(join(dist, "index.html"), "utf8"));
  for (const f of initial) {
    const code = readFileSync(join(dist, f), "utf8");
    if (topLevelAwaits(code).length === 0) continue;
    awaitedIn.push(f);
    // A top-level await stalls first paint on something; assume every chunk the file names (and what they import).
    awaited.push(...awaitedClosure(dynamicAndPreloaded(f, code)));
  }
}, 180_000);
afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true });
});

describe("fix: first paint does not wait for the data chunk", () => {
  it("the build loads at least one initial script", () => {
    expect(initial.length).toBeGreaterThan(0);
  });
  it("no initial script has a top-level await of any kind", () => {
    expect(awaitedIn, `top-level await in ${awaitedIn.join(", ")}`).toEqual([]);
  });
  it("initial scripts plus chunks (and their static imports) behind a top-level await are <= 256,000 bytes gzip", () => {
    const all = [...new Set([...initial, ...awaited])];
    const bytes = all.reduce((n, f) => n + gzipBytes(readFileSync(join(dist, f))), 0);
    expect(bytes, `gated on ${all.join(", ")} = ${bytes} bytes gzip, limit ${LIMIT}`).toBeLessThanOrEqual(LIMIT);
  });
});
