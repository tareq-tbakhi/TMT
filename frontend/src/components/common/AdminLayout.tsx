/**
 * AdminLayout — shell for the Super Admin (Ministry) area.
 * Token-based design system, admin accent, full a11y support.
 */

import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Bell,
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useAccent } from "../../contexts/PreferencesContext";
import { SettingsPanel } from "../ui";

const NAV_ITEMS: { path: string; label: string; icon: LucideIcon }[] = [
  { path: "/admin", label: "admin.nav.dashboard", icon: LayoutDashboard },
  { path: "/admin/hospitals", label: "admin.nav.facilities", icon: Building2 },
  { path: "/admin/users", label: "admin.nav.users", icon: Users },
  { path: "/admin/analytics", label: "admin.nav.analytics", icon: BarChart3 },
  { path: "/admin/alerts", label: "admin.nav.alerts", icon: Bell },
  { path: "/admin/social-media", label: "admin.nav.socialMedia", icon: MessageCircle },
];

const AdminLayout: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useAccent("admin");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
      isActive
        ? "bg-accent-soft text-on-accent-soft"
        : "text-ink-muted hover:bg-surface-2 hover:text-ink"
    }`;

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
        aria-label="Admin navigation"
        className={`fixed inset-y-0 start-0 z-40 flex w-72 flex-col border-e border-edge bg-surface transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between gap-2 border-b border-edge px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent"
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight text-ink">TMT</p>
              <p className="truncate text-xs font-semibold text-on-accent-soft">
                {t("admin.title")}
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
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/admin"}
                className={navLinkClasses}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                <span className="truncate">{t(item.label)}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="space-y-1 border-t border-edge p-3">
          <div className="mb-1 flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-on-accent-soft">
              SA
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {t("admin.superAdmin")}
              </p>
              <p className="truncate text-xs text-ink-muted">{t("admin.role")}</p>
            </div>
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
              {t("admin.title")}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 sm:inline-flex">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
              <span className="text-xs font-semibold text-on-accent-soft">
                {t("admin.superAdmin")}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label={t("settings.open")}
              className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus"
            >
              <Settings aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

export default AdminLayout;
