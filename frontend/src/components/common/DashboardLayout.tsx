import React, { useState, useMemo } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore, ROLE_TO_DEPARTMENT, DEPARTMENT_LABELS, DEPARTMENT_COLORS, type DepartmentType } from "../../store/authStore";
import { useAlertStore } from "../../store/alertStore";
import { SocketProvider, useSocket } from "../../contexts/SocketContext";

const DEPT_ICONS: Record<DepartmentType, string> = {
  hospital: "\u{1F3E5}",
  police: "\u{1F6A8}",
  civil_defense: "\u{1F6E1}\uFE0F",
};

const NAV_ITEMS_BY_DEPT: Record<DepartmentType, { path: string; label: string; icon: string }[]> = {
  hospital: [
    { path: "/dashboard", label: "nav.dashboard", icon: "\uD83D\uDCCA" },
    { path: "/dashboard/alerts", label: "nav.alerts", icon: "\uD83D\uDD14" },
    { path: "/dashboard/analytics", label: "nav.analytics", icon: "\uD83D\uDCC8" },
    { path: "/dashboard/map", label: "nav.map", icon: "\uD83D\uDDFA\uFE0F" },
    { path: "/dashboard/aid-requests", label: "nav.aidRequests", icon: "\uD83E\uDD1D" },
    { path: "/dashboard/transfers", label: "Transfers", icon: "\uD83D\uDD00" },
    { path: "/dashboard/status", label: "nav.status", icon: "\uD83C\uDFE5" },
  ],
  police: [
    { path: "/dashboard", label: "nav.dashboard", icon: "\uD83D\uDCCA" },
    { path: "/dashboard/alerts", label: "nav.alerts", icon: "\uD83D\uDD14" },
    { path: "/dashboard/analytics", label: "nav.analytics", icon: "\uD83D\uDCC8" },
    { path: "/dashboard/map", label: "nav.map", icon: "\uD83D\uDDFA\uFE0F" },
    { path: "/dashboard/transfers", label: "Transfers", icon: "\uD83D\uDD00" },
    { path: "/dashboard/status", label: "Station Status", icon: "\uD83D\uDEA8" },
  ],
  civil_defense: [
    { path: "/dashboard", label: "nav.dashboard", icon: "\uD83D\uDCCA" },
    { path: "/dashboard/alerts", label: "nav.alerts", icon: "\uD83D\uDD14" },
    { path: "/dashboard/analytics", label: "nav.analytics", icon: "\uD83D\uDCC8" },
    { path: "/dashboard/map", label: "nav.map", icon: "\uD83D\uDDFA\uFE0F" },
    { path: "/dashboard/aid-requests", label: "Resource Requests", icon: "\uD83E\uDD1D" },
    { path: "/dashboard/transfers", label: "Transfers", icon: "\uD83D\uDD00" },
    { path: "/dashboard/status", label: "Center Status", icon: "\uD83D\uDEE1\uFE0F" },
  ],
};

const DashboardInner: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const unreadCount = useAlertStore((s) => s.unreadCount);
  const { isConnected } = useSocket();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const dept: DepartmentType = user?.facilityType ?? ROLE_TO_DEPARTMENT[user?.role ?? ""] ?? "hospital";
  const deptLabel = DEPARTMENT_LABELS[dept] ?? "Hospital";
  const deptColors = DEPARTMENT_COLORS[dept] ?? DEPARTMENT_COLORS.hospital;
  const deptIcon = DEPT_ICONS[dept] ?? "\u{1F3E5}";

  const navItems = useMemo(() => {
    return NAV_ITEMS_BY_DEPT[dept] ?? NAV_ITEMS_BY_DEPT.hospital;
  }, [dept]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(newLang);
  };

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive
        ? `${deptColors.bg} ${deptColors.text}`
        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`;

  const roleLabel = user?.role === "super_admin"
    ? "Super Admin"
    : `${deptLabel} Admin`;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 start-0 z-40 flex w-64 flex-col border-e border-gray-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full rtl:translate-x-full"
        }`}
      >
        {/* Logo area */}
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-5">
          <span className="text-2xl">{deptIcon}</span>
          <div>
            <h1 className="text-lg font-bold text-gray-900">TMT</h1>
            <p className={`text-xs font-medium ${deptColors.text}`}>{deptLabel} Dashboard</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/dashboard"}
              className={navLinkClasses}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{t(item.label)}</span>
              {item.path === "/dashboard/alerts" && unreadCount > 0 && (
                <span className="ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {unreadCount > 999 ? "999+" : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-gray-200 p-3">
          {/* Department badge */}
          <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 mb-1 ${deptColors.bg}`}>
            <span className={`h-2 w-2 rounded-full ${deptColors.accent}`} />
            <span className={`text-xs font-medium ${deptColors.text}`}>{roleLabel}</span>
          </div>
          {/* Connection status */}
          <div className="flex items-center gap-2 px-3 py-1.5 mb-1">
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-400"
              }`}
            />
            <span className="text-xs text-gray-400">
              {isConnected ? "Live" : "Reconnecting..."}
            </span>
          </div>
          <button
            onClick={toggleLanguage}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <span className="text-lg">{"\uD83C\uDF10"}</span>
            <span>{i18n.language === "ar" ? "English" : "\u0627\u0644\u0639\u0631\u0628\u064a\u0629"}</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <span className="text-lg">{"\uD83D\uDEAA"}</span>
            <span>{t("nav.logout")}</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6">
          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          {/* Dashboard title */}
          <div className="hidden lg:block">
            <h2 className="text-lg font-semibold text-gray-900">
              {deptLabel} Dashboard
            </h2>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Notification bell */}
            <button
              onClick={() => navigate("/dashboard/alerts")}
              className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                  {unreadCount > 999 ? "999+" : unreadCount}
                </span>
              )}
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg p-2 text-gray-700 hover:bg-gray-100"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${deptColors.bg} text-sm font-medium ${deptColors.text}`}>
                  {deptLabel.charAt(0).toUpperCase()}
                </div>
                <span className="hidden text-sm font-medium sm:block">
                  {roleLabel}
                </span>
              </button>
              {userMenuOpen && (
                <div className="absolute end-0 z-10 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate("/dashboard/status");
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t("nav.status")}
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    {t("nav.logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const DashboardLayout: React.FC = () => (
  <SocketProvider>
    <DashboardInner />
  </SocketProvider>
);

export default DashboardLayout;
