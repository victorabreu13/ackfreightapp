import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: { bodySizeLimit: "32mb" },
    proxyClientMaxBodySize: "32mb",
  },
  serverExternalPackages: ["exceljs", "@prisma/client", "pdfkit", "bwip-js", "bwip-js/node", "google-auth-library"],
};

export default nextConfig;
