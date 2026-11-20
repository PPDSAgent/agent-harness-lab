// @vitest-environment node
// B1 (Will's chat decision): the app's entry bundle must not carry run-record data, so committing a
// new runs/*.json cannot grow the initial JS. Probes are read at test time from the committed
// runs/*.json (distinctive string values: started_at / finished_at timestamps, run branch names,
// dispatch outcome texts). Initial chunks are found the way `npm run perf` does it
// (scripts/perf-lib.ts initialScriptPaths). Production build into a temp outDir.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { initialScriptPaths } from "../scripts/perf-lib.ts";

const repo = fileURLToPath(new URL("..", import.meta.url));
let dist = "";
let initialText = "";
let nFiles = 0;
const probes = new Set<string>();

function collect(v: unknown, key: string) {
  if (Array.isArray(v)) return v.forEach((x) => collect(x, key));
  if (v && typeof v === "object") return Object.entries(v).forEach(([k, x]) => collect(x, k));
  if (typeof v !== "string") return;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
  if ((iso && (key === "started_at" || key === "finished_at")) || (key === "branch" && v.length > 8) || (key === "outcome" && v.length > 30)) {
    // keep only strings that survive minification verbatim (no quote, backslash or non-ASCII)
    if (/^[\x20-\x7e]+$/.test(v) && !/["'\\`]/.test(v)) probes.add(v);
  }
}

beforeAll(async () => {
  for (const f of readdirSync(join(repo, "runs")).filter((n) => n.endsWith(".json"))) {
    nFiles++;
    collect(JSON.parse(readFileSync(join(repo, "runs", f), "utf8")), "");
  }
  dist = mkdtempSync(join(tmpdir(), "b1-"));
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build({ root: repo, mode: "production", logLevel: "silent", build: { outDir: dist, emptyOutDir: true } });
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
  const files = initialScriptPaths(readFileSync(join(dist, "index.html"), "utf8"));
  initialText = files.map((f) => readFileSync(join(dist, f), "utf8")).join("\n");
}, 180_000);
afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true });
});

describe("B1: entry bundle is independent of runs/*.json", () => {
  it("the committed run records give enough probes to be meaningful", () => {
    expect(nFiles).toBeGreaterThan(0);
    expect(probes.size).toBeGreaterThan(10);
    expect(initialText.length).toBeGreaterThan(0);
  });
  it("no run-record value appears in the initial JS chunks", () => {
    const leaked = [...probes].filter((p) => initialText.includes(p));
    expect(leaked.slice(0, 5), `${leaked.length} of ${probes.size} run-record values found in the initial JS`).toEqual([]);
  });
});
