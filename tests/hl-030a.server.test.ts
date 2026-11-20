// FROZEN acceptance tests for HL-030a A1-A3 (MCP App server `show_series_chart` + its ui:// resource).
// Builder may not edit this file. All data is SYNTHETIC (dates and numbers from a fixed formula, generated here).
//
// Facts and where they come from (installed packages, read in node_modules on 2026-11-17):
//  - @modelcontextprotocol/ext-apps@2.0.4, dist/src/constants.d.ts: exports RESOURCE_MIME_TYPE = "text/html;profile=mcp-app"
//    and RESOURCE_URI_META_KEY = "ui/resourceUri" (the legacy, deprecated key).
//  - @modelcontextprotocol/ext-apps@2.0.4, dist/src/spec.types.d.ts `McpUiToolMeta` and dist/src/server/index.d.ts
//    `registerAppTool`: the tool's `_meta.ui.resourceUri` carries the ui:// URI; registerAppTool also fills the legacy
//    `_meta["ui/resourceUri"]`. Hosts "must check both formats" (constants.d.ts) and accept a URI that starts with "ui://".
//    This test accepts either key and requires them to agree when both are present.
//  - @modelcontextprotocol/sdk@1.32.2, dist/esm/inMemory.d.ts: InMemoryTransport.createLinkedPair() (import path
//    "@modelcontextprotocol/sdk/inMemory.js", via the package's "./*" export); Client from
//    "@modelcontextprotocol/sdk/client/index.js".
//
// ASSUMPTION: the task block does not name the tool's argument keys or the structuredContent shape. These tests fix them as
//   arguments  { series: Array<{ t: string; y: number }>, title?: string }
//   structuredContent { title?: string, series: Array<{ t, y }> }  (series sorted ascending by Date.parse(t))
// The lead should confirm this contract with the builder brief (the build reads these tests).
// ASSUMPTION: a text fallback "states" the first/last dates as the `t` strings and min/max y as plain numbers; the tests
//   use whole-number y and YYYY-MM-DD dates so any natural rendering contains them verbatim.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps";
import { createSeriesChartServer } from "../src/mcp/series-chart/server";

type Pt = { t: string; y: number };

// SYNTHETIC series: day i of 2026-01-01.., y = (i * 7) % 23 + i (whole numbers).
function day(i: number): string {
  const d = new Date(Date.UTC(2026, 0, 1 + i));
  return d.toISOString().slice(0, 10);
}
function makeSeries(n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => ({ t: day(i), y: ((i * 7) % 23) + i }));
}

const open: Client[] = [];
async function connect() {
  const server = createSeriesChartServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "hl-030a-test-client", version: "0.0.0" });
  await server.connect(serverT);
  await client.connect(clientT);
  open.push(client);
  return client;
}
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

function uiUri(tool: { _meta?: Record<string, unknown> }): string | undefined {
  const meta = tool._meta ?? {};
  const modern = (meta.ui as { resourceUri?: unknown } | undefined)?.resourceUri;
  const legacy = meta[RESOURCE_URI_META_KEY];
  if (typeof modern === "string" && typeof legacy === "string") expect(legacy).toBe(modern);
  const uri = typeof modern === "string" ? modern : legacy;
  return typeof uri === "string" ? uri : undefined;
}

async function getTool(client: Client) {
  const { tools } = await client.listTools();
  return tools.find((t) => t.name === "show_series_chart");
}

describe("HL-030a A1 · tools/list links a ui:// resource", () => {
  it("lists show_series_chart whose _meta links a ui:// URI (MCP Apps convention)", async () => {
    const client = await connect();
    const tool = await getTool(client);
    expect(tool, "tools/list must include show_series_chart").toBeDefined();
    const uri = uiUri(tool as { _meta?: Record<string, unknown> });
    expect(uri, "tool._meta.ui.resourceUri (or legacy ui/resourceUri) must be set").toBeDefined();
    expect(uri!.startsWith("ui://")).toBe(true);
    expect(uri!.length).toBeGreaterThan("ui://".length);
  });

  it("createSeriesChartServer() returns a fresh server each call (two connect independently)", async () => {
    const a = await connect();
    const b = await connect();
    expect(await getTool(a)).toBeDefined();
    expect(await getTool(b)).toBeDefined();
  });
});

