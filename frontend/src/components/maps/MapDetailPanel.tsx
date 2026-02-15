import React, { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
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

// ─── Helpers ──────────────────────────────────────────────

const severityLabel = (sev: number): string =>
  sev >= 4 ? "critical" : sev >= 3 ? "high" : sev >= 2 ? "medium" : "low";

const layerIcon: Record<string, string> = {
  sos: "🚨",
  crisis: "⚠️",
  patient: "🧑",
  hospital: "🏥",
  police_station: "🚔",
  civil_defense: "🚒",
};

const mobilityLabels: Record<string, string> = {
  can_walk: "Can Walk",
  wheelchair: "Wheelchair",
  bedridden: "Bedridden",
  other: "Other",
};

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

  return (
    <div
      ref={panelRef}
      className="detail-panel-slide fixed top-0 end-0 z-[1100] h-full w-full max-w-md overflow-y-auto border-s border-gray-200 bg-white shadow-2xl"
    >
      {/* ─── Header ─────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {layerIcon[event.layer] ?? "📍"}
          </span>
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {event.title ?? eventLabel}
            </h2>
            <p className="text-xs text-gray-500">
              {timeAgo(event.created_at)}
            </p>
          </div>
        </div>
        <button
          onClick={close}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      <div className="space-y-0 divide-y divide-gray-100">
        {/* ─── Event Summary ────────────────────────── */}
        <Section title="Event Summary">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <StatusBadge severity={severityLabel(event.severity)} size="sm" />
            {patientStatus && (
              <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                {patientStatus}
              </span>
            )}
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
              {event.layer}
            </span>
          </div>
          <InfoRow label="Type" value={eventLabel} />
          <InfoRow label="Source" value={event.source} />
          <InfoRow
            label="Location"
            value={`${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`}
          />
          {event.details && (
            <p className="mt-2 text-xs text-gray-600 leading-relaxed">
              {event.details}
            </p>
          )}
        </Section>

        {/* ─── Related Alerts ───────────────────────── */}
        <Section title="Related Alerts">
          {loadingAlerts ? (
            <LoadingSpinner size="sm" />
          ) : relatedAlerts.length === 0 ? (
            <Empty text="No related alerts nearby" />
          ) : (
            <div className="space-y-2">
              {relatedAlerts.map((a) => (
                <div
                  key={a.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-800">
                      {a.title}
                    </span>
                    <StatusBadge severity={a.severity} size="sm" />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {timeAgo(a.created_at)} · {a.source ?? "system"}
                  </p>
                  {a.details && (
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2">
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
              <LoadingSpinner size="sm" />
            ) : (
              <>
                {/* Identity */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                    {(patient?.name ?? info?.name ?? "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {patient?.name ?? info?.name ?? "Unknown"}
                    </p>
                    {(patient?.phone ?? info?.phone) && (
                      <a
                        href={`tel:${patient?.phone ?? info?.phone}`}
                        className="text-xs text-blue-600 hover:underline"
                        dir="ltr"
                      >
                        {patient?.phone ?? info?.phone}
                      </a>
                    )}
                  </div>
                </div>

                {/* Quick badges */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(patient?.blood_type ?? info?.blood_type) && (
                    <Badge
                      bg="bg-red-50"
                      text="text-red-700"
                      label={patient?.blood_type ?? info?.blood_type ?? ""}
                    />
                  )}
                  {(patient?.gender ?? info?.gender) && (
                    <Badge
                      bg="bg-gray-100"
                      text="text-gray-600"
                      label={patient?.gender ?? info?.gender ?? ""}
                    />
                  )}
                  {(patient?.mobility ?? info?.mobility) && (
                    <Badge
                      bg="bg-orange-50"
                      text="text-orange-700"
                      label={
                        mobilityLabels[
                          patient?.mobility ?? info?.mobility ?? ""
                        ] ??
                        patient?.mobility ??
                        info?.mobility ??
                        ""
                      }
                    />
                  )}
                  {patient?.date_of_birth && (
                    <Badge
                      bg="bg-gray-100"
                      text="text-gray-600"
                      label={`DOB: ${patient.date_of_birth}`}
                    />
                  )}
                  {patient?.national_id && (
                    <Badge
                      bg="bg-gray-100"
                      text="text-gray-600"
                      label={`ID: ${patient.national_id}`}
                    />
                  )}
                </div>

                {/* Trust score */}
                {(patient?.trust_score ?? info?.trust_score) != null && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-gray-400">Trust</span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          (patient?.trust_score ?? info?.trust_score ?? 1) >=
                          0.7
                            ? "bg-green-500"
                            : (patient?.trust_score ??
                                  info?.trust_score ??
                                  1) >= 0.4
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        }`}
                        style={{
                          width: `${(patient?.trust_score ?? info?.trust_score ?? 1) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">
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
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>
                      Total SOS:{" "}
                      <strong className="text-gray-700">
                        {patient.total_sos_count}
                      </strong>
                    </span>
                    <span>
                      False alarms:{" "}
                      <strong className="text-gray-700">
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
              <LoadingSpinner size="sm" />
            ) : (
              <div className="space-y-2">
                <TagList
                  label="Chronic Conditions"
                  items={
                    patient?.chronic_conditions ??
                    info?.chronic_conditions ??
                    []
                  }
                  bg="bg-red-50"
                  text="text-red-700"
                />
                <TagList
                  label="Allergies"
                  items={patient?.allergies ?? info?.allergies ?? []}
                  bg="bg-yellow-50"
                  text="text-yellow-700"
                />
                <TagList
                  label="Medications"
                  items={
                    patient?.current_medications ??
                    info?.current_medications ??
                    []
                  }
                  bg="bg-blue-50"
                  text="text-blue-700"
                />
                <TagList
                  label="Special Equipment"
                  items={
                    patient?.special_equipment ??
                    info?.special_equipment ??
                    []
                  }
                  bg="bg-purple-50"
                  text="text-purple-700"
                />
                {patient?.notes && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">
                      Notes:{" "}
                    </span>
                    <span className="text-xs text-gray-600">
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
                  className="flex items-center justify-between py-1.5"
                >
                  <div>
                    <span className="text-sm text-gray-800">{c.name}</span>
                    {(c as { relationship?: string }).relationship && (
                      <span className="ml-1 text-xs text-gray-400">
                        ({(c as { relationship?: string }).relationship})
                      </span>
                    )}
                  </div>
                  <a
                    href={`tel:${c.phone}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
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
              <LoadingSpinner size="sm" />
            ) : sosHistory.length === 0 ? (
              <Empty text="No SOS history" />
            ) : (
              <div className="space-y-2">
                {sosHistory.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          severity={severityLabel(s.severity)}
                          size="sm"
                        />
                        <span className="text-xs font-medium text-gray-600">
                          {s.patient_status}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          s.status === "RESOLVED"
                            ? "text-green-600"
                            : s.status === "PENDING"
                              ? "text-red-600"
                              : "text-yellow-600"
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {timeAgo(s.created_at)} · {s.source}
                      {s.auto_resolved && " · Auto-resolved"}
                    </p>
                    {s.details && (
                      <p className="mt-1 text-xs text-gray-500 line-clamp-2">
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
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-gray-800">
                  {nearestHospital.hospital.name}
                </span>
                <span className="text-xs font-medium text-blue-600">
                  {nearestHospital.hospital.distance_km.toFixed(1)} km
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>
                  Status:{" "}
                  <strong className="text-gray-700">
                    {nearestHospital.hospital.status}
                  </strong>
                </span>
                <span>
                  Beds:{" "}
                  <strong className="text-gray-700">
                    {nearestHospital.hospital.available_beds}
                  </strong>
                </span>
              </div>
              {nearestHospital.hospital.phone && (
                <a
                  href={`tel:${nearestHospital.hospital.phone}`}
                  className="mt-1 block text-xs text-blue-600 hover:underline"
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
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <p className="text-xs text-gray-400 mb-1">
                    {timeAgo(r.created_at)}
                  </p>
                  {r.conditions?.length > 0 && (
                    <p className="text-xs text-gray-600">
                      <strong className="text-gray-700">Conditions:</strong>{" "}
                      {r.conditions.join(", ")}
                    </p>
                  )}
                  {r.medications?.length > 0 && (
                    <p className="text-xs text-gray-600">
                      <strong className="text-gray-700">Medications:</strong>{" "}
                      {r.medications.join(", ")}
                    </p>
                  )}
                  {r.notes && (
                    <p className="mt-1 text-xs text-gray-500 italic">
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
    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
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
    <span className="text-gray-400">{label}</span>
    <span className="font-medium text-gray-700">{value}</span>
  </div>
);

const Badge: React.FC<{ bg: string; text: string; label: string }> = ({
  bg,
  text,
  label,
}) => (
  <span
    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${bg} ${text}`}
  >
    {label}
  </span>
);

const TagList: React.FC<{
  label: string;
  items: string[];
  bg: string;
  text: string;
}> = ({ label, items, bg, text }) => {
  if (items.length === 0) return null;
  return (
    <div>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((item, i) => (
          <Badge key={i} bg={bg} text={text} label={item} />
        ))}
      </div>
    </div>
  );
};

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-xs text-gray-400 italic">{text}</p>
);

export default MapDetailPanel;
