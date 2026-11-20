// @vitest-environment node
// FROZEN acceptance tests for HL-001 (App skeleton) -- toolchain/config criteria.
// Written by the test engineer before the build; the builder may not edit this file.
//
// File contracts the builder must meet (paths relative to repo root):
//   .nvmrc                      -> pins Node 22 (first line "22", "22.x" or "v22...")
//   package.json                -> scripts lint, typecheck, test, build (non-empty strings)
//   tsconfig.json (or tsconfig.app.json / tsconfig.node.json referenced by it)
//                               -> compilerOptions.strict === true in the app config
//   src/components/ui/button.tsx and src/components/ui/card.tsx
//                               -> header (first 30 lines) cites
//                                  https://raw.githubusercontent.com/shadcn-ui/ui/<40-hex SHA>/...
// tsconfig files may contain comments/trailing commas (JSONC); parsed leniently here.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function parseJsonc(text: string): any {
  // strip /* */ and // comments outside strings, then trailing commas
  let out = "";
  let i = 0;
  let inStr = false;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === "\\") { out += n; i += 2; continue; }
      if (c === '"') inStr = false;
      i++;
    } else if (c === '"') { inStr = true; out += c; i++; }
    else if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++; }
    else if (c === "/" && n === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; }
    else { out += c; i++; }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

describe("HL-001 Accept: Node version pinned in .nvmrc (22)", () => {
  it(".nvmrc exists and pins major version 22", () => {
    expect(existsSync(path.join(root, ".nvmrc"))).toBe(true);
    expect(read(".nvmrc").trim()).toMatch(/^v?22(\.\d+){0,2}$/);
  });
});

describe("HL-001 Accept: npm scripts lint, typecheck, test and build", () => {
  it("package.json defines all four scripts", () => {
    expect(existsSync(path.join(root, "package.json"))).toBe(true);
    const pkg = JSON.parse(read("package.json"));
    for (const name of ["lint", "typecheck", "test", "build"]) {
      expect(typeof pkg.scripts?.[name], `script ${name}`).toBe("string");
      expect(pkg.scripts[name].trim().length, `script ${name} non-empty`).toBeGreaterThan(0);
    }
  });
});

describe("HL-001 Accept: TypeScript strict", () => {
  it("the app tsconfig sets compilerOptions.strict to true", () => {
    expect(existsSync(path.join(root, "tsconfig.json"))).toBe(true);
    const candidates = ["tsconfig.json", "tsconfig.app.json"]
      .filter((f) => existsSync(path.join(root, f)))
      .map((f) => parseJsonc(read(f)));
    expect(candidates.some((c) => c.compilerOptions?.strict === true)).toBe(true);
  });
});

describe("HL-001 Accept: vendored shadcn Button and Card cite a pinned source", () => {
  for (const file of ["button", "card"]) {
    it(`src/components/ui/${file}.tsx header has a raw.githubusercontent.com/shadcn-ui/ui/<40-hex SHA> URL`, () => {
      const p = `src/components/ui/${file}.tsx`;
      expect(existsSync(path.join(root, p))).toBe(true);
      const header = read(p).split("\n").slice(0, 30).join("\n");
      expect(header).toMatch(/https:\/\/raw\.githubusercontent\.com\/shadcn-ui\/ui\/[0-9a-f]{40}\//);
    });
  }
});
