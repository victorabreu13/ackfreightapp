import { sendPasswordResetEmail } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase/config";

const createCustomerFn = httpsCallable<
  { name: string; email: string },
  { uid: string }
>(functions, "createCustomer");

// Creates a real, login-capable customer account (admin-only, e.g. for a
// phone-in order) and immediately sends them a password-reset email so they
// can set their own password — the account's random initial password is
// generated server-side and never seen by the admin or this client.
export async function createCustomer(name: string, email: string): Promise<string> {
  if (auth.currentUser) {
    await auth.currentUser.getIdToken();
  }
  const result = await createCustomerFn({ name, email });
  await sendPasswordResetEmail(auth, email);
  return result.data.uid;
}
