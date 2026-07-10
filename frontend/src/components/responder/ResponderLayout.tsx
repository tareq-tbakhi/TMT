/**
 * Base layout for all Field Responder views.
 * Mobile-first shell: compact header (role identity + connection state as
 * icon + text, never color alone) and a bottom tab bar with >=56px targets.
 * Token-driven so it adapts to light / dark / high-contrast and the
 * role accent set by each responder layout via useAccent().
 */

import { useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Ambulance,
  ClipboardList,
  Flame,
  History,
  LifeBuoy,
  LogOut,
  Map,
  Settings,
  Siren,
  Wifi,
  WifiOff,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore, RESPONDER_LABELS, type ResponderType } from "../../store/authStore";
import { useResponderStore } from "../../store/responderStore";
import { Badge, SettingsPanel } from "../ui";

interface ResponderLayoutProps {
  responderType: ResponderType;
  tabs: Array<{
    path: string;
    label: string;
    icon: "case" | "map" | "equipment" | "history";
  }>;
}

/** Tab icon keys -> lucide components (design system: lucide only). */
const TAB_ICONS: Record<ResponderLayoutProps["tabs"][number]["icon"], LucideIcon> = {
  case: ClipboardList,
  map: Map,
  equipment: Wrench,
  history: History,
};

/** Role identity icon shown in the header chip. */
const ROLE_ICONS: Record<ResponderType, LucideIcon> = {
  ambulance: Ambulance,
  police: Siren,
  civil_defense: LifeBuoy,
  firefighter: Flame,
};

// ─── Layout Component ────────────────────────────────────────────

export default function ResponderLayout({ responderType, tabs }: ResponderLayoutProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthStore();
  const { activeCase, isConnected, isOnDuty } = useResponderStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const label = RESPONDER_LABELS[responderType];
  const RoleIcon = ROLE_ICONS[responderType];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(newLang);
  };

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <a href="#main-content" className="skip-link">
        {t("a11y.skipToContent")}
      </a>

      {/* Top header: role identity + connection state */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-edge bg-surface px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent"
          >
            <RoleIcon className="h-5 w-5" />
          </span>
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-lg font-bold leading-tight text-ink">{label}</h1>
            {activeCase && (
              <Badge tone="danger" solid size="sm" dot>
                Active
              </Badge>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Connection state: icon + text, never color alone */}
          <span
            role="status"
            className={`me-1 inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ${
              isConnected
                ? "bg-success-soft text-on-success-soft"
                : "bg-danger-soft text-on-danger-soft"
            }`}
          >
            {isConnected ? (
              <Wifi aria-hidden="true" className="h-4 w-4" />
            ) : (
              <WifiOff aria-hidden="true" className="h-4 w-4 animate-pulse" />
            )}
            {isConnected ? "Live" : "Offline"}
          </span>

          {/* Language toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            aria-label="Change language"
            className="flex h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm font-bold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus"
          >
            {i18n.language === "ar" ? "EN" : "AR"}
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

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Logout"
            className="flex h-11 w-11 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger-soft focus-visible:outline-3 focus-visible:outline-focus"
          >
            <LogOut aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      {/* Bottom tab navigation — large touch targets */}
      <nav
        role="navigation"
        aria-label={label}
        className="fixed bottom-0 inset-x-0 z-50 border-t border-edge bg-surface"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex h-[4.5rem] max-w-lg items-stretch justify-around">
          {tabs.map((tab) => {
            const fullPath = `/${responderType}${tab.path}`;
            const isActive =
              location.pathname === fullPath ||
              (tab.path === "" && location.pathname === `/${responderType}`);
            const Icon = TAB_ICONS[tab.icon];

            return (
              <NavLink
                key={tab.path}
                to={fullPath}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                  isActive ? "text-accent" : "text-ink-muted hover:text-ink"
                }`}
              >
                <span className="relative">
                  <Icon
                    aria-hidden="true"
                    className="h-7 w-7"
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-1.5 start-1/2 h-1 w-4 -translate-x-1/2 rounded-full bg-accent rtl:translate-x-1/2"
                    />
                  )}
                </span>
                <span
                  className={`max-w-full truncate text-xs ${
                    isActive ? "font-bold" : "font-semibold"
                  }`}
                >
                  {tab.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Mounted only while open so provider-less unit tests stay green */}
      {settingsOpen && (
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
