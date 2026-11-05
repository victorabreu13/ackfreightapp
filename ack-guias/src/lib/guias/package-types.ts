/** The packaging a pickup request and its guía can name. It prints in the Package column of the pickup order. */
export const PACKAGE_TYPES = ["Pallet", "Box", "Pieces", "Crates"] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

/** The list entry that matches the text, whatever its case, or an empty string. */
export function packageTypeFrom(value: unknown): PackageType | "" {
  const wanted = String(value ?? "").trim().toLowerCase();
  return PACKAGE_TYPES.find((item) => item.toLowerCase() === wanted) ?? "";
}
