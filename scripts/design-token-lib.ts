/**
 * Colour math and design-token measurement for the contrast / CVD review.
 *
 * Contrast (WCAG 2.2):
 *   relative luminance https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 *   contrast ratio     https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 *   text (1.4.3)       https://www.w3.org/TR/WCAG22/#contrast-minimum  4.5:1
 *   non-text (1.4.11)  https://www.w3.org/TR/WCAG22/#non-text-contrast  3:1
 *
 * CVD simulation: Machado, Oliveira, Fernandes (2009), Table 1 severity 1.0
 *   (dichromacy) applied to sRGB channels in [0, 1] as in the authors' tutorial
 *   Eq. 1, then clamped to the displayable range.
 *   https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
 *
 * CIEDE2000: Sharma, Wu, Dalal, "The CIEDE2000 Color-Difference Formula:
 *   Implementation Notes, Supplementary Test Data, and Mathematical Observations",
 *   Color Research & Application 30(1), 2005.
 *   https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
 *
 * Okabe–Ito chart hues: Wong, "Points of view: Color blindness", Nature Methods
 *   8, 441 (2011), https://www.nature.com/articles/nmeth.1618
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const WCAG_AA_TEXT = 4.5;
export const WCAG_AA_UI = 3;
/** Working threshold: ΔE00 below this is treated as a collapsed pair. ASSUMPTION. */
export const DE00_COLLAPSE = 10;
/** Working threshold: accent/evidence vs charts/status. ASSUMPTION. */
export const DE00_COLLISION = 15;

export type Rgb = { r: number; g: number; b: number };
export type Lab = { l: number; a: number; b: number };
export type ThemeName = "dark" | "light";
export type Cvd = "none" | "protanopia" | "deuteranopia" | "tritanopia";

export const CVD_CONDITIONS: readonly Cvd[] = ["protanopia", "deuteranopia", "tritanopia"];

/** Machado et al. 2009 Table 1, severity 1.0, row-major 3×3. */
export const MACHADO_10: Record<Exclude<Cvd, "none">, readonly (readonly number[])[]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const TEXT_ON_SURFACES: { fg: string; bg: string }[] = [
  { fg: "foreground", bg: "background" },
  { fg: "foreground", bg: "card" },
  { fg: "foreground", bg: "secondary" },
  { fg: "foreground", bg: "surface-2" },
  { fg: "card-foreground", bg: "card" },
  { fg: "muted-foreground", bg: "background" },
  { fg: "muted-foreground", bg: "card" },
  { fg: "muted-foreground", bg: "secondary" },
  { fg: "muted-foreground", bg: "surface-2" },
  { fg: "primary-foreground", bg: "primary" },
  { fg: "secondary-foreground", bg: "secondary" },
  { fg: "accent-foreground", bg: "accent" },
  { fg: "destructive-foreground", bg: "destructive" },
  { fg: "evidence-foreground", bg: "evidence" },
  { fg: "live-foreground", bg: "live" },
  { fg: "destructive", bg: "background" },
  { fg: "destructive", bg: "card" },
  { fg: "evidence", bg: "background" },
  { fg: "evidence", bg: "card" },
  { fg: "live", bg: "background" },
  { fg: "live", bg: "card" },
  { fg: "primary", bg: "background" },
  { fg: "primary", bg: "card" },
];

const UI_ON_SURFACES: { fg: string; bg: string }[] = [
  { fg: "primary", bg: "background" },
  { fg: "primary", bg: "card" },
  { fg: "live", bg: "background" },
  { fg: "live", bg: "card" },
  { fg: "evidence", bg: "background" },
  { fg: "evidence", bg: "card" },
  { fg: "ring", bg: "background" },
  { fg: "ring", bg: "card" },
  { fg: "ring", bg: "secondary" },
  { fg: "ring", bg: "surface-2" },
  { fg: "destructive", bg: "background" },
  { fg: "destructive", bg: "card" },
];

const CHART_NAMES = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"] as const;
const CHART_SURFACES = ["background", "card"] as const;
const CATEGORICAL = ["primary", "live", "evidence", "destructive", ...CHART_NAMES] as const;

export type PairResult = {
  theme: ThemeName;
  fg: string;
  bg: string;
  fgHex: string;
  bgHex: string;
  ratio: number;
  min: number;
  pass: boolean;
};

