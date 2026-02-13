/**
 * Formatting utilities for dates, severity labels, status labels, etc.
 */

/**
 * Formats a date string or Date object into a localized, human-readable string.
 */
export function formatDate(
  date: string | Date,
  locale: string = "en"
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Returns a relative time string like "5 minutes ago".
 */
export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Severity level labels and colors.
 */
export const severityConfig: Record<
  string,
  { label: string; labelAr: string; color: string; bgColor: string }
> = {
  low: {
    label: "Low",
    labelAr: "\u0645\u0646\u062e\u0641\u0636",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
  },
  medium: {
    label: "Medium",
    labelAr: "\u0645\u062a\u0648\u0633\u0637",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
  },
  high: {
    label: "High",
    labelAr: "\u0645\u0631\u062a\u0641\u0639",
    color: "text-orange-700",
    bgColor: "bg-orange-100",
  },
  critical: {
    label: "Critical",
    labelAr: "\u062d\u0631\u062c",
    color: "text-red-700",
    bgColor: "bg-red-100",
  },
};

/**
 * Returns severity display info for a given severity level.
 */
export function getSeverityInfo(
  severity: string | number,
  locale: string = "en"
) {
  // Handle numeric severity (1-5) by mapping to string labels
  let key: string;
  if (typeof severity === "number") {
    if (severity <= 1) key = "low";
    else if (severity <= 2) key = "medium";
    else if (severity <= 3) key = "high";
    else key = "critical";
  } else {
    key = severity.toLowerCase();
  }

  const config = severityConfig[key] ?? severityConfig["medium"];
  return {
    label: locale === "ar" ? config.labelAr : config.label,
    color: config.color,
    bgColor: config.bgColor,
  };
}

/**
 * Hospital status labels.
 */
export const hospitalStatusConfig: Record<
  string,
  { label: string; labelAr: string; color: string }
> = {
  operational: {
    label: "Operational",
    labelAr: "\u0639\u0627\u0645\u0644",
    color: "text-green-600",
  },
  limited: {
    label: "Limited",
    labelAr: "\u0645\u062d\u062f\u0648\u062f",
    color: "text-yellow-600",
  },
  full: {
    label: "Full",
    labelAr: "\u0645\u0645\u062a\u0644\u0626",
    color: "text-red-600",
  },
  destroyed: {
    label: "Destroyed",
    labelAr: "\u0645\u062f\u0645\u0631",
    color: "text-gray-600",
  },
};

/**
 * Returns hospital status display info.
 */
export function getHospitalStatusInfo(status: string, locale: string = "en") {
  const config = hospitalStatusConfig[status] ?? hospitalStatusConfig["operational"];
  return {
    label: locale === "ar" ? config.labelAr : config.label,
    color: config.color,
  };
}

/**
 * SOS patient status labels.
 */
export const patientStatusConfig: Record<
  string,
  { label: string; labelAr: string; short: string }
> = {
  safe: {
    label: "Safe",
    labelAr: "\u0622\u0645\u0646",
    short: "S",
  },
  injured: {
    label: "Injured",
    labelAr: "\u0645\u0635\u0627\u0628",
    short: "I",
  },
  trapped: {
    label: "Trapped",
    labelAr: "\u0645\u062d\u0627\u0635\u0631",
    short: "T",
  },
  evacuate: {
    label: "Needs Evacuation",
    labelAr: "\u064a\u062d\u062a\u0627\u062c \u0625\u062e\u0644\u0627\u0621",
    short: "E",
  },
};

/**
 * Returns the short code for a patient status (used in SMS).
 */
export function getPatientStatusShort(status: string): string {
  return patientStatusConfig[status]?.short ?? "I";
}

/**
 * Event type labels for display.
 */
export const eventTypeLabels: Record<string, { en: string; ar: string }> = {
  flood: { en: "Flood", ar: "\u0641\u064a\u0636\u0627\u0646" },
  bombing: { en: "Bombing", ar: "\u0642\u0635\u0641" },
  earthquake: { en: "Earthquake", ar: "\u0632\u0644\u0632\u0627\u0644" },
  fire: { en: "Fire", ar: "\u062d\u0631\u064a\u0642" },
  building_collapse: { en: "Building Collapse", ar: "\u0627\u0646\u0647\u064a\u0627\u0631 \u0645\u0628\u0646\u0649" },
  shooting: { en: "Shooting", ar: "\u0625\u0637\u0644\u0627\u0642 \u0646\u0627\u0631" },
  chemical: { en: "Chemical", ar: "\u0643\u064a\u0645\u064a\u0627\u0626\u064a" },
  medical_emergency: { en: "Medical Emergency", ar: "\u0637\u0648\u0627\u0631\u0626 \u0637\u0628\u064a\u0629" },
  infrastructure: { en: "Infrastructure", ar: "\u0628\u0646\u064a\u0629 \u062a\u062d\u062a\u064a\u0629" },
  other: { en: "Other", ar: "\u0623\u062e\u0631\u0649" },
};
