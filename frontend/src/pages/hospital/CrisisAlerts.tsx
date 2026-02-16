import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AlertCard from "../../components/common/AlertCard";
import { useAlertStore, type AlertStats } from "../../store/alertStore";
import { useSocketEvent } from "../../contexts/SocketContext";
import { eventTypeLabels, timeAgo } from "../../utils/formatting";
import type { Alert } from "../../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const PAGE_SIZE = 25;

const SEVERITY_OPTIONS = [
  { value: "", label: "All Severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  ...Object.entries(eventTypeLabels).map(([key, val]) => ({
    value: key,
    label: val.en,
  })),
];

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "sos", label: "SOS Only" },
  { value: "telegram", label: "Telegram" },
  { value: "system", label: "System" },
];

/* ------------------------------------------------------------------ */
/* Severity config                                                    */
/* ------------------------------------------------------------------ */
const SEV = {
  critical: { dot: "bg-red-600", ring: "ring-red-200", text: "text-red-700", bg: "bg-red-50" },
  high: { dot: "bg-orange-500", ring: "ring-orange-200", text: "text-orange-700", bg: "bg-orange-50" },
  medium: { dot: "bg-yellow-500", ring: "ring-yellow-200", text: "text-yellow-700", bg: "bg-yellow-50" },
  low: { dot: "bg-blue-400", ring: "ring-blue-200", text: "text-blue-700", bg: "bg-blue-50" },
} as const;

type ViewMode = "cards" | "compact";

