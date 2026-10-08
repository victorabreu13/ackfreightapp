import { collection, onSnapshot, query, where } from "firebase/firestore";
import { HttpsCallable, httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase/config";
import { AwbPay, AwbPayOverride, PayAgreement, PayAgreementLog } from "../types";

async function callWithFreshToken<Req, Res>(fn: HttpsCallable<Req, Res>, data: Req): Promise<Res> {
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

const getDriverPayAgreementFn = httpsCallable<
  { driverId: string },
  { agreement: PayAgreement; logs: PayAgreementLog[] }
>(functions, "getDriverPayAgreement");

export async function getDriverPayAgreement(driverId: string) {
  return callWithFreshToken(getDriverPayAgreementFn, { driverId });
}

const setDriverPayAgreementFn = httpsCallable<
  { driverId: string; agreement: PayAgreement },
  { agreement: PayAgreement }
>(functions, "setDriverPayAgreement");

export async function setDriverPayAgreement(driverId: string, agreement: PayAgreement) {
  return callWithFreshToken(setDriverPayAgreementFn, { driverId, agreement });
}

const getCompanyPayDefaultFn = httpsCallable<
  Record<string, never>,
  { agreement: PayAgreement; logs: PayAgreementLog[] }
>(functions, "getCompanyPayDefault");

export async function getCompanyPayDefault() {
  return callWithFreshToken(getCompanyPayDefaultFn, {});
}

const setCompanyPayDefaultFn = httpsCallable<{ agreement: PayAgreement }, { agreement: PayAgreement }>(
  functions,
  "setCompanyPayDefault"
);

export async function setCompanyPayDefault(agreement: PayAgreement) {
  return callWithFreshToken(setCompanyPayDefaultFn, { agreement });
}

const setAwbPayOverrideFn = httpsCallable<
  { requestId: string; awbIndex: number; amount: number; reason: string },
  { amount: number }
>(functions, "setAwbPayOverride");

export async function setAwbPayOverride(
  requestId: string,
  awbIndex: number,
  amount: number,
  reason: string
) {
  return callWithFreshToken(setAwbPayOverrideFn, { requestId, awbIndex, amount, reason });
}

const adjustAwbPayFn = httpsCallable<
  { requestId: string; awbIndex: number; amount: number; reason: string },
  { adjustment: AwbPay["adjustment"] }
>(functions, "adjustAwbPay");

export async function adjustAwbPay(requestId: string, awbIndex: number, amount: number, reason: string) {
  return callWithFreshToken(adjustAwbPayFn, { requestId, awbIndex, amount, reason });
}

function mapDocs<T>(snap: { docs: { data: () => unknown }[] }): T[] {
  return snap.docs.map((doc) => doc.data() as T);
}

export function subscribeToDriverAwbPay(
  driverId: string,
  onChange: (rows: AwbPay[]) => void,
  onError?: (error: Error) => void
) {
  const q = query(collection(db, "awbPay"), where("driverId", "==", driverId));
  return onSnapshot(q, (snap) => onChange(mapDocs<AwbPay>(snap)), onError);
}

export function subscribeToRequestAwbPay(
  requestId: string,
  onChange: (rows: AwbPay[]) => void,
  onError?: (error: Error) => void
) {
  const q = query(collection(db, "awbPay"), where("requestId", "==", requestId));
  return onSnapshot(q, (snap) => onChange(mapDocs<AwbPay>(snap)), onError);
}

export function subscribeToRequestPayOverrides(
  requestId: string,
  onChange: (rows: AwbPayOverride[]) => void,
  onError?: (error: Error) => void
) {
  const q = query(collection(db, "awbPayOverrides"), where("requestId", "==", requestId));
  return onSnapshot(q, (snap) => onChange(mapDocs<AwbPayOverride>(snap)), onError);
}
