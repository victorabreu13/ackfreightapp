import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isGuiasAllowed } from "@/lib/app-mode";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-search", request.nextUrl.search);
  const { pathname } = request.nextUrl;
  if (pathname === "/" || pathname === "/awb") return NextResponse.redirect(new URL(pathname === "/awb" ? "/awb/stock" : "/guias", request.url));
  if (!isGuiasAllowed(pathname)) return new NextResponse("Not found", { status: 404 });
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
