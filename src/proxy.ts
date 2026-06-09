import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Next 16 "Proxy" (formerly Middleware). Optimistic auth gate: redirects
 * unauthenticated users away from the dashboard, and authenticated users away
 * from the login page. Authorization on data routes is enforced server-side.
 */
export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isAuthPage = nextUrl.pathname === "/login" || nextUrl.pathname === "/register";
  const isProtected =
    nextUrl.pathname.startsWith("/dashboard") ||
    nextUrl.pathname.startsWith("/auto-boost") ||
    nextUrl.pathname.startsWith("/orders") ||
    nextUrl.pathname.startsWith("/panels") ||
    nextUrl.pathname.startsWith("/analytics") ||
    nextUrl.pathname.startsWith("/users") ||
    nextUrl.pathname.startsWith("/settings");

  if (isProtected && !isLoggedIn) {
    const url = new URL("/login", nextUrl.origin);
    url.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
