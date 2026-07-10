import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bandage,
  Biohazard,
  Bomb,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Construction,
  Crosshair,
  Flame,
  Footprints,
  Globe,
  Hospital,
  MapPin,
  Pin,
  Siren,
  Sparkles,
  TriangleAlert,
  Waves,
  type LucideIcon,
} from "lucide-react";
import StatusBadge from "./StatusBadge";
import { Badge, Button } from "../ui";
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

const eventTypeIcons: Record<string, LucideIcon> = {
  flood: Waves,
  bombing: Bomb,
  earthquake: Globe,
  fire: Flame,
  building_collapse: Building2,
  shooting: Crosshair,
  chemical: Biohazard,
  medical_emergency: Hospital,
  infrastructure: Construction,
  other: Pin,
};

const patientStatusIcons: Record<
  string,
  { icon: LucideIcon; label: string; color: string }
> = {
  injured: {
    icon: Bandage,
    label: "Injured",
    color: "bg-danger-soft text-on-danger-soft",
  },
  trapped: {
    icon: Siren,
    label: "Trapped",
    color: "bg-sev-critical-soft text-on-sev-critical-soft",
  },
  evacuate: {
    icon: Footprints,
    label: "Evacuate",
    color: "bg-sev-high-soft text-on-sev-high-soft",
  },
  safe: {
    icon: CircleCheck,
    label: "Safe",
    color: "bg-success-soft text-on-success-soft",
  },
};

const severityBorderColors: Record<string, string> = {
  critical: "border-s-sev-critical",
  high: "border-s-sev-high",
  medium: "border-s-sev-medium",
  low: "border-s-sev-low",
};

