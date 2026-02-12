/**
 * Analytics page with charts and statistics.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { getAnalyticsStats, type AnalyticsStats } from "../../services/api";

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#a855f7"];

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getAnalyticsStats();
        setStats(data);
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  const barData = [
    { name: "Patients", value: stats?.total_patients ?? 0 },
    { name: "Active Alerts", value: stats?.active_alerts ?? 0 },
    { name: "SOS Pending", value: stats?.sos_pending ?? 0 },
    { name: "SOS Today", value: stats?.sos_today ?? 0 },
    { name: "At Risk", value: stats?.patients_at_risk ?? 0 },
  ];

  const pieData = [
    {
      name: "Operational",
      value: stats?.hospitals_operational ?? 0,
    },
    {
      name: "Non-operational",
      value: (stats?.hospitals_total ?? 0) - (stats?.hospitals_operational ?? 0),
    },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t("nav.analytics")}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Overview</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Hospital Status</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {pieData.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
