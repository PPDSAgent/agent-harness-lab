// Client entry bundled (IIFE) into the served HTML by scripts/build-mcp-view.ts.
//
// A deliberately small hand-rolled MCP Apps view client instead of bundling the ext-apps `App` class: the
// bundled App (dist/src/app-with-deps.js, ~540 KB with zod) contains URL-looking string literals that break A2's
// "no remote url()" check on the served text, and made the jsdom handshake exceed the test timeouts (observed in this run).
// Wire protocol, all from @modelcontextprotocol/ext-apps@2.0.4, dist/src/spec.types.d.ts and message-transport.d.ts:
//   - messages are JSON-RPC 2.0 objects sent with window.parent.postMessage(msg, "*") (PostMessageTransport);
//   - view -> host request   "ui/initialize"  params { appInfo, appCapabilities, protocolVersion } (McpUiInitializeRequest);
//     LATEST_PROTOCOL_VERSION = "2026-01-26" (spec.types.d.ts);
//   - view -> host notification "ui/notifications/initialized" after the result arrives (McpUiInitializedNotification);
//   - host -> view notification "ui/notifications/tool-result", params = CallToolResult (McpUiToolResultNotification);
//   - view -> host notification "ui/notifications/size-changed" params { width, height } (McpUiSizeChangedNotification).
// As PostMessageTransport does on the view side, only messages whose event.source is window.parent are accepted.
import { renderSeriesChart } from "./view";

type Rpc = { jsonrpc?: string; id?: number | string; method?: string; params?: unknown; result?: unknown; error?: unknown };

const root = document.getElementById("root")!;
const host = window.parent;
const INIT_ID = 1;

function send(msg: Rpc): void {
  host.postMessage({ jsonrpc: "2.0", ...msg }, "*");
}

function reportSize(): void {
  send({ method: "ui/notifications/size-changed", params: { width: document.body.scrollWidth, height: document.body.scrollHeight } });
}

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== host) return;
  const m = ev.data as Rpc | null;
  if (typeof m !== "object" || m === null) return;
  if (m.id === INIT_ID && ("result" in m || "error" in m)) {
    if ("error" in m) {
      root.textContent = "The host refused to initialize this view.";
      return;
    }
    send({ method: "ui/notifications/initialized", params: {} });
  } else if (m.method === "ui/notifications/tool-result") {
    const r = (m.params ?? {}) as { isError?: boolean; structuredContent?: unknown; content?: unknown };
    if (r.isError) {
      // Show the tool's own text (CallToolResult.content text blocks), not a null-input validation reason.
      const text = (Array.isArray(r.content) ? r.content : [])
        .map((c) => (c && typeof c === "object" && (c as { type?: unknown }).type === "text" ? String((c as { text?: unknown }).text ?? "") : ""))
        .filter(Boolean)
        .join(" ");
      const p = document.createElement("p");
      p.setAttribute("role", "status");
      p.className = "msg";
      p.textContent = text || "The tool reported an error.";
      root.replaceChildren(p);
    } else {
      renderSeriesChart(root, r.structuredContent);
    }
    reportSize();
  } else if (m.method === "ui/resource-teardown" && m.id !== undefined) {
    send({ id: m.id, result: {} });
  }
});

send({
  id: INIT_ID,
  method: "ui/initialize",
  params: { appInfo: { name: "series-chart-view", version: "0.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" },
});
