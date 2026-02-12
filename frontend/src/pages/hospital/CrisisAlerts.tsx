import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { io } from "socket.io-client";
import AlertCard from "../../components/common/AlertCard";
import { useAlertStore } from "../../store/alertStore";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    const token = localStorage.getItem("tmt-token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const params = new URLSearchParams();
    if (severityFilter) params.set("severity", severityFilter);
    if (eventTypeFilter) params.set("event_type", eventTypeFilter);

    try {
      setLoading(true);
      const res = await fetch(
        `${API_URL}/api/v1/alerts?${params.toString()}`,
        { headers }
      );
      if (res.ok) {
        const data = (await res.json()) as Alert[];
        setAlerts(data);
      } else {
        setError("Failed to load alerts");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [severityFilter, eventTypeFilter, setAlerts]);

  // Initial load and re-fetch on filter change
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Socket.IO real-time subscription
  useEffect(() => {
    const socket = io(API_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("new_alert", (alert: Alert) => {
      addAlert(alert);
    });

    return () => {
      socket.disconnect();
    };
  }, [addAlert]);

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
      <div className="flex flex-col gap-3 sm:flex-row">
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

      {/* Alert count */}
      <div className="text-sm text-gray-500">
        Showing {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? "s" : ""}
        {filteredAlerts.filter((a) => !a.acknowledged).length > 0 && (
          <span className="ms-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            {filteredAlerts.filter((a) => !a.acknowledged).length} unacknowledged
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
