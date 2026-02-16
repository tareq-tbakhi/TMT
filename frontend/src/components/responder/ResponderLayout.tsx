/**
 * Base layout for all Field Responder views
 * Mobile-first with bottom tab navigation
 * Minimal UI optimized for emergency use
 */

import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore, RESPONDER_COLORS, RESPONDER_LABELS, type ResponderType } from "../../store/authStore";
import { useResponderStore } from "../../store/responderStore";

interface ResponderLayoutProps {
  responderType: ResponderType;
  tabs: Array<{
    path: string;
    label: string;
    icon: "case" | "map" | "equipment" | "history";
  }>;
}

// ─── Tab Icons ───────────────────────────────────────────────────

function TabIcon({ icon, active, color }: { icon: string; active: boolean; color: string }) {
  const strokeColor = active ? color : "currentColor";

  switch (icon) {
    case "case":
      return (
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      );

    case "map":
      return (
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      );

    case "equipment":
      return (
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );

    case "history":
      return (
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );

    default:
      return null;
  }
}

// ─── Status Indicator ────────────────────────────────────────────

function ConnectionStatus({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${
          isConnected ? "bg-green-500" : "bg-red-500 animate-pulse"
        }`}
      />
      <span className="text-xs text-gray-500">
        {isConnected ? "Live" : "Offline"}
      </span>
    </div>
  );
}

// ─── Layout Component ────────────────────────────────────────────

export default function ResponderLayout({ responderType, tabs }: ResponderLayoutProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthStore();
  const { activeCase, isConnected, isOnDuty } = useResponderStore();

  const colors = RESPONDER_COLORS[responderType];
  const label = RESPONDER_LABELS[responderType];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(newLang);
  };

  // Get active color for icons
  const activeIconColor = colors.text.replace("text-", "").replace("-700", "-600").replace("-800", "-700");
  const iconColorClass = `#${activeIconColor === "red-600" ? "dc2626" : activeIconColor === "indigo-600" ? "4f46e5" : activeIconColor === "orange-600" ? "ea580c" : "b91c1c"}`;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top Header - Compact */}
      <header className={`bg-gradient-to-r ${colors.gradient} px-4 py-3 flex items-center justify-between shrink-0 shadow-lg`}>
        <div className="flex items-center gap-3">
          {/* Role Badge */}
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg">{label}</span>
            {activeCase && (
              <span className="bg-white/20 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2 py-1">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-400" : "bg-red-400 animate-pulse"
              }`}
            />
            <span className="text-white/90 text-xs">
              {isConnected ? "Live" : "Offline"}
            </span>
          </div>

          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            className="text-white/90 text-sm font-medium hover:text-white transition-colors"
          >
            {i18n.language === "ar" ? "EN" : "AR"}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="bg-white/10 hover:bg-white/20 text-white rounded-lg p-2 transition-colors"
            aria-label="Logout"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      {/* Bottom Tab Navigation - Large Touch Targets */}
      <nav
        className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50"
        role="navigation"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-stretch justify-around max-w-lg mx-auto" style={{ height: "72px" }}>
          {tabs.map((tab) => {
            const fullPath = `/${responderType}${tab.path}`;
            const isActive =
              location.pathname === fullPath ||
              (tab.path === "" && location.pathname === `/${responderType}`);

            return (
              <NavLink
                key={tab.path}
                to={fullPath}
                className={`flex flex-col items-center justify-center flex-1 min-w-0 px-2 transition-all ${
                  isActive
                    ? colors.text
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-colors ${isActive ? colors.bg : ""}`}>
                  <TabIcon
                    icon={tab.icon}
                    active={isActive}
                    color={isActive ? iconColorClass : "currentColor"}
                  />
                </div>
                <span
                  className={`text-[11px] mt-0.5 ${
                    isActive ? "font-semibold" : "font-medium"
                  }`}
                >
                  {tab.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
