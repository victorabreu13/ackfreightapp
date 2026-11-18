import { prisma } from "@/lib/db";

/** The full names of the providers of the accounting, which the Trucker fields suggest. */
export async function truckerNames(): Promise<string[]> {
  try {
    return (await prisma.acctProvider.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } })).map((row) => row.name);
  } catch (error) {
    // A database that has not been updated yet has no providers: the fields work without suggestions.
    console.error("trucker names", error);
    return [];
  }
}
