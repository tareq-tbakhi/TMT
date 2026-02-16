/**
 * Dashboard home page - overview with key stats.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAnalyticsStats, type AnalyticsStats } from "../../services/api";
import { useAlertStore } from "../../store/alertStore";

export default function DashboardHome() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const unreadCount = useAlertStore((s) => s.unreadCount);

  useEffect(() => {
    async function fetchStats() {
      try {
        const data = await getAnalyticsStats();
        setStats(data);
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  const cards = [
    {
      label: t("dashboard.totalPatients"),
      value: stats?.total_patients ?? 0,
      color: "bg-blue-500",
    },
    {
      label: t("dashboard.activeAlerts"),
      value: stats?.active_alerts ?? unreadCount,
      color: "bg-red-500",
    },
    {
      label: t("dashboard.hospitals"),
      value: `${stats?.hospitals_operational ?? stats?.operational_hospitals ?? 0}/${stats?.hospitals_total ?? stats?.total_hospitals ?? 0}`,
      color: "bg-green-500",
    },
    {
      label: t("dashboard.sosRequests"),
      value: stats?.sos_pending ?? stats?.pending_sos ?? 0,
      color: "bg-orange-500",
    },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {t("dashboard.title")}
      </h1>
      <p className="text-gray-500 mb-8">{t("dashboard.welcome")}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 ${card.color} rounded-lg opacity-80`} />
              <div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-sm text-gray-500">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent activity placeholder */}
      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Activity
        </h2>
        <p className="text-gray-500 text-sm">
          Real-time events and alerts will appear here.
        </p>
      </div>
    </div>
  );
}
