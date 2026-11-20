// @vitest-environment node
// FROZEN acceptance tests for HL-015a A2 (lazy chunk, d3-scale only there) and A7 (entry size). Builder may not edit this file.
// Same build recipe as tests/hl-014.comparison-chunk.test.ts.
// A7 baseline: initial JS gzip (sum of the scripts the built index.html loads, level 9, scripts/perf-lib.ts, as
// tests/hl-011a-fix1.initial-js-budget.test.ts measures it) at start commit 25d7f49 = 258388 bytes
// (index-CWCh7yW7.js + react-sySUN5R7.js; measured by the test engineer on 2026-11-11, output in the freeze report).
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { gzipBytes, initialScriptPaths } from "../scripts/perf-lib.ts";

const repo = fileURLToPath(new URL("..", import.meta.url));
const BASELINE_BYTES = 258388;
const ALLOWED_GROWTH = 1024;
let dist = "";
let initial: string[] = [];
let assets: string[] = [];

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "hl015a-chunk-"));
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build({ root: repo, mode: "production", logLevel: "silent", build: { outDir: dist, emptyOutDir: true } });
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
  initial = initialScriptPaths(readFileSync(join(dist, "index.html"), "utf8"));
  const dir = join(dist, "assets");
  assets = existsSync(dir) ? readdirSync(dir).map((f) => `assets/${f}`) : [];
}, 180_000);
afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true });
});

function srcFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? srcFiles(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("HL-015a A2: the swimlane is its own lazy chunk", () => {
  it("the build emits a separate run-swimlane chunk", () => {
    expect(assets.filter((f) => /\/run-swimlane-[^/]+\.js$/.test(f)), `assets: ${assets.join(", ")}`).toHaveLength(1);
  });
  it("the chunk is not among the scripts index.html loads up front", () => {
    const chunk = assets.find((f) => /\/run-swimlane-[^/]+\.js$/.test(f));
    expect(chunk).toBeDefined();
    const norm = (p: string) => p.replace(/^\/+/, "");
    expect(initial.map(norm)).not.toContain(norm(chunk!));
  });
});

describe("HL-015a A2: drawing library is d3-scale, imported only by the lazy component", () => {
  it("package.json lists d3-scale as a dependency", () => {
    const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).toHaveProperty("d3-scale");
  });
  it("src/components/run-swimlane.tsx imports d3-scale and no other file under src does", () => {
    const importers = srcFiles(join(repo, "src")).filter((f) => /from\s+["']d3-scale["']|import\(["']d3-scale["']\)/.test(readFileSync(f, "utf8")));
    expect(importers.map((f) => f.slice(repo.length))).toEqual(["src/components/run-swimlane.tsx"]);
  });
});

describe("HL-015a A7: entry size", () => {
  it(`initial JS gzip grows by at most ${ALLOWED_GROWTH} bytes over the 25d7f49 baseline (${BASELINE_BYTES})`, () => {
    const bytes = initial.reduce((n, f) => n + gzipBytes(readFileSync(join(dist, f))), 0);
    expect(bytes, `initial JS = ${bytes} bytes gzip; limit ${BASELINE_BYTES + ALLOWED_GROWTH}`).toBeLessThanOrEqual(BASELINE_BYTES + ALLOWED_GROWTH);
  });
});
