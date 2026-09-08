export type UserRole = "admin" | "driver";

export const ULD_TYPES = [
  "Loose",
  "PMC",
  "FQA",
  "PAG",
  "DQF",
  "ALF",
  "AKE",
] as const;

export type UldType = (typeof ULD_TYPES)[number];

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: number;
}

export interface ProofFile {
  url: string;
  name: string;
  kind: "image" | "document";
}

export interface Trip {
  id: string;
  driverId: string;
  driverName: string;
  driverEmail: string;
  date: string; // YYYY-MM-DD
  timeStart: string; // HH:mm
  timeFinish: string; // HH:mm
  from: string;
  to: string;
  qty: number;
  unitTypes: UldType[]; // one entry per unit, length === qty
  awbNumber: string;
  notes: string;
  proofFiles: ProofFile[];
  createdAt: number;
}

export type NewTripInput = Omit<Trip, "id" | "createdAt">;
