import type { CompanyView } from "@/lib/guias/company-profile";
import { renderCorteAwb } from "@/lib/guias/corte";
import type { GuiaPrintOptions, GuiaRecord } from "@/lib/guias/files";
import { splitHouseNumber } from "@/lib/guias/house";

const blank = (value: string | null | undefined) => (value ?? "").trim();

/**
 * The house air waybill: the same air waybill as a master, with the HAWB number where the airline number goes, ACK in
 * Issued By, and the master it travels under at the bottom right. What the house leaves empty (the flight, the
 * airports, the airline) is taken from its master.
 */
export async function renderHouseAwb(house: GuiaRecord, master: GuiaRecord | null, company: CompanyView, options: GuiaPrintOptions): Promise<Buffer> {
  const number = blank(house.hawb);
  const { prefix, serial } = splitHouseNumber(number);
  const derived: GuiaRecord = {
    ...house,
    awb: number,
    prefix,
    serial,
    carrierName: house.carrierName ?? master?.carrierName ?? null,
    carrierAddress: house.carrierAddress ?? master?.carrierAddress ?? null,
    flightNumber: blank(house.flightNumber) || blank(master?.flightNumber) || null,
    flightDate: blank(house.flightDate) || blank(master?.flightDate) || null,
    departure: blank(house.departure) || blank(master?.departure) || null,
    destination: blank(house.destination) || blank(master?.destination) || null,
    destCountry: house.destCountry ?? master?.destCountry ?? null,
  };
  // The master it travels under prints at the bottom right, where the air waybill number of a master prints.
  return renderCorteAwb(derived, company, { ...options, house: { master: blank(master?.awb) } });
}
