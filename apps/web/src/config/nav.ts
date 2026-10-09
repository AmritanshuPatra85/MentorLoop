import type { UserRole } from "@mentorloop/shared";
import {
  BarChart3,
  Calendar,
  Clock,
  Compass,
  LayoutDashboard,
  Link2,
  User,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// ---------------------------------------------------------------------------
// Per-role navigation menus
// ---------------------------------------------------------------------------

const FOUNDER_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover Mentors", icon: Compass },
  { href: "/connections", label: "Connections", icon: Link2 },
  { href: "/sessions", label: "Sessions", icon: Calendar },
  { href: "/profile", label: "Profile", icon: User },
];

const MENTOR_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/feed", label: "Startup Feed", icon: Compass },
  { href: "/connections", label: "Connections", icon: Link2 },
  { href: "/sessions", label: "Sessions", icon: Calendar },
  { href: "/availability", label: "Availability", icon: Clock },
  { href: "/profile", label: "Profile", icon: User },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/approvals", label: "Approvals", icon: UserCheck },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  founder: FOUNDER_NAV,
  mentor: MENTOR_NAV,
  admin: ADMIN_NAV,
};

/** Return navigation items appropriate for the given role. */
export function getNavItems(role: UserRole): NavItem[] {
  return NAV_BY_ROLE[role] ?? FOUNDER_NAV;
}