const priorityTone = (score: number) =>
  score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : "neutral";

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
  const EventIcon = eventTypeIcons[alert.event_type] ?? Pin;
  const meta = (alert.metadata_ ?? alert.metadata) as Record<string, unknown> | undefined;
  const priorityScore = alert.priority_score ?? (meta?.priority_score as number) ?? 0;
  const isSOS = alert.source === "sos" || alert.event_type === "medical_emergency";
  const patientInfo = meta?.patient_info as MapEventPatientInfo | undefined;
  const patientStatus = meta?.patient_status as string | undefined;
  const psConfig = patientStatus ? patientStatusIcons[patientStatus] : null;

  // Extract metadata fields with proper typing
  const metaResponseUrgency = typeof meta?.response_urgency === "string" ? meta.response_urgency : null;
  const metaReportedFalse = Boolean(meta?.reported_false);
  const metaRecommendation = typeof meta?.recommendation === "string" ? meta.recommendation : null;
  const metaPriorityFactors = Array.isArray(meta?.priority_factors) ? (meta.priority_factors as string[]) : [];
  const metaNearbyAlertCount = typeof meta?.nearby_alert_count === "number" ? meta.nearby_alert_count : 0;
  const metaTelegramCorroborated = Boolean(meta?.telegram_corroborated);
  const metaPatientId = typeof meta?.patient_id === "string" ? meta.patient_id : null;
  const metaLocationDescription = typeof meta?.location_description === "string" ? meta.location_description : null;

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
          body: JSON.stringify({}),
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
  const locationDescription = metaLocationDescription;
  // Try to extract location from details if source is Telegram and no coordinates
  const detailsLocation =
    !hasCoords && alert.source === "telegram" && alert.details
      ? alert.details
      : null;

  const locationSummary = hasCoords
    ? `${alert.latitude!.toFixed(4)}, ${alert.longitude!.toFixed(4)}`
    : locationDescription || (detailsLocation ? "See details" : "Unknown");

  const borderColor = alert.acknowledged
    ? "border-edge"
    : `border-s-4 ${severityBorderColors[alert.severity] ?? "border-s-sev-critical"} border-e-edge border-t-edge border-b-edge`;

  return (
    <div
      className={`cursor-pointer rounded-lg border bg-surface p-4 shadow-1 transition-shadow hover:shadow-2 ${
        alert.acknowledged ? `${borderColor} opacity-70` : borderColor
      } ${className}`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse alert details" : "Expand alert details"}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
          >
            {expanded ? (
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            ) : (
              <ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
            )}
          </button>
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-on-accent-soft"
          >
            <EventIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            {/* Row 1: Title + badges */}
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-ink">
                {alert.title}
              </h3>
              <StatusBadge severity={alert.severity} size="sm" />
              {priorityScore > 0 && (
                <Badge
                  tone={priorityTone(priorityScore)}
                  size="sm"
                  icon={<Sparkles />}
                  title="AI Priority Score"
                >
                  P{priorityScore}
                </Badge>
              )}
              {psConfig && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${psConfig.color}`}
                >
                  <psConfig.icon aria-hidden="true" className="h-3 w-3" />
                  {psConfig.label}
                </span>
              )}
              {metaResponseUrgency && (
                <Badge
                  tone={
                    metaResponseUrgency === "immediate"
                      ? "danger"
                      : metaResponseUrgency === "within_1h"
                        ? "high"
                        : "neutral"
                  }
                  size="sm"
                >
                  {metaResponseUrgency.replace(/_/g, " ")}
                </Badge>
              )}
              {metaReportedFalse && (
                <Badge tone="danger" size="sm">
                  Reported False
                </Badge>
              )}
            </div>

            {/* Row 2: Key metadata */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
              <span className="font-semibold text-ink-muted">{eventLabel}</span>
              <span>{timeAgo(alert.created_at)}</span>
              {alert.source && <span className="text-ink-faint">via {alert.source}</span>}
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="h-3 w-3 shrink-0" />
                {locationDescription || locationSummary}
              </span>
              <span className="text-ink-faint">{Math.round(alert.confidence * 100)}% conf</span>
            </div>

            {/* Row 3: SOS patient info (inline, always visible for SOS alerts) */}
            {isSOS && patientInfo && (
              <div className="mt-2 flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
                <div
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger-soft text-xs font-bold text-on-danger-soft"
                >
                  {patientInfo.name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="text-sm font-semibold text-ink">{patientInfo.name ?? "Unknown"}</span>
                    {patientInfo.phone && (
                      <a
                        href={`tel:${patientInfo.phone}`}
                        className="text-xs font-medium text-link underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-focus"
                        dir="ltr"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {patientInfo.phone}
                      </a>
                    )}
                    {patientInfo.blood_type && (
                      <Badge tone="danger" size="sm">
                        {patientInfo.blood_type}
                      </Badge>
                    )}
                    {(patientInfo.allergies?.length ?? 0) > 0 && (
                      <Badge tone="warning" size="sm">
                        Allergies: {patientInfo.allergies!.join(", ")}
                      </Badge>
                    )}
                  </div>
                  {(patientInfo.emergency_contacts?.length ?? 0) > 0 && (
                    <div className="mt-0.5 text-xs text-ink-muted">
                      ICE: {patientInfo.emergency_contacts![0].name}{" "}
                      <a
                        href={`tel:${patientInfo.emergency_contacts![0].phone}`}
                        className="text-link underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-focus"
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
                <Badge tone="warning" size="sm" icon={<TriangleAlert />}>
                  Low trust ({Math.round(Number(meta.patient_trust_score) * 100)}%)
                  {meta.patient_false_alarms ? ` · ${meta.patient_false_alarms} false alarm(s)` : ""}
                </Badge>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          {!alert.acknowledged && (
            <Button
              size="sm"
              className="min-h-11"
              loading={acknowledging}
              onClick={handleAcknowledge}
            >
              Acknowledge
            </Button>
          )}
          {alert.acknowledged && (
            <Badge tone="success" size="sm" icon={<CircleCheck />}>
              Acknowledged
            </Badge>
          )}
          {!meta?.reported_false && (
            <Button
              size="sm"
              variant="secondary"
              className="min-h-11"
              loading={reportingFalse}
              onClick={handleReportFalse}
            >
              Report False
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-edge pt-3">
          {/* Location Section */}
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">Location</p>
            {hasCoords && (
              <div className="flex items-center gap-2 text-sm text-ink">
                <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-on-accent-soft" />
                <span>{alert.latitude!.toFixed(5)}, {alert.longitude!.toFixed(5)}</span>
                {alert.radius_m != null && alert.radius_m > 0 && (
                  <span className="text-xs text-ink-muted">(radius: {alert.radius_m}m)</span>
                )}
                <a
                  href={`/dashboard/map?lat=${alert.latitude}&lon=${alert.longitude}`}
                  onClick={(e) => e.stopPropagation()}
                  className="ms-auto text-xs font-semibold text-link underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-focus"
                >
                  View on Map
                </a>
              </div>
            )}
            {locationDescription && (
              <p className="mt-1 text-sm text-ink">{locationDescription}</p>
            )}
            {!hasCoords && !locationDescription && detailsLocation && (
              <p className="text-sm italic text-ink-muted">Location from report: see details below</p>
            )}
            {!hasCoords && !locationDescription && !detailsLocation && (
              <p className="text-sm italic text-ink-faint">No precise location available</p>
            )}
          </div>

          {alert.details && (
            <p className="text-sm text-ink">{alert.details}</p>
          )}
          {alert.affected_patients_count != null && (
            <p className="text-sm text-ink-muted">
              <span className="font-semibold">Affected patients:</span>{" "}
              {String(alert.affected_patients_count)}
            </p>
          )}
          {metaRecommendation && (
            <p className="rounded-md bg-info-soft px-2 py-1 text-sm text-on-info-soft">
              <span className="font-semibold">AI Recommendation:</span>{" "}
              {metaRecommendation}
            </p>
          )}
          {metaPriorityFactors.length > 0 && (
            <div className="text-xs text-ink-muted">
              <span className="font-semibold">Priority Factors:</span>
              <ul className="ms-4 mt-1 list-disc space-y-0.5">
                {metaPriorityFactors.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {metaNearbyAlertCount > 0 && (
            <p className="text-xs text-ink-muted">
              <span className="font-semibold">Nearby alerts:</span> {metaNearbyAlertCount}
              {metaTelegramCorroborated && (
                <span className="ms-2 font-semibold text-on-info-soft">Telegram confirmed</span>
              )}
            </p>
          )}
          {metaPatientId && (
            <Link
              to={`/dashboard/patients/${metaPatientId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              View Full Patient Profile
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          )}
          <p className="text-xs text-ink-faint">
            Created: {new Date(alert.created_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
};

export default AlertCard;
