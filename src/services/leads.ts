import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase/config";

export interface Lead {
  id: string;
  contactName: string;
  email: string;
  phone?: string;
  from: string;
  to: string;
  tripDate?: string;
  pickupTime?: string;
  notes?: string;
  awbNumber?: string;
  status: "pending" | "approved" | "dismissed";
  createdAt: number;
}

const leadsCollection = collection(db, "leads");

export function subscribeToPendingLeads(
  onChange: (leads: Lead[]) => void,
  onError: (error: Error) => void
) {
  const q = query(leadsCollection, where("status", "==", "pending"));
  return onSnapshot(
    q,
    (snapshot) => {
      const leads = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Lead))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      onChange(leads);
    },
    onError
  );
}

async function callAdmin<T>(name: string, data: { leadId: string }): Promise<T> {
  if (auth.currentUser) await auth.currentUser.getIdToken(true);
  const fn = httpsCallable<{ leadId: string }, T>(functions, name);
  const result = await fn(data);
  return result.data;
}

export function approveLead(leadId: string): Promise<{ tripRequestId: string }> {
  return callAdmin("approveLead", { leadId });
}

export function dismissLead(leadId: string): Promise<{ success: boolean }> {
  return callAdmin("dismissLead", { leadId });
}
