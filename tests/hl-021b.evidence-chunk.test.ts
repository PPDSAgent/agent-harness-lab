// @vitest-environment node
// FROZEN acceptance test for HL-021b B5 (size / laziness). Builder may not edit this file.
// Same build recipe as tests/hl-021a.evidence-trail-chunk.test.ts.
// Entry baseline: initial JS gzip (scripts/perf-lib.ts, as tests/hl-011a-fix1.initial-js-budget.test.ts measures it: index + react chunks,
// gzip level 9) at the run's start commit 9c3db0c = 259370 bytes (index-Cwx_ZUgY.js 256088 + react-sySUN5R7.js 3282; measured by the
// test engineer on 2026-11-12 with `vite build`). Allowed growth: 1024 bytes. NOTE the budget in hl-011a-fix1 is already exceeded at
// this commit (inherited); this test measures growth only.
// Laziness: the raw run-record fields the Evidence chain block needs and that are NOT already in the entry (mutation_check.file_line
// values, from runs/*.json) must not appear in any script index.html loads up front. They must still be present in some emitted chunk
// (the block shows them), so a build that dropped the data cannot pass.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { gzipBytes, initialScriptPaths } from "../scripts/perf-lib.ts";

const repo = fileURLToPath(new URL("..", import.meta.url));
const BASELINE_BYTES = 259370;
const ALLOWED_GROWTH = 1024;
let dist = "";
let initial: string[] = [];
let assets: string[] = [];

const fileLines: string[] = readdirSync(join(repo, "runs"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => (JSON.parse(readFileSync(join(repo, "runs", f), "utf8")) as { mutation_check?: { file_line?: unknown } | null }).mutation_check?.file_line)
  .filter((v): v is string => typeof v === "string" && v.length > 0);

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "hl021b-chunk-"));
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
  assets = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => `assets/${f}`) : [];
}, 180_000);
afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true });
});

const text = (f: string) => readFileSync(join(dist, f), "utf8");
const norm = (p: string) => p.replace(/^\/+/, "");

describe("HL-021b B5: the raw run-record data for the Evidence chain block stays out of the entry", () => {
  it("there are file_line values to look for", () => {
    expect(fileLines.length).toBeGreaterThan(5);
  });
  it("no mutation_check.file_line value is in any script index.html loads up front", () => {
    for (const f of initial) {
      const t = text(f);
      const leaked = fileLines.filter((fl) => t.includes(fl));
      expect(leaked, `${f} contains record data ${leaked.slice(0, 3).join(", ")}`).toEqual([]);
    }
  });
  it("the file_line values are still in some emitted chunk that is not loaded up front", () => {
    const lazy = assets.filter((f) => !initial.map(norm).includes(norm(f)));
    const all = lazy.map(text).join("\n");
    const missing = fileLines.filter((fl) => !all.includes(fl));
    expect(missing).toEqual([]);
  });
});

describe("HL-021b B5: entry size", () => {
  it(`initial JS gzip grows by at most ${ALLOWED_GROWTH} bytes over the 9c3db0c baseline (${BASELINE_BYTES})`, () => {
    const bytes = initial.reduce((n, f) => n + gzipBytes(readFileSync(join(dist, f))), 0);
    expect(bytes, `initial JS = ${bytes} bytes gzip; limit ${BASELINE_BYTES + ALLOWED_GROWTH}`).toBeLessThanOrEqual(BASELINE_BYTES + ALLOWED_GROWTH);
  });
});
