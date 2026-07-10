import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import {
  Activity,
  Bell,
  Building2,
  LayoutDashboard,
  Map as MapIcon,
  Siren,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LoadingState,
  PageHeader,
  StatCard,
  statusTone,
  Button,
} from "../../components/ui";
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchStats(), fetchAlerts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [fetchStats, fetchAlerts]);

  // Initial data fetch
  useEffect(() => {
    load();
  }, [load]);

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
      <>
        <PageHeader
          icon={<LayoutDashboard />}
          title={t("dashboard.title")}
          description={t("dashboard.welcome")}
        />
        <LoadingState label={t("common.loading")} />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader
          icon={<LayoutDashboard />}
          title={t("dashboard.title")}
          description={t("dashboard.welcome")}
        />
        <Card className="border-danger bg-danger-soft">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <TriangleAlert aria-hidden="true" className="h-8 w-8 text-danger" />
            <p className="text-base font-semibold text-on-danger-soft">{error}</p>
            <Button variant="secondary" onClick={load}>
              Retry
            </Button>
          </div>
        </Card>
      </>
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
      <PageHeader
        icon={<LayoutDashboard />}
        title={t("dashboard.title")}
        description={t("dashboard.welcome")}
      />

      {/* Stats Cards Row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={dept === "hospital" ? t("dashboard.totalPatients") : dept === "police" ? "Active Cases" : "People Affected"}
          value={stats?.total_patients ?? 0}
          icon={<Users />}
          tone="accent"
          hint={`${stats?.patients_at_risk ?? 0} at risk`}
        />
        <StatCard
          label={t("dashboard.activeAlerts")}
          value={stats?.active_alerts ?? 0}
          icon={<TriangleAlert />}
          tone="danger"
        />
        <StatCard
          label={dept === "hospital" ? t("dashboard.hospitals") : dept === "police" ? "Stations" : "Centers"}
          value={`${stats?.operational_hospitals ?? 0}/${stats?.total_hospitals ?? 0}`}
          icon={<Building2 />}
          tone="success"
          hint="operational"
        />
        <StatCard
          label={t("dashboard.sosRequests")}
          value={stats?.pending_sos ?? 0}
          icon={<Siren />}
          tone="warning"
          trend={
            stats?.created_sos_today
              ? { value: `${stats.created_sos_today} today`, direction: "up", positive: false }
              : undefined
          }
          hint={stats?.created_sos_today ? undefined : "0 today"}
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Mini Map */}
        <Card flush className="overflow-hidden lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-edge px-5 py-3">
            <MapIcon aria-hidden="true" className="h-4 w-4 text-ink-muted" />
            <h3 className="text-sm font-semibold text-ink">
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
                      <p className="font-semibold text-ink">{alert.title}</p>
                      <p className="text-ink-muted">{alert.event_type}</p>
                      <p className="text-ink-faint">{timeAgo(alert.created_at)}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </Card>

        {/* Recent Alerts */}
        <Card flush>
          <div className="flex items-center justify-between border-b border-edge px-5 py-3">
            <div className="flex items-center gap-2">
              <Bell aria-hidden="true" className="h-4 w-4 text-ink-muted" />
              <h3 className="text-sm font-semibold text-ink">
                Recent Alerts
              </h3>
            </div>
            <a
              href="/dashboard/alerts"
              className="rounded-sm text-xs font-semibold text-link underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              View all
            </a>
          </div>
          <div className="divide-y divide-edge">
            {recentAlerts.length === 0 ? (
              <div className="px-5 py-4">
                <EmptyState icon={<Bell />} title={t("alerts.noAlerts")} className="border-0 bg-transparent px-0 py-8" />
              </div>
            ) : (
              recentAlerts.slice(0, 5).map((alert) => {
                const sevBorder =
                  alert.severity === "critical" ? "border-s-sev-critical" :
                  alert.severity === "high" ? "border-s-sev-high" :
                  alert.severity === "medium" ? "border-s-sev-medium" :
                  "border-s-sev-low";
                const meta = (alert as unknown as { metadata_?: Record<string, unknown>; metadata?: Record<string, unknown> });
                const alertMeta = (meta.metadata_ ?? meta.metadata) as Record<string, unknown> | undefined;
                const pInfo = alertMeta?.patient_info as { name?: string; phone?: string; blood_type?: string } | undefined;
                const pStatus = alertMeta?.patient_status as string | undefined;
                const priorityScore = (alertMeta?.priority_score as number) ?? 0;

                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 border-s-3 ${sevBorder} px-4 py-3 transition-colors hover:bg-surface-2`}
                  >
                    <div className="mt-0.5 shrink-0">
                      <StatusBadge severity={alert.severity} size="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                          {alert.title}
                        </p>
                        {priorityScore > 0 && (
                          <Badge
                            tone={priorityScore >= 80 ? "critical" : priorityScore >= 60 ? "high" : "neutral"}
                            size="sm"
                            title="AI Priority Score"
                          >
                            P{priorityScore}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-xs text-ink-muted">
                          {alert.event_type} &middot; {timeAgo(alert.created_at)}
                        </span>
                        {pStatus && (
                          <Badge
                            tone={
                              pStatus === "trapped"
                                ? "critical"
                                : pStatus === "injured"
                                  ? "high"
                                  : pStatus === "evacuate"
                                    ? "medium"
                                    : "success"
                            }
                            size="sm"
                          >
                            {pStatus}
                          </Badge>
                        )}
                      </div>
                      {pInfo?.name && (
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {pInfo.name}
                          {pInfo.phone && <span className="ms-1 text-ink-faint" dir="ltr">{pInfo.phone}</span>}
                          {pInfo.blood_type && <span className="ms-1 font-semibold text-on-danger-soft">{pInfo.blood_type}</span>}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Department Status Indicator */}
      <Card>
        <CardHeader
          icon={<Activity />}
          title={`${deptLabel} Status Overview`}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <StatusBadge status="operational" size="sm" />
            <span className="text-sm text-ink-muted">
              {stats?.operational_hospitals ?? 0} operational facilities
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={statusTone((stats?.pending_sos ?? 0) > 0 ? "pending" : "active")} size="sm" dot>
              SOS pending: {stats?.pending_sos ?? 0}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={(stats?.patients_at_risk ?? 0) > 0 ? "warning" : "neutral"} size="sm" dot>
              Patients at risk: {stats?.patients_at_risk ?? 0}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
