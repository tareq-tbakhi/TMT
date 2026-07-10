/**
 * ActiveCaseCard - Shows the current assigned case
 * Hero card optimized for one-handed emergency use: severity-soft banner,
 * accent-soft patient brief, large tap targets, icon + text everywhere.
 */

import {
  Biohazard,
  CarFront,
  Clock,
  Droplet,
  Flame,
  HeartPulse,
  Hospital,
  LifeBuoy,
  MapPin,
  Navigation,
  Phone,
  Siren,
  TriangleAlert,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AssignedCase } from "../../types/responderTypes";
import { STATUS_LABELS } from "../../types/responderTypes";
import { type ResponderType } from "../../store/authStore";
import { Badge, Button, Card, statusTone } from "../ui";

interface ActiveCaseCardProps {
  caseData: AssignedCase;
  responderType: ResponderType;
  onNavigate?: () => void;
}

/** Priority -> severity token classes (banner uses soft scale, dot solid). */
const PRIORITY_STYLES: Record<
  AssignedCase["priority"],
  { banner: string; dot: string }
> = {
  critical: {
    banner: "bg-sev-critical-soft text-on-sev-critical-soft",
    dot: "bg-sev-critical",
  },
  high: { banner: "bg-sev-high-soft text-on-sev-high-soft", dot: "bg-sev-high" },
  medium: {
    banner: "bg-sev-medium-soft text-on-sev-medium-soft",
    dot: "bg-sev-medium",
  },
  low: { banner: "bg-sev-low-soft text-on-sev-low-soft", dot: "bg-sev-low" },
};

/** Case type -> lucide icon (replaces the old emoji set). */
const CASE_TYPE_LUCIDE: Record<AssignedCase["type"], LucideIcon> = {
  medical: HeartPulse,
  security: Siren,
  fire: Flame,
  rescue: LifeBuoy,
  hazmat: Biohazard,
  accident: CarFront,
};

function timeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMins = Math.floor((now - then) / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export default function ActiveCaseCard({ caseData, responderType, onNavigate }: ActiveCaseCardProps) {
  const priorityStyle = PRIORITY_STYLES[caseData.priority];
  const TypeIcon = CASE_TYPE_LUCIDE[caseData.type];

  return (
    <Card flush className="overflow-hidden">
      {/* Priority Banner — severity-soft tokens, icon + text (not color alone) */}
      <div
        className={`flex items-center justify-between gap-2 px-4 py-2.5 ${priorityStyle.banner}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 rounded-full ${priorityStyle.dot} animate-pulse`}
          />
          <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-black uppercase tracking-wide">
            {caseData.priority} Priority
          </span>
        </div>
        <span className="shrink-0 text-sm font-semibold">{caseData.caseNumber}</span>
      </div>

      {/* Main Content */}
      <div className="space-y-4 p-4">
        {/* Case Type & Description */}
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-on-accent-soft"
          >
            <TypeIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold leading-tight text-ink">
              {caseData.briefDescription}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-semibold capitalize text-ink-muted">
                {caseData.type}
              </span>
              {caseData.victimCount && (
                <span className="flex items-center gap-1 text-sm font-semibold text-ink-muted">
                  <Users aria-hidden="true" className="h-4 w-4" />
                  {caseData.victimCount} {caseData.victimCount === 1 ? "person" : "people"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status */}
        <Badge tone={statusTone(caseData.status)} dot>
          {STATUS_LABELS[caseData.status]}
        </Badge>

        {/* Victim/Patient Information - Customized per responder type */}
        {caseData.victimInfo && (
          <div className="rounded-lg bg-accent-soft p-3">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-on-accent-soft"
              >
                <UserRound className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-on-accent-soft">
                  {responderType === "ambulance" ? "Patient Information" : "Person Information"}
                </p>

                {/* Name - shown for all */}
                <div className="mt-2 space-y-1">
                  {caseData.victimInfo.name && (
                    <p className="text-base font-bold text-ink">{caseData.victimInfo.name}</p>
                  )}

                  {/* Basic info - age/gender for ambulance & firefighter only */}
                  {(responderType === "ambulance" || responderType === "firefighter") && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {caseData.victimInfo.age && (
                        <span className="font-semibold text-ink-muted">
                          {caseData.victimInfo.age} yrs
                        </span>
                      )}
                      {caseData.victimInfo.gender && (
                        <span className="font-semibold capitalize text-ink-muted">
                          {caseData.victimInfo.gender}
                        </span>
                      )}
                      {/* Blood type - ambulance only */}
                      {responderType === "ambulance" && caseData.victimInfo.bloodType && (
                        <Badge tone="danger" size="sm" icon={<Droplet />}>
                          {caseData.victimInfo.bloodType}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {/* Medical conditions - ambulance only */}
                {responderType === "ambulance" &&
                  caseData.victimInfo.medicalConditions &&
                  caseData.victimInfo.medicalConditions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-bold text-ink-muted">Medical Conditions:</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {caseData.victimInfo.medicalConditions.map((condition, i) => (
                          <Badge key={i} tone="warning" size="sm">
                            {condition}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Allergies - ambulance only */}
                {responderType === "ambulance" &&
                  caseData.victimInfo.allergies &&
                  caseData.victimInfo.allergies.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-bold text-ink-muted">Allergies:</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {caseData.victimInfo.allergies.map((allergy, i) => (
                          <Badge key={i} tone="danger" size="sm">
                            {allergy}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Special conditions for firefighter (mobility, oxygen dependent, etc.) */}
                {responderType === "firefighter" &&
                  caseData.victimInfo.medicalConditions &&
                  caseData.victimInfo.medicalConditions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-bold text-ink-muted">Special Conditions:</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {caseData.victimInfo.medicalConditions.map((condition, i) => (
                          <Badge key={i} tone="warning" size="sm">
                            {condition}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Contact buttons - shown for all */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {caseData.victimInfo.phone && (
                    <a
                      href={`tel:${caseData.victimInfo.phone}`}
                      className="flex min-h-11 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-bold text-on-accent shadow-1 transition-colors hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                    >
                      <Phone aria-hidden="true" className="h-4 w-4" />
                      {responderType === "ambulance" ? "Call Patient" : "Call"}
                    </a>
                  )}
                  {caseData.victimInfo.emergencyContact && (
                    <a
                      href={`tel:${caseData.victimInfo.emergencyContact.phone}`}
                      className="flex min-h-11 items-center gap-1.5 rounded-md border border-edge-strong bg-surface px-4 text-sm font-bold text-ink transition-colors hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                    >
                      <Phone aria-hidden="true" className="h-4 w-4" />
                      {caseData.victimInfo.emergencyContact.relation}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Location */}
        <div className="rounded-lg bg-surface-2 p-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-danger-soft text-on-danger-soft"
            >
              <MapPin className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                Pickup Location
              </p>
              <p className="mt-0.5 text-base font-bold text-ink">
                {caseData.pickupLocation.address}
              </p>
              {caseData.pickupLocation.landmark && (
                <p className="mt-0.5 text-sm text-ink-muted">
                  {caseData.pickupLocation.landmark}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Destination - only for ambulance (hospital) and police (station) */}
        {caseData.destination && (responderType === "ambulance" || responderType === "police") && (
          <div className="rounded-lg bg-success-soft p-3">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-on-success-soft"
              >
                <Hospital className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-on-success-soft">
                  Destination
                </p>
                <p className="mt-0.5 text-base font-bold text-ink">
                  {caseData.destination.name}
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{caseData.destination.address}</p>
              </div>
            </div>
          </div>
        )}

        {/* Time Info */}
        <div className="flex items-center justify-between gap-2 border-t border-edge pt-2">
          <span className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Clock aria-hidden="true" className="h-4 w-4 shrink-0" />
            Assigned {timeAgo(caseData.assignedAt)}
          </span>
          {caseData.dispatchPhone && (
            <a
              href={`tel:${caseData.dispatchPhone}`}
              className="flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-bold text-link transition-colors hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              <Phone aria-hidden="true" className="h-4 w-4" />
              Dispatch
            </a>
          )}
        </div>
      </div>

      {/* Navigate Button */}
      {onNavigate && (
        <div className="px-4 pb-4">
          <Button size="xl" fullWidth icon={<Navigation />} onClick={onNavigate}>
            Navigate to Location
          </Button>
        </div>
      )}
    </Card>
  );
}
