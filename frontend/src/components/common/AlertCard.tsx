import React, { useState } from "react";
import StatusBadge from "./StatusBadge";
import { timeAgo, eventTypeLabels } from "../../utils/formatting";
import type { MapEventPatientInfo } from "../../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface AlertData {
  id: string;
  title: string;
  severity: string;
  event_type: string;
  latitude: number | null;
  longitude: number | null;
  radius_m?: number;
  created_at: string;
  source: string | null;
  confidence: number;
  details: string | null;
  acknowledged: string | null;
  affected_patients_count?: number;
  priority_score?: number;
  metadata_?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface AlertCardProps {
  alert: AlertData;
  onAcknowledge?: (id: string) => void;
  className?: string;
}

const eventTypeIcons: Record<string, string> = {
  flood: "\uD83C\uDF0A",
  bombing: "\uD83D\uDCA3",
  earthquake: "\uD83C\uDF0D",
  fire: "\uD83D\uDD25",
  building_collapse: "\uD83C\uDFDA\uFE0F",
  shooting: "\u26A0\uFE0F",
  chemical: "\u2623\uFE0F",
  medical_emergency: "\uD83C\uDFE5",
  infrastructure: "\uD83D\uDEA7",
  other: "\uD83D\uDCCC",
};

const patientStatusIcons: Record<string, { icon: string; label: string; color: string }> = {
  injured: { icon: "\uD83E\uDE78", label: "Injured", color: "text-red-700 bg-red-50" },
  trapped: { icon: "\uD83D\uDEA8", label: "Trapped", color: "text-red-800 bg-red-100" },
  evacuate: { icon: "\uD83C\uDFC3", label: "Evacuate", color: "text-orange-700 bg-orange-50" },
  safe: { icon: "\u2705", label: "Safe", color: "text-green-700 bg-green-50" },
};

const severityBorderColors: Record<string, string> = {
  critical: "border-s-red-600",
  high: "border-s-orange-500",
  medium: "border-s-yellow-500",
  low: "border-s-blue-400",
};

