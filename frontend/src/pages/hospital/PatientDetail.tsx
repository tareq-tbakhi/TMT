import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import {
  ArrowLeft,
  Building2,
  CircleCheck,
  ClipboardList,
  FileText,
  History,
  MapPin,
  Phone,
  Save,
  SquarePen,
  Stethoscope,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LoadingState,
  PageHeader,
  statusTone,
  type BadgeTone,
} from "../../components/ui";
import StatusBadge from "../../components/common/StatusBadge";
import { timeAgo, formatDate } from "../../utils/formatting";
import {
  getPatient,
  getPatientRecords,
  getPatientSOS,
  getPatientNearestHospital,
  updatePatient,
} from "../../services/api";
import type {
  Patient,
  MedicalRecord,
  SOSHistoryItem,
  NearestHospitalResponse,
} from "../../services/api";

// Fix Leaflet default marker icon
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const sosIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [20, 33],
  iconAnchor: [10, 33],
  popupAnchor: [1, -28],
  shadowSize: [33, 33],
  className: "hue-rotate-[200deg] saturate-200",
});

// --- Label maps ---
const mobilityLabel: Record<string, string> = {
  can_walk: "Can Walk",
  wheelchair: "Wheelchair",
  bedridden: "Bedridden",
  other: "Other",
};

const livingLabel: Record<string, string> = {
  alone: "Alone",
  with_family: "With Family",
  care_facility: "Care Facility",
};

const genderLabel: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

const sosStatusTone: Record<string, BadgeTone> = {
  pending: "warning",
  acknowledged: "info",
  dispatched: "accent",
  resolved: "success",
  cancelled: "neutral",
};

