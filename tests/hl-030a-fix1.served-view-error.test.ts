// @vitest-environment jsdom
// FROZEN fix test 1 for HL-030a (reviewer r1 required fix 2). Builder may not edit this file. All data SYNTHETIC.
// Behaviour: when the host delivers a tool result with isError: true, the served view shows the tool's own text
// content (not the null-input validation reason, not the "Waiting for the chart data" placeholder), and draws no svg.
// A valid result still draws the svg, so a view that ignores every result fails the first/last tests.
// Host harness copied in shape from tests/hl-030a.served-view.test.ts (handshake per @modelcontextprotocol/ext-apps@2.0.4
// dist/src/spec.types.d.ts: ui/initialize, ui/notifications/initialized, ui/notifications/tool-result).
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSeriesChartServer } from "../src/mcp/series-chart/server";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function serve(): Promise<{ client: Client; html: string }> {
  const server = createSeriesChartServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "hl-030a-fix1", version: "0.0.0" });
  await server.connect(st);
  await client.connect(ct);
  cleanups.push(() => client.close());
  const { tools } = await client.listTools();
  const meta = tools.find((t) => t.name === "show_series_chart")?._meta ?? {};
  const uri = ((meta.ui as { resourceUri?: string } | undefined)?.resourceUri ?? meta["ui/resourceUri"]) as string;
  const html = ((await client.readResource({ uri })).contents[0] as { text: string }).text;
  return { client, html };
}

function startHost(html: string, resultParams: () => unknown) {
  const iframe = document.createElement("iframe");
  let delivered = false;
  const host = () => iframe.contentWindow!.parent as unknown as Window;
  const post = (data: unknown) => {
    const w = iframe.contentWindow!;
    w.dispatchEvent(new (w as unknown as typeof globalThis).MessageEvent("message", { data, source: host(), origin: "http://localhost" }));
  };
  const deliver = () => {
    if (delivered) return;
    delivered = true;
    post({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: resultParams() });
  };
  const onMessage = (ev: MessageEvent) => {
    const m = ev.data as { id?: unknown; method?: string } | null;
    if (!m || typeof m !== "object") return;
    if (m.method === "ui/initialize" && m.id !== undefined) {
      post({
        jsonrpc: "2.0",
        id: m.id,
        result: { protocolVersion: "2026-01-26", hostInfo: { name: "hl-030a-fix1-host", version: "0.0.0" }, hostCapabilities: {}, hostContext: { theme: "light", displayMode: "inline" } },
      });
    } else if (m.method === "ui/notifications/initialized") {
      deliver();
    }
  };
  document.body.appendChild(iframe);
  host().addEventListener("message", onMessage as EventListener);
  const timer = setTimeout(deliver, 1500);
  cleanups.push(() => {
    clearTimeout(timer);
    host().removeEventListener("message", onMessage as EventListener);
    iframe.remove();
  });
  iframe.contentDocument!.open();
  iframe.contentDocument!.write(html);
  iframe.contentDocument!.close();
  return { iframe };
}

function visibleText(doc: Document): string {
  const clone = doc.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style").forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

async function until<T>(fn: () => T | null | undefined | false, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out waiting for the view");
    await new Promise((r) => setTimeout(r, 25));
  }
}

// Waits up to 3.5 s for a condition, then returns either way so the assertion (not a timeout) reports a miss.
async function settle(fn: () => boolean, ms = 3500): Promise<void> {
  const end = Date.now() + ms;
  while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
}

const ERROR_TEXT = "Upstream series store is unavailable (synthetic fault 7431)";

describe("HL-030a fix1 · an isError tool result shows the tool's own text", () => {
  it("the delivered error text is visible and the waiting placeholder is gone", async () => {
    const { html } = await serve();
    const { iframe } = startHost(html, () => ({ isError: true, content: [{ type: "text", text: ERROR_TEXT }] }));
    const doc = iframe.contentDocument!;
    await settle(() => visibleText(doc).includes("synthetic fault 7431"));
    expect(visibleText(doc)).toContain(ERROR_TEXT);
    expect(visibleText(doc)).not.toMatch(/waiting for the chart data/i);
    expect(doc.querySelector("svg")).toBeNull();
  });

  it("the error text replaces the null-input validation reason (it is not a generic 'no data' message)", async () => {
    const { html } = await serve();
    const { iframe } = startHost(html, () => ({ isError: true, content: [{ type: "text", text: ERROR_TEXT }] }));
    const doc = iframe.contentDocument!;
    await settle(() => visibleText(doc).includes("synthetic fault 7431"));
    // The old behaviour rendered the validation reason for null input; the view must not show that instead of the tool text.
    const t = visibleText(doc);
    expect(t.length).toBeLessThan(ERROR_TEXT.length + 120);
    expect(t).toContain(ERROR_TEXT);
  });

  it("a valid result still draws the svg and no error text (a view that ignores results fails)", async () => {
    const { client, html } = await serve();
    const series = Array.from({ length: 6 }, (_, i) => ({ t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), y: i * 2 + 1 }));
    const result = await client.callTool({ name: "show_series_chart", arguments: { series, title: "Synthetic fix1" } });
    expect(result.isError).not.toBe(true);
    const { iframe } = startHost(html, () => result);
    const doc = iframe.contentDocument!;
    await until(() => doc.querySelector("svg"));
    expect(visibleText(doc)).not.toMatch(/waiting for the chart data/i);
    expect(visibleText(doc)).not.toContain("synthetic fault 7431");
  });
});
