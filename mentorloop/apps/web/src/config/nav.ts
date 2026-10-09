import { LayoutDashboard, Palette, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Role-aware navigation arrives with RBAC in Sprint 2.3.
export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/design", label: "Design system", icon: Palette },
];