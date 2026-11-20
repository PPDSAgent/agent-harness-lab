import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyTheme,
  readPreference,
  resolveTheme,
  writePreference,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

/** Three-way theme switch. Dark is the default; System tracks the OS live. */
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => readPreference());

  useEffect(() => {
    applyTheme(resolveTheme(preference));
    if (preference !== "system" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme(resolveTheme("system"));
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, [preference]);

  return (
    <div role="group" aria-label="Color theme" className="inline-flex gap-1 rounded-md border p-0.5">
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={preference === option.value ? "secondary" : "ghost"}
          aria-pressed={preference === option.value}
          className="h-7 px-2.5 text-xs focus-visible:ring-ring"
          onClick={() => {
            // Only an explicit choice is saved, so a later change of default reaches
            // visitors who never picked one.
            writePreference(option.value);
            setPreference(option.value);
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
