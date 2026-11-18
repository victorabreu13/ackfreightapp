import { brandTitle } from "@/lib/guias/brand";
import { resolveRequestBrand } from "@/lib/guias/request-brand";

export async function GuiaEyebrow() {
  const brand = await resolveRequestBrand();
  return <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{brandTitle(brand)}</p>;
}
