import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { signOutAction } from "@/server/session-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ACK Freight App",
  icons: { icon: "/brand-icon" },
};

/** The client's own space. Only a customer login gets in, and it sees only the guías of its client. */
export default async function CustomerPortalLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?customer=1");
  if (user.role !== "CUSTOMER") redirect("/guias");
  return (
    <div className="min-h-full">
      <header className="bg-[#3f2a12] text-primary-foreground">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/brand-icon" alt="" className="h-9 w-auto max-w-[9.5rem] rounded-md bg-white object-contain px-1" />
            <span>
              <span className="block font-display text-xl leading-none">ACK Freight App</span>
              <span className="block text-[10px] uppercase tracking-[0.22em] text-white/65">{user.clientName ?? "Cliente"}</span>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-white/80 sm:inline">{user.name || user.email}</span>
            <form action={signOutAction}>
              <button className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10">Salir</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-4 py-6">{children}</main>
    </div>
  );
}
