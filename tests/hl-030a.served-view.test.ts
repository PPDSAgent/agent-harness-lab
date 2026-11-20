// @vitest-environment jsdom
// FROZEN acceptance tests for HL-030a A5 (the served HTML alone draws the chart). Builder may not edit this file.
// All data is SYNTHETIC (generated here). Runs in jsdom (per-file comment above); vitest's jsdom environment runs scripts.
//
// HOW IT WORKS (a minimal MCP Apps host, in the test): the HTML that resources/read serves is loaded into an <iframe>
// inside the jsdom page (document.write into the iframe, because jsdom does not load srcdoc); the test plays the host side of the view protocol:
//   view -> host  "ui/initialize" (JSON-RPC request, has an id)       -> host replies with a result
//   view -> host  "ui/notifications/initialized"                       -> host sends the tool result
//   host -> view  "ui/notifications/tool-result", params = the CallToolResult (incl. structuredContent)
// Sources (installed, read 2026-11-17):
//  - @modelcontextprotocol/ext-apps@2.0.4 dist/src/spec.types.d.ts: McpUiInitializeRequest ("ui/initialize"),
//    McpUiInitializeResult (protocolVersion, hostInfo, hostCapabilities, hostContext),
//    McpUiInitializedNotification ("ui/notifications/initialized"), McpUiToolResultNotification
//    ("ui/notifications/tool-result", params: CallToolResult).
//  - @modelcontextprotocol/ext-apps@2.0.4 dist/src/message-transport.d.ts: PostMessageTransport uses window.postMessage with
//    "*" and (view side) validates event.source === window.parent. jsdom's postMessage does not set event.source, so the host
//    here dispatches MessageEvents into the iframe window with source = the parent window, which is what a browser would do.
// ASSUMPTION: jsdom cannot run <script type="module">, so the served view must use classic inline scripts (a bundled IIFE). A
//   view that needs module scripts fails here; that would be a limit of this test, to be raised with the lead, not a reason to
//   weaken it.
// ASSUMPTION: the view may be a hand-rolled postMessage client or the bundled ext-apps App class; both send "ui/initialize"
//   first. If the view never sends it, the host sends the tool result anyway after 1500 ms.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSeriesChartServer } from "../src/mcp/series-chart/server";

type Pt = { t: string; y: number };
function makeSeries(n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => ({
    t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    y: ((i * 3) % 11) + i,
  }));
}

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function serve(): Promise<{ client: Client; html: string }> {
  const server = createSeriesChartServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "hl-030a-served-view", version: "0.0.0" });
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
  const sent: string[] = [];
  const received: string[] = [];
  let delivered = false;
  const deliver = () => {
    if (delivered) return;
    delivered = true;
    post({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: resultParams() });
  };
  // vitest's global `window` is not the jsdom Window object itself; the iframe's `parent` is, and that is what a view compares
  // event.source with (verified in a scratch run: source === window.parent is true for events built this way).
  const host = () => iframe.contentWindow!.parent as unknown as Window;
  const post = (data: unknown) => {
    const w = iframe.contentWindow!;
    sent.push((data as { method?: string }).method ?? "response");
    w.dispatchEvent(new (w as unknown as typeof globalThis).MessageEvent("message", { data, source: host(), origin: "http://localhost" }));
  };
  const onMessage = (ev: MessageEvent) => {
    const m = ev.data as { id?: unknown; method?: string } | null;
    if (!m || typeof m !== "object") return;
    received.push(m.method ?? "response");
    if (m.method === "ui/initialize" && m.id !== undefined) {
      post({
        jsonrpc: "2.0",
        id: m.id,
        result: {
          protocolVersion: "2026-01-26",
          hostInfo: { name: "hl-030a-test-host", version: "0.0.0" },
          hostCapabilities: {},
          hostContext: { theme: "light", displayMode: "inline" },
        },
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
  // jsdom 30 does not load <iframe> (verified in a scratch run: empty document), so write the document in.
  iframe.contentDocument!.open();
  iframe.contentDocument!.write(html);
  iframe.contentDocument!.close();
  return { iframe, sent, received };
}

function visibleText(doc: Document): string {
  const clone = doc.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style").forEach((n) => n.remove());
  return (clone.textContent ?? "").trim();
}

async function until<T>(fn: () => T | null | undefined | false, ms = 6000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out waiting for the view to draw");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("HL-030a A5 · the served HTML alone draws the chart", () => {
  it("serves classic inline script that contains the renderer (no module scripts, no external script)", async () => {
    const { html } = await serve();
    expect(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html)).toBe(true);
    expect(/<script\b[^>]*\btype\s*=\s*["']?module/i.test(html)).toBe(false);
    expect(html).toMatch(/svg/i);
  });

  it("a host delivering a show_series_chart result makes the view draw one svg role=img with the title and one marker per point", async () => {
    const { client, html } = await serve();
    const series = makeSeries(14);
    const result = await client.callTool({ name: "show_series_chart", arguments: { series, title: "Synthetic served view" } });
    expect(result.isError).not.toBe(true);
    const { iframe } = startHost(html, () => result);
    const svg = await until(() => iframe.contentDocument?.querySelector("svg"));
    expect(iframe.contentDocument!.querySelectorAll("svg")).toHaveLength(1);
    expect(svg.getAttribute("role")).toBe("img");
    const byIds = (svg.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .map((id) => iframe.contentDocument!.getElementById(id)?.textContent ?? "")
      .join(" ");
    const nameOrTitle = svg.getAttribute("aria-label") || byIds.trim() || (svg.querySelector("title")?.textContent ?? "");
    expect(nameOrTitle).toContain("Synthetic served view");
    expect(svg.querySelectorAll("path")).toHaveLength(1);
    expect(svg.querySelectorAll("circle, [data-marker]")).toHaveLength(14);
  });

  it("the view speaks the MCP Apps handshake (ui/initialize, then ui/notifications/initialized) before the result is delivered", async () => {
    const { client, html } = await serve();
    const result = await client.callTool({ name: "show_series_chart", arguments: { series: makeSeries(3) } });
    const { iframe, received, sent } = startHost(html, () => result);
    await until(() => iframe.contentDocument?.querySelector("svg"));
    expect(received).toContain("ui/initialize");
    expect(received).toContain("ui/notifications/initialized");
    // the host only answered the handshake, then sent the result: initialize was seen before the result went out
    expect(sent.indexOf("response")).toBeLessThan(sent.indexOf("ui/notifications/tool-result"));
  });

  it("a tool-result with no usable structured content shows a text message and no svg", async () => {
    const { html } = await serve();
    const { iframe } = startHost(html, () => ({ isError: true, content: [{ type: "text", text: "bad input" }] }));
    // wait for the host to have delivered (initialized handshake or the 1500 ms fallback), then let the view react
    await until(() => iframe.contentDocument?.body);
    await new Promise((r) => setTimeout(r, 2200));
    expect(iframe.contentDocument!.querySelector("svg")).toBeNull();
    expect(visibleText(iframe.contentDocument!).length).toBeGreaterThan(0);
  });
});
