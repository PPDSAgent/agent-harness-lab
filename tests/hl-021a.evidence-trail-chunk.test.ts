// @vitest-environment node
// FROZEN acceptance test for HL-021a A3 (lazy loading in the built output) and the entry-size constraint. Builder may not edit this file.
// Same build recipe as tests/hl-015b.scrubber-chunk.test.ts.
// The section must be emitted as its own chunk `evidence-trail-<hash>.js` (so the lazy import targets a file named
// src/components/evidence-trail.tsx), not loaded up front. The string "not recorded" (A5) is only in the section, so where it
// lands in the build says where the section code went.
// Entry baseline: initial JS gzip (scripts/perf-lib.ts, as tests/hl-011a-fix1.initial-js-budget.test.ts measures it) at start commit
// 058939b = 258964 bytes (index-BLFHcPQ-.js + react-sySUN5R7.js; measured by the test engineer on 2026-11-12 with `vite build`).
// Allowed growth is the lazy import stub only, so the section's own data loading (the runs/*.json records) must live in the chunk.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { gzipBytes, initialScriptPaths } from "../scripts/perf-lib.ts";

const repo = fileURLToPath(new URL("..", import.meta.url));
const BASELINE_BYTES = 258964;
const ALLOWED_GROWTH = 1024;
const MARKER = "not recorded";
let dist = "";
let initial: string[] = [];
let assets: string[] = [];

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "hl021a-chunk-"));
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

describe("HL-021a A3: the Evidence trail section is its own lazy chunk", () => {
  it("an evidence-trail chunk is emitted once and not loaded up front", () => {
    const chunks = assets.filter((f) => /\/evidence-trail-[^/]+\.js$/.test(f));
    expect(chunks, `assets: ${assets.join(", ")}`).toHaveLength(1);
    expect(initial.map(norm)).not.toContain(norm(chunks[0]));
  });
  it(`the section string "${MARKER}" is in the evidence-trail chunk`, () => {
    const chunk = assets.find((f) => /\/evidence-trail-[^/]+\.js$/.test(f));
    expect(chunk).toBeDefined();
    expect(text(chunk!)).toContain(MARKER);
  });
  it(`the section string "${MARKER}" is in no script that index.html loads up front`, () => {
    for (const f of initial) expect(text(f), f).not.toContain(MARKER);
  });
});

describe("HL-021a: entry size", () => {
  it(`initial JS gzip grows by at most ${ALLOWED_GROWTH} bytes over the 058939b baseline (${BASELINE_BYTES})`, () => {
    const bytes = initial.reduce((n, f) => n + gzipBytes(readFileSync(join(dist, f))), 0);
    expect(bytes, `initial JS = ${bytes} bytes gzip; limit ${BASELINE_BYTES + ALLOWED_GROWTH}`).toBeLessThanOrEqual(BASELINE_BYTES + ALLOWED_GROWTH);
  });
});
