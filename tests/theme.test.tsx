// @vitest-environment jsdom
// Theme toggle (Will, 2026-11-03, DESIGN.md D3): dark-first default; Dark / Light / System;
// System follows the OS with a dark fallback; the choice persists; storage failures are safe.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ThemeToggle } from "../src/components/theme-toggle";
import { DEFAULT_PREFERENCE, THEME_STORAGE_KEY, readPreference, resolveTheme } from "../src/lib/theme";

const media = (light: boolean) => (q: string) =>
  ({ matches: q === "(prefers-color-scheme: light)" ? light : false }) as MediaQueryList;

function stubMatchMedia(light: boolean) {
  window.matchMedia = vi.fn((q: string) => ({
    matches: q === "(prefers-color-scheme: light)" ? light : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  stubMatchMedia(true); // an OS that prefers light, so "dark" must come from the default
});
afterEach(() => cleanup());

describe("theme rules", () => {
  it("defaults to dark (dark-first)", () => {
    expect(DEFAULT_PREFERENCE).toBe("dark");
    expect(readPreference(localStorage)).toBe("dark");
  });

  it("System follows the OS, and falls back to dark", () => {
    expect(resolveTheme("system", media(true))).toBe("light");
    expect(resolveTheme("system", media(false))).toBe("dark");
    const saved = window.matchMedia;
    delete (window as unknown as { matchMedia?: unknown }).matchMedia; // a browser with no matchMedia
    expect(resolveTheme("system")).toBe("dark");
    window.matchMedia = saved;
    expect(resolveTheme("system", () => { throw new Error("no matchMedia"); })).toBe("dark");
  });

  it("explicit choices ignore the OS", () => {
    expect(resolveTheme("dark", media(true))).toBe("dark");
    expect(resolveTheme("light", media(false))).toBe("light");
  });

  it("an unreadable or junk stored value falls back to dark", () => {
    expect(readPreference({ getItem: () => { throw new Error("blocked"); } })).toBe("dark");
    expect(readPreference({ getItem: () => "purple" })).toBe("dark");
  });
});

describe("ThemeToggle", () => {
  it("starts on Dark even when the OS prefers light, and applies it", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("Light applies light and persists the choice", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Light" }).getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("System resolves from the OS", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("restores a saved choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Light" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("is one labelled group of three buttons", () => {
    render(<ThemeToggle />);
    const group = screen.getByRole("group", { name: "Color theme" });
    expect(group.querySelectorAll("button").length).toBe(3);
  });
});
