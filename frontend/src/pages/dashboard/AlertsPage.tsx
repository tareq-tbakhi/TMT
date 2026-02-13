/**
 * Alerts management page for hospital dashboard.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAlerts } from "../../services/api";
import { useAlertStore } from "../../store/alertStore";
import { getSeverityInfo, timeAgo, eventTypeLabels } from "../../utils/formatting";

export default function AlertsPage() {
  const { t, i18n } = useTranslation();
  const { alerts, setAlerts, setActiveAlert, acknowledgeAlert } = useAlertStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const data = await getAlerts({ limit: 50 });
        setAlerts(data);
      } catch (err) {
        console.error("Failed to fetch alerts:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAlerts();
  }, [setAlerts]);

  const locale = i18n.language;

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t("alerts.title")}
      </h1>

      {alerts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-gray-500">{t("alerts.noAlerts")}</p>
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
                className={`bg-white rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-shadow ${
                  alert.acknowledged
                    ? "border-gray-200 opacity-70"
                    : "border-l-4 border-l-red-500 border-gray-200"
                }`}
                onClick={() => setActiveAlert(alert)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${severity.bgColor} ${severity.color}`}
                      >
                        {severity.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {eventLabel}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900">
                      {alert.title}
                    </h3>
                    {alert.details && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {alert.details}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>{timeAgo(alert.created_at)}</span>
                      {alert.latitude && alert.longitude && (
                        <span>
                          {alert.latitude.toFixed(3)}, {alert.longitude.toFixed(3)}
                        </span>
                      )}
                      {alert.affected_patients_count > 0 && (
                        <span>
                          {alert.affected_patients_count} patients affected
                        </span>
                      )}
                    </div>
                  </div>
                  {!alert.acknowledged && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        acknowledgeAlert(alert.id);
                      }}
                      className="ms-4 px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors shrink-0"
                    >
                      {t("alerts.acknowledge")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
