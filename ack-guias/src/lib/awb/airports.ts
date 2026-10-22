const COUNTRY: Record<string, string> = {
  BOG: "COLOMBIA",
  MDE: "COLOMBIA",
  CLO: "COLOMBIA",
  BAQ: "COLOMBIA",
  LIM: "PERU",
  UIO: "ECUADOR",
  GYE: "ECUADOR",
  EZE: "ARGENTINA",
  GUA: "GUATEMALA",
  SJO: "COSTA RICA",
  MIA: "UNITED STATES",
  LAX: "UNITED STATES",
  JFK: "UNITED STATES",
  SCL: "CHILE",
  PTY: "PANAMA",
  SAP: "HONDURAS",
  SAL: "EL SALVADOR",
  SDQ: "DOMINICAN REPUBLIC",
  PUJ: "DOMINICAN REPUBLIC",
  GRU: "BRAZIL",
  GIG: "BRAZIL",
};

const CITY: Record<string, string> = {
  BOG: "Bogota",
  MDE: "Medellin",
  CLO: "Cali",
  LIM: "Lima",
  UIO: "Quito",
  GYE: "Guayaquil",
  GUA: "Guatemala City",
  MIA: "Miami",
  LAX: "Los Angeles",
  JFK: "New York",
  PTY: "Panama City",
};

const CODE_BY_CITY: Record<string, string> = Object.fromEntries(
  Object.entries(CITY).map(([code, city]) => [city.toUpperCase(), code]),
);

export function cityForAirport(code: string | null | undefined): string {
  if (!code) return "";
  const clean = code.trim().toUpperCase();
  return CITY[clean] ?? clean;
}

export function codeForPlace(value: string | null | undefined): string {
  if (!value) return "";
  const clean = value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(clean)) return clean;
  return CODE_BY_CITY[clean] ?? clean;
}

export function countryForAirport(code: string | null | undefined): string {
  if (!code) return "";
  return COUNTRY[code.trim().toUpperCase()] ?? "";
}

export function carrierBlock(prefix: string, airline: string | null): { name: string; address: string } {
  if (prefix === "369") {
    return {
      name: "ATLAS AIR",
      address: "Worldwide Flight Services (WFS) 4350 NW 36TH ST POD C, MIAMI, FL 33166, UNITED STATES\nPhone: (305) 777-7295",
    };
  }
  if (prefix === "045") {
    return { name: "LATAM AIRLINES GROUP", address: "1801 NW 66 AVENUE\nMIAMI , FLORIDA 33122 UNITED STATES" };
  }
  return { name: (airline ?? "ISSUING CARRIER").toUpperCase(), address: "" };
}
