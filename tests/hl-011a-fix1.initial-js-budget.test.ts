// @vitest-environment node
// FROZEN fix-1 test for HL-011a (review r1 required fix 1). Builder may not edit this file.
// Budget: initial JS of the main route <= 250 KB gzip (TESTING.md performance budgets), measured the
// way `npm run perf` does it (scripts/perf.ts): gzip level 9 of every <script type=module> and
// <link rel=modulepreload> the built index.html loads, using scripts/perf-lib.ts. perf.ts reports
// bytes / 1024, so the limit is 250 * 1024 bytes. Builds into a temp outDir; takes a few seconds.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { gzipBytes, initialScriptPaths } from "../scripts/perf-lib.ts";

const repo = fileURLToPath(new URL("..", import.meta.url));
const BUDGET_BYTES = 250 * 1024;
let dist = "";
let files: string[] = [];

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "hl011a-fix1-"));
  // Vitest sets NODE_ENV=test, which would bundle React's development build and inflate the size;
  // `npm run perf` builds with the production mode, so do the same here.
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build({ root: repo, mode: "production", logLevel: "silent", build: { outDir: dist, emptyOutDir: true } });
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
  files = initialScriptPaths(readFileSync(join(dist, "index.html"), "utf8"));
}, 180_000);
afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true });
});

describe("HL-011a fix1: initial JS budget", () => {
  it("the build loads at least one initial script", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it("initial JS gzip of the main route is <= 250 KB (250 * 1024 bytes)", () => {
    const bytes = files.reduce((n, f) => n + gzipBytes(readFileSync(join(dist, f))), 0);
    expect(bytes, `initial JS ${files.join(", ")} = ${bytes} bytes gzip, budget ${BUDGET_BYTES}`).toBeLessThanOrEqual(BUDGET_BYTES);
  });
});
