import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { UserProfile } from "../types";

const usersCollection = collection(db, "users");

export function subscribeToDrivers(
  onChange: (drivers: UserProfile[]) => void,
  onError: (error: Error) => void
) {
  const q = query(
    usersCollection,
    where("role", "==", "driver"),
    orderBy("name")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const drivers = snapshot.docs.map((d) => d.data() as UserProfile);
      onChange(drivers);
    },
    onError
  );
}

export function subscribeToCustomers(
  onChange: (customers: UserProfile[]) => void,
  onError: (error: Error) => void
) {
  const q = query(
    usersCollection,
    where("role", "==", "customer"),
    orderBy("name")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const customers = snapshot.docs.map((d) => d.data() as UserProfile);
      onChange(customers);
    },
    onError
  );
}
