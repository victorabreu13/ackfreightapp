import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { HttpsCallable, httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase/config";
import {
  AwbLine,
  computeTripRequestRollup,
  NewTripRequestInput,
  TripRequest,
  TripRequestStatus,
} from "../types";

// Force a fresh ID token before calling, and retry once on "unauthenticated":
// on native the cached token can lag behind sign-in state, which makes a
// callable function see no auth even though the user is logged in. Mirrors
// the same helper in services/trips.ts.
async function callWithFreshToken<Req, Res>(
  fn: HttpsCallable<Req, Res>,
  data: Req
): Promise<Res> {
  if (auth.currentUser) {
    await auth.currentUser.getIdToken(true);
  }
  try {
    const result = await fn(data);
    return result.data;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "functions/unauthenticated" && auth.currentUser) {
      await auth.currentUser.getIdToken(true);
      const retry = await fn(data);
      return retry.data;
    }
    throw err;
  }
}

const tripRequestsCollection = collection(db, "tripRequests");

// A trip request's id is needed as part of the storage path for its
// documents before the Firestore doc itself exists, so callers generate the
// id first (this just allocates one client-side, no write happens), upload
// files to tripRequestDocs/{customerId}/{id}/..., then call createTripRequest.
export function newTripRequestId(): string {
  return doc(tripRequestsCollection).id;
}

export async function createTripRequest(
  id: string,
  input: NewTripRequestInput
): Promise<void> {
  const now = Date.now();
  await setDoc(doc(db, "tripRequests", id), {
    ...input,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateTripRequest(
  requestId: string,
  changes: Partial<
    Pick<
      TripRequest,
      | "tripDate"
      | "from"
      | "pickupTime"
      | "to"
      | "personRequesting"
      | "awbLines"
      | "importFeeFiles"
    >
  >
): Promise<void> {
  await updateDoc(doc(db, "tripRequests", requestId), {
    ...changes,
    updatedAt: Date.now(),
  });
}

export async function cancelTripRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, "tripRequests", requestId), {
    status: "cancelled",
    updatedAt: Date.now(),
  });
}

// A single request's own detail screens (Dispatch, customer, driver) held a
// static snapshot from navigation params — fine for most fields, but it
// means live tracking would never actually update once you opened the
// screen. This gives those screens a live subscription instead.
export function subscribeToTripRequest(
  requestId: string,
  onChange: (request: TripRequest) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "tripRequests", requestId),
    (snap) => {
      if (snap.exists()) {
        onChange({ id: snap.id, ...snap.data() } as TripRequest);
      }
    },
    onError
  );
}

export function subscribeToCustomerTripRequests(
  customerId: string,
  onChange: (requests: TripRequest[]) => void,
  onError: (error: Error) => void
) {
  const q = query(
    tripRequestsCollection,
    where("customerId", "==", customerId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const requests = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() } as TripRequest)
      );
      onChange(requests);
    },
    onError
  );
}

// Dispatch (admin) — sees every customer's requests.
export function subscribeToAllTripRequests(
  onChange: (requests: TripRequest[]) => void,
  onError: (error: Error) => void
) {
  const q = query(tripRequestsCollection, orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const requests = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() } as TripRequest)
      );
      onChange(requests);
    },
    onError
  );
}

// Admin has unrestricted write access to tripRequests (see firestore.rules),
// so this stays a direct client write rather than a Cloud Function — the
// transaction just guards against two admins assigning at nearly the same
// moment from clobbering each other's read-modify-write of the array.
export async function assignAwbDriver(
  requestId: string,
  awbIndex: number,
  driverId: string | null,
  driverName: string | null
): Promise<void> {
  const ref = doc(db, "tripRequests", requestId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Trip request not found.");
    const data = snap.data() as TripRequest;
    const previousDriverId = data.awbLines[awbIndex]?.assignedDriverId ?? null;
    const awbLines: AwbLine[] = data.awbLines.map((line, i) =>
      i === awbIndex
        ? {
            ...line,
            assignedDriverId: driverId,
            assignedDriverName: driverName,
            status: (driverId ? "assigned" : "submitted") as TripRequestStatus,
          }
        : line
    );
    const rollup = computeTripRequestRollup(awbLines);
    const updates: Record<string, unknown> = {
      awbLines,
      ...rollup,
      updatedAt: Date.now(),
    };
    // Reassigning a line away from a driver who was mid-trip on it (this is
    // allowed — e.g. swapping in a replacement driver) can leave their pin
    // stuck on the live tracking map if this was their only in-progress line
    // on the request. Clear it in that case so the map doesn't keep showing
    // someone no longer working this request.
    if (
      previousDriverId &&
      previousDriverId !== driverId &&
      !awbLines.some((l) => l.assignedDriverId === previousDriverId && l.status === "in_progress")
    ) {
      updates[`driverLocations.${previousDriverId}`] = deleteField();
    }
    tx.update(ref, updates);
  });
}

// Lets an admin correct a customer's typo on an AWB's weight before billing
// is computed from it — billing amount for perKilogram customers is derived
// straight from this field, so a bad kilograms value would otherwise flow
// straight into the invoice.
export async function updateAwbKilograms(
  requestId: string,
  awbIndex: number,
  kilograms: number
): Promise<void> {
  const ref = doc(db, "tripRequests", requestId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Trip request not found.");
    const data = snap.data() as TripRequest;
    const awbLines: AwbLine[] = data.awbLines.map((line, i) =>
      i === awbIndex ? { ...line, kilograms } : line
    );
    tx.update(ref, { awbLines, updatedAt: Date.now() });
  });
}

export async function setTripRequestStatus(
  requestId: string,
  status: TripRequest["status"]
): Promise<void> {
  await updateDoc(doc(db, "tripRequests", requestId), {
    status,
    updatedAt: Date.now(),
  });
}

export function subscribeToDriverTripRequests(
  driverId: string,
  onChange: (requests: TripRequest[]) => void,
  onError: (error: Error) => void
) {
  const q = query(
    tripRequestsCollection,
    where("assignedDriverIds", "array-contains", driverId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const requests = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() } as TripRequest)
      );
      onChange(requests);
    },
    onError
  );
}

const startMyAwbLinesFn = httpsCallable<{ requestId: string }, { success: boolean }>(
  functions,
  "startMyAwbLines"
);

export async function startMyAwbLines(requestId: string): Promise<void> {
  await callWithFreshToken(startMyAwbLinesFn, { requestId });
}

const completeMyAwbLinesFn = httpsCallable<
  { requestId: string; tripLogId: string; awbIndexes: number[] },
  { success: boolean }
>(functions, "completeMyAwbLines");

export async function completeMyAwbLines(
  requestId: string,
  tripLogId: string,
  awbIndexes: number[]
): Promise<void> {
  await callWithFreshToken(completeMyAwbLinesFn, { requestId, tripLogId, awbIndexes });
}

const updateMyLiveLocationFn = httpsCallable<
  { requestId: string; lat: number; lng: number },
  { success: boolean }
>(functions, "updateMyLiveLocation");

export async function updateMyLiveLocation(
  requestId: string,
  lat: number,
  lng: number
): Promise<void> {
  await callWithFreshToken(updateMyLiveLocationFn, { requestId, lat, lng });
}
