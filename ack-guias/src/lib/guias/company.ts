import { applyKopeOverrides, type CompanyView } from "@/lib/guias/company-profile";
import { prisma } from "@/lib/db";

export async function loadCompany(agentKey: string): Promise<CompanyView> {
  const agent = await prisma.issuingAgent.findUnique({
    where: { key: agentKey },
    include: { profile: true },
  });
  if (!agent) throw new Error("Unknown issuing company");
  const profile = agent.profile;
  const view: CompanyView = {
    agentKey,
    brandName: profile?.brandName || agent.legalName,
    letterheadName: profile?.letterheadName || agent.legalName,
    address: profile?.address || agent.address,
    phone: profile?.phone || agent.phone || "",
    fax: profile?.fax || "",
    opsEmail: profile?.opsEmail || "",
    contactName: profile?.contactName || "",
    contactTitle: profile?.contactTitle || "",
    termsUrl: profile?.termsUrl || "",
    tsaIacId: profile?.tsaIacId || "",
    ccsfId: profile?.ccsfId || "",
    warehouseName: profile?.warehouseName || "",
    warehouseAddress: profile?.warehouseAddress || "",
    signerName: profile?.signerName || "",
    signerTitle: profile?.signerTitle || "",
    logo: profile?.logo ? Buffer.from(profile.logo) : null,
    logoMime: profile?.logoMime ?? null,
  };
  return applyKopeOverrides(view);
}
