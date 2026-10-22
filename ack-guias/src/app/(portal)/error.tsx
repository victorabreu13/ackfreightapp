"use client";

export default function PortalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="font-display text-3xl">ACK Freight App could not load this page</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
        Try again
      </button>
    </div>
  );
}
