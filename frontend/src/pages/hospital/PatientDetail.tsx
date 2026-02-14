import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
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

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  acknowledged: "bg-blue-100 text-blue-800",
  dispatched: "bg-purple-100 text-purple-800",
  resolved: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
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
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">
          {error || "Patient not found"}
        </div>
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
      {/* Back button + actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={() => { setEditing(false); setEditFields({}); }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || Object.keys(editFields).length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Edit Patient
            </button>
          )}
        </div>
      </div>

      {/* ── Header Card + Map ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Patient header */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
                {patient.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {patient.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  {patient.date_of_birth && (
                    <span>{calculateAge(patient.date_of_birth)} yrs</span>
                  )}
                  {patient.gender && (
                    <span>{genderLabel[patient.gender] ?? patient.gender}</span>
                  )}
                  <span>Registered {formatDate(patient.created_at)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!patient.is_active && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                  Inactive
                </span>
              )}
              {(patient.mobility === "bedridden" ||
                patient.mobility === "wheelchair") && (
                <StatusBadge
                  severity={patient.mobility === "bedridden" ? "critical" : "high"}
                  size="md"
                />
              )}
            </div>
          </div>

          {/* Trust score bar */}
          {patient.trust_score != null && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs font-medium text-gray-500">Trust Score</span>
              <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    patient.trust_score >= 0.7
                      ? "bg-green-500"
                      : patient.trust_score >= 0.4
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${(patient.trust_score ?? 1) * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-700">
                {((patient.trust_score ?? 1) * 100).toFixed(0)}%
              </span>
              {(patient.total_sos_count ?? 0) > 0 && (
                <span className="text-xs text-gray-400">
                  ({patient.total_sos_count} SOS, {patient.false_alarm_count ?? 0} false)
                </span>
              )}
            </div>
          )}

          {/* Info grid */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>

          {/* Emergency Contacts */}
          {contacts.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
                Emergency Contacts
              </h3>
              <div className="space-y-2">
                {contacts.map((contact, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        {contact.name}
                      </span>
                      {contact.relationship && (
                        <span className="ms-2 text-xs text-gray-400">
                          ({contact.relationship})
                        </span>
                      )}
                    </div>
                    <a
                      href={`tel:${contact.phone}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      dir="ltr"
                    >
                      {contact.phone}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mini Map + Nearest Hospital */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
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
                        <p className="font-semibold">{patient.name}</p>
                        <p className="text-gray-500">
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
                          <p className="font-semibold">SOS — {sos.status}</p>
                          <p>{timeAgo(sos.created_at)}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
              </MapContainer>
            </div>
          </div>

          {/* Nearest Hospital card */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Nearest Hospital
            </h3>
            {nearHosp ? (
              <div className="space-y-2">
                <p className="text-base font-semibold text-gray-900">
                  {nearHosp.name}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                    {nearHosp.distance_km} km
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 font-medium ${
                      nearHosp.status === "operational"
                        ? "bg-green-50 text-green-700"
                        : nearHosp.status === "limited"
                        ? "bg-yellow-50 text-yellow-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {nearHosp.status}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                    {nearHosp.available_beds} beds
                  </span>
                </div>
                {nearHosp.phone && (
                  <a
                    href={`tel:${nearHosp.phone}`}
                    className="mt-1 inline-block text-xs text-blue-600 hover:text-blue-800"
                    dir="ltr"
                  >
                    {nearHosp.phone}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No nearby hospital data</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Medical Information ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold text-gray-900">
          Medical Information
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <TagSection
            title="Chronic Conditions"
            items={allConditions}
            color="red"
          />
          <TagSection
            title="Allergies"
            items={allAllergies}
            color="yellow"
          />
          <TagSection
            title="Current Medications"
            items={allMedications}
            color="blue"
          />
          <TagSection
            title="Special Equipment"
            items={allEquipment}
            color="purple"
          />
        </div>

        {/* Notes section */}
        {(patient.notes || latestRecord?.notes) && (
          <div className="mt-5 rounded-lg bg-gray-50 p-4">
            <h3 className="mb-1 text-sm font-semibold text-gray-700">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {patient.notes || latestRecord?.notes}
            </p>
          </div>
        )}
      </div>

      {/* ── SOS History ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            SOS History
          </h2>
          {sosHistory.length > 0 && (
            <span className="text-xs text-gray-400">
              {sosHistory.length} record{sosHistory.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {sosHistory.length > 0 ? (
          <div className="space-y-3">
            {sosHistory.map((sos) => (
              <div
                key={sos.id}
                className="rounded-lg border border-gray-100 bg-gray-50 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusColors[sos.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {sos.status}
                    </span>
                    {sos.patient_status && (
                      <span className="text-xs text-gray-500">
                        {sos.patient_status}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {timeAgo(sos.created_at)}
                  </span>
                </div>
                {sos.details && (
                  <p className="mt-2 text-sm text-gray-600">{sos.details}</p>
                )}
                {sos.latitude != null && sos.longitude != null && (
                  <p className="mt-1 text-xs text-gray-400">
                    Location: {sos.latitude.toFixed(4)},{" "}
                    {sos.longitude.toFixed(4)}
                  </p>
                )}
                {sos.resolved_at && (
                  <p className="mt-1 text-xs text-green-600">
                    Resolved {timeAgo(sos.resolved_at)}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-gray-50 py-8 text-center">
            <p className="text-sm text-gray-400">No SOS history</p>
          </div>
        )}
      </div>

      {/* ── Medical Records (from separate table) ── */}
      {records.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Medical Record History
          </h2>
          <div className="space-y-4">
            {records.map((rec) => (
              <div
                key={rec.id}
                className="rounded-lg border border-gray-100 bg-gray-50 p-4"
              >
                <div className="flex justify-between text-xs text-gray-500 mb-3">
                  <span>Record #{rec.id.slice(0, 8)}</span>
                  <span>{formatDate(rec.created_at)}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {rec.conditions.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">
                        Conditions:
                      </span>
                      <span className="ms-1 text-sm text-gray-700">
                        {rec.conditions.join(", ")}
                      </span>
                    </div>
                  )}
                  {rec.medications.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">
                        Medications:
                      </span>
                      <span className="ms-1 text-sm text-gray-700">
                        {rec.medications.join(", ")}
                      </span>
                    </div>
                  )}
                  {rec.allergies.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">
                        Allergies:
                      </span>
                      <span className="ms-1 text-sm text-gray-700">
                        {rec.allergies.join(", ")}
                      </span>
                    </div>
                  )}
                  {rec.notes && (
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500">
                        Notes:
                      </span>
                      <span className="ms-1 text-sm text-gray-700">
                        {rec.notes}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
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
    <dt className="text-xs font-medium text-gray-400">{label}</dt>
    <dd
      className={`mt-0.5 text-sm font-medium ${
        highlight ? "text-red-700" : "text-gray-900"
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
  color: "red" | "yellow" | "blue" | "purple";
}> = ({ title, items, color }) => {
  const colorMap = {
    red: "bg-red-50 text-red-700",
    yellow: "bg-yellow-50 text-yellow-700",
    blue: "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{title}</h3>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={i}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${colorMap[color]}`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">None recorded</p>
      )}
    </div>
  );
};

export default PatientDetail;
