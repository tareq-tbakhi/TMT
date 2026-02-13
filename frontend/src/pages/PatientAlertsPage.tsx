/**
 * Patient alerts page - shows alerts relevant to the patient.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWebSocket } from "../hooks/useWebSocket";
import { getSeverityInfo, timeAgo, eventTypeLabels } from "../utils/formatting";

interface PatientAlert {
  id: string;
  event_type: string;
  severity: string;
  title: string;
  details: string | null;
  created_at: string;
}

export default function PatientAlertsPage() {
  const { t, i18n } = useTranslation();
  const { lastEvent } = useWebSocket();
  const [alerts, setAlerts] = useState<PatientAlert[]>([]);

  // Listen for patient-specific alerts
  useEffect(() => {
    if (lastEvent?.type === "patient_alert") {
      const alert = lastEvent.data as PatientAlert;
      setAlerts((prev) => [alert, ...prev]);
    }
  }, [lastEvent]);

  const locale = i18n.language;

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t("alerts.title")}
        </h1>

        {alerts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <p className="text-gray-500">{t("alerts.noAlerts")}</p>
            <p className="text-sm text-gray-400 mt-2">
              You will be notified of any alerts in your area.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const severity = getSeverityInfo(alert.severity, locale);
              const eventLabel =
                eventTypeLabels[alert.event_type]?.[
                  locale === "ar" ? "ar" : "en"
                ] ?? alert.event_type;

              return (
                <div
                  key={alert.id}
                  className="bg-white rounded-xl shadow-sm border border-l-4 border-l-red-500 border-gray-200 p-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${severity.bgColor} ${severity.color}`}
                    >
                      {severity.label}
                    </span>
                    <span className="text-xs text-gray-500">{eventLabel}</span>
                    <span className="ms-auto text-xs text-gray-400">
                      {timeAgo(alert.created_at)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900">{alert.title}</h3>
                  {alert.details && (
                    <p className="text-sm text-gray-600 mt-1">
                      {alert.details}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
