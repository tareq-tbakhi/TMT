import React, { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Hospital as HospitalIcon,
  MapPin,
  Shield,
  Siren,
  TriangleAlert,
  Truck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMapStore } from "../../store/mapStore";
import {
  getPatient,
  getPatientRecords,
  getPatientSOS,
  getPatientNearestHospital,
  getAlerts,
} from "../../services/api";
import type {
  MapEvent,
  MapEventPatientInfo,
  Patient,
  MedicalRecord,
  SOSHistoryItem,
  NearestHospitalResponse,
  Alert,
} from "../../services/api";
import { timeAgo, eventTypeLabels } from "../../utils/formatting";
import StatusBadge from "../common/StatusBadge";
import LoadingSpinner from "../common/LoadingSpinner";
import { Badge, type BadgeTone } from "../ui";

// ─── Helpers ──────────────────────────────────────────────

const severityLabel = (sev: number): string =>
  sev >= 4 ? "critical" : sev >= 3 ? "high" : sev >= 2 ? "medium" : "low";

const layerIcon: Record<string, LucideIcon> = {
  sos: Siren,
  crisis: TriangleAlert,
  patient: UserRound,
  hospital: HospitalIcon,
  police_station: Shield,
  civil_defense: Truck,
};

const mobilityLabels: Record<string, string> = {
  can_walk: "Can Walk",
  wheelchair: "Wheelchair",
  bedridden: "Bedridden",
  other: "Other",
};

const sosStatusTone = (status: string): BadgeTone =>
  status === "RESOLVED" ? "success" : status === "PENDING" ? "danger" : "warning";

// ─── Component ────────────────────────────────────────────

