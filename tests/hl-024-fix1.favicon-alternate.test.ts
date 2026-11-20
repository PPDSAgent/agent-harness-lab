// HL-024 fix1 (Will, chat 2026-11-13): "Keep A but store B as an alternate that can be
// reviewed and switched out later". A = public/favicon.svg (unchanged). B = public/favicon-alt.svg,
// same mark with the DESIGN.md tokens read from src/index.css at test time.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const A = "public/favicon.svg";
const B = "public/favicon-alt.svg";

const attr = (svg: string, tag: string, name: string): string | undefined => {
  const m = svg.match(new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]*)"`, "i"));
  return m?.[1];
};
const token = (css: string, name: string): string => {
  // First definition (dark / default theme block).
  const m = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!m) throw new Error(`token ${name} not found in src/index.css`);
  return m[1].toLowerCase();
};

describe("HL-024 fix1: option A kept", () => {
  it("favicon.svg still uses #0f172a background and #5eead4 stroke", () => {
    const svg = read(A);
    expect(attr(svg, "rect", "fill")?.toLowerCase()).toBe("#0f172a");
    expect(attr(svg, "path", "stroke")?.toLowerCase()).toBe("#5eead4");
  });
  it("index.html links /favicon.svg as the icon and not the alternate", () => {
    const html = read("index.html");
    expect(html).toMatch(/<link[^>]*rel="icon"[^>]*href="\/favicon\.svg"/);
    expect(html).not.toContain("favicon-alt.svg");
  });
});

describe("HL-024 fix1: option B stored as an alternate", () => {
  it("public/favicon-alt.svg exists", () => {
    expect(existsSync(resolve(root, B))).toBe(true);
  });
  it("is a valid SVG with the same viewBox and path geometry as A", () => {
    const a = read(A);
    const b = read(B);
    expect(b).toMatch(/<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(b).toMatch(/<\/svg>\s*$/);
    expect(attr(b, "svg", "viewBox")).toBe(attr(a, "svg", "viewBox"));
    expect(attr(b, "path", "d")).toBe(attr(a, "path", "d"));
    expect(attr(b, "rect", "rx")).toBe(attr(a, "rect", "rx"));
  });
  it("uses --p-graphite-950 as background and --p-signal as stroke, read from src/index.css", () => {
    const css = read("src/index.css");
    const b = read(B);
    expect(attr(b, "rect", "fill")?.toLowerCase()).toBe(token(css, "--p-graphite-950"));
    expect(attr(b, "path", "stroke")?.toLowerCase()).toBe(token(css, "--p-signal"));
  });
  it("says how to switch: a comment naming index.html and favicon-alt.svg", () => {
    const comments = [...read(B).matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]);
    expect(comments.some((c) => c.includes("index.html") && c.includes("favicon-alt.svg"))).toBe(true);
  });
});
