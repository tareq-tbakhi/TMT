/**
 * Dashboard layout with sidebar navigation and content area.
 * Used for all hospital dashboard routes.
 */

import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";
import { useAlertStore } from "../../store/alertStore";
import { useOffline } from "../../hooks/useOffline";
import { useWebSocket } from "../../hooks/useWebSocket";

const navItems = [
  { to: "/dashboard", label: "nav.dashboard", icon: "grid" },
  { to: "/dashboard/alerts", label: "nav.alerts", icon: "bell" },
  { to: "/dashboard/analytics", label: "nav.analytics", icon: "chart" },
  { to: "/dashboard/patients", label: "nav.patients", icon: "users" },
  { to: "/dashboard/map", label: "nav.map", icon: "map" },
  { to: "/dashboard/status", label: "nav.status", icon: "hospital" },
];

const iconMap: Record<string, string> = {
  grid: "\u25a6",
  bell: "\u266a",
  chart: "\u2593",
  users: "\u263a",
  map: "\u2316",
  hospital: "\u271a",
};

export default function DashboardLayout() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const unreadCount = useAlertStore((s) => s.unreadCount);
  const { isOffline } = useOffline();
  const { isConnected } = useWebSocket();

  const toggleLanguage = () => {
    const newLang = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(newLang);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold">TMT</h1>
          <p className="text-xs text-gray-400">Triage & Monitor for Threats</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/dashboard"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              <span className="text-lg w-6 text-center">
                {iconMap[item.icon]}
              </span>
              <span>{t(item.label)}</span>
              {item.icon === "bell" && unreadCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                  {unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Status bar */}
        <div className="p-3 border-t border-gray-700 space-y-2">
          {/* Connection status */}
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-400" : "bg-red-400"
              }`}
            />
            <span className="text-gray-400">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>

          {/* Offline banner */}
          {isOffline && (
            <div className="bg-yellow-600 text-white text-xs px-2 py-1 rounded">
              {t("common.offline")}
            </div>
          )}

          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className="w-full text-xs text-gray-400 hover:text-white px-2 py-1 text-start"
          >
            {i18n.language === "ar" ? "English" : "\u0639\u0631\u0628\u064a"}
          </button>

          {/* User info & logout */}
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{user?.role}</span>
            <button
              onClick={logout}
              className="text-red-400 hover:text-red-300"
            >
              {t("nav.logout")}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
