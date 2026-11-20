// HL-030a: the committed generated view script must equal a fresh bundle of src/mcp/series-chart (no stale inline script).
// Regenerate with `npm run build:mcp-view`. Written by the builder (not a frozen test).
import { describe, expect, it } from "vitest";
import { bundleView } from "../scripts/build-mcp-view";
import { VIEW_SCRIPT } from "../src/mcp/series-chart/view-bundle.generated";

describe("HL-030a generated view bundle", () => {
  it("is up to date with view.ts, series.ts and view-entry.ts", () => {
    expect(VIEW_SCRIPT).toBe(bundleView());
  });
  it("can see staleness (control: a changed script differs)", () => {
    expect(VIEW_SCRIPT + " ").not.toBe(bundleView());
  });
});