export type CvdPair = {
  theme: ThemeName;
  cvd: Cvd;
  a: string;
  b: string;
  aHex: string;
  bHex: string;
  aSim: string;
  bSim: string;
  de00: number;
};

export type TokenReport = {
  dark: Record<string, string>;
  light: Record<string, string>;
  themeInline: Record<string, string>;
  fonts: { sans: string; mono: string };
  textPairs: PairResult[];
  uiPairs: PairResult[];
  chartPairs: PairResult[];
  chartCvd: CvdPair[];
  collisions: CvdPair[];
};

export function repoRoot(from = fileURLToPath(import.meta.url)): string {
  return join(dirname(from), "..");
}

export function readIndexCss(root = repoRoot()): string {
  return readFileSync(join(root, "src/index.css"), "utf8");
}

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

export function parseDeclarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const chunk of body.split(";")) {
    const trimmed = chunk.trim();
    if (!trimmed.startsWith("--")) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const name = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    out[name] = value;
  }
  return out;
}

export function extractBlock(css: string, header: string): string {
  let from = 0;
  while (from < css.length) {
    const start = css.indexOf(header, from);
    if (start < 0) throw new Error(`block not found: ${header}`);
    const after = start + header.length;
    // `:root` must not match `:root[data-theme=...]`.
    if (header === ":root" && css[after] === "[") {
      from = after;
      continue;
    }
    const open = css.indexOf("{", start);
    if (open < 0) throw new Error(`no '{' after ${header}`);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) return css.slice(open + 1, i);
      }
    }
    throw new Error(`unclosed block: ${header}`);
  }
  throw new Error(`block not found: ${header}`);
}

