export type UserRole = "admin" | "driver" | "customer";

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
  uldNumbers: string[]; // one entry per unit, length === qty
  awbNumber: string;
  notes: string;
  proofFiles: ProofFile[];
  createdAt: number;
}

export type NewTripInput = Omit<Trip, "id" | "createdAt">;

export const TRIP_REQUEST_STATUSES = [
  "submitted",
  "assigned",
  "completed",
  "invoiced",
  "cancelled",
] as const;

export type TripRequestStatus = (typeof TRIP_REQUEST_STATUSES)[number];

export interface RequestFile {
  url: string;
  name: string;
}

export interface AwbLine {
  awbNumber: string;
  qtyPieces: number;
  type: UldType;
  kilograms: number;
  awbFile: RequestFile | null;
  loaFile: RequestFile | null;
  doFile: RequestFile | null; // Delivery Order / Delivery Ticket
}

export interface TripRequest {
  id: string;
  customerId: string;
  customerName: string; // denormalized, fixed at submit
  customerEmail: string;
  submittedAt: number; // fixed
  tripDate: string; // YYYY-MM-DD, editable
  from: string;
  to: string;
  personRequesting: string;
  awbLines: AwbLine[]; // 1..10 entries
  importFeeFiles: RequestFile[]; // shared across AWBs
  assignedDriverIds: string[];
  assignedDriverNames: string[];
  status: TripRequestStatus;
  createdAt: number;
  updatedAt: number;
}

export type NewTripRequestInput = Omit<
  TripRequest,
  "id" | "createdAt" | "updatedAt"
>;

export function newAwbLine(): AwbLine {
  return {
    awbNumber: "",
    qtyPieces: 1,
    type: "Loose",
    kilograms: 0,
    awbFile: null,
    loaFile: null,
    doFile: null,
  };
}
