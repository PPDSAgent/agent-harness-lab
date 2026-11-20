// @vitest-environment node
// WCAG 2.2 contrast, Machado 2009 CVD, and token-layer checks over src/index.css.
// Measurement code: scripts/design-token-lib.ts (npm run measure:tokens).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DE00_COLLAPSE,
  DE00_COLLISION,
  MACHADO_10,
  WCAG_AA_TEXT,
  WCAG_AA_UI,
  ciede2000,
  extractBlock,
  measureIndexCss,
  parseDeclarations,
  repoRoot,
  stripComments,
} from "../scripts/design-token-lib.ts";

const root = repoRoot(fileURLToPath(import.meta.url));
const css = readFileSync(join(root, "src/index.css"), "utf8");
const pkg = readFileSync(join(root, "package.json"), "utf8");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe("CIEDE2000 (Sharma, Wu, Dalal 2005 fixtures)", () => {
  it("matches published pair 1 and pair 2", () => {
    // https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
    expect(
      ciede2000({ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }),
    ).toBeCloseTo(2.0425, 4);
    expect(
      ciede2000({ l: 50, a: 3.1571, b: -77.2803 }, { l: 50, a: 0, b: -82.7485 }),
    ).toBeCloseTo(2.8615, 4);
  });
});

describe("Machado 2009 Table 1 severity 1.0", () => {
  it("keeps the published dichromacy matrices", () => {
    expect(MACHADO_10.protanopia[0]).toEqual([0.152286, 1.052583, -0.204868]);
    expect(MACHADO_10.deuteranopia[0]).toEqual([0.367322, 0.860646, -0.227968]);
    expect(MACHADO_10.tritanopia[0]).toEqual([1.255528, -0.076749, -0.178779]);
  });
});

describe("DESIGN.md D1 typeface", () => {
  const report = measureIndexCss(root);
  it("uses the system stack, with no Plex or @fontsource", () => {
    const sans = report.fonts.sans.replace(/['"]/g, "");
    const mono = report.fonts.mono.replace(/['"]/g, "");
    expect(sans).toBe("-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif");
    expect(mono).toBe("ui-monospace, SF Mono, Menlo, monospace");
    expect(css).not.toMatch(/fontsource|IBM Plex|Plex Sans|Plex Mono/i);
    expect(pkg).not.toMatch(/fontsource|ibm-plex/i);
  });
});

describe("WCAG 2.2 contrast over tokens", () => {
  const report = measureIndexCss(root);

  it("body text / surface pairs are at least 4.5:1", () => {
    const bad = report.textPairs.filter((p) => !p.pass);
    expect(bad, JSON.stringify(bad)).toEqual([]);
    expect(report.textPairs.length).toBeGreaterThan(0);
    expect(report.textPairs.every((p) => p.min === WCAG_AA_TEXT)).toBe(true);
  });

  it("accent, evidence, live, ring, and destructive vs surfaces are at least 3:1", () => {
    const bad = report.uiPairs.filter((p) => !p.pass);
    expect(bad, JSON.stringify(bad)).toEqual([]);
    expect(report.uiPairs.every((p) => p.min === WCAG_AA_UI)).toBe(true);
  });

  it("chart marks vs background and card are at least 3:1", () => {
    const bad = report.chartPairs.filter((p) => !p.pass);
    expect(bad, JSON.stringify(bad)).toEqual([]);
  });
});

describe("colorblind-safe chart set (Machado 2009 severity 1.0)", () => {
  const report = measureIndexCss(root);

  it("no chart pair collapses (ΔE00 < 10) under protanopia, deuteranopia, or tritanopia", () => {
    const bad = report.chartCvd.filter((p) => p.cvd !== "none" && p.de00 < DE00_COLLAPSE);
    expect(bad, JSON.stringify(bad.map((p) => ({ ...p, de00: Number(p.de00.toFixed(2)) })))).toEqual([]);
  });

  it("accent, evidence, live, and status do not collide with chart series (ΔE00 < 15, normal vision)", () => {
    const bad = report.collisions.filter((p) => p.de00 < DE00_COLLISION);
    expect(bad, JSON.stringify(bad.map((p) => ({ ...p, de00: Number(p.de00.toFixed(2)) })))).toEqual([]);
  });

  it("live matches primary; evidence is a distinct token", () => {
    expect(report.dark["--live"]).toBe(report.dark["--primary"]);
    expect(report.light["--live"]).toBe(report.light["--primary"]);
    expect(report.dark["--evidence"]).not.toBe(report.dark["--primary"]);
    expect(report.light["--evidence"]).not.toBe(report.light["--primary"]);
    expect(report.dark["--accent"]).not.toBe(report.dark["--primary"]);
    expect(report.light["--accent"]).not.toBe(report.light["--primary"]);
  });
});

describe("token layering (primitive -> semantic -> component)", () => {
  const clean = stripComments(css);
  const dark = parseDeclarations(extractBlock(clean, ":root"));
  const light = parseDeclarations(extractBlock(clean, ':root[data-theme="light"]'));
  const theme = parseDeclarations(extractBlock(clean, "@theme inline"));

  it("only --p-* primitives hold raw hex", () => {
    for (const [block, vars] of [["dark", dark], ["light", light]] as const) {
      for (const [name, value] of Object.entries(vars)) {
        if (/^#[0-9a-fA-F]{3,8}$/.test(value.trim())) {
          expect(name.startsWith("--p-"), `${block} ${name} = ${value}`).toBe(true);
        } else if (name.startsWith("--p-")) {
          expect(value, `${block} ${name}`).not.toMatch(/#[0-9a-fA-F]{3,8}/);
        } else {
          expect(value.trim(), `${block} ${name} = ${value}`).toMatch(/^var\(--[a-z0-9-]+\)$/i);
        }
      }
    }
  });

  it("@theme color tokens point at semantic names, not hex", () => {
    const colors = Object.entries(theme).filter(([k]) => k.startsWith("--color-"));
    expect(colors.length).toBeGreaterThan(10);
    for (const [name, value] of colors) {
      expect(value.trim(), name).toMatch(/^var\(--[a-z0-9-]+\)$/i);
      expect(value).not.toMatch(/#/);
    }
    expect(theme["--font-sans"]?.trim()).toBe("var(--p-font-sans)");
    expect(theme["--font-mono"]?.trim()).toBe("var(--p-font-mono)");
    expect(theme["--shadow-card"]).toMatch(/var\(--elevation-highlight\)/);
  });

  it("components and App have no raw hex colours", () => {
    const files = [
      ...walk(join(root, "src/components")),
      join(root, "src/App.tsx"),
      join(root, "src/main.tsx"),
    ];
    const hex = /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/;
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (hex.test(text)) hits.push(file.slice(root.length + 1));
    }
    expect(hits).toEqual([]);
  });

  it("focus ring does not dilute --ring with opacity", () => {
    const button = readFileSync(join(root, "src/components/ui/button.tsx"), "utf8");
    const cva = button.slice(button.indexOf("const buttonVariants"), button.indexOf("function Button"));
    expect(cva).not.toMatch(/ring-ring\/\d+/);
    expect(cva).toMatch(/focus-visible:ring-ring/);
  });

  it("honors prefers-reduced-motion and exposes one view-enter animation", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/@keyframes hl-view-enter/);
    expect(css).toMatch(/\[data-view-enter\]/);
  });
});
