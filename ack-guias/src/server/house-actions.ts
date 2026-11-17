"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EMPTY_GUIA_VALUES } from "@/lib/guias/draft-guia";
import type { GuiaValues } from "@/lib/guias/extract";
import { ensureGuiaClient } from "@/lib/guias/guia-client";
import { documentData, lineData } from "@/lib/guias/guia-data";
import { isManualKey } from "@/lib/guias/guia-manual";
import { houseNumberTaken, keepMasterValueOverHouses, nextHouseNumber, syncMasterFromHouses } from "@/lib/guias/house-sync";
import { rememberGuiaParties } from "@/lib/guias/parties";
import { roundUpText } from "@/lib/guias/round-up";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

async function requireTeam() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20change%20the%20houses");
  return user;
}

function housesBack(message: string, kind: "notice" | "error" = "notice"): never {
  redirect(`/guias/houses?${kind}=${encodeURIComponent(message)}`);
}

/** The fields of a house form as the values of a guía. Pieces and weights go up to the next whole number. */
function valuesFromForm(formData: FormData): GuiaValues {
  return {
    ...EMPTY_GUIA_VALUES,
    client: text(formData.get("client")),
    shipper: text(formData.get("shipper")),
    shipperAddress: text(formData.get("shipperAddress")),
    consignee: text(formData.get("consignee")),
    consigneeAddress: text(formData.get("consigneeAddress")),
    notify: text(formData.get("notify")),
    notifyAddress: text(formData.get("notifyAddress")),
    origin: text(formData.get("origin")).toUpperCase(),
    destination: text(formData.get("destination")).toUpperCase(),
    pieces: roundUpText(text(formData.get("pieces"))),
    grossKg: roundUpText(text(formData.get("grossKg"))),
    chargeableKg: roundUpText(text(formData.get("chargeableKg"))),
    rate: text(formData.get("rate")),
    goods: text(formData.get("goods")),
    handling: text(formData.get("handling")),
    hawb: text(formData.get("hawb")).toUpperCase(),
  };
}

/** The master a house is linked to, when it exists and is a master guía. */
async function masterIdFrom(formData: FormData): Promise<string | null> {
  const id = text(formData.get("masterId"));
  if (!id) return null;
  const master = await prisma.airWaybillDocument.findFirst({ where: { id, product: "guia" }, select: { id: true } });
  return master?.id ?? null;
}

export async function saveNewHouse(formData: FormData) {
  const user = await requireTeam();
  const values = valuesFromForm(formData);
  const back = (message: string) => redirect(`/guias/houses/new?${text(formData.get("masterId")) ? `master=${text(formData.get("masterId"))}&` : ""}error=${encodeURIComponent(message)}`);
  if (!values.client) back("Type the client of the house.");
  // The number is handed out in order unless one was typed.
  let number = values.hawb;
  if (number) {
    if (await houseNumberTaken(number)) back(`The house number ${number} already exists.`);
  } else {
    number = await nextHouseNumber();
  }
  const masterId = await masterIdFrom(formData);
  const billTo = await ensureGuiaClient("ack", values.client);
  const created = await prisma.airWaybillDocument.create({
    data: {
      ...documentData({ ...values, hawb: number }, [], {}, billTo?.id ?? null),
      product: "house",
      status: "draft",
      awb: "",
      prefix: "",
      serial: "",
      agentKey: "ack",
      createdBy: user.email,
      masterId,
      lines: { create: [lineData(values)] },
    },
  });
  try {
    await rememberGuiaParties("ack", billTo?.id ?? null, values);
  } catch (error) {
    console.error("house directory", error);
  }
  if (masterId) {
    await syncMasterFromHouses(masterId, user.email);
    revalidatePath(`/guias/${masterId}`);
  }
  revalidatePath("/guias/houses");
  redirect(`/guias/houses/${created.id}?saved=1`);
}

export async function saveHouse(formData: FormData) {
  const user = await requireTeam();
  const id = text(formData.get("id"));
  const existing = await prisma.airWaybillDocument.findUnique({ where: { id }, select: { id: true, product: true, masterId: true, hawb: true } });
  if (!existing || existing.product !== "house") housesBack("House not found.", "error");
  const values = valuesFromForm(formData);
  const back = (message: string) => redirect(`/guias/houses/${id}?error=${encodeURIComponent(message)}`);
  if (!values.client) back("Type the client of the house.");
  const number = values.hawb || existing.hawb || (await nextHouseNumber());
  if (await houseNumberTaken(number, id)) back(`The house number ${number} already exists.`);
  const masterId = await masterIdFrom(formData);
  const billTo = await ensureGuiaClient("ack", values.client);
  await prisma.$transaction([
    prisma.awbGoodsLine.deleteMany({ where: { documentId: id } }),
    prisma.airWaybillDocument.update({
      where: { id },
      data: { ...documentData({ ...values, hawb: number }, [], {}, billTo?.id ?? null), masterId, lines: { create: [lineData(values)] } },
    }),
  ]);
  try {
    await rememberGuiaParties("ack", billTo?.id ?? null, values);
  } catch (error) {
    console.error("house directory", error);
  }
  // The master it left and the master it joined both add their houses up again.
  for (const master of new Set([existing.masterId, masterId])) {
    if (!master) continue;
    await syncMasterFromHouses(master, user.email);
    revalidatePath(`/guias/${master}`);
  }
  revalidatePath("/guias/houses");
  redirect(`/guias/houses/${id}?saved=1`);
}

