// @vitest-environment node
// FROZEN acceptance tests for HL-015b B7 (scrubber code is in the existing lazy swimlane chunk; entry size). Builder may not edit this file.
// Same build recipe as tests/hl-015a.swimlane-chunk.test.ts.
// Entry baseline: initial JS gzip (sum of the scripts the built index.html loads, level 9, scripts/perf-lib.ts, as
// tests/hl-011a-fix1.initial-js-budget.test.ts measures it) at start commit 430a669 = 258601 bytes
// (index-CcsccJC3.js + react-sySUN5R7.js; measured by the test engineer on 2026-11-12 with `vite build`, output in the freeze report).
// The scrubber's accessible name "Scrub tool calls" is a string only the scrubber UI can contain; where it lands in the build says
// where the scrubber code went. The test is agnostic about file names (a new src/ module is fine if it is bundled into the lazy chunk).
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { gzipBytes, initialScriptPaths } from "../scripts/perf-lib.ts";

const repo = fileURLToPath(new URL("..", import.meta.url));
const BASELINE_BYTES = 258601;
const ALLOWED_GROWTH = 1024;
const MARKER = "Scrub tool calls";
let dist = "";
let initial: string[] = [];
let assets: string[] = [];

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "hl015b-chunk-"));
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

const text = (f: string) => readFileSync(join(dist, f), "utf8");
const norm = (p: string) => p.replace(/^\/+/, "");

describe("HL-015b B7: scrubber code lives in the lazy swimlane chunk", () => {
  it("the existing run-swimlane chunk is still emitted, once, and not loaded up front", () => {
    const chunks = assets.filter((f) => /\/run-swimlane-[^/]+\.js$/.test(f));
    expect(chunks, `assets: ${assets.join(", ")}`).toHaveLength(1);
    expect(initial.map(norm)).not.toContain(norm(chunks[0]));
  });
  it(`the scrubber UI string "${MARKER}" is in the run-swimlane chunk`, () => {
    const chunk = assets.find((f) => /\/run-swimlane-[^/]+\.js$/.test(f));
    expect(chunk).toBeDefined();
    expect(text(chunk!)).toContain(MARKER);
  });
  it(`the scrubber UI string "${MARKER}" is in no script that index.html loads up front`, () => {
    for (const f of initial) expect(text(f), f).not.toContain(MARKER);
  });
});

describe("HL-015b B7: entry size", () => {
  it(`initial JS gzip grows by at most ${ALLOWED_GROWTH} bytes over the 430a669 baseline (${BASELINE_BYTES})`, () => {
    const bytes = initial.reduce((n, f) => n + gzipBytes(readFileSync(join(dist, f))), 0);
    expect(bytes, `initial JS = ${bytes} bytes gzip; limit ${BASELINE_BYTES + ALLOWED_GROWTH}`).toBeLessThanOrEqual(BASELINE_BYTES + ALLOWED_GROWTH);
  });
});
