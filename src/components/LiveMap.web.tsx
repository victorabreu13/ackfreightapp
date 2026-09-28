import React from "react";

interface Props {
  lat: number;
  lng: number;
  label?: string;
}

// Web implementation — no API key needed, unlike an official Google Maps
// JS API embed. Metro picks this file automatically over LiveMap.tsx when
// bundling for web, so react-native-maps (native-only) is never touched.
export default function LiveMap({ lat, lng, label }: Props) {
  return React.createElement("iframe", {
    src: `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`,
    title: label ?? "Live location",
    loading: "lazy",
    style: {
      width: "100%",
      height: 220,
      border: 0,
      borderRadius: 12,
    },
  });
}