export function parseHex(value: string): Rgb | null {
  const raw = value.trim().toLowerCase();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(raw);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex(rgb: Rgb): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${c(rgb.r)}${c(rgb.g)}${c(rgb.b)}`;
}

function resolveValue(name: string, vars: Record<string, string>, seen: Set<string> = new Set()): string {
  if (seen.has(name)) throw new Error(`cycle: ${name}`);
  seen.add(name);
  const raw = vars[name];
  if (raw === undefined) throw new Error(`missing token ${name}`);
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(raw.trim());
  if (ref) return resolveValue(ref[1], vars, seen);
  return raw.trim();
}

export function resolveHex(name: string, vars: Record<string, string>): string {
  const key = name.startsWith("--") ? name : `--${name}`;
  const value = resolveValue(key, vars);
  const rgb = parseHex(value);
  if (!rgb) throw new Error(`${key} did not resolve to hex (got ${value})`);
  return rgbToHex(rgb);
}

/** WCAG 2.2 relative luminance of an 8-bit sRGB colour. */
export function relativeLuminance(rgb: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = lin(rgb.r);
  const g = lin(rgb.g);
  const b = lin(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio, (L1 + 0.05) / (L2 + 0.05) with L1 ≥ L2. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

function srgb01(rgb: Rgb): [number, number, number] {
  return [rgb.r / 255, rgb.g / 255, rgb.b / 255];
}

export function simulateCvd(rgb: Rgb, cvd: Cvd): Rgb {
  if (cvd === "none") return rgb;
  const m = MACHADO_10[cvd];
  const [r, g, b] = srgb01(rgb);
  const out = m.map((row) => row[0] * r + row[1] * g + row[2] * b);
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return { r: clamp(out[0]) * 255, g: clamp(out[1]) * 255, b: clamp(out[2]) * 255 };
}

function srgbToLinearChannel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinearChannel(rgb.r);
  const g = srgbToLinearChannel(rgb.g);
  const b = srgbToLinearChannel(rgb.b);
  // sRGB D65 matrix, IEC 61966-2-1.
  const x = 0.4123908 * r + 0.3575843 * g + 0.1804808 * b;
  const y = 0.212639 * r + 0.7151687 * g + 0.0721923 * b;
  const z = 0.0193308 * r + 0.1191948 * g + 0.9502273 * b;
  const xn = 0.95047;
  const yn = 1;
  const zn = 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function hueRad(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const h = Math.atan2(b, a);
  return h < 0 ? h + 2 * Math.PI : h;
}

/** CIEDE2000 ΔE00. Sharma et al. 2005, kL = kC = kH = 1. */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const L1 = lab1.l;
  const a1 = lab1.a;
  const b1 = lab1.b;
  const L2 = lab2.l;
  const a2 = lab2.a;
  const b2 = lab2.b;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cab = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cab, 7) / (Math.pow(Cab, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = hueRad(a1p, b1);
  const h2p = hueRad(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > Math.PI) dhp -= 2 * Math.PI;
    else if (dhp < -Math.PI) dhp += 2 * Math.PI;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2);
  const Lp = (L1 + L2) / 2;
  const Cp = (C1p + C2p) / 2;
  let hp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > Math.PI) hp += h1p + h2p < 2 * Math.PI ? Math.PI : -Math.PI;
    hp /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos(hp - Math.PI / 6) +
    0.24 * Math.cos(2 * hp) +
    0.32 * Math.cos(3 * hp + Math.PI / 30) -
    0.2 * Math.cos(4 * hp - (63 * Math.PI) / 180);
  const dTheta = ((30 * Math.PI) / 180) * Math.exp(-Math.pow((hp * 180) / Math.PI - 275, 2) / 625);
  const RC = 2 * Math.sqrt(Math.pow(Cp, 7) / (Math.pow(Cp, 7) + Math.pow(25, 7)));
  const SL = 1 + (0.015 * Math.pow(Lp - 50, 2)) / Math.sqrt(20 + Math.pow(Lp - 50, 2));
  const SC = 1 + 0.045 * Cp;
  const SH = 1 + 0.015 * Cp * T;
  const RT = -Math.sin(2 * dTheta) * RC;
  const dL = dLp / SL;
  const dC = dCp / SC;
  const dH = dHp / SH;
  return Math.sqrt(dL * dL + dC * dC + dH * dH + RT * dC * dH);
}

export function deltaE00(a: Rgb, b: Rgb): number {
  return ciede2000(rgbToLab(a), rgbToLab(b));
}

function pair(
  theme: ThemeName,
  fg: string,
  bg: string,
  vars: Record<string, string>,
  min: number,
): PairResult {
  const fgHex = resolveHex(fg, vars);
  const bgHex = resolveHex(bg, vars);
  const ratio = contrastRatio(parseHex(fgHex)!, parseHex(bgHex)!);
  return { theme, fg, bg, fgHex, bgHex, ratio, min, pass: ratio + 1e-12 >= min };
}

function cvdPair(theme: ThemeName, cvd: Cvd, a: string, b: string, vars: Record<string, string>): CvdPair {
  const aHex = resolveHex(a, vars);
  const bHex = resolveHex(b, vars);
  const aRgb = simulateCvd(parseHex(aHex)!, cvd);
  const bRgb = simulateCvd(parseHex(bHex)!, cvd);
  return {
    theme,
    cvd,
    a,
    b,
    aHex,
    bHex,
    aSim: rgbToHex(aRgb),
    bSim: rgbToHex(bRgb),
    de00: deltaE00(aRgb, bRgb),
  };
}

export function parseThemes(css: string): {
  dark: Record<string, string>;
  light: Record<string, string>;
  themeInline: Record<string, string>;
} {
  const clean = stripComments(css);
  const root = parseDeclarations(extractBlock(clean, ":root"));
  const lightOver = parseDeclarations(extractBlock(clean, ':root[data-theme="light"]'));
  const themeInline = parseDeclarations(extractBlock(clean, "@theme inline"));
  return { dark: root, light: { ...root, ...lightOver }, themeInline };
}

export function measureCss(css: string): TokenReport {
  const { dark, light, themeInline } = parseThemes(css);
  const themes: { name: ThemeName; vars: Record<string, string> }[] = [
    { name: "dark", vars: dark },
    { name: "light", vars: light },
  ];
  const textPairs: PairResult[] = [];
  const uiPairs: PairResult[] = [];
  const chartPairs: PairResult[] = [];
  const chartCvd: CvdPair[] = [];
  const collisions: CvdPair[] = [];

  for (const { name, vars } of themes) {
    for (const p of TEXT_ON_SURFACES) textPairs.push(pair(name, p.fg, p.bg, vars, WCAG_AA_TEXT));
    for (const p of UI_ON_SURFACES) uiPairs.push(pair(name, p.fg, p.bg, vars, WCAG_AA_UI));
    for (const chart of CHART_NAMES) {
      for (const surface of CHART_SURFACES) {
        chartPairs.push(pair(name, chart, surface, vars, WCAG_AA_UI));
      }
    }
    for (const cvd of [...CVD_CONDITIONS, "none"] as Cvd[]) {
      for (let i = 0; i < CHART_NAMES.length; i++) {
        for (let j = i + 1; j < CHART_NAMES.length; j++) {
          chartCvd.push(cvdPair(name, cvd, CHART_NAMES[i], CHART_NAMES[j], vars));
        }
      }
    }
    const roles = [...CATEGORICAL];
    for (let i = 0; i < roles.length; i++) {
      for (let j = i + 1; j < roles.length; j++) {
        if (roles[i] === "primary" && roles[j] === "live") continue;
        if (roles[i] === "live" && roles[j] === "primary") continue;
        collisions.push(cvdPair(name, "none", roles[i], roles[j], vars));
      }
    }
  }

  return {
    dark: Object.fromEntries(Object.keys(dark).map((k) => [k, resolveValue(k, dark)])),
    light: Object.fromEntries(Object.keys(light).map((k) => [k, resolveValue(k, light)])),
    themeInline,
    fonts: {
      sans: resolveValue("--p-font-sans", dark),
      mono: resolveValue("--p-font-mono", dark),
    },
    textPairs,
    uiPairs,
    chartPairs,
    chartCvd,
    collisions,
  };
}

export function measureIndexCss(root = repoRoot()): TokenReport {
  return measureCss(readIndexCss(root));
}

function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  return [head, sep, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

export function renderReviewMarkdown(report: TokenReport): string {
  const textRows = report.textPairs.map((p) => [
    p.theme,
    `${p.fg} / ${p.bg}`,
    p.fgHex,
    p.bgHex,
    formatRatio(p.ratio),
    String(p.min),
    p.pass ? "pass" : "FAIL",
  ]);
  const uiRows = report.uiPairs.map((p) => [
    p.theme,
    `${p.fg} / ${p.bg}`,
    p.fgHex,
    p.bgHex,
    formatRatio(p.ratio),
    String(p.min),
    p.pass ? "pass" : "FAIL",
  ]);
  const chartRows = report.chartPairs.map((p) => [
    p.theme,
    `${p.fg} / ${p.bg}`,
    p.fgHex,
    p.bgHex,
    formatRatio(p.ratio),
    p.pass ? "pass" : "FAIL",
  ]);
  const cvdRows = report.chartCvd.map((p) => [
    p.theme,
    p.cvd,
    `${p.a} / ${p.b}`,
    p.aSim,
    p.bSim,
    p.de00.toFixed(2),
    p.de00 + 1e-12 >= DE00_COLLAPSE ? "ok" : "COLLAPSE",
  ]);
  const colRows = report.collisions.map((p) => [
    p.theme,
    `${p.a} / ${p.b}`,
    p.aHex,
    p.bHex,
    p.de00.toFixed(2),
    p.de00 + 1e-12 >= DE00_COLLISION ? "ok" : "COLLIDE",
  ]);
  return [
    "Text / surface pairs (WCAG 2.2 1.4.3, 4.5:1):",
    mdTable(["theme", "pair", "fg", "bg", "ratio", "min", "result"], textRows),
    "",
    "Accent / UI / ring / surface pairs (WCAG 2.2 1.4.11, 3:1):",
    mdTable(["theme", "pair", "fg", "bg", "ratio", "min", "result"], uiRows),
    "",
    "Chart marks / surface (WCAG 2.2 1.4.11, 3:1):",
    mdTable(["theme", "pair", "fg", "bg", "ratio", "result"], chartRows),
    "",
    `Chart pairs under Machado 2009 severity 1.0 (ΔE00 collapse < ${DE00_COLLAPSE}):`,
    mdTable(["theme", "cvd", "pair", "a sim", "b sim", "ΔE00", "result"], cvdRows),
    "",
    `Accent / evidence / status / chart collisions in normal vision (ΔE00 < ${DE00_COLLISION}):`,
    mdTable(["theme", "pair", "a", "b", "ΔE00", "result"], colRows),
  ].join("\n");
}
