export interface FleetMapDriver {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
  /** No point for 3+ minutes — drawn grey with a dashed red ring. */
  stale: boolean;
  detail?: string;
}

export interface FleetMapRoute {
  id: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  color: string;
  label?: string;
}

export interface FleetMapProps {
  drivers: FleetMapDriver[];
  routes?: FleetMapRoute[];
  height?: number;
  onPressDriver?: (id: string) => void;
}

/** MIA cargo area — used when nothing is on the map yet. */
export const DEFAULT_CENTER = { lat: 25.807, lng: -80.3 };
