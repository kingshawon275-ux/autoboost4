import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canView, defaultRouteFor } from "@/lib/permissions";

/**
 * Server-side page guard. Ensures the user is logged in and may view the route;
 * otherwise redirects to login or their default landing page. Returns the
 * session so the page can use it.
 */
export async function guardPage(href: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { role, perms } = session.user;
  if (!canView(href, role, perms)) {
    redirect(defaultRouteFor(role, perms));
  }
  return session;
}
