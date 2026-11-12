import { Label } from "@/components/ui/label";
import { PACKAGE_TYPES, packageTypeFrom } from "@/lib/guias/package-types";

/** The Package drop list of a pickup request and of a guía: Pallet, Box, Pieces or Crates. */
export function PackageSelect({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="packageType">Package</Label>
      <select id="packageType" name="packageType" defaultValue={packageTypeFrom(defaultValue)} className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
        <option value="">—</option>
        {PACKAGE_TYPES.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}
