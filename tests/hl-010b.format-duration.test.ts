// FROZEN acceptance tests for HL-010b (duration formatter). Builder may not edit this file.
// All inline data is SYNTHETIC.
//
// CONTRACT: src/lib/format-duration.ts
//   export function formatDuration(ms: number | null): string   (named export)
// HL-010a had this formatter private inside src/components/runs-list.tsx; HL-010b exports it so the
// list and the detail view share one implementation. Behaviour is the HL-010a behaviour.
import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/lib/format-duration";

describe("HL-010b formatDuration", () => {
  it.each([
    [59949, "59.9 s"],
    [59990, "1 min 0 s"],
    [119600, "2 min 0 s"],
  ])("frozen case %i -> %s", (ms, out) => {
    expect(formatDuration(ms)).toBe(out);
  });

  it("renders null as the em dash", () => {
    expect(formatDuration(null)).toBe("—");
  });

  it.each([
    [0, "0 ms"],
    [999, "999 ms"],
    [1000, "1.0 s"],
    [1500, "1.5 s"],
    [60000, "1 min 0 s"],
    [90000, "1 min 30 s"],
  ])("neighbouring case %i -> %s", (ms, out) => {
    expect(formatDuration(ms)).toBe(out);
  });
});
