import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, FleetMapProps } from "./fleetMapTypes";

// Web fleet map: Leaflet + OpenStreetMap tiles. The existing LiveMap.web
// uses a keyless Google embed iframe, which can only show one pin, so it
// can't draw a whole fleet. OSM tiles need no key; for heavy production use
// switch the tile URL to a provider with an SLA (MapTiler, Stadia, Mapbox)
// or to the Google Maps JS API with a restricted key.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export default function FleetMap({ drivers, routes = [], height = 420, onPressDriver }: FleetMapProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 12);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const r of routes) {
      L.polyline(
        [
          [r.from.lat, r.from.lng],
          [r.to.lat, r.to.lng],
        ],
        { color: r.color, weight: 4, opacity: 0.55, dashArray: "6 6" }
      )
        .bindTooltip(escapeHtml(r.label ?? ""), { sticky: true })
        .addTo(g);
      L.circleMarker([r.to.lat, r.to.lng], { radius: 5, color: "#fff", weight: 2, fillColor: r.color, fillOpacity: 1 }).addTo(g);
      pts.push([r.from.lat, r.from.lng], [r.to.lat, r.to.lng]);
    }
    for (const d of drivers) {
      const bg = d.stale ? "#64748b" : d.color;
      const ring = d.stale ? "outline:2px dashed #dc2626;" : "";
      const html = `<div style="display:flex;align-items:center;gap:4px;background:${bg};color:#fff;border:2px solid #fff;${ring}border-radius:14px;padding:2px 8px 2px 6px;font:800 11px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.35);white-space:nowrap;width:max-content">🚚 ${escapeHtml(d.label)}</div>`;
      const marker = L.marker([d.lat, d.lng], {
        icon: L.divIcon({ className: "", html, iconSize: undefined, iconAnchor: [16, 12] }),
        title: d.label,
      });
      if (d.detail) marker.bindTooltip(escapeHtml(d.detail), { direction: "top", offset: [0, -12] });
      if (onPressDriver) marker.on("click", () => onPressDriver(d.id));
      marker.addTo(g);
      pts.push([d.lat, d.lng]);
    }
    // Fit once when data first arrives; afterwards keep the user's pan/zoom.
    if (!fitted.current && pts.length > 0) {
      m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 14 });
      fitted.current = true;
    }
  }, [drivers, routes, onPressDriver]);

  return React.createElement("div", {
    ref: el,
    style: { width: "100%", height, borderRadius: 12, overflow: "hidden", border: "1px solid #e3e7ef", zIndex: 0 },
  });
}
