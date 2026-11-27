import { redirect } from "next/navigation";

/** Clients and rates became one list with Clients & team: each client has its agreed rate there. */
export default function GuiaClientsPage() {
  redirect("/guias/acct-clients");
}
