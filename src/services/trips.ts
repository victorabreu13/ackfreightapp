import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { HttpsCallable, httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase/config";
import { DeletedTrip, NewTripInput, Trip } from "../types";

const tripsCollection = collection(db, "trips");

// Force a fresh ID token before calling, and retry once on "unauthenticated":
// on native the cached token can lag behind sign-in state, which makes a
// callable function see no auth even though the user is logged in.
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

interface DuplicateUldResult {
  duplicate: boolean;
  uldNumber?: string;
}

export function duplicateUldMessage(
  uldNumber: string | undefined,
  action: "submitting" | "completing"
) {
  const which = uldNumber ? `ULD #${uldNumber}` : "This ULD";
  return `${which} is already logged under this AWB. Double-check the number before ${action}.`;
}

const checkDuplicateUldFn = httpsCallable<
  { awbNumber: string; uldNumbers: string[] },
  DuplicateUldResult
>(functions, "checkDuplicateUld");

export async function checkDuplicateUld(
  awbNumber: string,
  uldNumbers: string[]
): Promise<DuplicateUldResult> {
  return callWithFreshToken(checkDuplicateUldFn, { awbNumber, uldNumbers });
}

const deleteTripFn = httpsCallable<{ tripId: string }, { success: boolean }>(
  functions,
  "deleteTrip"
);

export async function deleteTrip(tripId: string): Promise<void> {
  await callWithFreshToken(deleteTripFn, { tripId });
}

const listDeletedTripsFn = httpsCallable<void, { deletedTrips: DeletedTrip[] }>(
  functions,
  "listDeletedTrips"
);

export async function listDeletedTrips(): Promise<DeletedTrip[]> {
  const result = await callWithFreshToken(listDeletedTripsFn, undefined);
  return result.deletedTrips;
}

const restoreDeletedTripFn = httpsCallable<
  { deletedTripId: string },
  { success: boolean; tripId: string }
>(functions, "restoreDeletedTrip");

export async function restoreDeletedTrip(deletedTripId: string): Promise<void> {
  await callWithFreshToken(restoreDeletedTripFn, { deletedTripId });
}

const submitTripLogFn = httpsCallable<{ trip: NewTripInput }, { id: string }>(
  functions,
  "submitTripLog"
);

export async function createTrip(input: NewTripInput): Promise<string> {
  const result = await callWithFreshToken(submitTripLogFn, { trip: input });
  return result.id;
}

export async function setTripPaid(tripId: string, paid: boolean): Promise<void> {
  await updateDoc(doc(db, "trips", tripId), { paid });
}

export async function setTripInvoiced(tripId: string, invoiced: boolean): Promise<void> {
  await updateDoc(doc(db, "trips", tripId), { invoiced });
}

export function subscribeToDriverTrips(
  driverId: string,
  onChange: (trips: Trip[]) => void,
  onError: (error: Error) => void
) {
  const q = query(
    tripsCollection,
    where("driverId", "==", driverId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const trips = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Trip)
      );
      onChange(trips);
    },
    onError
  );
}

export function subscribeToAllTrips(
  onChange: (trips: Trip[]) => void,
  onError: (error: Error) => void
) {
  const q = query(tripsCollection, orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const trips = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Trip)
      );
      onChange(trips);
    },
    onError
  );
}
