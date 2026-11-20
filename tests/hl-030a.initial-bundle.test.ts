// FROZEN acceptance test for HL-030a A6 (server code stays out of the web app's initial bundle). Builder may not edit this file.
// The existing initial-JS budget tests (tests/hl-011a-fix1.initial-js-budget.test.ts, tests/fix-first-paint-budget.test.ts)
// keep running unchanged; this adds a static guard on the import graph from the app entry.
// Method: walk the static + dynamic relative imports reachable from src/main.tsx (regex over source text) and require that none
// resolve into src/mcp/ and none name @modelcontextprotocol/*. The server module must exist (so this is red until HL-030a is built).
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(__dirname, "..");
const src = join(root, "src");
const EXT = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(src, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const e of EXT) {
    const p = base + e;
    if (existsSync(p) && /\.(tsx?|jsx?)$/.test(p)) return p;
  }
  return null;
}

function reachable(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    const text = readFileSync(f, "utf8");
    const re = /(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
    for (const m of text.matchAll(re)) {
      const spec = (m[1] ?? m[2] ?? m[3])!;
      const r = resolveImport(f, spec);
      if (r) stack.push(r);
      else if (!spec.startsWith(".")) bare.add(spec);
    }
  }
  return { files, bare };
}

describe("HL-030a A6 · server code is not in the web app's initial bundle", () => {
  it("the MCP server module exists (control: the guard below is not vacuous)", () => {
    expect(existsSync(join(src, "mcp/series-chart/server.ts"))).toBe(true);
    expect(existsSync(join(src, "mcp/series-chart/view.ts"))).toBe(true);
  });

  it("nothing reachable from src/main.tsx lives under src/mcp/ or imports @modelcontextprotocol/*", () => {
    const { files, bare } = reachable(join(src, "main.tsx"));
    expect(files.size, "walker found the app's own modules").toBeGreaterThan(5);
    const inMcp = [...files].filter((f) => f.startsWith(join(src, "mcp") + "/"));
    expect(inMcp).toEqual([]);
    expect([...bare].filter((b) => b.startsWith("@modelcontextprotocol/"))).toEqual([]);
  });

  it("the guard can see a violation (control: a synthetic entry that imports src/mcp is flagged)", () => {
    const probe = join(src, "mcp/series-chart/server.ts");
    // The server module's own graph does reach @modelcontextprotocol/* once built; walking from it must find them.
    const { bare } = reachable(probe);
    expect([...bare].some((b) => b.startsWith("@modelcontextprotocol/"))).toBe(true);
  });
});