export async function deleteHouse(formData: FormData) {
  const user = await requireTeam();
  const id = text(formData.get("id"));
  const house = await prisma.airWaybillDocument.findUnique({ where: { id }, select: { product: true, masterId: true, hawb: true } });
  if (!house || house.product !== "house") housesBack("House not found.", "error");
  await prisma.airWaybillDocument.delete({ where: { id } });
  if (house.masterId) {
    await syncMasterFromHouses(house.masterId, user.email);
    revalidatePath(`/guias/${house.masterId}`);
  }
  revalidatePath("/guias/houses");
  housesBack(`House ${house.hawb ?? ""} deleted.`);
}

/** Ties a house to a master from the master's page. */
export async function linkHouseToMaster(formData: FormData) {
  const user = await requireTeam();
  const masterId = text(formData.get("masterId"));
  const houseId = text(formData.get("houseId"));
  const back = `/guias/${masterId}`;
  const [master, house] = await Promise.all([
    prisma.airWaybillDocument.findFirst({ where: { id: masterId, product: "guia" }, select: { id: true } }),
    prisma.airWaybillDocument.findFirst({ where: { id: houseId, product: "house" }, select: { id: true, hawb: true, masterId: true } }),
  ]);
  if (!master || !house) redirect(`${back}?error=${encodeURIComponent("House or master not found.")}`);
  const previous = house.masterId;
  await prisma.airWaybillDocument.update({ where: { id: houseId }, data: { masterId } });
  await syncMasterFromHouses(masterId, user.email);
  if (previous && previous !== masterId) {
    await syncMasterFromHouses(previous, user.email);
    revalidatePath(`/guias/${previous}`);
  }
  revalidatePath(back);
  revalidatePath("/guias/houses");
  redirect(`${back}?houses=${encodeURIComponent(`House ${house.hawb ?? ""} linked.`)}`);
}

export async function unlinkHouse(formData: FormData) {
  const user = await requireTeam();
  const masterId = text(formData.get("masterId"));
  const houseId = text(formData.get("houseId"));
  const house = await prisma.airWaybillDocument.findFirst({ where: { id: houseId, product: "house", masterId }, select: { hawb: true } });
  await prisma.airWaybillDocument.updateMany({ where: { id: houseId, product: "house", masterId }, data: { masterId: null } });
  await syncMasterFromHouses(masterId, user.email);
  revalidatePath(`/guias/${masterId}`);
  revalidatePath("/guias/houses");
  redirect(`/guias/${masterId}?houses=${encodeURIComponent(`House ${house?.hawb ?? ""} released from the master.`)}`);
}

/** Clears the manual mark of one number, or of all, and takes the totals of the houses again. */
export async function resetMasterFromHouses(formData: FormData) {
  const user = await requireTeam();
  const masterId = text(formData.get("masterId"));
  const field = text(formData.get("field"));
  const keys = field === "all" ? "all" : isManualKey(field) ? [field] : null;
  if (!keys) redirect(`/guias/${masterId}?error=${encodeURIComponent("That field does not follow the houses.")}`);
  const result = await syncMasterFromHouses(masterId, user.email, { source: "reset", reset: keys });
  revalidatePath(`/guias/${masterId}`);
  redirect(`/guias/${masterId}?houses=${encodeURIComponent(result.skipped ? "The guía is already issued: it is not changed." : "The totals of the houses were taken again.")}`);
}

/** Keeps the master's own number over the sum of its houses. */
export async function keepMasterValue(formData: FormData) {
  await requireTeam();
  const masterId = text(formData.get("masterId"));
  const field = text(formData.get("field"));
  const housesValue = text(formData.get("housesValue"));
  if (isManualKey(field) && housesValue) await keepMasterValueOverHouses(masterId, field, housesValue);
  revalidatePath(`/guias/${masterId}`);
  redirect(`/guias/${masterId}?houses=${encodeURIComponent("The master value is kept.")}`);
}

