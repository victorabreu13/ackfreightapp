import { MIGRATION_PENDING_MESSAGE } from "@/lib/guias/migration-error";

export function MigrationPending() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-8">
      <h1 className="font-display text-3xl">{MIGRATION_PENDING_MESSAGE}</h1>
    </div>
  );
}
