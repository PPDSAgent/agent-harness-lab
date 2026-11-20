import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

// Everything here reads tokens from src/index.css (DESIGN.md D1-D4). No hex values in this file.
const TYPE_SCALE = [
  { cls: "text-xs", name: "text-xs", size: "12px / 16px", rem: "0.75rem" },
  { cls: "text-sm", name: "text-sm", size: "14px / 20px", rem: "0.875rem" },
  { cls: "text-base", name: "text-base", size: "16px / 24px", rem: "1rem" },
  { cls: "text-lg", name: "text-lg", size: "18px / 28px", rem: "1.125rem" },
  { cls: "text-xl", name: "text-xl", size: "20px / 28px", rem: "1.25rem" },
  { cls: "text-2xl", name: "text-2xl", size: "24px / 32px", rem: "1.5rem" },
];

// Every --color-* token of the @theme block in src/index.css (each maps to the same-named CSS variable).
const COLORS = [
  "background", "foreground", "card", "card-foreground", "surface-2", "surface-3", "elevation-highlight",
  "muted-foreground", "primary", "primary-foreground", "live", "live-foreground", "evidence", "evidence-foreground",
  "secondary", "secondary-foreground", "accent", "accent-foreground", "destructive", "destructive-foreground",
  "border", "input", "ring", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6",
] as const;

const CHARTS = [
  { name: "chart-1", label: "circle", shape: <circle cx="6" cy="6" r="5" /> },
  { name: "chart-2", label: "square", shape: <rect x="1" y="1" width="10" height="10" /> },
  { name: "chart-3", label: "triangle", shape: <polygon points="6,1 11,11 1,11" /> },
  { name: "chart-4", label: "diamond", shape: <polygon points="6,0.5 11.5,6 6,11.5 0.5,6" /> },
  { name: "chart-5", label: "plus", shape: <path d="M4.5 1h3v3.5H11v3H7.5V11h-3V7.5H1v-3h3.5z" /> },
  { name: "chart-6", label: "cross", shape: <path d="M2 0.5 6 4.5 10 0.5 11.5 2 7.5 6 11.5 10 10 11.5 6 7.5 2 11.5 0.5 10 4.5 6 0.5 2z" /> },
] as const;

// Line styles carry the percentile; colour is never the only cue.
const PERCENTILES = [
  { name: "p50", label: "median", dash: undefined, width: 2 },
  { name: "p95", label: "dashed", dash: "6 3", width: 2 },
  { name: "p99", label: "dotted", dash: "1.5 3", width: 3 },
] as const;

/** Resolved colour of a token in the active theme, re-read when <html data-theme> changes. */
function useResolved(name: string) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    const read = () => {
      if (ref.current) setValue(getComputedStyle(ref.current).backgroundColor);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, [name]);
  return { ref, value };
}

function Swatch({ name }: { name: string }) {
  const { ref, value } = useResolved(name);
  return (
    <li className="flex items-center gap-2">
      <span ref={ref} aria-hidden="true" className="size-6 shrink-0 rounded-md border" style={{ background: `var(--${name})` }} />
      <span className="min-w-0">
        <code className="block truncate font-mono text-xs">{name}</code>
        <span className="block font-mono text-xs text-muted-foreground">{value}</span>
      </span>
    </li>
  );
}

function ChartSwatch({ item }: { item: (typeof CHARTS)[number] }) {
  const { ref, value } = useResolved(item.name);
  return (
    <li className="flex items-center gap-2">
      <span ref={ref} aria-hidden="true" className="hidden" style={{ background: `var(--${item.name})` }} />
      <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor" style={{ color: `var(--${item.name})` }}>
        {item.shape}
      </svg>
      <span className="min-w-0">
        <code className="block truncate font-mono text-xs">{item.name}</code>
        <span className="block text-xs text-muted-foreground">Series marker: {item.label}</span>
        <span className="block font-mono text-xs text-muted-foreground">{value}</span>
      </span>
    </li>
  );
}

export default function StyleGuide() {
  const [moved, setMoved] = useState(false);
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 [overflow-wrap:anywhere] sm:py-10" data-density="compact">
      <div className="mb-4 flex justify-end">
        <ThemeToggle />
      </div>
      <h1 className="text-2xl font-semibold">Style guide</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tokens from DESIGN.md decisions D1 to D4, read live from src/index.css. Toggle the theme to compare.
      </p>

      <section aria-labelledby="sg-type" className="mt-8">
        <h2 id="sg-type" className="text-lg font-semibold">Type scale</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sans: <code className="font-mono">-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif</code>.
          Mono: <code className="font-mono">ui-monospace, &quot;SF Mono&quot;, Menlo, monospace</code>. No bundled webfont (D1).
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Size / line-height per step (Tailwind v4 defaults, https://tailwindcss.com/docs/font-size). Headings: h1 and h2 weight 600 (semibold); body weight 400; buttons weight 500.
        </p>
        <p className="mt-2 font-mono text-sm">Mono sample: 1234567890 run-id 0x2f ok</p>
        <ul className="mt-3 space-y-2">
          {TYPE_SCALE.map((t) => (
            <li key={t.name} className="flex flex-wrap items-baseline gap-x-4">
              <span className={t.cls}>The quick brown fox</span>
              <span className="font-mono text-xs text-muted-foreground">{t.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{t.size}</span>
              <span className="font-mono text-xs text-muted-foreground">{t.rem}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sg-color" className="mt-8">
        <h2 id="sg-color" className="text-lg font-semibold">Color tokens</h2>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COLORS.map((name) => <Swatch key={name} name={name} />)}
        </ul>
      </section>

      <section aria-labelledby="sg-chart" className="mt-8">
        <h2 id="sg-chart" className="text-lg font-semibold">Chart palette</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Six Okabe-Ito hues (Wong 2011, Nature Methods, https://www.nature.com/articles/nmeth.1618); the light set is darkened to hold 3:1 on the page.
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CHARTS.map((c) => <ChartSwatch key={c.name} item={c} />)}
        </ul>
        <h3 className="mt-4 text-sm font-semibold">Latency percentiles (line style)</h3>
        <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PERCENTILES.map((p) => (
            <li key={p.name} className="flex items-center gap-2">
              <svg width="48" height="8" viewBox="0 0 48 8" aria-hidden="true" className="shrink-0 stroke-foreground">
                <line x1="1" y1="4" x2="47" y2="4" strokeWidth={p.width} strokeDasharray={p.dash} />
              </svg>
              <span className="font-mono text-xs">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sg-motion" className="mt-8">
        <h2 id="sg-motion" className="text-lg font-semibold">Motion</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One staged load-in per view (D2). The sample below moves at 300 ms ease-out; it stops under prefers-reduced-motion: reduce.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Button variant="secondary" size="sm" className="focus-visible:ring-ring" onClick={() => setMoved((v) => !v)}>
            Replay sample
          </Button>
          <div className="relative h-6 w-48 rounded-md border" aria-hidden="true">
            <span
              className={`absolute top-1 size-4 rounded-full bg-primary transition-transform duration-300 ease-out ${moved ? "translate-x-40" : "translate-x-1"}`}
            />
          </div>
          <span className="font-mono text-xs text-muted-foreground">transform, 300 ms ease-out</span>
        </div>
      </section>
    </main>
  );
}
