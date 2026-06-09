import type { UserPerms } from "@/lib/auth";

export type Role = "ADMIN" | "MODERATOR" | "USER";

const EMPTY_PERMS: UserPerms = {
  canDashboard: false,
  canAnalytics: false,
  canPanels: false,
};

/** Can this user view a given dashboard route? Admin/Moderator see everything. */
export function canView(
  href: string,
  role: Role | undefined,
  perms: UserPerms | undefined,
): boolean {
  if (role === "ADMIN" || role === "MODERATOR") return true;
  const p = perms ?? EMPTY_PERMS;

  // USER: Auto Boost + Orders always allowed.
  if (href.startsWith("/auto-boost") || href.startsWith("/orders")) return true;
  if (href.startsWith("/dashboard")) return p.canDashboard;
  if (href.startsWith("/analytics")) return p.canAnalytics;
  if (href.startsWith("/panels")) return p.canPanels;
  // Users admin, Settings (currency/mappings/api keys) — admin only.
  if (href.startsWith("/users") || href.startsWith("/settings")) return false;
  return false;
}

/** Default landing route for a user after login. */
export function defaultRouteFor(role: Role | undefined, perms: UserPerms | undefined): string {
  if (role === "ADMIN" || role === "MODERATOR") return "/dashboard";
  if (perms?.canDashboard) return "/dashboard";
  return "/auto-boost";
}

/** Admins/mods manage panels (write); USERs never can. */
export function canManagePanels(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "MODERATOR";
}
