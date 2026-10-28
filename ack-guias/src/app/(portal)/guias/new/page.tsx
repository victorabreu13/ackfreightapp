import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { GuiaForm } from "@/components/guia-form";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCarrierOptions } from "@/lib/guias/carriers";
import type { GuiaValues } from "@/lib/guias/extract";

const blank: GuiaValues = {
  client: "",
  shipper: "",
  shipperAddress: "",
  consignee: "",
  consigneeAddress: "",
  notify: "",
  notifyAddress: "",
  origin: "",
  destination: "",
  flightNumber: "",
  flightDate: "",
  pieces: "",
  chargeableKg: "",
  rate: "",
  grossKg: "",
  goods: "",
  handling: "",
  aesItn: "",
  hawb: "",
  dg: "",
  unNumbers: "",
  bup: "",
  bupItems: "",
  lithiumPi: "",
  issuingCompany: "ack",
};

export default async function NewGuiaPage() {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20create%20a%20gu%C3%ADa");
  const prefixes = await prisma.airlinePrefix.findMany({ orderBy: { prefix: "asc" }, take: 200 });
  const stock = await prisma.awbStockNumber.groupBy({
    by: ["prefix"],
    where: { status: "available", agentKey: "ack" },
    _count: true,
  });
  const carrierOptions = await loadCarrierOptions();
  const awbOptions = prefixes.map((row) => ({ prefix: row.prefix, airline: row.airline, left: stock.find((item) => item.prefix === row.prefix)?._count ?? 0 }));
  return (
    <div className="space-y-4">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Nueva guía</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Chargeable kg is the weight that bills. Gross is optional. Every guía is issued by ACK TEAM LLC.
        </p>
      </div>
      <GuiaForm mode="new" values={blank} review={[]} snippets={{}} awbOptions={awbOptions} carrierOptions={carrierOptions} />
    </div>
  );
}
