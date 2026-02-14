import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import StatsCard from "../../components/common/StatsCard";
import StatusBadge from "../../components/common/StatusBadge";
import { useAlertStore } from "../../store/alertStore";
import { useAuthStore, ROLE_TO_DEPARTMENT, DEPARTMENT_LABELS, type DepartmentType } from "../../store/authStore";
import { useSocketEvent } from "../../contexts/SocketContext";
import { timeAgo } from "../../utils/formatting";
import type { AnalyticsStats, Alert } from "../../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Fix default marker icon for Leaflet in bundled environments
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const dept: DepartmentType = user?.facilityType ?? ROLE_TO_DEPARTMENT[user?.role ?? ""] ?? "hospital";
  const deptLabel = DEPARTMENT_LABELS[dept] ?? "Hospital";
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setAlerts } = useAlertStore();

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem("tmt-token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/analytics/stats`, { headers: getHeaders() });
      if (res.status === 401) {
        localStorage.removeItem("tmt-token");
        localStorage.removeItem("tmt-user");
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as AnalyticsStats;
        setStats(data);
      }
    } catch {
      // Silent fail for background refresh
    }
  }, [getHeaders]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/alerts?limit=5`, { headers: getHeaders() });
      if (res.status === 401) return;
      if (res.ok) {
        const wrapper = await res.json();
        setRecentAlerts(wrapper.alerts ?? []);
        setAlerts(wrapper.alerts ?? [], wrapper.total, wrapper.stats);
      }
    } catch {
      // Silent fail
    }
  }, [getHeaders, setAlerts]);

  // Initial data fetch
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchStats(), fetchAlerts()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fetchStats, fetchAlerts]);

  // Real-time updates via shared WebSocket
  useSocketEvent<Alert>("new_alert", (alert) => {
    setRecentAlerts((prev) => [alert, ...prev].slice(0, 5));
    fetchStats();
  });

  useSocketEvent("new_sos", () => {
    fetchStats();
  });

  useSocketEvent("hospital_status", () => {
    fetchStats();
  });

  useSocketEvent("sos_resolved", () => {
    fetchStats();
    fetchAlerts();
  });

  useSocketEvent("patient_location", () => {
    // Stats may change (e.g. patients_at_risk) when patients move
    fetchStats();
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-gray-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  // Default map center (Gaza)
  const mapCenter: [number, number] = [31.5, 34.47];

  // Build marker positions from recent alerts that have coordinates
  const alertMarkers = recentAlerts.filter(
    (a) => a.latitude != null && a.longitude != null
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t("dashboard.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {t("dashboard.welcome")}
        </p>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title={dept === "hospital" ? t("dashboard.totalPatients") : dept === "police" ? "Active Cases" : "People Affected"}
          value={stats?.total_patients ?? 0}
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          color="blue"
          trend="neutral"
          trendValue={`${stats?.patients_at_risk ?? 0} at risk`}
        />
        <StatsCard
          title={t("dashboard.activeAlerts")}
          value={stats?.active_alerts ?? 0}
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          }
          color="red"
        />
        <StatsCard
          title={dept === "hospital" ? t("dashboard.hospitals") : dept === "police" ? "Stations" : "Centers"}
          value={`${stats?.operational_hospitals ?? 0}/${stats?.total_hospitals ?? 0}`}
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
          color="green"
        />
        <StatsCard
          title={t("dashboard.sosRequests")}
          value={stats?.pending_sos ?? 0}
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          }
          color="orange"
          trend={stats?.resolved_sos_today ? "up" : "neutral"}
          trendValue={`${stats?.resolved_sos_today ?? 0} today`}
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Mini Map */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Recent Activity Map
            </h3>
          </div>
          <div className="h-80">
            <MapContainer
              center={mapCenter}
              zoom={10}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {alertMarkers.map((alert) => (
                <Marker
                  key={alert.id}
                  position={[alert.latitude!, alert.longitude!]}
                >
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold">{alert.title}</p>
                      <p className="text-gray-500">{alert.event_type}</p>
                      <p className="text-gray-400">{timeAgo(alert.created_at)}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Recent Alerts
            </h3>
            <a href="/dashboard/alerts" className="text-xs text-blue-600 hover:text-blue-800">
              View all
            </a>
          </div>
          <div className="divide-y divide-gray-100">
            {recentAlerts.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                {t("alerts.noAlerts")}
              </div>
            ) : (
              recentAlerts.slice(0, 5).map((alert) => {
                const sevBorder =
                  alert.severity === "critical" ? "border-s-red-600" :
                  alert.severity === "high" ? "border-s-orange-500" :
                  alert.severity === "medium" ? "border-s-yellow-500" :
                  "border-s-blue-400";
                const meta = (alert as unknown as { metadata_?: Record<string, unknown>; metadata?: Record<string, unknown> });
                const alertMeta = (meta.metadata_ ?? meta.metadata) as Record<string, unknown> | undefined;
                const pInfo = alertMeta?.patient_info as { name?: string; phone?: string; blood_type?: string } | undefined;
                const pStatus = alertMeta?.patient_status as string | undefined;
                const priorityScore = (alertMeta?.priority_score as number) ?? 0;

                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 border-s-3 ${sevBorder} px-4 py-3 hover:bg-gray-50 transition-colors`}
                  >
                    <div className="mt-0.5 shrink-0">
                      <StatusBadge severity={alert.severity} size="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate flex-1">
                          {alert.title}
                        </p>
                        {priorityScore > 0 && (
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            priorityScore >= 80 ? "bg-red-100 text-red-700" :
                            priorityScore >= 60 ? "bg-orange-100 text-orange-700" :
                            "bg-gray-100 text-gray-500"
                          }`}>
                            P{priorityScore}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {alert.event_type} &middot; {timeAgo(alert.created_at)}
                        </span>
                        {pStatus && (
                          <span className={`text-[10px] font-medium rounded px-1 py-0.5 ${
                            pStatus === "trapped" ? "bg-red-100 text-red-700" :
                            pStatus === "injured" ? "bg-red-50 text-red-600" :
                            pStatus === "evacuate" ? "bg-orange-50 text-orange-600" :
                            "bg-green-50 text-green-600"
                          }`}>
                            {pStatus}
                          </span>
                        )}
                      </div>
                      {pInfo?.name && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {pInfo.name}
                          {pInfo.phone && <span className="text-gray-400 ms-1" dir="ltr">{pInfo.phone}</span>}
                          {pInfo.blood_type && <span className="ms-1 text-red-600 font-medium">{pInfo.blood_type}</span>}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Department Status Indicator */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          {deptLabel} Status Overview
        </h3>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <StatusBadge status="operational" size="sm" />
            <span className="text-sm text-gray-600">
              {stats?.operational_hospitals ?? 0} operational facilities
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              SOS pending: {stats?.pending_sos ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              Patients at risk: {stats?.patients_at_risk ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
