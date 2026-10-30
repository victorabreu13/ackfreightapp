import { prisma } from "@/lib/db";
import { blank, documentData, lineData } from "@/lib/guias/guia-data";
import { ensureGuiaClient } from "@/lib/guias/guia-client";
import type { GuiaValues } from "@/lib/guias/extract";
import { rememberGuiaParties } from "@/lib/guias/parties";

export const EMPTY_GUIA_VALUES: GuiaValues = {
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

/**
 * A draft guía for ACK TEAM LLC made from the values of a pickup request or a receipt. It has no AWB number yet, the
 * way a guía saved from the new guía form does not.
 */
export async function createDraftGuia(
  values: GuiaValues,
  extra: { createdBy: string; truckerName?: string; truckerPhone?: string; driverName?: string },
): Promise<{ id: string }> {
  const billTo = await ensureGuiaClient("ack", values.client);
  const created = await prisma.airWaybillDocument.create({
    data: {
      ...documentData(values, [], {}, billTo?.id ?? null),
      product: "guia",
      status: "draft",
      awb: "",
      prefix: "",
      serial: "",
      agentKey: "ack",
      createdBy: extra.createdBy,
      truckerName: blank(extra.truckerName ?? ""),
      truckerPhone: blank(extra.truckerPhone ?? ""),
      driverName: blank(extra.driverName ?? ""),
      lines: { create: [lineData(values)] },
    },
  });
  try {
    await rememberGuiaParties("ack", billTo?.id ?? null, values);
  } catch (error) {
    console.error("guía directory", error);
  }
  return { id: created.id };
}
