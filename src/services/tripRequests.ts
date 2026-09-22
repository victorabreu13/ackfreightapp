import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { NewTripRequestInput, TripRequest } from "../types";

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
