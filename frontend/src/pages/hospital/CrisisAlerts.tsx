import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  BellOff,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  MapPin,
  Navigation,
  RefreshCw,
  Siren,
  Sparkles,
  Table2,
  TriangleAlert,
} from "lucide-react";
import AlertCard from "../../components/common/AlertCard";
import StatusBadge from "../../components/common/StatusBadge";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  Select,
  announce,
  severityTone,
  type BadgeTone,
} from "../../components/ui";
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
  critical: {
    dot: "bg-sev-critical",
    text: "text-on-sev-critical-soft",
    active: "border-sev-critical bg-sev-critical-soft",
  },
  high: {
    dot: "bg-sev-high",
    text: "text-on-sev-high-soft",
    active: "border-sev-high bg-sev-high-soft",
  },
  medium: {
    dot: "bg-sev-medium",
    text: "text-on-sev-medium-soft",
    active: "border-sev-medium bg-sev-medium-soft",
  },
  low: {
    dot: "bg-sev-low",
    text: "text-on-sev-low-soft",
    active: "border-sev-low bg-sev-low-soft",
  },
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
    announce("New crisis alert received", "polite");
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

  const viewToggleClasses = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
      active
        ? "bg-accent text-on-accent"
        : "bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink"
    }`;

  const pageBtnClasses = (active = false) =>
    `min-h-11 min-w-11 rounded-md border px-2.5 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
      active
        ? "border-accent bg-accent text-on-accent"
        : "border-edge-strong bg-surface text-ink-muted hover:bg-surface-2"
    }`;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <PageHeader
        icon={<Siren />}
        title={t("alerts.title")}
        description="Real-time crisis alerts and notifications"
        actions={
          <>
            <div
              className="inline-flex overflow-hidden rounded-md border border-edge-strong"
              role="group"
              aria-label="List view mode"
            >
              <button
                type="button"
                onClick={() => setViewMode("compact")}
                aria-pressed={viewMode === "compact"}
                className={viewToggleClasses(viewMode === "compact")}
              >
                <Table2 aria-hidden="true" className="h-4 w-4" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                aria-pressed={viewMode === "cards"}
                className={`${viewToggleClasses(viewMode === "cards")} border-s border-edge-strong`}
              >
                <LayoutGrid aria-hidden="true" className="h-4 w-4" />
                Cards
              </button>
            </div>
            <Button variant="secondary" icon={<RefreshCw />} onClick={fetchAlerts}>
              Refresh
            </Button>
          </>
        }
      />

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total */}
        <div className="rounded-lg border border-edge bg-surface px-4 py-3 shadow-1">
          <p className="text-xs font-semibold text-ink-muted">Total Alerts</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-ink">{(stats?.total ?? totalCount).toLocaleString()}</p>
        </div>
        {/* SOS */}
        <button
          type="button"
          onClick={() => setSourceFilter(sourceFilter === "sos" ? "" : "sos")}
          aria-pressed={sourceFilter === "sos"}
          className={`rounded-lg border px-4 py-3 text-start shadow-1 transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
            sourceFilter === "sos"
              ? "border-danger bg-danger-soft"
              : "border-edge bg-surface hover:bg-surface-2"
          }`}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold text-on-danger-soft">
            <Siren aria-hidden="true" className="h-3.5 w-3.5" />
            SOS Alerts
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-on-danger-soft">{(stats?.sos_count ?? 0).toLocaleString()}</p>
        </button>
        {/* By severity */}
        {(["critical", "high", "medium", "low"] as const).map((key) => {
          const s = SEV[key];
          const count = sevCount(key);
          const isActive = severityFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSeverityFilter(isActive ? "" : key)}
              aria-pressed={isActive}
              className={`rounded-lg border px-4 py-3 text-start shadow-1 transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                isActive ? s.active : "border-edge bg-surface hover:bg-surface-2"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.dot}`} />
                <p className={`text-xs font-semibold ${s.text}`}>{key.charAt(0).toUpperCase() + key.slice(1)}</p>
              </div>
              <p className={`mt-1 text-2xl font-bold tracking-tight ${s.text}`}>{count.toLocaleString()}</p>
            </button>
          );
        })}
      </div>

      {/* ── Filters row ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSortByPriority(!sortByPriority)}
          aria-pressed={sortByPriority}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
            sortByPriority
              ? "bg-accent text-on-accent shadow-1"
              : "border border-edge-strong bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink"
          }`}
        >
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          AI Priority
        </button>
        <Select
          label="Filter by severity"
          hideLabel
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="w-40 [&_select]:text-sm"
        >
          {SEVERITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <Select
          label="Filter by event type"
          hideLabel
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="w-40 [&_select]:text-sm"
        >
          {EVENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <Select
          label="Filter by source"
          hideLabel
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="w-40 [&_select]:text-sm"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        {(severityFilter || eventTypeFilter || sourceFilter) && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={() => {
              setSeverityFilter("");
              setEventTypeFilter("");
              setSourceFilter("");
            }}
          >
            Clear filters
          </Button>
        )}
        {stats && stats.unacknowledged > 0 && (
          <Badge tone="danger" className="ms-auto" icon={<BellOff />}>
            {stats.unacknowledged.toLocaleString()} unacknowledged
          </Badge>
        )}
      </div>

      {/* ── Loading / Error ── */}
      {loading && <LoadingState label="Loading alerts" />}
      {error && !loading && (
        <Card className="border-danger bg-danger-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-on-danger-soft">
              <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
              {error}
            </p>
            <Button variant="secondary" size="sm" onClick={fetchAlerts}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* ── Alert list ── */}
      {!loading && !error && (
        <>
          {alerts.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title={t("alerts.noAlerts")}
              description="New crisis alerts will appear here in real time."
            />
          ) : viewMode === "cards" ? (
            /* ── Card view ── */
            <div className="space-y-3">
              {sortedAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onAcknowledge={handleAcknowledge} />
              ))}
            </div>
          ) : (
            /* ── Compact table view ── */
            <Card flush className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-edge bg-surface-2">
                      <th className="w-[110px] px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">Severity</th>
                      <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">Alert</th>
                      <th className="w-[85px] px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">Dept</th>
                      <th className="w-[100px] px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">Source</th>
                      <th className="w-[80px] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-ink-muted">Priority</th>
                      <th className="w-[70px] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-ink-muted">Patients</th>
                      <th className="w-[100px] px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">Time</th>
                      <th className="w-[190px] px-4 py-3 text-end text-xs font-bold uppercase tracking-wide text-ink-muted">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
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
            </Card>
          )}

          {/* ── Pagination ── */}
          {totalCount > PAGE_SIZE && (
            <nav
              aria-label="Alerts pagination"
              className="flex flex-col items-center justify-between gap-3 sm:flex-row"
            >
              <p className="text-xs text-ink-muted">
                Showing {showFrom}–{showTo} of {totalCount.toLocaleString()} alerts
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  className={pageBtnClasses()}
                >
                  First
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className={pageBtnClasses()}
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
                      type="button"
                      onClick={() => setPage(p)}
                      aria-current={p === page ? "page" : undefined}
                      aria-label={`Page ${p + 1}`}
                      className={pageBtnClasses(p === page)}
                    >
                      {p + 1}
                    </button>
                  ));
                })()}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className={pageBtnClasses()}
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className={pageBtnClasses()}
                >
                  Last
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Compact table row                                                  */
/* ------------------------------------------------------------------ */
const patientStatusColor: Record<string, string> = {
  injured: "text-on-danger-soft",
  trapped: "font-bold text-on-sev-critical-soft",
  evacuate: "text-on-sev-high-soft",
  safe: "text-success",
};

