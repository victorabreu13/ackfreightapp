import { collection, doc, getDoc, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { DriverPayType, UserProfile } from "../types";

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

export async function setDriverPayRate(
  driverId: string,
  payType: DriverPayType,
  payRate: number
): Promise<void> {
  await updateDoc(doc(db, "users", driverId), { payType, payRate });
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

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function setCustomerBillRate(
  customerId: string,
  billType: DriverPayType,
  billRate: number
): Promise<void> {
  await updateDoc(doc(db, "users", customerId), { billType, billRate });
}
