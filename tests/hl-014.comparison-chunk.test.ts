// @vitest-environment node
// FROZEN acceptance test for HL-014 A3 (lazy loading in the built output). Builder may not edit this file.
// Builds the app into a temp dir and checks that the section is emitted as its own chunk
// (`harness-comparison-<hash>.js`) that the built index.html does not load up front.
// Same build recipe as tests/hl-013.claims-audit-chunk.test.ts.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { initialScriptPaths } from "../scripts/perf-lib.ts";

const repo = fileURLToPath(new URL("..", import.meta.url));
let dist = "";
let initial: string[] = [];
let assets: string[] = [];

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "hl014-chunk-"));
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

describe("HL-014 A3: the section is its own lazy chunk", () => {
  it("the build emits a separate harness-comparison chunk", () => {
    expect(assets.filter((f) => /\/harness-comparison-[^/]+\.js$/.test(f)), `assets: ${assets.join(", ")}`).toHaveLength(1);
  });
  it("the chunk is not among the scripts index.html loads up front", () => {
    const chunk = assets.find((f) => /\/harness-comparison-[^/]+\.js$/.test(f));
    expect(chunk).toBeDefined();
    const norm = (p: string) => p.replace(/^\/+/, "");
    expect(initial.map(norm)).not.toContain(norm(chunk!));
  });
});
