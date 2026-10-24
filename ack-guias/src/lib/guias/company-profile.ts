export const NOT_SET = "NOT SET";

/** ACK TEAM LLC TSA Indirect Air Carrier approval, valid Sep 29 2025 through Sep 29 2028. */
export const ACK_TSA_IAC = "SE2508006";

/** ACK office on that approval. The IATA agent code stays SE1701005. */
export const ACK_OFFICE_ADDRESS = "6550 NW 97TH AVE, SUITE 220, DORAL, FL 33178, UNITED STATES";

/** Printed TSA/IAC id. A blank ACK profile uses the ACK approval, never Kope's number. */
export function tsaIacFor(company: { agentKey: string; tsaIacId: string | null | undefined }): string {
  const set = company.tsaIacId?.trim() ?? "";
  if (set) return set;
  return company.agentKey === "ack" ? ACK_TSA_IAC : "SE1701005";
}

export type CompanyView = {
  agentKey: string;
  brandName: string;
  letterheadName: string;
  address: string;
  phone: string;
  fax: string;
  opsEmail: string;
  contactName: string;
  contactTitle: string;
  termsUrl: string;
  tsaIacId: string;
  ccsfId: string;
  warehouseName: string;
  warehouseAddress: string;
  signerName: string;
  signerTitle: string;
  logo: Buffer | null;
  logoMime: string | null;
};

const KOPE_ENV: Array<[keyof CompanyView, string]> = [
  ["letterheadName", "KOPE_COMPANY_NAME"],
  ["brandName", "KOPE_COMPANY_NAME"],
  ["address", "KOPE_COMPANY_ADDRESS"],
  ["phone", "KOPE_COMPANY_PHONE"],
  ["opsEmail", "KOPE_OPS_EMAIL"],
  ["tsaIacId", "KOPE_TSA_IAC"],
  ["ccsfId", "KOPE_CCSF"],
  ["warehouseAddress", "KOPE_WAREHOUSE"],
  ["signerName", "KOPE_SIGNER"],
];

export function shown(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : NOT_SET;
}

/** Letters omit these when blank and the screens name them. The PDF never prints NOT SET. */
const PROFILE_GAPS: Array<{ field: keyof CompanyView; message: string }> = [
  { field: "tsaIacId", message: "TSA IAC id missing" },
  { field: "ccsfId", message: "CCSF id missing" },
  { field: "warehouseName", message: "Warehouse name missing" },
  { field: "warehouseAddress", message: "Warehouse address missing" },
  { field: "signerName", message: "Signer name missing" },
];

export function profileGap(field: string, profile: CompanyView): string | null {
  const required = PROFILE_GAPS.find((item) => item.field === field);
  if (!required) return null;
  const value = profile[required.field];
  return typeof value === "string" && value.trim() ? null : required.message;
}

export function missingProfileMessages(profile: CompanyView): string[] {
  return PROFILE_GAPS.map((item) => profileGap(item.field, profile)).filter((message): message is string => Boolean(message));
}

/** KOPE_* overrides apply only to the Kope profile. ACK never reads them. */
export function applyKopeOverrides(profile: CompanyView, env: Record<string, string | undefined> = process.env): CompanyView {
  if (profile.agentKey !== "kope") return profile;
  const next = { ...profile };
  for (const [field, name] of KOPE_ENV) {
    const value = env[name]?.trim();
    if (!value) continue;
    if (field === "logo" || field === "logoMime") continue;
    next[field] = value;
  }
  return next;
}
