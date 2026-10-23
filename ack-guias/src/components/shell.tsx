import Link from "next/link";
import type { ReactNode } from "react";
import { GuiaBrandHead } from "@/components/guia-brand-head";
import type { SessionUser } from "@/lib/access";
import { NavMenu } from "@/components/nav-menu";
import { isNavGroup, menuFor } from "@/lib/guias/nav";
import { USER_ROLE_LABEL } from "@/lib/users";
import { signOutAction } from "@/server/session-actions";

export function Shell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const menu = menuFor(user.role);
  return (
    <div className="min-h-full">
      <header className="bg-[#3f2a12] text-primary-foreground">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
          <Link href="/guias" className="flex items-center gap-2.5">
            <img src="/brand-icon" alt="" className="h-8 w-auto max-w-[8.5rem] rounded-md bg-white object-contain px-1" />
            <span>
              <span className="block font-display text-lg leading-none">ACK Freight App</span>
              <span className="block text-[10px] uppercase tracking-[0.22em] text-white/65">ACK TEAM LLC</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-0.5 text-[13px]">
            {menu.map((item) =>
              isNavGroup(item) ? (
                <NavMenu key={item.label} label={item.label} links={item.links} />
              ) : (
                <Link key={item.href} href={item.href} className="rounded-md px-2.5 py-1 hover:bg-white/10">
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[13px]">
            <div className="text-right">
              <div className="font-medium leading-tight">{user.name || user.email}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/60">
                {USER_ROLE_LABEL[user.role] ?? "Viewer"}
              </div>
            </div>
            <form action={signOutAction}>
              <button className="rounded-md border border-white/20 px-2.5 py-1 text-xs hover:bg-white/10">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <GuiaBrandHead brand="ack" />
      <main className="mx-auto max-w-[1440px] px-4 py-6">{children}</main>
    </div>
  );
}
