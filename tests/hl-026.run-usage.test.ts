// @vitest-environment node
// FROZEN acceptance tests for HL-026 (run usage meter CLI; criteria U1 to U9).
// Written by the test engineer before the build; the builder may not edit this file or
// fixtures/usage/. All fixtures are SYNTHETIC. Tests go through the CLI only
// (`npx tsx src/cli/usage.ts`), so no library export is assumed.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "..");
const FX = join(REPO, "fixtures/usage");
const fx = (n: string) => join(FX, n);

type Res = { code: number | null; out: string; err: string };
function usage(args: string[]): Res {
  const r = spawnSync("npx", ["tsx", "src/cli/usage.ts", ...args], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}
function ok(args: string[]): Record<string, unknown> {
  const r = usage(args);
  expect(r.code, r.err).toBe(0);
  const lines = r.out.split("\n").filter((l) => l.trim() !== "");
  expect(lines.length).toBe(1);
  return JSON.parse(lines[0]) as Record<string, unknown>;
}

const KEYS = [
  "tokens", "input_tokens", "output_tokens", "cache_creation_input_tokens",
  "cache_read_input_tokens", "messages", "files", "skipped_lines", "cost_usd", "cost_source",
];

describe("HL-026 fixtures and script", () => {
  it("U0: every fixture exists and starts with a header line containing SYNTHETIC", () => {
    const names = [
      "dup-within", "cross-a", "cross-b", "no-usage", "partial-usage",
      "invalid-lines", "cost-all", "cost-some", "privacy-marker",
    ];
    for (const n of names) {
      const p = fx(`${n}.jsonl`);
      expect(existsSync(p), p).toBe(true);
      const first = readFileSync(p, "utf8").split("\n")[0];
      expect(JSON.parse(first)).toBeTypeOf("object");
      expect(first).toContain("SYNTHETIC");
    }
  });

  it("U0: package.json has a `usage` script that runs src/cli/usage.ts with tsx", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
    expect(pkg.scripts.usage).toMatch(/tsx\s+src\/cli\/usage\.ts/);
  });
});

describe("HL-026 U1 output keys", () => {
  it("U1: stdout is exactly one JSON object with exactly the ten keys", () => {
    const o = ok([fx("dup-within.jsonl")]);
    expect(Object.keys(o).sort()).toEqual([...KEYS].sort());
  });
});

describe("HL-026 U2 sums count each message.id once", () => {
  it("U2: an id repeated within a file (identical usage) counts once", () => {
    const o = ok([fx("dup-within.jsonl")]);
    expect(o).toMatchObject({
      input_tokens: 11, output_tokens: 22, cache_creation_input_tokens: 33,
      cache_read_input_tokens: 44, tokens: 110, messages: 2, files: 1, skipped_lines: 0,
    });
  });

  it("U2: an id repeated across two files counts once; files counts both", () => {
    const o = ok([fx("cross-a.jsonl"), fx("cross-b.jsonl")]);
    expect(o).toMatchObject({
      input_tokens: 16, output_tokens: 26, cache_creation_input_tokens: 36,
      cache_read_input_tokens: 46, tokens: 124, messages: 3, files: 2,
    });
  });

  it("U2: the same file given twice still counts each id once", () => {
    const o = ok([fx("dup-within.jsonl"), fx("dup-within.jsonl")]);
    expect(o).toMatchObject({ tokens: 110, messages: 2, files: 2 });
  });
});

