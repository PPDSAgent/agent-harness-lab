// @vitest-environment node
// FROZEN acceptance tests for HL-007 (Playwright screenshot harness).
// Written by the test engineer before the build; the builder may not edit this file.
//
// CONTRACT the builder implements (package.json script `screens`, run as `npm run screens`):
//   - Task name: env SCREENS_TASK, or the first CLI argument (`npm run screens -- HL-007`).
//     With neither, the script must exit non-zero with a message (no silent default).
//   - Output root: env SCREENS_DIR, default `screens` (relative to the repo root). PNGs are
//     written to `<SCREENS_DIR>/<task>/`. This test points SCREENS_DIR at a temp directory so
//     `npm test` never writes into the tracked screens/ tree.
//   - The script starts whatever server it needs for the app (the HL-001 page, route `/`),
//     uses Playwright with the system Chrome (`channel: "chrome"`), and stops the server.
//   - Exactly 4 PNGs, one per combination of width {1440, 390} and theme {light, dark}.
//     Each file name contains its width ("1440" or "390") and its theme ("light" or "dark"),
//     e.g. `home-1440-dark.png`. deviceScaleFactor 1, so image pixel width equals the viewport width.
//   - Each PNG is under 300 KB (300 * 1024 bytes). Exit code 0.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = resolve(import.meta.dirname, "..");
const TASK = "HL-TEST";
const MAX_BYTES = 300 * 1024;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let root = "";
let outDir = "";
let files: string[] = [];
let result: { status: number | null; output: string };

function ihdr(buf: Buffer) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), depth: buf[24], colorType: buf[25] };
}

/** Mean of the R,G,B bytes over the whole image (8-bit truecolor, with or without alpha). */
function meanRgb(buf: Buffer): number {
  const { width, height, depth, colorType } = ihdr(buf);
  if (depth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`unsupported PNG ${depth}/${colorType}`);
  const bpp = colorType === 2 ? 3 : 4;
  const chunks: Buffer[] = [];
  for (let p = 8; p < buf.length; ) {
    const len = buf.readUInt32BE(p);
    if (buf.toString("latin1", p + 4, p + 8) === "IDAT") chunks.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * bpp;
  let prev = Buffer.alloc(stride);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1);
    const ft = raw[o];
    const cur = Buffer.from(raw.subarray(o + 1, o + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let add = 0;
      if (ft === 1) add = a;
      else if (ft === 2) add = b;
      else if (ft === 3) add = (a + b) >> 1;
      else if (ft === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = (cur[i] + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      sum += cur[x * bpp] + cur[x * bpp + 1] + cur[x * bpp + 2];
      n += 3;
    }
    prev = cur;
  }
  return sum / n;
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hl007-"));
  outDir = join(root, TASK);
  const r = spawnSync("npm", ["run", "screens"], {
    cwd: REPO,
    env: { ...process.env, SCREENS_TASK: TASK, SCREENS_DIR: root },
    encoding: "utf8",
    timeout: 170_000,
  });
  result = { status: r.status, output: `${r.stdout}\n${r.stderr}` };
  files = existsSync(outDir) ? readdirSync(outDir).sort() : [];
}, 180_000);

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const byName = (w: string, t: string) => files.find((f) => f.includes(w) && f.includes(t));

describe("HL-007 screenshot harness", () => {
  it("Accept 2: `npm run screens` exits 0", () => {
    expect(result.output.slice(-1500)).not.toMatch(/Missing script/);
    expect(result.status, result.output.slice(-1500)).toBe(0);
  });

  it("Accept 1: produces exactly 4 PNGs in <SCREENS_DIR>/<task>/", () => {
    expect(files.length, `files: ${files.join(", ")}`).toBe(4);
    for (const f of files) expect(f).toMatch(/\.png$/i);
  });

  it("Accept 1: each PNG is a valid PNG under 300 KB", () => {
    expect(files.length).toBe(4);
    for (const f of files) {
      const p = join(outDir, f);
      expect(statSync(p).size, `${f} size`).toBeLessThan(MAX_BYTES);
      const buf = readFileSync(p);
      expect(buf.subarray(0, 8).equals(PNG_SIG), `${f} signature`).toBe(true);
    }
  });

  it("Accept 1: captures 1440 and 390 px widths, light and dark (one file per combination)", () => {
    expect(files.length).toBe(4);
    for (const w of ["1440", "390"]) {
      for (const t of ["light", "dark"]) {
        const f = byName(w, t);
        expect(f, `file for ${w}/${t} in ${files.join(", ")}`).toBeDefined();
        expect(readFileSync(join(outDir, f as string)).readUInt32BE(16), `${f} pixel width`).toBe(Number(w));
      }
    }
    expect(new Set(files.map((f) => `${/1440/.test(f)}${/light/.test(f)}`)).size).toBe(4);
  });

  it("Accept 1: the dark capture is visibly darker than the light capture at each width", () => {
    expect(files.length).toBe(4);
    for (const w of ["1440", "390"]) {
      const light = meanRgb(readFileSync(join(outDir, byName(w, "light") as string)));
      const dark = meanRgb(readFileSync(join(outDir, byName(w, "dark") as string)));
      expect(light - dark, `${w}: light mean ${light}, dark mean ${dark}`).toBeGreaterThan(60);
    }
  });
});
