import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "src/lib/awb/conditions");

function load(name: string): string {
  return readFileSync(join(dir, name), "utf8").replace(/\s+$/, "");
}

export const KOPE_ATLAS_EN = load("kope_atlas_en.txt");
export const ACK_LATAM_EN = load("ack_latam_en.txt");
export const ACK_LATAM_ES = load("ack_latam_es.txt");

export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export const AWB_COPY_LABELS = [
  "Original 1 (for Issuing Carrier) - Green",
  "Original 2 (for Consignee) - Pink",
  "Original 3 (for Shipper) - Blue",
] as const;

export function copyLabelFor(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed === "1" || trimmed === "2" || trimmed === "3") return AWB_COPY_LABELS[Number(trimmed) - 1];
  return trimmed;
}

export const KOPE_FACE_AGREEMENT =
  "It is agreed that the goods described herein are accepted in apparent good order and condition (except as noted) for carriage SUBJECT TO THE CONDITIONS OF CONTRACT ON THE REVERSE HEREOF, ALL GOODS MAY BE CARRIED BY ANY OTHER MEANS INCLUDING ROAD OR ANY OTHER CARRIER UNLESS SPECIFIC CONTRARY INSTRUCTIONS ARE GIVEN HEREON BY THE SHIPMENT, AND SHIPPER AGREES THAT THE SHIPMENT MAY BE CARRIED VIA INTERMEDIATE STOPPING PLACES WICH THE CARRIER DEEMS APPROPRIATE THE SHIPPER'S ATTENTION IS DRAWN TO THE NOTICE CONCERNING CARRIER'S LIMITATION OF LIABILITY. Shipper may increase such limitation of liability by declaring a higher value for carriage and paying a supplemental charge if required.";

export const ACK_FACE_AGREEMENT =
  "It is agreed that the goods described herein are accepted in apparent good order and condition(except as noted) for carriage SUBJECT TO THE CONDITIONS OF THE CONTRACT ON THE REVERSE HEREOF. ALL GOODS MAY BE CARRIED BY ANY OTHER MEANS INCLUDING ROAD OR ANY OTHER CARRIER UNLESS SPECIFIC CONTRARY INSTRUCTIONS ARE GIVEN HEREON BY THE SHIPPER, AND SHIPPER AGREES THAT THE SHIPMENT MAY BE CARRIED VIA INTERMEDIATE STOPPING PLACES WHICH THE CARRIER DEEMS APPROPIATE. THE SHIPPER'S ATTENTION IS DRAWN TO THE NOTICE CONCERNING CARRIER'S LIMITATION OF LIABILITY. Shipper may increase such limitation of liability by declaring a higher value for carriage and paying a supplemental charge if required.";

export const KOPE_COPIES = "Copies 1, 2 and 3 of this Air Waybill are originals and have the same validity";
export const ACK_COPIES = "Copies 1, 2 and 3 of this Air Waybill are originals and have the same validity.";

export const KOPE_INSURANCE =
  'INSURANCE - If carrier offers insurance, and such insurance is requested in accordance with the consitions thereof, indicate amount to be insured in figures in box marked "Amount of Insurance".';

export const ACK_INSURANCE =
  'INSURANCE - If carrier offers insurance, and such insurance is requested in accordance with the conditions thereof, indicate amount to be insured in figures in box marked "Amount of Insurance".';

export const KOPE_EXPORT =
  "These commodities technology or software were exported from the United States in accordance with the Export Administration Regulation. Diversion contrary to U.S. law is prohibited.";

export const ACK_EXPORT =
  "These commodities, technology or software were exported from the United States in accordance with the Export Administration Regulations. Ultimate destination";

export const KOPE_DIVERSION = "Diversion contrary to US law prohibited";
export const ACK_DIVERSION = "Diversion contrary to U.S. law prohibited.";

export const KOPE_CERT =
  "Shipper certifies that the particulars on the face hereof are correct and that insofar as any part of the consignment contains dangerous goods, such part is property described by name and is in proper condition for carriage by air according to the applicable Dangerous Goods Regulations.";

export const ACK_CERT_LEAD = "Shipper certifies that the particulars on the face hereof are correct and that ";
export const ACK_CERT_BOLD =
  "insofar as any part of the consignment contains dangerous goods, such part is properly described by name and is in proper condition for carriage by air according to the applicable Dangerous Goods Regulations.";
