import type { BoostType } from "@prisma/client";

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Auto Boost", href: "/auto-boost", icon: "Rocket" },
  { label: "Orders", href: "/orders", icon: "ListChecks" },
  { label: "Panels", href: "/panels", icon: "Server" },
  { label: "Analytics", href: "/analytics", icon: "BarChart3" },
  { label: "Users", href: "/users", icon: "Users", adminOnly: true },
  { label: "Settings", href: "/settings", icon: "Settings", adminOnly: true },
] as const;

// Grouped navigation for the premium sidebar.
export const NAV_GROUPS = [
  {
    heading: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
      { label: "Auto Boost", href: "/auto-boost", icon: "Rocket", badge: "AI" },
      { label: "Orders", href: "/orders", icon: "ListChecks" },
    ],
  },
  {
    heading: "Manage",
    items: [
      { label: "Panels", href: "/panels", icon: "Server" },
      { label: "Analytics", href: "/analytics", icon: "BarChart3" },
      { label: "Users", href: "/users", icon: "Users", adminOnly: true },
    ],
  },
  {
    heading: "Account",
    items: [{ label: "Settings", href: "/settings", icon: "Settings", adminOnly: true }],
  },
] as const;

export const BOOST_TYPES: { value: BoostType; label: string; emoji: string }[] = [
  { value: "LIKE", label: "Like", emoji: "👍" },
  { value: "SHARE", label: "Share", emoji: "🔁" },
  { value: "LOVE", label: "Love React", emoji: "❤️" },
  { value: "WOW", label: "Wow React", emoji: "😮" },
  { value: "CARE", label: "Care React", emoji: "🤗" },
  { value: "HAHA", label: "Haha React", emoji: "😆" },
  { value: "ANGRY", label: "Angry React", emoji: "😡" },
  { value: "COMMENT", label: "Comment", emoji: "💬" },
  { value: "FOLLOWERS", label: "Followers", emoji: "👥" },
  { value: "VIEWS", label: "Views", emoji: "👁️" },
  { value: "CUSTOM", label: "Custom Engagement", emoji: "✨" },
];

export const PLATFORMS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "X / Twitter" },
] as const;

export const ORDER_STATUS_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }
> = {
  PENDING: { label: "Pending", variant: "secondary" },
  PROCESSING: { label: "Processing", variant: "default" },
  PARTIAL: { label: "Partial", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "success" },
  CANCELED: { label: "Canceled", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
  REFILLED: { label: "Refilled", variant: "default" },
};

export const LOW_BALANCE_THRESHOLD = 10; // currency units