// --- Reverse geocoding via Nominatim ---
async function reverseGeocode(
  lat: number,
  lon: number
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`,
      { headers: { "User-Agent": "TMT-Platform/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Build a short display name from address parts
    const addr = data.address;
    if (!addr) return data.display_name || null;
    const parts = [
      addr.road || addr.neighbourhood || addr.suburb,
      addr.city || addr.town || addr.village,
      addr.state || addr.governorate,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : data.display_name || null;
  } catch {
    return null;
  }
}

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// --- Component ---
const PatientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [sosHistory, setSosHistory] = useState<SOSHistoryItem[]>([]);
  const [nearestHospital, setNearestHospital] =
    useState<NearestHospitalResponse | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const patientData = await getPatient(id);
      setPatient(patientData);

      // Parallel fetch of supplementary data (don't fail if these 404)
      const [recs, sos, hosp] = await Promise.all([
        getPatientRecords(id).catch(() => [] as MedicalRecord[]),
        getPatientSOS(id).catch(() => [] as SOSHistoryItem[]),
        getPatientNearestHospital(id).catch(() => null),
      ]);
      setRecords(recs);
      setSosHistory(sos);
      setNearestHospital(hosp);

      // Reverse geocode location
      if (patientData.location_name) {
        setLocationName(patientData.location_name);
      } else if (
        patientData.latitude != null &&
        patientData.longitude != null
      ) {
        reverseGeocode(patientData.latitude, patientData.longitude).then(
          (name) => {
            if (name) setLocationName(name);
          }
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load patient"
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!id || !patient) return;
    setSaving(true);
    try {
      const updated = await updatePatient(id, editFields as Partial<Patient>);
      setPatient(updated);
      setEditing(false);
      setEditFields({});
    } catch {
      // keep editing mode open
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading patient" />;
  }

  if (error || !patient) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          icon={<ArrowLeft className="rtl:rotate-180" />}
          onClick={() => navigate(-1)}
        >
          Back
        </Button>
        <Card className="border-danger bg-danger-soft">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <TriangleAlert aria-hidden="true" className="h-8 w-8 text-danger" />
            <p className="text-base font-semibold text-on-danger-soft">
              {error || "Patient not found"}
            </p>
            <Button variant="secondary" onClick={fetchData}>
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const hasLocation =
    patient.latitude != null && patient.longitude != null;
  const mapCenter: [number, number] = hasLocation
    ? [patient.latitude!, patient.longitude!]
    : [31.5, 34.47];

  const contacts = patient.emergency_contacts ?? [];
  const conditions = patient.chronic_conditions ?? [];
  const allergies = patient.allergies ?? [];
  const medications = patient.current_medications ?? [];
  const equipment = patient.special_equipment ?? [];

  const latestRecord = records.length > 0 ? records[0] : null;
  const nearHosp = nearestHospital?.hospital;

  // Merge patient-level medical info with latest medical record
  const allConditions = [
    ...conditions,
    ...(latestRecord?.conditions ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const allAllergies = [
    ...allergies,
    ...(latestRecord?.allergies ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const allMedications = [
    ...medications,
    ...(latestRecord?.medications ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const allEquipment = [
    ...equipment,
    ...(latestRecord?.special_equipment ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        icon={<ArrowLeft className="rtl:rotate-180" />}
        onClick={() => navigate(-1)}
      >
        Back
      </Button>

      {/* Page header with edit actions */}
      <PageHeader
        icon={<UserRound />}
        title={patient.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {patient.date_of_birth && (
              <span>{calculateAge(patient.date_of_birth)} yrs</span>
            )}
            {patient.gender && (
              <span>{genderLabel[patient.gender] ?? patient.gender}</span>
            )}
            <span>Registered {formatDate(patient.created_at)}</span>
          </span>
        }
        actions={
          <>
            {!patient.is_active && (
              <Badge tone="neutral" size="sm">
                Inactive
              </Badge>
            )}
            {(patient.mobility === "bedridden" ||
              patient.mobility === "wheelchair") && (
              <StatusBadge
                severity={patient.mobility === "bedridden" ? "critical" : "high"}
                size="md"
              />
            )}
            {editing ? (
              <>
                <Button
                  variant="secondary"
                  icon={<X />}
                  onClick={() => { setEditing(false); setEditFields({}); }}
                >
                  Cancel
                </Button>
                <Button
                  icon={<Save />}
                  loading={saving}
                  disabled={saving || Object.keys(editFields).length === 0}
                  onClick={handleSave}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                icon={<SquarePen />}
                onClick={() => setEditing(true)}
              >
                Edit Patient
              </Button>
            )}
          </>
        }
      />

      {/* ── Header Card + Map ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Patient overview */}
        <Card className="lg:col-span-2">
          <CardHeader icon={<ClipboardList />} title="Patient Overview" />

          {/* Trust score bar */}
          {patient.trust_score != null && (
            <div className="flex items-center gap-3">
              <span id="trust-score-label" className="text-xs font-semibold text-ink-muted">
                Trust Score
              </span>
              <div
                role="meter"
                aria-labelledby="trust-score-label"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((patient.trust_score ?? 1) * 100)}
                className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
              >
                <div
                  className={`h-full rounded-full ${
                    patient.trust_score >= 0.7
                      ? "bg-success"
                      : patient.trust_score >= 0.4
                      ? "bg-warning"
                      : "bg-danger"
                  }`}
                  style={{ width: `${(patient.trust_score ?? 1) * 100}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-ink">
                {((patient.trust_score ?? 1) * 100).toFixed(0)}%
              </span>
              {(patient.total_sos_count ?? 0) > 0 && (
                <span className="text-xs text-ink-faint">
                  ({patient.total_sos_count} SOS, {patient.false_alarm_count ?? 0} false)
                </span>
              )}
            </div>
          )}

          {/* Info grid */}
          <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label="Phone" value={patient.phone} dir="ltr" />
            <InfoItem
              label="Blood Type"
              value={patient.blood_type ?? "—"}
              highlight={!!patient.blood_type}
            />
            <InfoItem
              label="Mobility"
              value={mobilityLabel[patient.mobility] ?? patient.mobility}
            />
            <InfoItem
              label="Living Situation"
              value={livingLabel[patient.living_situation] ?? patient.living_situation}
            />
            <InfoItem
              label="Location"
              value={
                locationName
                  ? locationName
                  : hasLocation
                  ? `${patient.latitude!.toFixed(4)}, ${patient.longitude!.toFixed(4)}`
                  : "—"
              }
            />
            <InfoItem
              label="Language"
              value={patient.primary_language === "ar" ? "Arabic" : patient.primary_language === "en" ? "English" : (patient.primary_language ?? "—")}
            />
            {patient.national_id && (
              <InfoItem label="National ID" value={patient.national_id} />
            )}
            {patient.height_cm != null && (
              <InfoItem label="Height" value={`${patient.height_cm} cm`} />
            )}
            {patient.weight_kg != null && (
              <InfoItem label="Weight" value={`${patient.weight_kg} kg`} />
            )}
            {patient.insurance_info && (
              <InfoItem label="Insurance" value={patient.insurance_info} />
            )}
          </dl>

          {/* Emergency Contacts */}
          {contacts.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Phone aria-hidden="true" className="h-4 w-4 text-ink-muted" />
                Emergency Contacts
              </h3>
              <div className="space-y-2">
                {contacts.map((contact, idx) => (
                  <div
                    key={idx}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-surface-2 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-ink">
                        {contact.name}
                      </span>
                      {contact.relationship && (
                        <span className="ms-2 text-xs text-ink-faint">
                          ({contact.relationship})
                        </span>
                      )}
                    </div>
                    <a
                      href={`tel:${contact.phone}`}
                      className="rounded-sm text-sm font-semibold text-link underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                      dir="ltr"
                    >
                      {contact.phone}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Mini Map + Nearest Hospital */}
        <div className="space-y-6">
          <Card flush className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-edge px-5 py-3">
              <MapPin aria-hidden="true" className="h-4 w-4 text-ink-muted" />
              <h3 className="text-sm font-semibold text-ink">
                Patient Location
              </h3>
            </div>
            <div className="h-56">
              <MapContainer
                center={mapCenter}
                zoom={hasLocation ? 14 : 10}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {hasLocation && (
                  <Marker position={[patient.latitude!, patient.longitude!]}>
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold text-ink">{patient.name}</p>
                        <p className="text-ink-muted">
                          {locationName || `${patient.latitude!.toFixed(4)}, ${patient.longitude!.toFixed(4)}`}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                )}
                {/* Show SOS locations as secondary markers */}
                {sosHistory
                  .filter((s) => s.latitude != null && s.longitude != null)
                  .slice(0, 5)
                  .map((sos) => (
                    <Marker
                      key={sos.id}
                      position={[sos.latitude!, sos.longitude!]}
                      icon={sosIcon}
                    >
                      <Popup>
                        <div className="text-xs">
                          <p className="font-semibold text-ink">SOS — {sos.status}</p>
                          <p className="text-ink-muted">{timeAgo(sos.created_at)}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
              </MapContainer>
            </div>
          </Card>

          {/* Nearest Hospital card */}
          <Card>
            <CardHeader icon={<Building2 />} title="Nearest Hospital" />
            {nearHosp ? (
              <div className="space-y-2">
                <p className="text-base font-semibold text-ink">
                  {nearHosp.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="accent" size="sm">
                    {nearHosp.distance_km} km
                  </Badge>
                  <Badge tone={statusTone(nearHosp.status)} size="sm" dot>
                    {nearHosp.status}
                  </Badge>
                  <Badge tone="neutral" size="sm">
                    {nearHosp.available_beds} beds
                  </Badge>
                </div>
                {nearHosp.phone && (
                  <a
                    href={`tel:${nearHosp.phone}`}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-link underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                    dir="ltr"
                  >
                    <Phone aria-hidden="true" className="h-3.5 w-3.5" />
                    {nearHosp.phone}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-faint">No nearby hospital data</p>
            )}
          </Card>
        </div>
      </div>

      {/* ── Medical Information ── */}
      <Card>
        <CardHeader icon={<Stethoscope />} title="Medical Information" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <TagSection
            title="Chronic Conditions"
            items={allConditions}
            tone="danger"
          />
          <TagSection
            title="Allergies"
            items={allAllergies}
            tone="warning"
          />
          <TagSection
            title="Current Medications"
            items={allMedications}
            tone="info"
          />
          <TagSection
            title="Special Equipment"
            items={allEquipment}
            tone="accent"
          />
        </div>

        {/* Notes section */}
        {(patient.notes || latestRecord?.notes) && (
          <div className="mt-5 rounded-lg bg-surface-2 p-4">
            <h3 className="mb-1 text-sm font-semibold text-ink">Notes</h3>
            <p className="whitespace-pre-wrap text-sm text-ink-muted">
              {patient.notes || latestRecord?.notes}
            </p>
          </div>
        )}
      </Card>

      {/* ── SOS History ── */}
      <Card>
        <CardHeader
          icon={<History />}
          title="SOS History"
          actions={
            sosHistory.length > 0 ? (
              <span className="text-xs text-ink-faint">
                {sosHistory.length} record{sosHistory.length !== 1 ? "s" : ""}
              </span>
            ) : undefined
          }
        />
        {sosHistory.length > 0 ? (
          <div className="space-y-3">
            {sosHistory.map((sos) => (
              <div
                key={sos.id}
                className="rounded-lg border border-edge bg-surface-2 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      severity={
                        sos.severity >= 4
                          ? "critical"
                          : sos.severity >= 3
                          ? "high"
                          : sos.severity >= 2
                          ? "medium"
                          : "low"
                      }
                      size="sm"
                    />
                    <Badge tone={sosStatusTone[sos.status] ?? "neutral"} size="sm" dot>
                      {sos.status}
                    </Badge>
                    {sos.patient_status && (
                      <span className="text-xs text-ink-muted">
                        {sos.patient_status}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink-muted">
                    {timeAgo(sos.created_at)}
                  </span>
                </div>
                {sos.details && (
                  <p className="mt-2 text-sm text-ink-muted">{sos.details}</p>
                )}
                {sos.latitude != null && sos.longitude != null && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-faint">
                    <MapPin aria-hidden="true" className="h-3 w-3" />
                    Location: {sos.latitude.toFixed(4)},{" "}
                    {sos.longitude.toFixed(4)}
                  </p>
                )}
                {sos.resolved_at && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-success">
                    <CircleCheck aria-hidden="true" className="h-3 w-3" />
                    Resolved {timeAgo(sos.resolved_at)}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<History />}
            title="No SOS history"
            className="py-8"
          />
        )}
      </Card>

      {/* ── Medical Records (from separate table) ── */}
      {records.length > 0 && (
        <Card>
          <CardHeader icon={<FileText />} title="Medical Record History" />
          <div className="space-y-4">
            {records.map((rec) => (
              <div
                key={rec.id}
                className="rounded-lg border border-edge bg-surface-2 p-4"
              >
                <div className="mb-3 flex justify-between text-xs text-ink-muted">
                  <span>Record #{rec.id.slice(0, 8)}</span>
                  <span>{formatDate(rec.created_at)}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {rec.conditions.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-ink-muted">
                        Conditions:
                      </span>
                      <span className="ms-1 text-sm text-ink">
                        {rec.conditions.join(", ")}
                      </span>
                    </div>
                  )}
                  {rec.medications.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-ink-muted">
                        Medications:
                      </span>
                      <span className="ms-1 text-sm text-ink">
                        {rec.medications.join(", ")}
                      </span>
                    </div>
                  )}
                  {rec.allergies.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-ink-muted">
                        Allergies:
                      </span>
                      <span className="ms-1 text-sm text-ink">
                        {rec.allergies.join(", ")}
                      </span>
                    </div>
                  )}
                  {rec.notes && (
                    <div className="sm:col-span-2">
                      <span className="text-xs font-semibold text-ink-muted">
                        Notes:
                      </span>
                      <span className="ms-1 text-sm text-ink">
                        {rec.notes}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

// --- Sub-components ---

const InfoItem: React.FC<{
  label: string;
  value: string;
  dir?: string;
  highlight?: boolean;
}> = ({ label, value, dir, highlight }) => (
  <div>
    <dt className="text-xs font-semibold text-ink-faint">{label}</dt>
    <dd
      className={`mt-0.5 text-sm font-semibold ${
        highlight ? "text-danger" : "text-ink"
      }`}
      dir={dir}
    >
      {value}
    </dd>
  </div>
);

const TagSection: React.FC<{
  title: string;
  items: string[];
  tone: BadgeTone;
}> = ({ title, items, tone }) => {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <Badge key={i} tone={tone} size="sm">
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-faint">None recorded</p>
      )}
    </div>
  );
};

export default PatientDetail;
