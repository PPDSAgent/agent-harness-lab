import { Button } from "@/components/ui/button";

/** Designed loading and error states for the run data (DESIGN.md: states are designed, not blank). */
export function DataState({ status, retry }: { status: "loading" | "error"; retry: () => void }) {
  if (status === "loading") {
    return (
      <p role="status" className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  return (
    <div role="alert" className="rounded-md border border-destructive px-4 py-3 text-sm">
      <p className="text-base font-semibold text-destructive">Run data couldn't load.</p>
      <p className="mt-1 text-muted-foreground">The data file did not download. Check the connection, then try again.</p>
      <Button variant="secondary" size="sm" className="mt-3 focus-visible:ring-ring" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
