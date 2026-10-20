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

/** A saved route: the points a driver was recorded at, in order. */
export interface FleetMapTrail {
  id: string;
  color: string;
  points: { lat: number; lng: number }[];
}

/** A fixed, labelled spot (where a trip was started, picked up or completed). */
export interface FleetMapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
  detail?: string;
}

export interface FleetMapProps {
  drivers: FleetMapDriver[];
  routes?: FleetMapRoute[];
  trails?: FleetMapTrail[];
  pins?: FleetMapPin[];
  height?: number;
  onPressDriver?: (id: string) => void;
}

/** MIA cargo area — used when nothing is on the map yet. */
export const DEFAULT_CENTER = { lat: 25.807, lng: -80.3 };
