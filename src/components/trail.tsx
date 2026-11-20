import { Button } from "@/components/ui/button";

const SECTION = '[aria-label="Evidence trail"]';

// Lazy (HL-021b B4), which keeps the entry chunk small. Opens the Evidence trail section, then moves focus to it.
// The section is itself lazy, so wait for it to mount (about 2 s at most) before focusing.
export default function TrailLink({ open }: { open: (show: boolean) => void }) {
  const focusWhenMounted = (frames: number) => {
    const el = document.querySelector<HTMLElement>(SECTION);
    if (el) el.focus();
    else if (frames > 0) requestAnimationFrame(() => focusWhenMounted(frames - 1));
  };
  return (
    <Button
      variant="secondary"
      size="sm"
      className="mb-3 border"
      onClick={() => {
        open(true);
        focusWhenMounted(120);
      }}
    >
      Open the evidence trail for these runs
    </Button>
  );
}
