// MCP App server for HL-030a: tool `show_series_chart` + a `ui://` HTML view that draws it.
//
// Conventions used, all from installed packages (read 2026-11-17):
//  - @modelcontextprotocol/ext-apps@2.0.4, dist/src/constants.d.ts: RESOURCE_MIME_TYPE ("text/html;profile=mcp-app") is the
//    MIME type of a UI resource; RESOURCE_URI_META_KEY ("ui/resourceUri") is the legacy tool-metadata key.
//  - @modelcontextprotocol/ext-apps@2.0.4, dist/src/spec.types.d.ts McpUiToolMeta: the tool's `_meta.ui.resourceUri` names the
//    ui:// resource. Hosts must check both forms (constants.d.ts), so we set both, as registerAppTool in dist/src/server/index.js does.
//  - ASSUMPTION: ext-apps' registerAppTool/registerAppResource helpers target the v2 `@modelcontextprotocol/server` package;
//    this repo pins @modelcontextprotocol/sdk@1.32.2, so the same metadata is written by hand on the SDK's low-level Server.
//  - @modelcontextprotocol/sdk@1.32.2, dist/esm/server/index.d.ts: Server.setRequestHandler(<Schema>, handler); schemas from
//    dist/esm/types.d.ts. The low-level Server is used (not McpServer) so invalid tool input is validated in our handler and
//    returned as `isError: true` instead of the SDK's schema layer rejecting the request.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps";
import { VIEW_HTML } from "./html";
import { parseSeriesData } from "./series";

export const TOOL_NAME = "show_series_chart";
export const VIEW_URI = "ui://series-chart/view.html";

const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    series: {
      type: "array",
      description: "2 to 500 points, any order; returned sorted by t.",
      items: {
        type: "object",
        properties: { t: { type: "string", description: "ISO-8601 date, e.g. 2026-01-31" }, y: { type: "number" } },
        required: ["t", "y"],
      },
    },
    title: { type: "string" },
  },
  required: ["series"],
};

export function createSeriesChartServer(): Server {
  const server = new Server({ name: "series-chart", version: "0.0.0" }, { capabilities: { tools: {}, resources: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: TOOL_NAME,
        description: "Draw a line chart of a time series (synthetic or public data) in an interactive view.",
        inputSchema: INPUT_SCHEMA,
        _meta: { ui: { resourceUri: VIEW_URI }, [RESOURCE_URI_META_KEY]: VIEW_URI },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== TOOL_NAME) {
      return { isError: true, content: [{ type: "text" as const, text: `Unknown tool: ${req.params.name}` }] };
    }
    const parsed = parseSeriesData(req.params.arguments);
    if (!parsed.ok) {
      return { isError: true, content: [{ type: "text" as const, text: `Invalid input: ${parsed.reason}.` }] };
    }
    const { series, title } = parsed.data;
    const ys = series.map((p) => p.y);
    const text =
      `${title ? `${title}: ` : ""}${series.length} points from ${series[0]!.t} to ${series[series.length - 1]!.t}; ` +
      `min y ${Math.min(...ys)}, max y ${Math.max(...ys)}.`;
    return { content: [{ type: "text" as const, text }], structuredContent: { ...parsed.data } };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [{ uri: VIEW_URI, name: "Series chart view", mimeType: RESOURCE_MIME_TYPE }],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    if (req.params.uri !== VIEW_URI) throw new Error(`Unknown resource: ${req.params.uri}`);
    return { contents: [{ uri: VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: VIEW_HTML }] };
  });

  return server;
}