/* ---- Haversine distance (km) ---- */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ---- Google Maps directions URL ---- */
function googleMapsDirectionsUrl(
  destLat: number,
  destLon: number,
  originLat?: number,
  originLon?: number,
): string {
  const dest = `${destLat},${destLon}`;
  if (originLat != null && originLon != null) {
    return `https://www.google.com/maps/dir/${originLat},${originLon}/${dest}`;
  }
  // No origin — Google will use the user's current location
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */
const CrisisAlerts: React.FC = () => {
  const { t } = useTranslation();
  const { alerts, setAlerts, acknowledgeAlert, totalCount, stats } =
    useAlertStore();

  const [severityFilter, setSeverityFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortByPriority, setSortByPriority] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const refetchRef = useRef(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  // Get user location for distance sorting + navigation
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 5000 },
    );
  }, []);

  /* ---- fetch alerts with server-side pagination + filters ---- */
  const fetchAlerts = useCallback(async () => {
    const id = ++refetchRef.current;
    const token = localStorage.getItem("tmt-token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      setLoading(true);
      const endpoint = sortByPriority ? "alerts/prioritized" : "alerts";
      const params = new URLSearchParams();
      if (severityFilter) params.set("severity", severityFilter);
      if (eventTypeFilter) params.set("event_type", eventTypeFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await fetch(
        `${API_URL}/api/v1/${endpoint}?${params.toString()}`,
        { headers }
      );
      if (id !== refetchRef.current) return; // stale

      if (res.status === 401) {
        localStorage.removeItem("tmt-token");
        localStorage.removeItem("tmt-user");
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setAlerts(
          data.alerts ?? [],
          data.total ?? 0,
          data.stats as AlertStats | null,
        );
        setError(null);
      } else {
        setError("Failed to load alerts");
      }
    } catch (err) {
      if (id === refetchRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load alerts");
      }
    } finally {
      if (id === refetchRef.current) setLoading(false);
    }
  }, [severityFilter, eventTypeFilter, sourceFilter, sortByPriority, page, setAlerts]);

  // Fetch on filter/page/sort change
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [severityFilter, eventTypeFilter, sourceFilter, sortByPriority]);

  // Real-time: just refetch current page (debounced)
  const socketTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useSocketEvent("new_alert", () => {
    clearTimeout(socketTimer.current);
    socketTimer.current = setTimeout(fetchAlerts, 1500);
  });

  const handleAcknowledge = (id: string) => acknowledgeAlert(id);

  // Client-side re-sort: priority_score desc, then distance asc (closest first for ties)
  const sortedAlerts = React.useMemo(() => {
    if (!sortByPriority) return alerts;
    const sevScores: Record<string, number> = { critical: 80, high: 60, medium: 40, low: 20 };
    return [...alerts].sort((a, b) => {
      const metaA = (a as any).metadata_ ?? (a as any).metadata ?? {};
      const metaB = (b as any).metadata_ ?? (b as any).metadata ?? {};
      const scoreA = (a as any).priority_score ?? metaA?.priority_score ?? sevScores[a.severity] ?? 30;
      const scoreB = (b as any).priority_score ?? metaB?.priority_score ?? sevScores[b.severity] ?? 30;
      if (scoreA !== scoreB) return scoreB - scoreA; // higher score first
      // Tiebreaker: closer to user first
      if (userLocation && a.latitude && a.longitude && b.latitude && b.longitude) {
        const distA = haversineKm(userLocation.lat, userLocation.lon, a.latitude, a.longitude);
        const distB = haversineKm(userLocation.lat, userLocation.lon, b.latitude, b.longitude);
        return distA - distB; // closer first
      }
      return 0;
    });
  }, [alerts, sortByPriority, userLocation]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const showFrom = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const showTo = Math.min((page + 1) * PAGE_SIZE, totalCount);

  /* ---- severity stat helpers ---- */
  const sevCount = (key: string) =>
    stats?.by_severity?.[key] ?? 0;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("alerts.title")}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Real-time crisis alerts and notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-gray-300 bg-white text-xs font-medium">
            <button
              onClick={() => setViewMode("compact")}
              className={`px-3 py-1.5 rounded-s-lg transition-colors ${
                viewMode === "compact"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`px-3 py-1.5 rounded-e-lg transition-colors ${
                viewMode === "cards"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Cards
            </button>
          </div>
          <button
            onClick={fetchAlerts}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total */}
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs font-medium text-gray-500">Total Alerts</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{(stats?.total ?? totalCount).toLocaleString()}</p>
        </div>
        {/* SOS */}
        <button
          onClick={() => setSourceFilter(sourceFilter === "sos" ? "" : "sos")}
          className={`rounded-lg border px-4 py-3 text-left transition-colors ${
            sourceFilter === "sos"
              ? "border-red-300 bg-red-50 ring-2 ring-red-200"
              : "border-gray-200 bg-white hover:bg-red-50/50"
          }`}
        >
          <p className="text-xs font-medium text-red-600">SOS Alerts</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{(stats?.sos_count ?? 0).toLocaleString()}</p>
        </button>
        {/* By severity */}
        {(["critical", "high", "medium", "low"] as const).map((key) => {
          const s = SEV[key];
          const count = sevCount(key);
          const isActive = severityFilter === key;
          return (
            <button
              key={key}
              onClick={() => setSeverityFilter(isActive ? "" : key)}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                isActive
                  ? `${s.bg} border-current ${s.ring} ring-2`
                  : `border-gray-200 bg-white hover:${s.bg}`
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                <p className={`text-xs font-medium ${s.text}`}>{key.charAt(0).toUpperCase() + key.slice(1)}</p>
              </div>
              <p className={`mt-1 text-2xl font-bold ${s.text}`}>{count.toLocaleString()}</p>
            </button>
          );
        })}
      </div>

      {/* ── Filters row ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSortByPriority(!sortByPriority)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            sortByPriority
              ? "bg-purple-600 text-white shadow-sm"
              : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          AI Priority
        </button>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {SEVERITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {EVENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {(severityFilter || eventTypeFilter || sourceFilter) && (
          <button
            onClick={() => {
              setSeverityFilter("");
              setEventTypeFilter("");
              setSourceFilter("");
            }}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Clear filters
          </button>
        )}
        {stats && stats.unacknowledged > 0 && (
          <span className="ms-auto inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
            {stats.unacknowledged.toLocaleString()} unacknowledged
          </span>
        )}
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div className="flex h-24 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-blue-200 border-t-blue-600" />
        </div>
      )}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Alert list ── */}
      {!loading && !error && (
        <>
          {alerts.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="mt-3 text-sm text-gray-500">{t("alerts.noAlerts")}</p>
            </div>
          ) : viewMode === "cards" ? (
            /* ── Card view ── */
            <div className="space-y-3">
              {sortedAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onAcknowledge={handleAcknowledge} />
              ))}
            </div>
          ) : (
            /* ── Compact table view ── */
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
                      <th className="px-4 py-2.5 w-[90px]">Severity</th>
                      <th className="px-4 py-2.5">Alert</th>
                      <th className="px-4 py-2.5 w-[85px]">Dept</th>
                      <th className="px-4 py-2.5 w-[100px]">Source</th>
                      <th className="px-4 py-2.5 w-[65px] text-center">Priority</th>
                      <th className="px-4 py-2.5 w-[70px] text-center">Patients</th>
                      <th className="px-4 py-2.5 w-[100px]">Time</th>
                      <th className="px-4 py-2.5 w-[140px] text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedAlerts.map((alert) => (
                      <CompactRow
                        key={alert.id}
                        alert={alert}
                        onAcknowledge={handleAcknowledge}
                        userLocation={userLocation}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Pagination ── */}
          {totalCount > PAGE_SIZE && (
            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-xs text-gray-500">
                Showing {showFrom}–{showTo} of {totalCount.toLocaleString()} alerts
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  First
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Prev
                </button>
                {/* Page number buttons */}
                {(() => {
                  const pages: number[] = [];
                  const start = Math.max(0, page - 2);
                  const end = Math.min(totalPages - 1, page + 2);
                  for (let i = start; i <= end; i++) pages.push(i);
                  return pages.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        p === page
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {p + 1}
                    </button>
                  ));
                })()}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Compact table row                                                  */
/* ------------------------------------------------------------------ */
const sevBadge: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-700",
};

