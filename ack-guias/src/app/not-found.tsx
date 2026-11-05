import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">ACK Freight App</p>
      <h1 className="mt-2 font-display text-4xl">That page is not in ACK Freight App</h1>
      <Link href="/guias" className="mt-4 text-sm text-teal underline">
        Back to guías
      </Link>
    </main>
  );
}
