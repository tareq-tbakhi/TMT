/**
 * DashboardLayout — shared shell for all department web dashboards
 * (hospital / police / civil defense admins + super admin).
 *
 * Design-system reference implementation:
 *  - token-based colors only (works in light, dark & high-contrast)
 *  - role accent via useAccent()
 *  - skip link, landmark roles, aria-current nav, live connection status
 *  - SettingsPanel (theme, text size, contrast, motion, language)
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  ChevronDown,
  Globe2,
  HeartHandshake,
  Hospital,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  Settings,
  ShieldAlert,
  Siren,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useAuthStore,
  ROLE_TO_DEPARTMENT,
  DEPARTMENT_LABELS,
  type DepartmentType,
} from "../../store/authStore";
import { useAlertStore } from "../../store/alertStore";
import { SocketProvider, useSocket } from "../../contexts/SocketContext";
import { useAccent, type AccentRole } from "../../contexts/PreferencesContext";
import { SettingsPanel } from "../ui";

const DEPT_ICONS: Record<DepartmentType, LucideIcon> = {
  hospital: Hospital,
  police: Siren,
  civil_defense: ShieldAlert,
};

const DEPT_ACCENT: Record<DepartmentType, AccentRole> = {
  hospital: "hospital",
  police: "police",
  civil_defense: "civil_defense",
};

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS_BY_DEPT: Record<DepartmentType, NavItem[]> = {
  hospital: [
    { path: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
    { path: "/dashboard/alerts", label: "nav.alerts", icon: Bell },
    { path: "/dashboard/analytics", label: "nav.analytics", icon: BarChart3 },
    { path: "/dashboard/map", label: "nav.map", icon: MapIcon },
    { path: "/dashboard/aid-requests", label: "nav.aidRequests", icon: HeartHandshake },
    { path: "/dashboard/transfers", label: "Transfers", icon: ArrowLeftRight },
    { path: "/dashboard/status", label: "nav.status", icon: Activity },
  ],
  police: [
    { path: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
    { path: "/dashboard/alerts", label: "nav.alerts", icon: Bell },
    { path: "/dashboard/analytics", label: "nav.analytics", icon: BarChart3 },
    { path: "/dashboard/map", label: "nav.map", icon: MapIcon },
    { path: "/dashboard/transfers", label: "Transfers", icon: ArrowLeftRight },
    { path: "/dashboard/status", label: "Station Status", icon: Activity },
  ],
  civil_defense: [
    { path: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
    { path: "/dashboard/alerts", label: "nav.alerts", icon: Bell },
    { path: "/dashboard/analytics", label: "nav.analytics", icon: BarChart3 },
    { path: "/dashboard/map", label: "nav.map", icon: MapIcon },
    { path: "/dashboard/aid-requests", label: "Resource Requests", icon: HeartHandshake },
    { path: "/dashboard/transfers", label: "Transfers", icon: ArrowLeftRight },
    { path: "/dashboard/status", label: "Center Status", icon: Activity },
  ],
};

const SUPER_ADMIN_NAV: NavItem[] = [
  { path: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { path: "/dashboard/alerts", label: "nav.alerts", icon: Bell },
  { path: "/dashboard/patients", label: "Patients", icon: Users },
  { path: "/dashboard/analytics", label: "nav.analytics", icon: BarChart3 },
  { path: "/dashboard/map", label: "nav.map", icon: MapIcon },
  { path: "/dashboard/aid-requests", label: "nav.aidRequests", icon: HeartHandshake },
  { path: "/dashboard/transfers", label: "Transfers", icon: ArrowLeftRight },
  { path: "/dashboard/status", label: "nav.status", icon: Activity },
];

const DashboardInner: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const unreadCount = useAlertStore((s) => s.unreadCount);
  const { isConnected } = useSocket();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = user?.role === "super_admin";
  const dept: DepartmentType =
    user?.facilityType ?? ROLE_TO_DEPARTMENT[user?.role ?? ""] ?? "hospital";
  const deptLabel = isSuperAdmin
    ? "Command Center"
    : DEPARTMENT_LABELS[dept] ?? "Hospital";
  const DeptIcon = isSuperAdmin ? Globe2 : DEPT_ICONS[dept] ?? Hospital;

  useAccent(isSuperAdmin ? "admin" : DEPT_ACCENT[dept] ?? "hospital");

  const navItems = useMemo(() => {
    if (isSuperAdmin) return SUPER_ADMIN_NAV;
    return NAV_ITEMS_BY_DEPT[dept] ?? NAV_ITEMS_BY_DEPT.hospital;
  }, [dept, isSuperAdmin]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [userMenuOpen]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `group flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
      isActive
        ? "bg-accent-soft text-on-accent-soft"
        : "text-ink-muted hover:bg-surface-2 hover:text-ink"
    }`;

  const roleLabel = isSuperAdmin ? "Super Admin" : `${deptLabel} Admin`;

  return (
    <div className="flex h-screen bg-canvas">
      <a href="#main-content" className="skip-link">
        {t("a11y.skipToContent")}
      </a>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="app-sidebar"
        aria-label={`${deptLabel} navigation`}
        className={`fixed inset-y-0 start-0 z-40 flex w-72 flex-col border-e border-edge bg-surface transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
      >
        {/* Logo area */}
        <div className="flex h-16 items-center justify-between gap-2 border-b border-edge px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent"
            >
              <DeptIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight text-ink">TMT</p>
              <p className="truncate text-xs font-semibold text-on-accent-soft">
                {deptLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus lg:hidden"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/dashboard"}
                className={navLinkClasses}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                <span className="truncate">{t(item.label)}</span>
                {item.path === "/dashboard/alerts" && unreadCount > 0 && (
                  <span className="ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-white">
                    {unreadCount > 999 ? "999+" : unreadCount}
                    <span className="sr-only"> unread alerts</span>
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="space-y-1 border-t border-edge p-3">
          {/* Connection status */}
          <div className="flex items-center gap-2.5 px-3 py-1.5" role="status">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${
                isConnected ? "bg-success" : "bg-danger animate-pulse"
              }`}
            />
            <span className="text-xs font-medium text-ink-muted">
              {isConnected ? "Live — real-time updates on" : "Reconnecting…"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus"
          >
            <Settings aria-hidden="true" className="h-5 w-5 shrink-0" />
            <span className="truncate">{t("settings.title")}</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft focus-visible:outline-3 focus-visible:outline-focus"
          >
            <LogOut aria-hidden="true" className="h-5 w-5 shrink-0" />
            <span>{t("nav.logout")}</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-edge bg-surface px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              aria-controls="app-sidebar"
              aria-expanded={sidebarOpen}
              className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus lg:hidden"
            >
              <Menu aria-hidden="true" className="h-6 w-6" />
            </button>
            <h2 className="hidden truncate text-lg font-bold text-ink lg:block">
              {deptLabel} Dashboard
            </h2>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Notification bell */}
            <button
              type="button"
              onClick={() => navigate("/dashboard/alerts")}
              aria-label={
                unreadCount > 0
                  ? `${t("nav.alerts")} — ${unreadCount} unread`
                  : t("nav.alerts")
              }
              className="relative flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus"
            >
              <Bell aria-hidden="true" className="h-5 w-5" />
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute end-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white"
                >
                  {unreadCount > 999 ? "999+" : unreadCount}
                </span>
              )}
            </button>

            {/* Settings */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label={t("settings.open")}
              className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus"
            >
              <Settings aria-hidden="true" className="h-5 w-5" />
            </button>

            {/* User menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                className="flex min-h-11 items-center gap-2 rounded-md p-1.5 pe-2 text-ink transition-colors hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-on-accent-soft">
                  {deptLabel.charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-sm font-semibold sm:block">{roleLabel}</span>
                <ChevronDown aria-hidden="true" className="hidden h-4 w-4 text-ink-faint sm:block" />
              </button>
              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute end-0 z-10 mt-2 w-52 rounded-md border border-edge bg-surface py-1 shadow-2"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate("/dashboard/status");
                    }}
                    className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus"
                  >
                    <Activity aria-hidden="true" className="h-4 w-4 text-ink-faint" />
                    {t("nav.status")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                    className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft focus-visible:outline-3 focus-visible:outline-focus"
                  >
                    <LogOut aria-hidden="true" className="h-4 w-4" />
                    {t("nav.logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

const DashboardLayout: React.FC = () => (
  <SocketProvider>
    <DashboardInner />
  </SocketProvider>
);

export default DashboardLayout;
