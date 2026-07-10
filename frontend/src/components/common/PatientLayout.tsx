/**
 * PatientLayout — mobile-first shell for the citizen app.
 *
 * Accessibility is the top priority here: this layout serves elderly
 * users, children, and people using screen readers or large text.
 *  - Bottom tab bar with large (≥56px) touch targets and clear labels
 *  - The SOS tab is a raised, always-visible emergency button
 *  - Settings panel: text size, contrast, motion, theme, language
 */

import { useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  ClipboardList,
  LogOut,
  Newspaper,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useAccent } from "../../contexts/PreferencesContext";
import { SettingsPanel } from "../ui";

interface Tab {
  to: string;
  labelKey: string;
  icon?: LucideIcon;
  sos?: boolean;
}

/** SOS is placed in the center so it is always under the thumb. */
const tabs: Tab[] = [
  { to: "/news", labelKey: "nav.news", icon: Newspaper },
  { to: "/patient-alerts", labelKey: "nav.alerts", icon: Bell },
  { to: "/sos", labelKey: "nav.sos", sos: true },
  { to: "/health-records", labelKey: "nav.healthRecords", icon: ClipboardList },
  { to: "/profile", labelKey: "nav.profile", icon: UserRound },
];

export default function PatientLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useAccent("patient");

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <a href="#main-content" className="skip-link">
        {t("a11y.skipToContent")}
      </a>

      {/* Top header */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-edge bg-surface px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-black text-on-accent"
          >
            T
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight text-ink">TMT</h1>
            {user && (
              <p className="hidden truncate text-xs text-ink-muted sm:block">
                {user.role === "patient" ? t("nav.patient") : user.role}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={t("settings.open")}
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus"
          >
            <Settings aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={logout}
            aria-label={t("nav.logout")}
            className="flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft focus-visible:outline-3 focus-visible:outline-focus"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">{t("nav.logout")}</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      {/* Bottom tab navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-edge bg-surface"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label={t("nav.patient")}
      >
        <div className="mx-auto flex h-[4.5rem] max-w-lg items-stretch justify-around">
          {tabs.map((tab) => {
            const isActive =
              location.pathname === tab.to ||
              location.pathname.startsWith(tab.to + "/");

            if (tab.sos) {
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={t(tab.labelKey)}
                  className="relative flex min-w-0 flex-1 flex-col items-center justify-end pb-1.5 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 rounded-md"
                >
                  {/* Raised emergency button */}
                  <span
                    aria-hidden="true"
                    className={`absolute -top-6 flex h-16 w-16 items-center justify-center rounded-full border-4 border-canvas text-sm font-black tracking-wide text-on-sos shadow-2 transition-transform ${
                      isActive ? "bg-sos scale-105" : "bg-sos hover:bg-sos-hover"
                    }`}
                  >
                    SOS
                  </span>
                  <span
                    className={`mt-auto text-xs ${
                      isActive ? "font-bold text-sos" : "font-semibold text-ink-muted"
                    }`}
                  >
                    {t(tab.labelKey)}
                  </span>
                </NavLink>
              );
            }

            const Icon = tab.icon!;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                  isActive ? "text-accent" : "text-ink-faint hover:text-ink-muted"
                }`}
              >
                <span className="relative">
                  <Icon
                    aria-hidden="true"
                    className="h-6 w-6"
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-1.5 start-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent rtl:translate-x-1/2"
                    />
                  )}
                </span>
                <span
                  className={`max-w-full truncate text-xs ${
                    isActive ? "font-bold" : "font-semibold"
                  }`}
                >
                  {t(tab.labelKey)}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
