// Pure renderer for the series-chart MCP App view (HL-030a A4). No imports from the
// MCP packages: this file is also bundled into the served HTML (see scripts/build-mcp-view.ts).
import { parseSeriesData } from "./series";

const NS = "http://www.w3.org/2000/svg";
const W = 640;
const H = 320;
const M = { l: 56, r: 16, t: 16, b: 40 };

function el(name: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * Draw `data` ({ title?, series: [{t, y}] }) into `container`, replacing its content.
 * Invalid or empty data renders a text message and no <svg>. Text is set with
 * textContent only, so a title containing markup is never interpreted.
 */
export function renderSeriesChart(container: HTMLElement, data: unknown): void {
  container.replaceChildren();
  const parsed = parseSeriesData(data);
  if (!parsed.ok) {
    const p = document.createElement("p");
    p.setAttribute("role", "status");
    p.className = "msg";
    p.textContent = `No chart to show: ${parsed.reason}.`;
    container.appendChild(p);
    return;
  }
  const { title, series } = parsed.data;
  const times = series.map((p) => Date.parse(p.t));
  const t0 = times[0]!;
  const t1 = times[times.length - 1]!;
  const ys = series.map((p) => p.y);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const x = (ms: number) => M.l + (t1 === t0 ? (W - M.l - M.r) / 2 : ((ms - t0) / (t1 - t0)) * (W - M.l - M.r));
  const y = (v: number) => H - M.b - ((v - lo) / (hi - lo)) * (H - M.t - M.b);

  const name = `${title ?? "Series chart"}: ${series.length} points from ${series[0]!.t} to ${series[series.length - 1]!.t}, y from ${fmt(Math.min(...ys))} to ${fmt(Math.max(...ys))}`;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": name, width: "100%" });
  svg.appendChild(el("title", {}, name));

  // Axes use <line> (not <path>) so the data line is the only path.
  svg.appendChild(el("line", { class: "axis", x1: M.l, y1: H - M.b, x2: W - M.r, y2: H - M.b }));
  svg.appendChild(el("line", { class: "axis", x1: M.l, y1: M.t, x2: M.l, y2: H - M.b }));
  for (const v of [lo, (lo + hi) / 2, hi]) {
    svg.appendChild(el("text", { class: "tick", x: M.l - 6, y: y(v) + 4, "text-anchor": "end" }, fmt(v)));
  }
  svg.appendChild(el("text", { class: "tick", x: M.l, y: H - M.b + 18, "text-anchor": "start" }, series[0]!.t));
  svg.appendChild(el("text", { class: "tick", x: W - M.r, y: H - M.b + 18, "text-anchor": "end" }, series[series.length - 1]!.t));

  const d = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(times[i]!).toFixed(1)} ${y(p.y).toFixed(1)}`).join(" ");
  svg.appendChild(el("path", { class: "line", d, fill: "none" }));
  series.forEach((p, i) => {
    const c = el("circle", { class: "marker", "data-marker": "", cx: x(times[i]!).toFixed(1), cy: y(p.y).toFixed(1), r: 3 });
    c.appendChild(el("title", {}, `${p.t}: ${fmt(p.y)}`));
    svg.appendChild(c);
  });

  if (title) {
    const h = document.createElement("h1");
    h.textContent = title;
    container.appendChild(h);
  }
  container.appendChild(svg);
}
