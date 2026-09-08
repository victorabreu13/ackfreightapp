import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { NewTripInput, Trip } from "../types";

const tripsCollection = collection(db, "trips");

export async function createTrip(input: NewTripInput): Promise<void> {
  await addDoc(tripsCollection, {
    ...input,
    createdAt: Date.now(),
  });
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
