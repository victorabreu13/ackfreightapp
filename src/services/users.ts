import { collection, doc, getDoc, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { HttpsCallable, httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase/config";
import { DriverPayType, UserProfile, UserRole } from "../types";

const usersCollection = collection(db, "users");

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

// For driver-assignment pickers specifically — payroll/records screens still
// need subscribeToDrivers' full list (a deactivated driver still has trips to
// get paid for), but an inactive driver shouldn't be assignable to new work.
// Filtered client-side rather than via a Firestore "active != false" query,
// since that operator excludes documents missing the field entirely (true
// for every driver who's never been deactivated).
export function subscribeToActiveDrivers(
  onChange: (drivers: UserProfile[]) => void,
  onError: (error: Error) => void
) {
  return subscribeToDrivers(
    (drivers) => onChange(drivers.filter((d) => d.active !== false)),
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

export async function setUserName(uid: string, name: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { name });
}

export function subscribeToAllUsers(
  onChange: (users: UserProfile[]) => void,
  onError: (error: Error) => void
) {
  const q = query(usersCollection, orderBy("name"));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => d.data() as UserProfile)),
    onError
  );
}

const setUserRoleFn = httpsCallable<{ uid: string; role: UserRole }, { success: boolean }>(
  functions,
  "setUserRole"
);

export async function setUserRole(uid: string, role: UserRole): Promise<void> {
  await callWithFreshToken(setUserRoleFn, { uid, role });
}

const updateUserEmailFn = httpsCallable<{ uid: string; email: string }, { success: boolean }>(
  functions,
  "updateUserEmail"
);

export async function updateUserEmail(uid: string, email: string): Promise<void> {
  await callWithFreshToken(updateUserEmailFn, { uid, email });
}

const updateUserPasswordFn = httpsCallable<{ uid: string; password: string }, { success: boolean }>(
  functions,
  "updateUserPassword"
);

export async function updateUserPassword(uid: string, password: string): Promise<void> {
  await callWithFreshToken(updateUserPasswordFn, { uid, password });
}

const setUserActiveFn = httpsCallable<{ uid: string; active: boolean }, { success: boolean }>(
  functions,
  "setUserActive"
);

export async function setUserActive(uid: string, active: boolean): Promise<void> {
  await callWithFreshToken(setUserActiveFn, { uid, active });
}

const deleteUserAccountFn = httpsCallable<{ uid: string }, { success: boolean }>(
  functions,
  "deleteUserAccount"
);

export async function deleteUserAccount(uid: string): Promise<void> {
  await callWithFreshToken(deleteUserAccountFn, { uid });
}
