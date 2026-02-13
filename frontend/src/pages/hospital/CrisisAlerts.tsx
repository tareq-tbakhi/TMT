import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AlertCard from "../../components/common/AlertCard";
import { useAlertStore } from "../../store/alertStore";
import { useSocketEvent } from "../../contexts/SocketContext";
import { eventTypeLabels } from "../../utils/formatting";
import type { Alert } from "../../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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

const CrisisAlerts: React.FC = () => {
  const { t } = useTranslation();
  const { alerts, setAlerts, addAlert, acknowledgeAlert } = useAlertStore();
  const [severityFilter, setSeverityFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [sortByPriority, setSortByPriority] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    const token = localStorage.getItem("tmt-token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      setLoading(true);
      // Use prioritized endpoint for AI-ranked alerts
      const endpoint = sortByPriority ? "alerts/prioritized" : "alerts";
      const params = new URLSearchParams();
      if (!sortByPriority) {
        if (severityFilter) params.set("severity", severityFilter);
        if (eventTypeFilter) params.set("event_type", eventTypeFilter);
      }
      const qs = params.toString();
      const res = await fetch(
        `${API_URL}/api/v1/${endpoint}${qs ? `?${qs}` : ""}`,
        { headers }
      );
      if (res.status === 401) {
        localStorage.removeItem("tmt-token");
        localStorage.removeItem("tmt-user");
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
      } else {
        setError("Failed to load alerts");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [severityFilter, eventTypeFilter, sortByPriority, setAlerts]);

  // Initial load and re-fetch on filter change
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Real-time alert updates via shared socket (addAlert already called in global context,
  // but we also refetch to get server-ranked list)
  useSocketEvent("new_alert", () => {
    fetchAlerts();
  });

  const handleAcknowledge = (id: string) => {
    acknowledgeAlert(id);
  };

  // Apply client-side filters (in case alerts were added via socket)
  const filteredAlerts = alerts.filter((alert) => {
    if (severityFilter && alert.severity !== severityFilter) return false;
    if (eventTypeFilter && alert.event_type !== eventTypeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("alerts.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time crisis alerts and notifications
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          onClick={() => setSortByPriority(!sortByPriority)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            sortByPriority
              ? "bg-purple-600 text-white shadow-sm"
              : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          AI Priority
        </button>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {SEVERITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {EVENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {(severityFilter || eventTypeFilter) && (
          <button
            onClick={() => {
              setSeverityFilter("");
              setEventTypeFilter("");
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Severity summary bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <span className="text-sm font-medium text-gray-700">
          {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? "s" : ""}
        </span>
        <span className="h-4 w-px bg-gray-200" />
        {[
          { key: "critical", label: "Critical", bg: "bg-red-600" },
          { key: "high", label: "High", bg: "bg-orange-500" },
          { key: "medium", label: "Medium", bg: "bg-yellow-500" },
          { key: "low", label: "Low", bg: "bg-blue-400" },
        ].map(({ key, label, bg }) => {
          const count = filteredAlerts.filter((a) => a.severity === key).length;
          if (count === 0) return null;
          return (
            <button
              key={key}
              onClick={() => setSeverityFilter(severityFilter === key ? "" : key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                severityFilter === key
                  ? "ring-2 ring-offset-1 ring-gray-400"
                  : "hover:opacity-80"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${bg}`} />
              <span className="text-gray-700">{count}</span>
              <span className="text-gray-400">{label}</span>
            </button>
          );
        })}
        <span className="h-4 w-px bg-gray-200" />
        {filteredAlerts.filter((a) => !a.acknowledged).length > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
            {filteredAlerts.filter((a) => !a.acknowledged).length} unacknowledged
          </span>
        )}
        {filteredAlerts.filter((a) => a.source === "sos").length > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
            {filteredAlerts.filter((a) => a.source === "sos").length} SOS
          </span>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Alert list */}
      {!loading && !error && (
        <div className="space-y-3">
          {filteredAlerts.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              <p className="mt-3 text-sm text-gray-500">
                {t("alerts.noAlerts")}
              </p>
            </div>
          ) : (
            filteredAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={handleAcknowledge}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CrisisAlerts;
