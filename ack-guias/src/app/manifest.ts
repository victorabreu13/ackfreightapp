import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ACK Freight App",
    short_name: "ACK Freight",
    description: "Air waybills for ACK TEAM LLC.",
    start_url: "/guias",
    display: "standalone",
    background_color: "#3f2a12",
    theme_color: "#3f2a12",
    icons: [{ src: "/brand-icon", sizes: "any", type: "image/png" }],
  };
}
