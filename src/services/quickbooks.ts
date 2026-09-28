import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";

// The authorize URL is built server-side (startQuickBooksAuth) because it
// needs to register a one-time CSRF state value that the OAuth callback
// validates before trusting the redirect back — a client-generated state
// with no server record to check it against isn't real CSRF protection.
const startAuthFn = httpsCallable<Record<string, never>, { authUrl: string }>(
  functions,
  "startQuickBooksAuth"
);

export async function getQuickBooksConnectUrl(): Promise<string> {
  const result = await startAuthFn({});
  return result.data.authUrl;
}

interface QuickBooksStatus {
  connected: boolean;
  companyName?: string | null;
  environment?: string;
  realmId?: string;
}

const getStatusFn = httpsCallable<Record<string, never>, QuickBooksStatus>(
  functions,
  "getQuickBooksStatus"
);

export async function getQuickBooksStatus(): Promise<QuickBooksStatus> {
  const result = await getStatusFn({});
  return result.data;
}

const disconnectFn = httpsCallable<Record<string, never>, { success: boolean }>(
  functions,
  "disconnectQuickBooks"
);

export async function disconnectQuickBooks(): Promise<void> {
  await disconnectFn({});
}

interface SendInvoiceResult {
  success: boolean;
  invoiceId: string;
  invoiceNumber: string | null;
  amount: number;
  emailSent: boolean;
}

const sendInvoiceFn = httpsCallable<{ requestId: string }, SendInvoiceResult>(
  functions,
  "sendQuickBooksInvoice"
);

export async function sendQuickBooksInvoice(requestId: string): Promise<SendInvoiceResult> {
  const result = await sendInvoiceFn({ requestId });
  return result.data;
}