const deptTone: Record<string, BadgeTone> = {
  hospital: "accent",
  police: "info",
  civil_defense: "high",
};

const deptLabel: Record<string, string> = {
  hospital: "Hospital",
  police: "Police",
  civil_defense: "Civil Def",
};

const priorityToneOf = (score: number): BadgeTone =>
  score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : "neutral";

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

  const navLinkClasses =
    "inline-flex min-h-11 items-center gap-1 rounded-md bg-success px-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2";
  const mapLinkClasses =
    "inline-flex min-h-11 items-center gap-1 rounded-md border border-edge-strong bg-surface px-2.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2";

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className={`cursor-pointer transition-colors hover:bg-surface-2 ${
          alert.acknowledged ? "opacity-60" : ""
        } ${expanded ? "bg-accent-soft/40" : ""}`}
      >
        {/* Severity + expander */}
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse alert details" : "Expand alert details"}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-3 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              {expanded ? (
                <ChevronDown aria-hidden="true" className="h-4 w-4" />
              ) : (
                <ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
              )}
            </button>
            <StatusBadge severity={alert.severity} size="sm" />
          </div>
        </td>

        {/* Title + event + patient status */}
        <td className="px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">
              {alert.title}
            </span>
            <span className="shrink-0 text-xs text-ink-faint">
              {eventLabel}
            </span>
            {patientStatus && (
              <span className={`shrink-0 text-xs font-semibold ${patientStatusColor[patientStatus] ?? "text-ink-muted"}`}>
                {patientStatus}
              </span>
            )}
            {isSecondary && (
              <Badge tone="info" size="sm">
                Supporting
              </Badge>
            )}
          </div>
          {/* Second line: patient name + details preview */}
          {isSOS && patientInfo?.name && (
            <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
              <span className="font-semibold text-ink">{patientInfo.name}</span>
              {patientInfo.phone && (
                <span dir="ltr">{patientInfo.phone}</span>
              )}
              {patientInfo.blood_type && (
                <Badge tone="danger" size="sm">
                  {patientInfo.blood_type}
                </Badge>
              )}
            </div>
          )}
          {!isSOS && alert.details && (
            <p className="mt-0.5 max-w-[400px] truncate text-xs text-ink-muted">
              {alert.details}
            </p>
          )}
        </td>

        {/* Department */}
        <td className="px-4 py-2.5">
          {routedDept ? (
            <Badge tone={deptTone[routedDept] ?? "neutral"} size="sm">
              {deptLabel[routedDept] ?? routedDept}
            </Badge>
          ) : (
            <span className="text-xs text-ink-faint">&mdash;</span>
          )}
        </td>

        {/* Source */}
        <td className="px-4 py-2.5">
          <Badge
            tone={isSOS ? "danger" : alert.source === "telegram" ? "info" : "neutral"}
            size="sm"
          >
            {alert.source ?? "system"}
          </Badge>
        </td>

        {/* Priority */}
        <td className="px-4 py-2.5 text-center">
          {priorityScore > 0 && (
            <Badge
              tone={priorityToneOf(priorityScore)}
              solid={priorityScore >= 80}
              size="sm"
              icon={<Sparkles />}
              title="AI Priority Score"
            >
              P{priorityScore}
            </Badge>
          )}
        </td>

        {/* Affected patients */}
        <td className="px-4 py-2.5 text-center text-xs text-ink-muted">
          {alert.affected_patients_count > 0 ? alert.affected_patients_count : "—"}
        </td>

        {/* Time */}
        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-muted">
          {timeAgo(alert.created_at)}
        </td>

        {/* Actions */}
        <td className="px-4 py-2.5 text-end">
          <div className="flex items-center justify-end gap-1.5">
            {!alert.acknowledged ? (
              <Button
                size="sm"
                className="min-h-11"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledge(alert.id);
                }}
              >
                Ack
              </Button>
            ) : (
              <Badge tone="neutral" size="sm">
                Done
              </Badge>
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
                  className={navLinkClasses}
                  title="Get directions in Google Maps"
                >
                  <Navigation aria-hidden="true" className="h-3.5 w-3.5" />
                  Navigate
                </a>
                <a
                  href={`/dashboard/map?lat=${alert.latitude}&lon=${alert.longitude}`}
                  onClick={(e) => e.stopPropagation()}
                  className={mapLinkClasses}
                >
                  <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
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
          <td colSpan={8} className="border-b border-edge bg-surface-2 px-4 py-3">
            <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {/* Details */}
              {alert.details && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="mb-0.5 font-bold text-ink">Details</p>
                  <p className="text-ink-muted">{alert.details}</p>
                </div>
              )}
              {/* Location + Navigate */}
              {alert.latitude && alert.longitude && (
                <div>
                  <p className="mb-0.5 font-bold text-ink">Location</p>
                  <p className="text-ink-muted">
                    {alert.latitude.toFixed(5)}, {alert.longitude.toFixed(5)}
                    {userLocation && (
                      <span className="ms-2 font-semibold text-on-accent-soft">
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
                    className={`mt-1 ${navLinkClasses}`}
                  >
                    <Navigation aria-hidden="true" className="h-3 w-3" />
                    Get Directions
                  </a>
                </div>
              )}
              {/* Confidence */}
              <div>
                <p className="mb-0.5 font-bold text-ink">Confidence</p>
                <p className="text-ink-muted">{Math.round(alert.confidence * 100)}%</p>
              </div>
              {/* AI recommendation */}
              {meta?.recommendation && (
                <div className="sm:col-span-2">
                  <p className="mb-0.5 flex items-center gap-1 font-bold text-on-info-soft">
                    <Sparkles aria-hidden="true" className="h-3 w-3" />
                    AI Recommendation
                  </p>
                  <p className="rounded-md bg-info-soft px-2 py-1 text-on-info-soft">{String(meta.recommendation)}</p>
                </div>
              )}
              {/* Priority factors */}
              {Array.isArray(meta?.priority_factors) && meta.priority_factors.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="mb-0.5 font-bold text-ink">Priority Factors</p>
                  <ul className="ms-4 list-disc space-y-0.5 text-ink-muted">
                    {(meta.priority_factors as string[]).map((f: string, i: number) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* SOS patient details */}
              {isSOS && patientInfo && (
                <div className="rounded-md bg-danger-soft p-2.5 sm:col-span-2 lg:col-span-3">
                  <p className="mb-1 font-bold text-on-danger-soft">Patient Information</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-on-danger-soft">
                    <span><b>Name:</b> {patientInfo.name}</span>
                    {patientInfo.phone && <span dir="ltr"><b>Phone:</b> {patientInfo.phone}</span>}
                    {patientInfo.blood_type && <span><b>Blood:</b> {patientInfo.blood_type}</span>}
                    {patientInfo.chronic_conditions?.length > 0 && (
                      <span><b>Conditions:</b> {patientInfo.chronic_conditions.join(", ")}</span>
                    )}
                    {patientInfo.allergies?.length > 0 && (
                      <span><b>Allergies:</b> {patientInfo.allergies.join(", ")}</span>
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
                      <Badge tone="warning" size="sm" icon={<TriangleAlert />}>
                        Low trust ({Math.round(Number(meta.patient_trust_score) * 100)}%)
                        {meta.patient_false_alarms ? ` · ${meta.patient_false_alarms} false alarm(s)` : ""}
                      </Badge>
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
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                  >
                    View Full Patient Profile
                    <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                </div>
              )}
              {/* Nearby alert info */}
              {meta?.nearby_alert_count != null && Number(meta.nearby_alert_count) > 0 && (
                <div>
                  <p className="mb-0.5 font-bold text-ink">Nearby Alerts</p>
                  <p className="text-ink-muted">
                    {String(meta.nearby_alert_count)} nearby
                    {meta.telegram_corroborated && (
                      <span className="ms-1 font-semibold text-on-info-soft">Telegram confirmed</span>
                    )}
                  </p>
                </div>
              )}
              {/* Created at */}
              <div>
                <p className="mb-0.5 font-bold text-ink">Created</p>
                <p className="text-ink-muted">{new Date(alert.created_at).toLocaleString()}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default CrisisAlerts;
