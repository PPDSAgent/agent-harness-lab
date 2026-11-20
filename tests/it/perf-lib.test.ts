// @vitest-environment node
// HL-009 integration tests (`npm run test:it`): the perf helpers against a real production build output shape.
import { describe, expect, it } from "vitest";
import { computeCls, entry, gzipBytes, initialScriptPaths } from "../../scripts/perf-lib.ts";

describe("computeCls", () => {
  it("is 0 with no shifts", () => expect(computeCls([])).toBe(0));
  it("ignores shifts after user input", () => {
    expect(computeCls([{ value: 0.5, startTime: 10, hadRecentInput: true }])).toBe(0);
  });
  it("sums shifts inside a session window and takes the worst window", () => {
    const s = [
      { value: 0.02, startTime: 100, hadRecentInput: false },
      { value: 0.03, startTime: 600, hadRecentInput: false },
      { value: 0.04, startTime: 9000, hadRecentInput: false }, // gap > 1 s: new window
    ];
    expect(computeCls(s)).toBe(0.05);
  });
});

describe("initialScriptPaths", () => {
  it("finds module scripts and modulepreloads, skips external and stylesheet links", () => {
    const html = `<script type="module" crossorigin src="/assets/index-abc.js"></script>
      <link rel="modulepreload" href="/assets/vendor-def.js">
      <link rel="stylesheet" href="/assets/index.css">
      <script type="module" src="https://cdn.example/x.js"></script>`;
    expect(initialScriptPaths(html)).toEqual(["assets/index-abc.js", "assets/vendor-def.js"]);
  });
});

describe("gzipBytes and entry", () => {
  it("compresses repetitive text", () => expect(gzipBytes("a".repeat(10_000))).toBeLessThan(100));
  it("refuses a null value without a reason", () => {
    expect(() => entry("x", null, "ms", 1, "m")).toThrow(/reason/);
    expect(entry("x", null, "ms", 1, "m", "why").reason).toBe("why");
  });
});