describe("HL-026 U3 unknown usage is null, never 0", () => {
  it("U3: no counted message carries usage -> every token field is null", () => {
    const o = ok([fx("no-usage.jsonl")]);
    for (const k of [
      "tokens", "input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens",
    ]) {
      expect(o[k], k).toBeNull();
    }
    expect(o.messages).toBe(1);
  });

  it("U3: a field missing on one counted message nulls that total and tokens, not the others", () => {
    const o = ok([fx("partial-usage.jsonl")]);
    expect(o.cache_read_input_tokens).toBeNull();
    expect(o.tokens).toBeNull();
    expect(o).toMatchObject({
      input_tokens: 2, output_tokens: 3, cache_creation_input_tokens: 4, messages: 2,
    });
  });

  it("U3: one counted message without usage nulls every total", () => {
    const o = ok([fx("dup-within.jsonl"), fx("no-usage.jsonl")]);
    expect(o.messages).toBe(3);
    expect(o.tokens).toBeNull();
    expect(o.input_tokens).toBeNull();
    expect(o.output_tokens).toBeNull();
  });
});

describe("HL-026 U4 bad lines never crash", () => {
  it("U4: invalid JSON lines are counted in skipped_lines; non-assistant lines are ignored", () => {
    const o = ok([fx("invalid-lines.jsonl")]);
    expect(o).toMatchObject({
      skipped_lines: 2, messages: 1, files: 1,
      input_tokens: 2, output_tokens: 3, cache_creation_input_tokens: 4,
      cache_read_input_tokens: 5, tokens: 14,
    });
  });
});

describe("HL-026 U5 cost_usd and cost_source", () => {
  it("U5: every counted message has numeric costUSD -> cost_usd is the per-message sum (id once)", () => {
    const o = ok([fx("cost-all.jsonl")]);
    expect(o.cost_usd).toBe(0.75);
    expect(typeof o.cost_source).toBe("string");
    expect((o.cost_source as string).length).toBeGreaterThan(0);
    expect(o.cost_source).toMatch(/costUSD/);
    expect(o.cost_source).not.toMatch(/no measured cost/);
    expect(o).toMatchObject({ tokens: 12, messages: 2 });
  });

  it("U5: only some messages carry costUSD -> cost_usd null, source names the billing report", () => {
    const o = ok([fx("cost-some.jsonl")]);
    expect(o.cost_usd).toBeNull();
    expect(o.cost_source).toMatch(/no measured cost/);
    expect(o.cost_source).toMatch(/billing/i);
    expect(o.cost_source).toMatch(/usage|cost report/i);
  });

  it("U5: no costUSD anywhere -> cost_usd null; the tool never prices tokens", () => {
    const o = ok([fx("dup-within.jsonl")]);
    expect(o.cost_usd).toBeNull();
    expect(o.cost_source).toMatch(/no measured cost/);
  });
});

describe("HL-026 U6 privacy", () => {
  it("U6: stdout contains none of the transcript text, only numbers and fixed wording", () => {
    const r = usage([fx("privacy-marker.jsonl")]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).not.toContain("ZQX-PRIVATE-MARKER-7731");
    expect(r.out).not.toContain("synthetic secret-ish text");
    expect(r.out).not.toContain("/Users/demo");
    expect(r.out).not.toContain("msg-08");
    const o = JSON.parse(r.out) as Record<string, unknown>;
    expect(o).toMatchObject({ tokens: 18, messages: 1 });
  });

  it("U6: the marker is absent from stdout when mixed with other files too", () => {
    const r = usage([fx("dup-within.jsonl"), fx("privacy-marker.jsonl"), fx("invalid-lines.jsonl")]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).not.toContain("ZQX-PRIVATE-MARKER-7731");
  });
});

describe("HL-026 U7 exit codes", () => {
  it("U7: no arguments -> exit 2, usage message on stderr, nothing on stdout", () => {
    const r = usage([]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/usage/i);
    expect(r.out.trim()).toBe("");
  });

  it("U7: an unreadable path -> exit 2 with a usage message on stderr", () => {
    const r = usage([fx("does-not-exist.jsonl")]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/usage/i);
  });

  it("U7: one readable and one unreadable path -> exit 2", () => {
    const r = usage([fx("dup-within.jsonl"), fx("does-not-exist.jsonl")]);
    expect(r.code).toBe(2);
  });

  it("U7: success exits 0", () => {
    expect(usage([fx("cross-a.jsonl")]).code).toBe(0);
  });
});
