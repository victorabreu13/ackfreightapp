import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isLegacyCloudRunHost, resolveAppUrl } from "@/lib/app-url";
import { isGuiasAllowed } from "@/lib/app-mode";

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0]?.trim() ?? "";
    if (isLegacyCloudRunHost(`https://${host}`)) {
      const canonical = new URL(resolveAppUrl());
      const dest = request.nextUrl.clone();
      dest.protocol = canonical.protocol;
      dest.host = canonical.host;
      return NextResponse.redirect(dest);
    }
  }
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