const patientStatusColor: Record<string, string> = {
  injured: "text-red-700",
  trapped: "text-red-800 font-semibold",
  evacuate: "text-orange-700",
  safe: "text-green-700",
};

const deptBadge: Record<string, string> = {
  hospital: "bg-blue-50 text-blue-700",
  police: "bg-indigo-50 text-indigo-700",
  civil_defense: "bg-orange-50 text-orange-700",
};

const deptLabel: Record<string, string> = {
  hospital: "Hospital",
  police: "Police",
  civil_defense: "Civil Def",
};

interface CompactRowProps {
  alert: Alert;
  onAcknowledge: (id: string) => void;
  userLocation?: { lat: number; lon: number } | null;
}

const CompactRow: React.FC<CompactRowProps> = ({ alert, onAcknowledge, userLocation }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = (alert as any).metadata_ ?? (alert as any).metadata ?? {};
  const priorityScore = (alert as any).priority_score ?? meta?.priority_score ?? 0;
  const isSOS = alert.source === "sos";
  const isSecondary = meta?.is_secondary === true || (alert as any).alert_type === "secondary";
  const patientStatus = meta?.patient_status as string | undefined;
  const patientInfo = meta?.patient_info as Record<string, any> | undefined;
  const eventLabel = eventTypeLabels[alert.event_type]?.en ?? alert.event_type;
  const routedDept = (alert as any).routed_department as string | undefined;

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className={`cursor-pointer transition-colors hover:bg-gray-50 ${
          alert.acknowledged ? "opacity-60" : ""
        } ${expanded ? "bg-blue-50/40" : ""}`}
      >
        {/* Severity */}
        <td className="px-4 py-2.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${sevBadge[alert.severity] ?? "bg-gray-100 text-gray-600"}`}>
            {alert.severity.toUpperCase()}
          </span>
        </td>

        {/* Title + event + patient status */}
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate font-medium text-gray-900 text-sm">
              {alert.title}
            </span>
            <span className="shrink-0 text-[10px] text-gray-400">
              {eventLabel}
            </span>
            {patientStatus && (
              <span className={`shrink-0 text-[10px] font-medium ${patientStatusColor[patientStatus] ?? "text-gray-500"}`}>
                {patientStatus}
              </span>
            )}
            {isSecondary && (
              <span className="shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                Supporting
              </span>
            )}
          </div>
          {/* Second line: patient name + details preview */}
          {isSOS && patientInfo?.name && (
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
              <span className="font-medium text-gray-700">{patientInfo.name}</span>
              {patientInfo.phone && (
                <span dir="ltr">{patientInfo.phone}</span>
              )}
              {patientInfo.blood_type && (
                <span className="rounded bg-red-50 px-1 text-[10px] font-medium text-red-700">
                  {patientInfo.blood_type}
                </span>
              )}
            </div>
          )}
          {!isSOS && alert.details && (
            <p className="mt-0.5 truncate text-[11px] text-gray-500 max-w-[400px]">
              {alert.details}
            </p>
          )}
        </td>

        {/* Department */}
        <td className="px-4 py-2.5">
          {routedDept ? (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${deptBadge[routedDept] ?? "bg-gray-100 text-gray-600"}`}>
              {deptLabel[routedDept] ?? routedDept}
            </span>
          ) : (
            <span className="text-[10px] text-gray-300">&mdash;</span>
          )}
        </td>

        {/* Source */}
        <td className="px-4 py-2.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
            isSOS
              ? "bg-red-50 text-red-700"
              : alert.source === "telegram"
              ? "bg-cyan-50 text-cyan-700"
              : "bg-gray-100 text-gray-600"
          }`}>
            {alert.source ?? "system"}
          </span>
        </td>

        {/* Priority */}
        <td className="px-4 py-2.5 text-center">
          {priorityScore > 0 && (
            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              priorityScore >= 80 ? "bg-red-100 text-red-800" :
              priorityScore >= 60 ? "bg-orange-100 text-orange-800" :
              priorityScore >= 40 ? "bg-yellow-100 text-yellow-800" :
              "bg-gray-100 text-gray-600"
            }`}>
              P{priorityScore}
            </span>
          )}
        </td>

        {/* Affected patients */}
        <td className="px-4 py-2.5 text-center text-xs text-gray-600">
          {alert.affected_patients_count > 0 ? alert.affected_patients_count : "\u2014"}
        </td>

        {/* Time */}
        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
          {timeAgo(alert.created_at)}
        </td>

        {/* Actions */}
        <td className="px-4 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1.5">
            {!alert.acknowledged ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledge(alert.id);
                }}
                className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Ack
              </button>
            ) : (
              <span className="rounded-md bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-400">
                Done
              </span>
            )}
            {alert.latitude && alert.longitude && (
              <>
                <a
                  href={googleMapsDirectionsUrl(
                    alert.latitude,
                    alert.longitude,
                    userLocation?.lat,
                    userLocation?.lon,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-md bg-green-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-green-700 transition-colors"
                  title="Get directions in Google Maps"
                >
                  Navigate
                </a>
                <a
                  href={`/dashboard/map?lat=${alert.latitude}&lon=${alert.longitude}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
                >
                  Map
                </a>
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-gray-50/70 px-4 py-3 border-b border-gray-100">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
              {/* Details */}
              {alert.details && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="font-medium text-gray-700 mb-0.5">Details</p>
                  <p className="text-gray-600">{alert.details}</p>
                </div>
              )}
              {/* Location + Navigate */}
              {alert.latitude && alert.longitude && (
                <div>
                  <p className="font-medium text-gray-700 mb-0.5">Location</p>
                  <p className="text-gray-600">
                    {alert.latitude.toFixed(5)}, {alert.longitude.toFixed(5)}
                    {userLocation && (
                      <span className="ms-2 text-blue-600 font-medium">
                        ({haversineKm(userLocation.lat, userLocation.lon, alert.latitude, alert.longitude).toFixed(1)} km away)
                      </span>
                    )}
                  </p>
                  <a
                    href={googleMapsDirectionsUrl(
                      alert.latitude,
                      alert.longitude,
                      userLocation?.lat,
                      userLocation?.lon,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-green-700 transition-colors"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Get Directions
                  </a>
                </div>
              )}
              {/* Confidence */}
              <div>
                <p className="font-medium text-gray-700 mb-0.5">Confidence</p>
                <p className="text-gray-600">{Math.round(alert.confidence * 100)}%</p>
              </div>
              {/* AI recommendation */}
              {meta?.recommendation && (
                <div className="sm:col-span-2">
                  <p className="font-medium text-blue-700 mb-0.5">AI Recommendation</p>
                  <p className="text-blue-600 bg-blue-50 rounded px-2 py-1">{String(meta.recommendation)}</p>
                </div>
              )}
              {/* Priority factors */}
              {Array.isArray(meta?.priority_factors) && meta.priority_factors.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="font-medium text-gray-700 mb-0.5">Priority Factors</p>
                  <ul className="list-disc ms-4 space-y-0.5 text-gray-600">
                    {(meta.priority_factors as string[]).map((f: string, i: number) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* SOS patient details */}
              {isSOS && patientInfo && (
                <div className="sm:col-span-2 lg:col-span-3 rounded-md bg-red-50 p-2.5">
                  <p className="font-medium text-red-700 mb-1">Patient Information</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-700">
                    <span><b>Name:</b> {patientInfo.name}</span>
                    {patientInfo.phone && <span dir="ltr"><b>Phone:</b> {patientInfo.phone}</span>}
                    {patientInfo.blood_type && <span><b>Blood:</b> {patientInfo.blood_type}</span>}
                    {patientInfo.chronic_conditions?.length > 0 && (
                      <span><b>Conditions:</b> {patientInfo.chronic_conditions.join(", ")}</span>
                    )}
                    {patientInfo.allergies?.length > 0 && (
                      <span className="text-amber-700"><b>Allergies:</b> {patientInfo.allergies.join(", ")}</span>
                    )}
                    {patientInfo.emergency_contacts?.length > 0 && (
                      <span>
                        <b>ICE:</b> {patientInfo.emergency_contacts[0].name} ({patientInfo.emergency_contacts[0].phone})
                      </span>
                    )}
                  </div>
                  {/* Trust warning */}
                  {meta?.patient_trust_score != null && Number(meta.patient_trust_score) < 0.5 && (
                    <div className="mt-1.5">
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        Low trust ({Math.round(Number(meta.patient_trust_score) * 100)}%)
                        {meta.patient_false_alarms ? ` \u00B7 ${meta.patient_false_alarms} false alarm(s)` : ""}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {/* View patient profile link */}
              {meta?.patient_id && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <Link
                    to={`/dashboard/patients/${meta.patient_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    View Full Patient Profile
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              )}
              {/* Nearby alert info */}
              {meta?.nearby_alert_count != null && Number(meta.nearby_alert_count) > 0 && (
                <div>
                  <p className="font-medium text-gray-700 mb-0.5">Nearby Alerts</p>
                  <p className="text-gray-600">
                    {String(meta.nearby_alert_count)} nearby
                    {meta.telegram_corroborated && (
                      <span className="ms-1 text-cyan-600 font-medium">Telegram confirmed</span>
                    )}
                  </p>
                </div>
              )}
              {/* Created at */}
              <div>
                <p className="font-medium text-gray-700 mb-0.5">Created</p>
                <p className="text-gray-600">{new Date(alert.created_at).toLocaleString()}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default CrisisAlerts;