const MapDetailPanel: React.FC = () => {
  const { t } = useTranslation();
  const { selectedEvent, setSelectedEvent } = useMapStore();
  const panelRef = useRef<HTMLDivElement>(null);

  // API data states
  const [patient, setPatient] = useState<Patient | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [sosHistory, setSosHistory] = useState<SOSHistoryItem[]>([]);
  const [nearestHospital, setNearestHospital] =
    useState<NearestHospitalResponse | null>(null);
  const [relatedAlerts, setRelatedAlerts] = useState<Alert[]>([]);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const close = useCallback(() => setSelectedEvent(null), [setSelectedEvent]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        close();
      }
    };
    // Slight delay so the click that opened the panel doesn't immediately close it
    const timer = setTimeout(
      () => window.addEventListener("mousedown", handler),
      100
    );
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handler);
    };
  }, [close]);

  // Fetch data when event changes
  useEffect(() => {
    if (!selectedEvent) return;
    let cancelled = false;

    // Reset
    setPatient(null);
    setRecords([]);
    setSosHistory([]);
    setNearestHospital(null);
    setRelatedAlerts([]);

    const patientId =
      (selectedEvent.metadata?.patient_id as string) ?? null;

    // Fetch patient data
    if (patientId) {
      setLoadingPatient(true);
      Promise.all([
        getPatient(patientId).catch(() => null),
        getPatientRecords(patientId).catch(() => []),
        getPatientSOS(patientId).catch(() => []),
        getPatientNearestHospital(patientId).catch(() => null),
      ]).then(([p, r, s, h]) => {
        if (cancelled) return;
        setPatient(p);
        setRecords((r ?? []).slice(0, 3));
        setSosHistory((s ?? []).slice(0, 5));
        setNearestHospital(h);
        setLoadingPatient(false);
      });
    }

    // Fetch related alerts (same event_type, recent)
    setLoadingAlerts(true);
    getAlerts({
      event_type: selectedEvent.event_type,
      limit: 5,
    })
      .then((alerts) => {
        if (cancelled) return;
        // Filter by proximity — ~50km bounding box
        const nearby = alerts.filter((a) => {
          if (!a.latitude || !a.longitude) return false;
          const dlat = Math.abs(a.latitude - selectedEvent.latitude);
          const dlon = Math.abs(a.longitude - selectedEvent.longitude);
          return dlat < 0.5 && dlon < 0.5;
        });
        setRelatedAlerts(nearby.slice(0, 3));
        setLoadingAlerts(false);
      })
      .catch(() => {
        if (!cancelled) setLoadingAlerts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEvent]);

  if (!selectedEvent) return null;

  const event = selectedEvent;
  const info = event.metadata?.patient_info as
    | MapEventPatientInfo
    | undefined;
  const patientId = (event.metadata?.patient_id as string) ?? null;
  const patientStatus = event.metadata?.patient_status as string | undefined;
  const eventLabel =
    eventTypeLabels[event.event_type]?.en ?? event.event_type;
  const HeaderIcon = layerIcon[event.layer] ?? MapPin;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${event.title ?? eventLabel} details`}
      className="detail-panel-slide fixed end-0 top-0 z-[1100] h-full w-full max-w-md overflow-y-auto border-s border-edge bg-surface shadow-3"
    >
      {/* ─── Header ─────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-edge bg-surface px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-on-accent-soft"
          >
            <HeaderIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-ink">
              {event.title ?? eventLabel}
            </h2>
            <p className="text-xs text-ink-muted">
              {timeAgo(event.created_at)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close details panel"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-0 divide-y divide-edge">
        {/* ─── Event Summary ────────────────────────── */}
        <Section title="Event Summary">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge severity={severityLabel(event.severity)} size="sm" />
            {patientStatus && (
              <Badge tone="high" size="sm">
                {patientStatus}
              </Badge>
            )}
            <Badge tone="neutral" size="sm">
              {event.layer}
            </Badge>
          </div>
          <InfoRow label="Type" value={eventLabel} />
          <InfoRow label="Source" value={event.source} />
          <InfoRow
            label="Location"
            value={`${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`}
          />
          {event.details && (
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              {event.details}
            </p>
          )}
        </Section>

        {/* ─── Related Alerts ───────────────────────── */}
        <Section title="Related Alerts">
          {loadingAlerts ? (
            <LoadingSpinner size="sm" text="Loading related alerts" />
          ) : relatedAlerts.length === 0 ? (
            <Empty text="No related alerts nearby" />
          ) : (
            <div className="space-y-2">
              {relatedAlerts.map((a) => (
                <div
                  key={a.id}
                  className="rounded-lg border border-edge bg-surface-2 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-ink">
                      {a.title}
                    </span>
                    <StatusBadge severity={a.severity} size="sm" />
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {timeAgo(a.created_at)} · {a.source ?? "system"}
                  </p>
                  {a.details && (
                    <p className="mt-1 text-xs text-ink-muted line-clamp-2">
                      {a.details}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ─── Patient Profile ──────────────────────── */}
        {(patientId || info) && (
          <Section title="Patient Profile">
            {loadingPatient && !info ? (
              <LoadingSpinner size="sm" text="Loading patient" />
            ) : (
              <>
                {/* Identity */}
                <div className="mb-3 flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-on-accent-soft"
                  >
                    {(patient?.name ?? info?.name ?? "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-ink">
                      {patient?.name ?? info?.name ?? "Unknown"}
                    </p>
                    {(patient?.phone ?? info?.phone) && (
                      <a
                        href={`tel:${patient?.phone ?? info?.phone}`}
                        className="rounded-sm text-xs text-link underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-focus"
                        dir="ltr"
                      >
                        {patient?.phone ?? info?.phone}
                      </a>
                    )}
                  </div>
                </div>

                {/* Quick badges */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {(patient?.blood_type ?? info?.blood_type) && (
                    <Badge tone="danger" size="sm">
                      {patient?.blood_type ?? info?.blood_type ?? ""}
                    </Badge>
                  )}
                  {(patient?.gender ?? info?.gender) && (
                    <Badge tone="neutral" size="sm">
                      {patient?.gender ?? info?.gender ?? ""}
                    </Badge>
                  )}
                  {(patient?.mobility ?? info?.mobility) && (
                    <Badge tone="high" size="sm">
                      {mobilityLabels[
                        patient?.mobility ?? info?.mobility ?? ""
                      ] ??
                        patient?.mobility ??
                        info?.mobility ??
                        ""}
                    </Badge>
                  )}
                  {patient?.date_of_birth && (
                    <Badge tone="neutral" size="sm">
                      {`DOB: ${patient.date_of_birth}`}
                    </Badge>
                  )}
                  {patient?.national_id && (
                    <Badge tone="neutral" size="sm">
                      {`ID: ${patient.national_id}`}
                    </Badge>
                  )}
                </div>

                {/* Trust score */}
                {(patient?.trust_score ?? info?.trust_score) != null && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs text-ink-faint">Trust</span>
                    <div
                      role="meter"
                      aria-label="Trust score"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(
                        (patient?.trust_score ?? info?.trust_score ?? 1) * 100
                      )}
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
                    >
                      <div
                        className={`h-full rounded-full ${
                          (patient?.trust_score ?? info?.trust_score ?? 1) >=
                          0.7
                            ? "bg-success"
                            : (patient?.trust_score ??
                                  info?.trust_score ??
                                  1) >= 0.4
                              ? "bg-warning"
                              : "bg-danger"
                        }`}
                        style={{
                          width: `${(patient?.trust_score ?? info?.trust_score ?? 1) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-ink-muted">
                      {(
                        (patient?.trust_score ?? info?.trust_score ?? 1) *
                        100
                      ).toFixed(0)}
                      %
                    </span>
                  </div>
                )}

                {/* SOS stats */}
                {patient && (
                  <div className="flex gap-4 text-xs text-ink-muted">
                    <span>
                      Total SOS:{" "}
                      <strong className="text-ink">
                        {patient.total_sos_count}
                      </strong>
                    </span>
                    <span>
                      False alarms:{" "}
                      <strong className="text-ink">
                        {patient.false_alarm_count}
                      </strong>
                    </span>
                  </div>
                )}
              </>
            )}
          </Section>
        )}

        {/* ─── Medical Info ─────────────────────────── */}
        {(patientId || info) && (
          <Section title="Medical Info">
            {loadingPatient && !info ? (
              <LoadingSpinner size="sm" text="Loading medical info" />
            ) : (
              <div className="space-y-2">
                <TagList
                  label="Chronic Conditions"
                  items={
                    patient?.chronic_conditions ??
                    info?.chronic_conditions ??
                    []
                  }
                  tone="danger"
                />
                <TagList
                  label="Allergies"
                  items={patient?.allergies ?? info?.allergies ?? []}
                  tone="warning"
                />
                <TagList
                  label="Medications"
                  items={
                    patient?.current_medications ??
                    info?.current_medications ??
                    []
                  }
                  tone="info"
                />
                <TagList
                  label="Special Equipment"
                  items={
                    patient?.special_equipment ??
                    info?.special_equipment ??
                    []
                  }
                  tone="accent"
                />
                {patient?.notes && (
                  <div>
                    <span className="text-xs font-semibold text-ink-muted">
                      Notes:{" "}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {patient.notes}
                    </span>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {/* ─── Emergency Contacts ───────────────────── */}
        {((patient?.emergency_contacts?.length ?? 0) > 0 ||
          (info?.emergency_contacts?.length ?? 0) > 0) && (
          <Section title="Emergency Contacts">
            {(patient?.emergency_contacts ?? info?.emergency_contacts ?? []).map(
              (c, i) => (
                <div
                  key={i}
                  className="flex min-h-11 items-center justify-between gap-2 py-1.5"
                >
                  <div className="min-w-0">
                    <span className="text-sm text-ink">{c.name}</span>
                    {(c as { relationship?: string }).relationship && (
                      <span className="ms-1 text-xs text-ink-faint">
                        ({(c as { relationship?: string }).relationship})
                      </span>
                    )}
                  </div>
                  <a
                    href={`tel:${c.phone}`}
                    className="rounded-sm text-sm font-semibold text-link underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-focus"
                    dir="ltr"
                  >
                    {c.phone}
                  </a>
                </div>
              )
            )}
          </Section>
        )}

        {/* ─── SOS History ──────────────────────────── */}
        {patientId && (
          <Section title="SOS History">
            {loadingPatient ? (
              <LoadingSpinner size="sm" text="Loading SOS history" />
            ) : sosHistory.length === 0 ? (
              <Empty text="No SOS history" />
            ) : (
              <div className="space-y-2">
                {sosHistory.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-edge bg-surface-2 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          severity={severityLabel(s.severity)}
                          size="sm"
                        />
                        <span className="text-xs font-semibold text-ink-muted">
                          {s.patient_status}
                        </span>
                      </div>
                      <Badge tone={sosStatusTone(s.status)} size="sm" dot>
                        {s.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-faint">
                      {timeAgo(s.created_at)} · {s.source}
                      {s.auto_resolved && " · Auto-resolved"}
                    </p>
                    {s.details && (
                      <p className="mt-1 text-xs text-ink-muted line-clamp-2">
                        {s.details}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ─── Nearest Hospital ─────────────────────── */}
        {patientId && nearestHospital?.hospital && (
          <Section title="Nearest Hospital">
            <div className="rounded-lg border border-edge bg-surface-2 px-3 py-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  {nearestHospital.hospital.name}
                </span>
                <span className="text-xs font-semibold text-on-accent-soft">
                  {nearestHospital.hospital.distance_km.toFixed(1)} km
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-ink-muted">
                <span>
                  Status:{" "}
                  <strong className="text-ink">
                    {nearestHospital.hospital.status}
                  </strong>
                </span>
                <span>
                  Beds:{" "}
                  <strong className="text-ink">
                    {nearestHospital.hospital.available_beds}
                  </strong>
                </span>
              </div>
              {nearestHospital.hospital.phone && (
                <a
                  href={`tel:${nearestHospital.hospital.phone}`}
                  className="mt-1 block rounded-sm text-xs text-link underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-focus"
                  dir="ltr"
                >
                  {nearestHospital.hospital.phone}
                </a>
              )}
            </div>
          </Section>
        )}

        {/* ─── Medical Records ──────────────────────── */}
        {patientId && records.length > 0 && (
          <Section title="Medical Records">
            <div className="space-y-2">
              {records.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-edge bg-surface-2 px-3 py-2"
                >
                  <p className="mb-1 text-xs text-ink-faint">
                    {timeAgo(r.created_at)}
                  </p>
                  {r.conditions?.length > 0 && (
                    <p className="text-xs text-ink-muted">
                      <strong className="text-ink">Conditions:</strong>{" "}
                      {r.conditions.join(", ")}
                    </p>
                  )}
                  {r.medications?.length > 0 && (
                    <p className="text-xs text-ink-muted">
                      <strong className="text-ink">Medications:</strong>{" "}
                      {r.medications.join(", ")}
                    </p>
                  )}
                  {r.notes && (
                    <p className="mt-1 text-xs italic text-ink-muted">
                      {r.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Bottom padding */}
      <div className="h-8" />
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────

const Section: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <div className="px-5 py-4">
    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-faint">
      {title}
    </h3>
    {children}
  </div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between py-0.5 text-xs">
    <span className="text-ink-faint">{label}</span>
    <span className="font-semibold text-ink">{value}</span>
  </div>
);

const TagList: React.FC<{
  label: string;
  items: string[];
  tone: BadgeTone;
}> = ({ label, items, tone }) => {
  if (items.length === 0) return null;
  return (
    <div>
      <span className="text-xs font-semibold text-ink-muted">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((item, i) => (
          <Badge key={i} tone={tone} size="sm">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
};

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-xs italic text-ink-faint">{text}</p>
);

export default MapDetailPanel;
