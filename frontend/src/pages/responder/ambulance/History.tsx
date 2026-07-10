/**
 * History - Ambulance driver's completed cases history
 * Summary KPIs + one card per completed case with severity badge.
 */

import {
  Biohazard,
  CarFront,
  ClipboardList,
  Clock,
  Flame,
  HeartPulse,
  History as HistoryIcon,
  LifeBuoy,
  MapPin,
  Siren,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useResponderStore } from "../../../store/responderStore";
import type { CaseType, CasePriority } from "../../../types/responderTypes";
import { Badge, Card, EmptyState, severityTone } from "../../../components/ui";

/** Case type -> lucide icon (replaces the old emoji set). */
const CASE_TYPE_LUCIDE: Record<CaseType, LucideIcon> = {
  medical: HeartPulse,
  security: Siren,
  fire: Flame,
  rescue: LifeBuoy,
  hazmat: Biohazard,
  accident: CarFront,
};

/** Priority -> severity-soft token classes for the entry icon chip. */
const SEV_SOFT: Record<CasePriority, string> = {
  critical: "bg-sev-critical-soft text-on-sev-critical-soft",
  high: "bg-sev-high-soft text-on-sev-high-soft",
  medium: "bg-sev-medium-soft text-on-sev-medium-soft",
  low: "bg-sev-low-soft text-on-sev-low-soft",
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AmbulanceHistory() {
  const { completedCases } = useResponderStore();

  if (completedCases.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <EmptyState
          icon={<HistoryIcon />}
          title="No History Yet"
          description="Completed cases will appear here"
        />
      </div>
    );
  }

  const criticalCount = completedCases.filter((c) => c.priority === "critical").length;
  const totalTime = formatDuration(completedCases.reduce((acc, c) => acc + c.duration, 0));

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 pb-8">
      {/* Stats Summary */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">
          Today's Summary
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Card flush className="flex flex-col items-center gap-1 p-3 text-center">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-on-accent-soft"
            >
              <ClipboardList className="h-4 w-4" />
            </span>
            <p className="text-2xl font-bold text-ink">{completedCases.length}</p>
            <p className="text-xs font-semibold text-ink-muted">Cases</p>
          </Card>
          <Card flush className="flex flex-col items-center gap-1 p-3 text-center">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-sev-critical-soft text-on-sev-critical-soft"
            >
              <TriangleAlert className="h-4 w-4" />
            </span>
            <p className="text-2xl font-bold text-ink">{criticalCount}</p>
            <p className="text-xs font-semibold text-ink-muted">Critical</p>
          </Card>
          <Card flush className="flex flex-col items-center gap-1 p-3 text-center">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-info-soft text-on-info-soft"
            >
              <Clock className="h-4 w-4" />
            </span>
            <p className="text-2xl font-bold text-ink">{totalTime}</p>
            <p className="text-xs font-semibold text-ink-muted">Total Time</p>
          </Card>
        </div>
      </section>

      {/* History List */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">
          Recent Cases
        </h2>
        <ul className="space-y-3">
          {completedCases.map((entry) => {
            const TypeIcon = CASE_TYPE_LUCIDE[entry.type];

            return (
              <li key={entry.id}>
                <Card>
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <span
                      aria-hidden="true"
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${SEV_SOFT[entry.priority]}`}
                    >
                      <TypeIcon className="h-5 w-5" />
                    </span>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink-muted">
                          {entry.caseNumber}
                        </span>
                        <Badge tone={severityTone(entry.priority)} size="sm">
                          {entry.priority}
                        </Badge>
                      </div>
                      <p className="line-clamp-2 text-base font-bold text-ink">
                        {entry.briefDescription}
                      </p>
                      {entry.destination && (
                        <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
                          <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
                          {entry.destination}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-3 flex items-center justify-between border-t border-edge pt-3">
                    <span className="text-sm text-ink-muted">{formatDate(entry.completedAt)}</span>
                    <span className="flex items-center gap-1 text-sm font-semibold text-ink-muted">
                      <Clock aria-hidden="true" className="h-4 w-4 shrink-0" />
                      {formatDuration(entry.duration)}
                    </span>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
