import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePendingAlertStore } from "../../store/pendingAlertStore";
import { eventTypeLabels, timeAgo } from "../../utils/formatting";
import type { PendingAlert, PriorityAttribution } from "../../services/api";

/* ------------------------------------------------------------------ */
/* Severity badge styling (matches CrisisAlerts conventions)          */
/* ------------------------------------------------------------------ */
const sevBadge: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-700",
};

const deptLabel: Record<string, string> = {
  hospital: "Hospital",
  police: "Police",
  civil_defense: "Civil Defense",
};

function getMeta(alert: PendingAlert): Record<string, unknown> {
  // Backend exposes metadata via the aliased `metadata` field (see
  // alert_service._alert_to_dict / AlertResponse). Tolerate `metadata_` too.
  return (
    (alert.metadata as Record<string, unknown> | null) ??
    ((alert as unknown as { metadata_?: Record<string, unknown> }).metadata_) ??
    {}
  );
}

function getExplanation(alert: PendingAlert): PriorityAttribution[] {
  const meta = getMeta(alert);
  const exp = meta["priority_explanation"];
  return Array.isArray(exp) ? (exp as PriorityAttribution[]) : [];
}

function getPriorityScore(alert: PendingAlert): number | null {
  const meta = getMeta(alert);
  const score = meta["priority_score"];
  return typeof score === "number" ? score : null;
}

/* ------------------------------------------------------------------ */
/* Priority explanation breakdown                                     */
/* ------------------------------------------------------------------ */
const PriorityBreakdown: React.FC<{ alert: PendingAlert }> = ({ alert }) => {
  const { t } = useTranslation();
  const attributions = getExplanation(alert);
  const score = getPriorityScore(alert);

  if (attributions.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">
        {t("approvals.noExplanation")}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t("approvals.whyThisScore")}
        </p>
        {score != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-800">
            {t("approvals.totalScore")}: {score}
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {attributions.map((attr, i) => {
          const c = attr.contribution;
          const positive = typeof c === "number" && c >= 0;
          return (
            <li
              key={`${attr.factor}-${i}`}
              className="flex items-start gap-2 text-xs"
            >
              <span
                className={`inline-flex w-12 shrink-0 justify-center rounded px-1.5 py-0.5 font-mono font-bold ${
                  c == null
                    ? "bg-gray-100 text-gray-500"
                    : positive
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {c == null ? "—" : `${positive ? "+" : ""}${c}`}
              </span>
              <span className="text-gray-700">{attr.detail}</span>
              {attr.source && (
                <span className="ms-auto shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                  {attr.source}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Single pending-alert card                                          */
/* ------------------------------------------------------------------ */
const PendingCard: React.FC<{ alert: PendingAlert }> = ({ alert }) => {
  const { t } = useTranslation();
  const { approve, reject, actingId } = usePendingAlertStore();
  const isActing = actingId === alert.id;

  const eventLabel = eventTypeLabels[alert.event_type]?.en ?? alert.event_type;
  const dept = alert.routed_department ?? undefined;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header line */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            sevBadge[alert.severity] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {alert.severity.toUpperCase()}
        </span>
        <h3 className="font-semibold text-gray-900">{alert.title}</h3>
        <span className="text-[11px] text-gray-400">{eventLabel}</span>
      </div>

      {/* Meta line */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        {dept && (
          <span>
            <span className="font-medium text-gray-600">
              {t("approvals.department")}:
            </span>{" "}
            {deptLabel[dept] ?? dept}
          </span>
        )}
        <span>
          <span className="font-medium text-gray-600">
            {t("approvals.source")}:
          </span>{" "}
          {alert.source ?? "system"}
        </span>
        {alert.latitude != null && alert.longitude != null && (
          <span>
            <span className="font-medium text-gray-600">
              {t("approvals.location")}:
            </span>{" "}
            {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
          </span>
        )}
        <span>
          <span className="font-medium text-gray-600">
            {t("approvals.affectedPatients")}:
          </span>{" "}
          {alert.affected_patients_count}
        </span>
        <span>{timeAgo(alert.created_at)}</span>
      </div>

      {alert.details && (
        <p className="mt-2 text-sm text-gray-600">{alert.details}</p>
      )}

      {/* Priority explanation */}
      <div className="mt-3">
        <PriorityBreakdown alert={alert} />
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={() => reject(alert.id)}
          disabled={isActing}
          aria-label={t("approvals.reject")}
          aria-busy={isActing}
          className="rounded-md border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {t("approvals.reject")}
        </button>
        <button
          onClick={() => approve(alert.id)}
          disabled={isActing}
          aria-label={t("approvals.approve")}
          aria-busy={isActing}
          className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {t("approvals.approve")}
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */
const PendingApprovals: React.FC = () => {
  const { t } = useTranslation();
  const { alerts, loading, error, fetchPending } = usePendingAlertStore();

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("approvals.title")}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">{t("approvals.subtitle")}</p>
        </div>
        <button
          onClick={fetchPending}
          disabled={loading}
          aria-label={t("approvals.refresh")}
          aria-busy={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <svg
            className="h-3.5 w-3.5"
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
          {t("approvals.refresh")}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex h-24 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-blue-200 border-t-blue-600" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && alerts.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
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
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="mt-3 text-sm text-gray-500">{t("approvals.empty")}</p>
        </div>
      )}

      {/* List */}
      {!loading && !error && alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <PendingCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PendingApprovals;
