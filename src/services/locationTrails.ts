import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase/config";

export interface TrailPoint {
  lat: number;
  lng: number;
  t: number;
}

export interface TripTrail {
  driverId: string;
  driverName: string;
  points: TrailPoint[];
}

// Admin-only (Firestore rules): the saved route of each driver on a trip request,
// oldest point first. Written by the server while the driver is on the road.
export async function getTripTrails(requestId: string): Promise<TripTrail[]> {
  const snap = await getDocs(query(collection(db, "locationTrails"), where("requestId", "==", requestId)));
  return snap.docs.map((d) => {
    const data = d.data() as { driverId?: string; driverName?: string; points?: TrailPoint[] };
    const points = [...(data.points ?? [])].sort((a, b) => a.t - b.t);
    return { driverId: data.driverId ?? "", driverName: data.driverName ?? "Driver", points };
  });
}
