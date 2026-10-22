import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { GuiaForm } from "@/components/guia-form";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
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
  issuingCompany: "ack",
};

export default async function NewGuiaPage() {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20create%20a%20gu%C3%ADa");
  return (
    <div className="space-y-4">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Nueva guía</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Chargeable kg is the weight that bills. Gross is optional. Every guía is issued by ACK TEAM LLC.
        </p>
      </div>
      <GuiaForm mode="new" values={blank} review={[]} snippets={{}} />
    </div>
  );
}
