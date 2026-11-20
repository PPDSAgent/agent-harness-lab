// @vitest-environment jsdom
// Follow-ups from review r3 of HL-001 (reviews/2026-11-03T0100-HL-001-r3.md):
// R1 Tailwind's dark: variant is bound to the toggle; R2 the pre-paint script in index.html
// agrees with src/lib/theme.ts; R3 System's OS listener is removed when you leave System.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ThemeToggle } from "../src/components/theme-toggle";
import { THEME_STORAGE_KEY, readPreference, resolveTheme } from "../src/lib/theme";

const root = resolve(__dirname, "..");

/** A fake MediaQueryList whose OS setting can be flipped and whose listeners are visible. */
function fakeOs(prefersLight: boolean) {
  const listeners = new Set<() => void>();
  const os = {
    prefersLight,
    listeners,
    matchMedia: (q: string) => ({
      get matches() { return q === "(prefers-color-scheme: light)" ? os.prefersLight : false; },
      media: q,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }),
    flip(light: boolean) { os.prefersLight = light; listeners.forEach((fn) => fn()); },
  };
  window.matchMedia = os.matchMedia as unknown as typeof window.matchMedia;
  return os;
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => cleanup());

describe("R1: Tailwind's dark variant follows the toggle, not the OS", () => {
  it("src/index.css binds @custom-variant dark to [data-theme=dark]", () => {
    const css = readFileSync(resolve(root, "src/index.css"), "utf8");
    expect(css).toMatch(/@custom-variant\s+dark\s+\(&:where\(\[data-theme=dark\],\s*\[data-theme=dark\] \*\)\);/);
  });
});

describe("R2: the pre-paint script in index.html matches src/lib/theme.ts", () => {
  const html = readFileSync(resolve(root, "index.html"), "utf8");
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  it("index.html has exactly one inline script", () => expect(inline.length).toBe(1));

  const saved: (string | null | "throws")[] = [null, "dark", "light", "system", "purple", "throws"];
  for (const value of saved) {
    for (const prefersLight of [true, false]) {
      it(`saved=${value} os=${prefersLight ? "light" : "dark"}`, () => {
        fakeOs(prefersLight);
        const storage = {
          getItem: (k: string) => {
            if (value === "throws") throw new Error("storage blocked");
            return k === THEME_STORAGE_KEY ? value : null;
          },
        };
        const expected = resolveTheme(readPreference(storage), window.matchMedia);
        // Run the inline script with this case's storage in place of localStorage.
        new Function("localStorage", inline[0])(storage);
        expect(document.documentElement.dataset.theme).toBe(expected);
        expect(document.documentElement.style.colorScheme).toBe(expected);
      });
    }
  }
});

describe("R3: System tracks the OS live, and stops when you leave System", () => {
  it("adds one listener for System, removes it on Dark, and later OS changes leave it dark", () => {
    const os = fakeOs(false);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(os.listeners.size).toBe(1);

    act(() => os.flip(true));
    expect(document.documentElement.dataset.theme).toBe("light");

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(os.listeners.size).toBe(0);
    act(() => os.flip(true));
    act(() => os.flip(false));
    act(() => os.flip(true));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("a first visit with no click saves nothing", () => {
    fakeOs(true);
    render(<ThemeToggle />);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
