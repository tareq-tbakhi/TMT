/**
 * Patient layout with bottom tab navigation (mobile-first).
 * Used for all patient-facing routes: SOS, Alerts, Health Records, Profile.
 */

import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";

const tabs = [
  { to: "/sos", labelKey: "nav.sos", icon: "sos" },
  { to: "/news", labelKey: "nav.news", icon: "news" },
  { to: "/patient-alerts", labelKey: "nav.alerts", icon: "bell" },
  { to: "/health-records", labelKey: "nav.healthRecords", icon: "clipboard" },
  { to: "/profile", labelKey: "nav.profile", icon: "user" },
] as const;

/** Inline SVG icons for each tab. */
function TabIcon({ icon, active }: { icon: string; active: boolean }) {
  const color = active ? "currentColor" : "currentColor";

  switch (icon) {
    case "sos":
      return (
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black tracking-tight ${
            active
              ? "bg-red-600 text-white"
              : "bg-red-100 text-red-600 border-2 border-red-300"
          }`}
          aria-hidden="true"
        >
          SOS
        </div>
      );

    case "bell":
      return (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );

    case "clipboard":
      return (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          {/* Medical cross on clipboard */}
          <path d="M12 11v6M9 14h6" />
        </svg>
      );

    case "news":
      return (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1" />
          <path d="M21 12a2 2 0 00-2-2h-2v8a2 2 0 002 2 2 2 0 002-2v-6z" />
          <path d="M7 8h6M7 12h6M7 16h4" />
        </svg>
      );

    case "user":
      return (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );

    default:
      return null;
  }
}

export default function PatientLayout() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();

  const toggleLanguage = () => {
    const newLang = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(newLang);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">TMT</h1>
          {user && (
            <span className="text-sm text-gray-500 hidden sm:inline">
              {user.role === "patient" ? t("nav.patient") : user.role}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 transition-colors"
            aria-label={t("common.language")}
          >
            {i18n.language === "ar" ? "EN" : "\u0639\u0631\u0628\u064a"}
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="text-sm text-red-600 hover:text-red-800 transition-colors"
          >
            {t("nav.logout")}
          </button>
        </div>
      </header>

      {/* Main content - scrollable area between header and bottom nav */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom tab navigation */}
      <nav
        className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        role="navigation"
        aria-label={t("nav.patient")}
      >
        <div className="flex items-stretch justify-around h-16 max-w-lg mx-auto">
          {tabs.map((tab) => {
            const isActive =
              location.pathname === tab.to ||
              location.pathname.startsWith(tab.to + "/");

            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={() =>
                  `flex flex-col items-center justify-center flex-1 min-w-0 py-2 px-1 transition-colors ${
                    tab.icon === "sos" && isActive
                      ? "text-red-600"
                      : tab.icon === "sos"
                        ? "text-red-400 hover:text-red-600"
                        : isActive
                          ? "text-blue-600"
                          : "text-gray-400 hover:text-gray-600"
                  }`
                }
                aria-current={isActive ? "page" : undefined}
              >
                <TabIcon icon={tab.icon} active={isActive} />
                <span
                  className={`text-xs mt-1 truncate ${
                    isActive ? "font-semibold" : "font-medium"
                  }`}
                >
                  {t(tab.labelKey)}
                </span>

                {/* Active indicator dot */}
                {isActive && (
                  <span
                    className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                      tab.icon === "sos" ? "bg-red-600" : "bg-blue-600"
                    }`}
                  />
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
