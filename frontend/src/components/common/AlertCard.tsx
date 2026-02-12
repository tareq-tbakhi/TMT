import React, { useState } from "react";
import StatusBadge from "./StatusBadge";
import { timeAgo, eventTypeLabels } from "../../utils/formatting";

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

const AlertCard: React.FC<AlertCardProps> = ({
  alert,
  onAcknowledge,
  className = "",
}) => {
  const [expanded, setExpanded] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  const eventLabel =
    eventTypeLabels[alert.event_type]?.en ?? alert.event_type;
  const eventIcon = eventTypeIcons[alert.event_type] ?? "\uD83D\uDCCC";

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

  const locationText =
    alert.latitude != null && alert.longitude != null
      ? `${alert.latitude.toFixed(3)}, ${alert.longitude.toFixed(3)}`
      : "Unknown";

  return (
    <div
      className={`cursor-pointer rounded-lg border bg-white p-4 transition-all hover:shadow-md ${
        alert.acknowledged
          ? "border-gray-200 opacity-70"
          : "border-s-4 border-s-red-400 border-e-gray-200 border-t-gray-200 border-b-gray-200"
      } ${className}`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="mt-0.5 text-xl shrink-0">{eventIcon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {alert.title}
              </h3>
              <StatusBadge severity={alert.severity} size="sm" />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>{eventLabel}</span>
              <span>{locationText}</span>
              <span>{timeAgo(alert.created_at)}</span>
              {alert.source && <span>via {alert.source}</span>}
              <span>Confidence: {Math.round(alert.confidence * 100)}%</span>
            </div>
          </div>
        </div>

        {!alert.acknowledged && (
          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {acknowledging ? "..." : "Acknowledge"}
          </button>
        )}
        {alert.acknowledged && (
          <span className="shrink-0 rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500">
            Acknowledged
          </span>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
          {alert.details && (
            <p className="text-sm text-gray-700">{alert.details}</p>
          )}
          {alert.affected_patients_count != null && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Affected patients:</span>{" "}
              {alert.affected_patients_count}
            </p>
          )}
          {alert.radius_m != null && alert.radius_m > 0 && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Radius:</span> {alert.radius_m}m
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