// ---- A2 -------------------------------------------------------------------------------------------------------------
const ATTR_URL = /\b(?:src|href|srcset|poster|action|data|xlink:href)\s*=\s*["']?\s*(?:https?:)?\/\//i;
const CSS_URL = /url\(\s*["']?\s*(?:https?:)?\/\//i;
const CSS_IMPORT = /@import\s+(?:url\(\s*)?["']?\s*(?:https?:)?\/\//i;
const LINK_STYLESHEET_REMOTE = /<link\b[^>]*\brel\s*=\s*["']?stylesheet[^>]*>/i;
const SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=/i;
function networkLoads(html: string): string[] {
  const found: string[] = [];
  for (const [name, re] of [
    ["attribute url", ATTR_URL],
    ["css url()", CSS_URL],
    ["css @import", CSS_IMPORT],
    ["link stylesheet", LINK_STYLESHEET_REMOTE],
    ["script src", SCRIPT_SRC],
  ] as const) {
    if (re.test(html)) found.push(name);
  }
  return found;
}

describe("HL-030a A2 · resources/read returns one self-contained HTML document", () => {
  it("the network-load detector itself sees each kind of remote load (control, SYNTHETIC html)", () => {
    expect(networkLoads('<img src="https://x.example/a.png">')).toContain("attribute url");
    expect(networkLoads('<a href="//x.example/a">')).toContain("attribute url");
    expect(networkLoads("<style>div{background:url(https://x.example/a.png)}</style>")).toContain("css url()");
    expect(networkLoads("<style>@import 'https://x.example/a.css';</style>")).toContain("css @import");
    expect(networkLoads('<link rel="stylesheet" href="https://x.example/a.css">').length).toBeGreaterThan(0);
    expect(networkLoads('<script src="chart.js"></script>')).toContain("script src");
    expect(networkLoads('<svg xmlns="http://www.w3.org/2000/svg"></svg><script>var n="http://www.w3.org/2000/svg"</script>')).toEqual([]);
  });

  it("reads exactly one content, with the MCP Apps HTML MIME type from the package", async () => {
    const client = await connect();
    const uri = uiUri((await getTool(client)) as { _meta?: Record<string, unknown> })!;
    const res = await client.readResource({ uri });
    expect(res.contents).toHaveLength(1);
    const c = res.contents[0] as { uri: string; mimeType?: string; text?: string };
    expect(c.mimeType).toBe(RESOURCE_MIME_TYPE);
    expect(c.uri).toBe(uri);
    expect(typeof c.text).toBe("string");
  });

  it("the text is a complete HTML document", async () => {
    const client = await connect();
    const uri = uiUri((await getTool(client)) as { _meta?: Record<string, unknown> })!;
    const html = ((await client.readResource({ uri })).contents[0] as { text: string }).text;
    expect(html.trimStart().slice(0, 15).toLowerCase()).toBe("<!doctype html>");
    expect(/<html[\s>]/i.test(html)).toBe(true);
    expect(/<head[\s>]/i.test(html)).toBe(true);
    expect(/<body[\s>]/i.test(html)).toBe(true);
    expect(/<\/html>\s*$/i.test(html)).toBe(true);
  });

  it("loads nothing from the network: no remote src/href/url()/@import/stylesheet link, no <script src>", async () => {
    const client = await connect();
    const uri = uiUri((await getTool(client)) as { _meta?: Record<string, unknown> })!;
    const html = ((await client.readResource({ uri })).contents[0] as { text: string }).text;
    expect(networkLoads(html)).toEqual([]);
  });
});

// ---- A3 -------------------------------------------------------------------------------------------------------------
type Result = {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: { title?: string; series?: Pt[] };
};
async function call(client: Client, args: Record<string, unknown>): Promise<Result> {
  return (await client.callTool({ name: "show_series_chart", arguments: args })) as Result;
}
const textOf = (r: Result) => (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");

describe("HL-030a A3 · tools/call show_series_chart", () => {
  it("valid series: text fallback states count, first/last date, min/max y; structuredContent is sorted by t", async () => {
    const client = await connect();
    const sorted = makeSeries(12);
    // deterministic shuffle of the input order (reverse then rotate) so sorting is observable
    const shuffled = [...sorted].reverse();
    shuffled.push(shuffled.shift()!);
    const res = await call(client, { series: shuffled, title: "Synthetic demo" });
    expect(res.isError).not.toBe(true);
    const text = textOf(res);
    const ys = sorted.map((p) => p.y);
    expect(text).toContain("12");
    expect(text).toContain(sorted[0]!.t);
    expect(text).toContain(sorted[11]!.t);
    expect(text).toContain(String(Math.min(...ys)));
    expect(text).toContain(String(Math.max(...ys)));
    const sc = res.structuredContent;
    expect(sc).toBeDefined();
    expect(Array.isArray(sc!.series)).toBe(true);
    expect(sc!.series).toHaveLength(12);
    const times = sc!.series!.map((p) => Date.parse(p.t));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(sc!.series!.map((p) => [Date.parse(p.t), p.y])).toEqual(sorted.map((p) => [Date.parse(p.t), p.y]));
    expect(sc!.title).toBe("Synthetic demo");
  });

  it("title is optional", async () => {
    const client = await connect();
    const res = await call(client, { series: makeSeries(2) });
    expect(res.isError).not.toBe(true);
    expect(res.structuredContent!.series).toHaveLength(2);
  });

  it("accepts the 2-point and 500-point boundaries", async () => {
    const client = await connect();
    const two = await call(client, { series: makeSeries(2) });
    const many = await call(client, { series: makeSeries(500) });
    expect(two.isError).not.toBe(true);
    expect(many.isError).not.toBe(true);
    expect(many.structuredContent!.series).toHaveLength(500);
    expect(textOf(many)).toContain("500");
  });

  const bad: Array<[string, () => Record<string, unknown>]> = [
    ["fewer than 2 points (1)", () => ({ series: makeSeries(1) })],
    ["fewer than 2 points (0)", () => ({ series: [] })],
    ["more than 500 points (501)", () => ({ series: makeSeries(501) })],
    ["a y that is a string", () => ({ series: [...makeSeries(3), { t: day(9), y: "12" }] })],
    ["a y that is null (what JSON makes of NaN/Infinity)", () => ({ series: [...makeSeries(3), { t: day(9), y: null }] })],
    ["an unparseable date", () => ({ series: [...makeSeries(3), { t: "not-a-date", y: 1 }] })],
    ["an impossible calendar date", () => ({ series: [...makeSeries(3), { t: "2026-13-45", y: 1 }] })],
    ["a missing series", () => ({ title: "no data" })],
  ];
  for (const [label, args] of bad) {
    it(`invalid input (${label}) returns isError with a text reason and does not throw`, async () => {
      const client = await connect();
      let res: Result | undefined;
      let thrown: unknown;
      try {
        res = await call(client, args());
      } catch (e) {
        thrown = e;
      }
      expect(thrown, "callTool must resolve, not reject").toBeUndefined();
      expect(res!.isError).toBe(true);
      expect(textOf(res!).trim().length).toBeGreaterThan(0);
    });
  }

  it("a non-finite y (Infinity; JSON turns it into null on the wire) yields isError", async () => {
    const client = await connect();
    const res = await call(client, { series: [...makeSeries(3), { t: day(9), y: Number.POSITIVE_INFINITY }] });
    expect(res.isError).toBe(true);
    expect(textOf(res).trim().length).toBeGreaterThan(0);
  });
});
