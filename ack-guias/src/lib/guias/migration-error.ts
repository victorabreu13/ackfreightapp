const PENDING_CODES = new Set(["P2021", "P2022"]);

/** Missing table (P2021) or missing column (P2022), including errors wrapped in cause. */
export function isPendingMigration(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof record.code === "string" && PENDING_CODES.has(record.code)) return true;
    if (typeof record.message === "string" && /P2021|P2022/.test(record.message)) return true;
    current = record.cause;
  }
  return false;
}

export const MIGRATION_PENDING_MESSAGE = "Database migration pending, run migrate";

export function logMigrationError(page: string, error: unknown) {
  console.error(`Guías ${page}: ${MIGRATION_PENDING_MESSAGE}`, error);
}
