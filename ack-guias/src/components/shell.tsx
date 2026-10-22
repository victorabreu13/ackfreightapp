import Link from "next/link";
import type { ReactNode } from "react";
import { GuiaBrandHead } from "@/components/guia-brand-head";
import type { SessionUser } from "@/lib/access";
import { GUIAS_NAV } from "@/lib/guias/nav";
import { USER_ROLE_LABEL } from "@/lib/users";
import { signOutAction } from "@/server/session-actions";

export function Shell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const operations = user.role === "ADMIN" || user.role === "OPERATIONS" || (user.role as string) === "TEAM";
  const accounting = user.role === "ACCOUNTING";
  const viewer = user.role === "VIEWER";
  return (
    <div className="min-h-full">
      <header className="bg-[#3f2a12] text-primary-foreground">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/guias" className="flex items-center gap-3">
            <img src="/brand-icon" alt="" className="h-9 w-auto max-w-[9.5rem] rounded-md bg-white object-contain px-1" />
            <span>
              <span className="block font-display text-xl leading-none">ACK Freight App</span>
              <span className="block text-[10px] uppercase tracking-[0.22em] text-white/65">ACK TEAM LLC</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {GUIAS_NAV.filter((link) => {
              if (link.admin) return user.role === "ADMIN";
              if (link.team || link.accounting || link.viewer) {
                return (Boolean(link.team) && operations) || (Boolean(link.accounting) && accounting) || (Boolean(link.viewer) && viewer);
              }
              return true;
            }).map((link) => (
              <Link key={link.href} href={link.href} className="rounded-md px-3 py-1.5 hover:bg-white/10">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="text-right">
              <div className="font-medium leading-tight">{user.name || user.email}</div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/60">
                {USER_ROLE_LABEL[user.role] ?? "Viewer"}
              </div>
            </div>
            <form action={signOutAction}>
              <button className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <GuiaBrandHead brand="ack" />
      <main className="mx-auto max-w-[1440px] px-4 py-6">{children}</main>
    </div>
  );
}
