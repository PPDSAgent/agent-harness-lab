import { useEffect, useState } from "react";

// Shell first: the page paints without waiting for run data. src/lib/app-data.ts (fixtures, run
// records and the parsers) stays in its own lazy chunk (B1) and is fetched with a dynamic import()
// that nothing awaits at module top level (https://vite.dev/guide/features#dynamic-import).
export type AppData = typeof import("@/lib/app-data");
export type AppDataState = { status: "loading" } | { status: "error" } | { status: "ready"; data: AppData };

let loaded: AppData | null = null;
// Started when the entry runs, in parallel with React's first render, not queued behind the mount.
const request: Promise<AppData> = import("@/lib/app-data").then((m) => (loaded = m));
request.catch(() => {}); // a failure surfaces through useAppData; don't also report it as unhandled

/**
 * Retry reloads the page. A failed dynamic import() is cached in the browser's module map, so
 * calling import() again replays the same failure without a request (observed in Chrome on this
 * build, 2026-11-13). Vite's own guidance for a chunk that failed to load is a reload
 * (https://vite.dev/guide/build#load-error-handling). The only state lost is which sections were
 * open; the theme is kept in localStorage.
 */
const retry = () => window.location.reload();

/** Run data for App: loading, error (with retry) or ready. Renders ready at once if already loaded. */
export function useAppData(): AppDataState & { retry: () => void } {
  const [state, setState] = useState<AppDataState>(() => (loaded ? { status: "ready", data: loaded } : { status: "loading" }));

  useEffect(() => {
    let live = true;
    request.then(
      (data) => live && setState({ status: "ready", data }),
      () => live && setState({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, []);

  return { ...state, retry };
}