const AlertCard: React.FC<AlertCardProps> = ({
  alert,
  onAcknowledge,
  className = "",
}) => {
  const [expanded, setExpanded] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [reportingFalse, setReportingFalse] = useState(false);

  const eventLabel =
    eventTypeLabels[alert.event_type]?.en ?? alert.event_type;
  const eventIcon = eventTypeIcons[alert.event_type] ?? "\uD83D\uDCCC";
  const meta = (alert.metadata_ ?? alert.metadata) as Record<string, unknown> | undefined;
  const priorityScore = alert.priority_score ?? (meta?.priority_score as number) ?? 0;
  const isSOS = alert.source === "sos" || alert.event_type === "medical_emergency";
  const patientInfo = meta?.patient_info as MapEventPatientInfo | undefined;
  const patientStatus = meta?.patient_status as string | undefined;
  const psConfig = patientStatus ? patientStatusIcons[patientStatus] : null;

  const handleReportFalse = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (reportingFalse) return;
    if (!window.confirm("Report this alert as a false alarm? This will affect the patient's trust score.")) return;

    setReportingFalse(true);
    try {
      const token = localStorage.getItem("tmt-token");
      await fetch(
        `${API_URL}/api/v1/alerts/${alert.id}/report-false`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason: "Reported as false alarm by hospital" }),
        }
      );
    } catch {
      // Silently fail
    } finally {
      setReportingFalse(false);
    }
  };

  const handleAcknowledge = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (acknowledging || alert.acknowledged) return;

    setAcknowledging(true);
    try {
      const token = localStorage.getItem("tmt-token");
      const res = await fetch(
        `${API_URL}/api/v1/alerts/${alert.id}/acknowledge`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (res.ok && onAcknowledge) {
        onAcknowledge(alert.id);
      }
    } catch {
      // Silently fail; will retry
    } finally {
      setAcknowledging(false);
    }
  };

  // Build location display — descriptive text for Telegram, coordinates for SOS/system
  const hasCoords = alert.latitude != null && alert.longitude != null;
  const locationDescription = (meta?.location_description as string) || null;
  // Try to extract location from details if source is Telegram and no coordinates
  const detailsLocation =
    !hasCoords && alert.source === "telegram" && alert.details
      ? alert.details
      : null;

  const locationSummary = hasCoords
    ? `${alert.latitude!.toFixed(4)}, ${alert.longitude!.toFixed(4)}`
    : locationDescription || (detailsLocation ? "See details" : "Unknown");

  const borderColor = alert.acknowledged
    ? "border-gray-200"
    : `border-s-4 ${severityBorderColors[alert.severity] ?? "border-s-red-400"} border-e-gray-200 border-t-gray-200 border-b-gray-200`;

  return (
    <div
      className={`cursor-pointer rounded-lg border bg-white p-4 transition-all hover:shadow-md ${
        alert.acknowledged ? `${borderColor} opacity-70` : borderColor
      } ${className}`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="mt-0.5 text-xl shrink-0">{eventIcon}</span>
          <div className="min-w-0 flex-1">
            {/* Row 1: Title + badges */}
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {alert.title}
              </h3>
              <StatusBadge severity={alert.severity} size="sm" />
              {priorityScore > 0 && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                    priorityScore >= 80
                      ? "bg-red-100 text-red-800"
                      : priorityScore >= 60
                      ? "bg-orange-100 text-orange-800"
                      : priorityScore >= 40
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-gray-100 text-gray-600"
                  }`}
                  title="AI Priority Score"
                >
                  P{priorityScore}
                </span>
              )}
              {psConfig && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${psConfig.color}`}>
                  {psConfig.icon} {psConfig.label}
                </span>
              )}
              {meta?.response_urgency && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                  meta.response_urgency === "immediate" ? "bg-red-100 text-red-700" :
                  meta.response_urgency === "within_1h" ? "bg-orange-100 text-orange-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {String(meta.response_urgency).replace(/_/g, " ")}
                </span>
              )}
              {meta?.reported_false && (
                <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                  Reported False
                </span>
              )}
            </div>

            {/* Row 2: Key metadata */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <span className="font-medium text-gray-600">{eventLabel}</span>
              <span>{timeAgo(alert.created_at)}</span>
              {alert.source && <span className="text-gray-400">via {alert.source}</span>}
              <span className="inline-flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {locationDescription || locationSummary}
              </span>
              <span className="text-gray-400">{Math.round(alert.confidence * 100)}% conf</span>
            </div>

            {/* Row 3: SOS patient info (inline, always visible for SOS alerts) */}
            {isSOS && patientInfo && (
              <div className="mt-2 flex items-center gap-3 rounded-md bg-gray-50 px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
                  {patientInfo.name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="text-sm font-medium text-gray-900">{patientInfo.name ?? "Unknown"}</span>
                    {patientInfo.phone && (
                      <a
                        href={`tel:${patientInfo.phone}`}
                        className="text-xs text-blue-600 hover:underline"
                        dir="ltr"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {patientInfo.phone}
                      </a>
                    )}
                    {patientInfo.blood_type && (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
                        {patientInfo.blood_type}
                      </span>
                    )}
                    {(patientInfo.allergies?.length ?? 0) > 0 && (
                      <span className="rounded bg-yellow-50 px-1.5 py-0.5 text-xs text-yellow-700">
                        Allergies: {patientInfo.allergies!.join(", ")}
                      </span>
                    )}
                  </div>
                  {(patientInfo.emergency_contacts?.length ?? 0) > 0 && (
                    <div className="mt-0.5 text-xs text-gray-500">
                      ICE: {patientInfo.emergency_contacts![0].name}{" "}
                      <a
                        href={`tel:${patientInfo.emergency_contacts![0].phone}`}
                        className="text-blue-600 hover:underline"
                        dir="ltr"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {patientInfo.emergency_contacts![0].phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Trust warning (only when low) */}
            {meta?.patient_trust_score != null && Number(meta.patient_trust_score) < 0.5 && (
              <div className="mt-1">
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Low trust ({Math.round(Number(meta.patient_trust_score) * 100)}%)
                  {meta.patient_false_alarms ? ` \u00B7 ${meta.patient_false_alarms} false alarm(s)` : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          {!alert.acknowledged && (
            <button
              onClick={handleAcknowledge}
              disabled={acknowledging}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {acknowledging ? "..." : "Acknowledge"}
            </button>
          )}
          {alert.acknowledged && (
            <span className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500">
              Acknowledged
            </span>
          )}
          {!meta?.reported_false && (
            <button
              onClick={handleReportFalse}
              disabled={reportingFalse}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              {reportingFalse ? "..." : "Report False"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
          {/* Location Section */}
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs font-semibold text-gray-700 mb-1">Location</p>
            {hasCoords && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <svg className="h-4 w-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{alert.latitude!.toFixed(5)}, {alert.longitude!.toFixed(5)}</span>
                {alert.radius_m != null && alert.radius_m > 0 && (
                  <span className="text-xs text-gray-500">(radius: {alert.radius_m}m)</span>
                )}
                <a
                  href={`/dashboard/map?lat=${alert.latitude}&lon=${alert.longitude}`}
                  onClick={(e) => e.stopPropagation()}
                  className="ms-auto text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  View on Map
                </a>
              </div>
            )}
            {locationDescription && (
              <p className="text-sm text-gray-700 mt-1">{locationDescription}</p>
            )}
            {!hasCoords && !locationDescription && detailsLocation && (
              <p className="text-sm text-gray-600 italic">Location from report: see details below</p>
            )}
            {!hasCoords && !locationDescription && !detailsLocation && (
              <p className="text-sm text-gray-400 italic">No precise location available</p>
            )}
          </div>

          {alert.details && (
            <p className="text-sm text-gray-700">{alert.details}</p>
          )}
          {alert.affected_patients_count != null && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Affected patients:</span>{" "}
              {alert.affected_patients_count}
            </p>
          )}
          {meta?.recommendation && (
            <p className="text-sm text-blue-700 bg-blue-50 rounded px-2 py-1">
              <span className="font-medium">AI Recommendation:</span>{" "}
              {String(meta.recommendation)}
            </p>
          )}
          {Array.isArray(meta?.priority_factors) && (meta.priority_factors as string[]).length > 0 && (
            <div className="text-xs text-gray-600">
              <span className="font-medium">Priority Factors:</span>
              <ul className="mt-1 ms-4 list-disc space-y-0.5">
                {(meta.priority_factors as string[]).map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {meta?.nearby_alert_count != null && Number(meta.nearby_alert_count) > 0 && (
            <p className="text-xs text-gray-600">
              <span className="font-medium">Nearby alerts:</span> {String(meta.nearby_alert_count)}
              {meta.telegram_corroborated && (
                <span className="ms-2 text-cyan-600 font-medium">Telegram confirmed</span>
              )}
            </p>
          )}
          <p className="text-xs text-gray-400">
            Created: {new Date(alert.created_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
};

export default AlertCard;
