/**
 * SettingsPanel — appearance, accessibility & language settings dialog.
 * Available from every layout so elderly / low-vision users can adapt
 * the app to their needs anywhere.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import {
  Contrast,
  Globe,
  Monitor,
  Moon,
  PauseCircle,
  Sun,
} from "lucide-react";
import { Modal } from "./Modal";
import {
  usePreferences,
  type FontScale,
  type ThemeSetting,
} from "../../contexts/PreferencesContext";

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const FONT_STEPS: { value: FontScale; sample: string }[] = [
  { value: "md", sample: "A" },
  { value: "lg", sample: "A" },
  { value: "xl", sample: "A" },
  { value: "xxl", sample: "A" },
];

const FONT_SAMPLE_SIZE: Record<FontScale, string> = {
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  xxl: "text-2xl",
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  open,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const {
    theme,
    fontScale,
    highContrast,
    reducedMotion,
    setTheme,
    setFontScale,
    setHighContrast,
    setReducedMotion,
  } = usePreferences();

  const THEME_OPTIONS: { value: ThemeSetting; label: string; icon: React.ReactNode }[] = [
    { value: "system", label: t("settings.themeSystem"), icon: <Monitor aria-hidden="true" /> },
    { value: "light", label: t("settings.themeLight"), icon: <Sun aria-hidden="true" /> },
    { value: "dark", label: t("settings.themeDark"), icon: <Moon aria-hidden="true" /> },
  ];

  const switchLanguage = (lang: "en" | "ar") => {
    i18n.changeLanguage(lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  };

  return (
    <Modal open={open} onClose={onClose} title={t("settings.title")} size="sm">
      <div className="flex flex-col gap-6">
        {/* Theme */}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">
            {t("settings.theme")}
          </legend>
          <div role="radiogroup" aria-label={t("settings.theme")} className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={theme === opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-md border px-2 py-2.5 text-sm font-medium transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 [&_svg]:h-5 [&_svg]:w-5 ${
                  theme === opt.value
                    ? "border-accent bg-accent-soft text-on-accent-soft"
                    : "border-edge bg-surface text-ink-muted hover:bg-surface-2"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Text size */}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">
            {t("settings.textSize")}
          </legend>
          <div role="radiogroup" aria-label={t("settings.textSize")} className="grid grid-cols-4 gap-2">
            {FONT_STEPS.map((step, i) => (
              <button
                key={step.value}
                type="button"
                role="radio"
                aria-checked={fontScale === step.value}
                aria-label={`${t("settings.textSize")} ${i + 1}/4`}
                onClick={() => setFontScale(step.value)}
                className={`flex min-h-14 items-center justify-center rounded-md border font-bold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${FONT_SAMPLE_SIZE[step.value]} ${
                  fontScale === step.value
                    ? "border-accent bg-accent-soft text-on-accent-soft"
                    : "border-edge bg-surface text-ink-muted hover:bg-surface-2"
                }`}
              >
                {step.sample}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Toggles */}
        <div className="flex flex-col gap-3">
          <ToggleRow
            icon={<Contrast aria-hidden="true" />}
            label={t("settings.highContrast")}
            hint={t("settings.highContrastHint")}
            checked={highContrast}
            onChange={setHighContrast}
          />
          <ToggleRow
            icon={<PauseCircle aria-hidden="true" />}
            label={t("settings.reducedMotion")}
            hint={t("settings.reducedMotionHint")}
            checked={reducedMotion}
            onChange={setReducedMotion}
          />
        </div>

        {/* Language */}
        <fieldset>
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Globe aria-hidden="true" className="h-4 w-4" />
            {t("settings.language")}
          </legend>
          <div role="radiogroup" aria-label={t("settings.language")} className="grid grid-cols-2 gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={i18n.language !== "ar"}
              onClick={() => switchLanguage("en")}
              className={`min-h-12 rounded-md border px-3 text-base font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                i18n.language !== "ar"
                  ? "border-accent bg-accent-soft text-on-accent-soft"
                  : "border-edge bg-surface text-ink-muted hover:bg-surface-2"
              }`}
            >
              English
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={i18n.language === "ar"}
              onClick={() => switchLanguage("ar")}
              lang="ar"
              className={`min-h-12 rounded-md border px-3 text-base font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                i18n.language === "ar"
                  ? "border-accent bg-accent-soft text-on-accent-soft"
                  : "border-edge bg-surface text-ink-muted hover:bg-surface-2"
              }`}
            >
              العربية
            </button>
          </div>
        </fieldset>
      </div>
    </Modal>
  );
};

const ToggleRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ icon, label, hint, checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-md border border-edge bg-surface px-3.5 py-2.5 text-start transition-colors hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
  >
    <span className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="inline-flex shrink-0 text-ink-muted [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold text-ink">{label}</span>
        <span className="block text-sm text-ink-muted">{hint}</span>
      </span>
    </span>
    <span
      aria-hidden="true"
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
        checked ? "border-accent bg-accent" : "border-edge-strong bg-surface-3"
      }`}
    >
      <span
        className={`absolute h-5 w-5 rounded-full bg-white shadow-1 transition-all ${
          checked ? "start-6" : "start-1"
        }`}
      />
    </span>
  </button>
);

export default SettingsPanel;
