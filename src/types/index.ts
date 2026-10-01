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

export type DriverPayType = "perTrip" | "perKilogram";

export const AWB_PRIORITIES = ["Low", "Normal", "High"] as const;
export type AwbPriority = (typeof AWB_PRIORITIES)[number];

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: number;
  pushToken?: string;
  payType?: DriverPayType; // driver payroll basis, admin-configured
  payRate?: number; // dollars per trip, or dollars per kilogram, depending on payType
  billType?: DriverPayType; // customer billing basis, admin-configured (same shape as driver pay)
  billRate?: number; // dollars per trip, or dollars per kilogram, depending on billType
  quickbooksCustomerId?: string; // set by the server once this customer exists in QuickBooks
  active?: boolean; // undefined/true = active; admin-set false also disables their Auth login
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
  kilograms: number; // total weight moved on this trip, used for per-kg payroll
  notes: string;
  proofFiles: ProofFile[];
  paid: boolean; // driver payroll status for this trip, admin-toggled
  invoiced?: boolean; // admin-toggled directly; also true whenever the trip's
  // originating trip request (if any) has been invoiced
  createdAt: number;
}

export type NewTripInput = Omit<Trip, "id" | "createdAt" | "paid">;

export interface DeletedTrip {
  id: string;
  trip: Trip;
  tripId: string;
  deletedBy: { uid: string; name: string; email: string; role: string };
  deletedAt: number;
  restoredAt?: number;
  restoredBy?: string;
}

export const TRIP_REQUEST_STATUSES = [
  "submitted",
  "assigned",
  "in_progress",
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
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  status: TripRequestStatus; // this line only ever moves through submitted/assigned/in_progress/completed
  tripLogId?: string; // set once this line is completed, links to the driver's Trip Log entry
  startedAt?: number; // stamped when this line flips to in_progress, powers the Drivers Available screen
  priority: AwbPriority;
}

export interface DriverLocation {
  lat: number;
  lng: number;
  updatedAt: number;
}

export interface TripRequest {
  id: string;
  customerId: string;
  customerName: string; // denormalized, fixed at submit
  customerEmail: string;
  submittedAt: number; // fixed
  tripDate: string; // YYYY-MM-DD, editable
  from: string;
  pickupTime: string; // HH:mm, editable
  to: string;
  personRequesting: string;
  notes?: string; // optional free-text note from the customer to admins/drivers
  awbLines: AwbLine[]; // 1..10 entries
  importFeeFiles: RequestFile[]; // shared across AWBs
  assignedDriverIds: string[];
  assignedDriverNames: string[];
  status: TripRequestStatus;
  tripLogId?: string; // set once completed, links to the created Trip
  quickbooksInvoiceId?: string; // set once invoiced via QuickBooks
  invoicedAt?: number;
  // Live location per driver, while they have at least one AWB line on this
  // request in progress. Keyed by driver uid — a request can have more than
  // one driver active on different AWB lines at once. Only ever holds each
  // driver's current position, no history.
  driverLocations?: Record<string, DriverLocation>;
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
    assignedDriverId: null,
    assignedDriverName: null,
    status: "submitted",
    priority: "Normal",
  };
}

// The trip's overall status and assignedDriverIds/Names are derived from its
// AWB lines, which are the real source of truth now that each line can go to
// a different driver — call this any time awbLines changes and write the
// result alongside it.
export function computeTripRequestRollup(awbLines: AwbLine[]): {
  status: TripRequestStatus;
  assignedDriverIds: string[];
  assignedDriverNames: string[];
} {
  const assignedDriverIds = [
    ...new Set(awbLines.map((l) => l.assignedDriverId).filter((id): id is string => !!id)),
  ];
  const assignedDriverNames = [
    ...new Set(
      awbLines.map((l) => l.assignedDriverName).filter((name): name is string => !!name)
    ),
  ];

  let status: TripRequestStatus = "submitted";
  if (awbLines.length > 0 && awbLines.every((l) => l.status === "completed")) {
    status = "completed";
  } else if (awbLines.some((l) => l.status === "in_progress" || l.status === "completed")) {
    status = "in_progress";
  } else if (awbLines.some((l) => l.status === "assigned")) {
    status = "assigned";
  }

  return { status, assignedDriverIds, assignedDriverNames };
}
