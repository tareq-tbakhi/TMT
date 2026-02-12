import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import StatusBadge from "../../components/common/StatusBadge";
import { timeAgo, formatDate } from "../../utils/formatting";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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

interface PatientData {
  id: string;
  name: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  mobility: string;
  living_situation: string;
  blood_type: string | null;
  emergency_contacts: Array<{ name: string; phone: string }>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MedicalRecord {
  id: string;
  conditions: string[];
  medications: string[];
  allergies: string[];
  special_equipment: string[];
  notes: string | null;
  created_at: string;
}

interface SOSHistoryItem {
  id: string;
  status: string;
  severity: number;
  details: string | null;
  latitude: number;
  longitude: number;
  hospital_notified_id: string | null;
  created_at: string;
}

interface NearestHospital {
  id: string;
  name: string;
  distance_km: number;
  status: string;
  available_beds: number;
}

const PatientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [patient, setPatient] = useState<PatientData | null>(null);
  const [records, setRecords] = useState<MedicalRecord | null>(null);
  const [sosHistory, setSosHistory] = useState<SOSHistoryItem[]>([]);
  const [nearestHospital, setNearestHospital] = useState<NearestHospital | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const token = localStorage.getItem("tmt-token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [patientRes, recordsRes, sosRes, hospitalRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/patients/${id}`, { headers }),
          fetch(`${API_URL}/api/v1/patients/${id}/records`, { headers }).catch(
            () => null
          ),
          fetch(`${API_URL}/api/v1/patients/${id}/sos`, { headers }).catch(
            () => null
          ),
          fetch(`${API_URL}/api/v1/patients/${id}/nearest-hospital`, {
            headers,
          }).catch(() => null),
        ]);

        if (patientRes.ok) {
          setPatient((await patientRes.json()) as PatientData);
        } else {
          setError("Patient not found");
          return;
        }

        if (recordsRes?.ok) {
          setRecords((await recordsRes.json()) as MedicalRecord);
        }

        if (sosRes?.ok) {
          setSosHistory((await sosRes.json()) as SOSHistoryItem[]);
        }

        if (hospitalRes?.ok) {
          setNearestHospital(
            (await hospitalRes.json()) as NearestHospital
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load patient");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

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
          onClick={() => navigate("/dashboard/patients")}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; {t("common.back")}
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">
          {error || "Patient not found"}
        </div>
      </div>
    );
  }

  const hasLocation = patient.latitude != null && patient.longitude != null;
  const mapCenter: [number, number] = hasLocation
    ? [patient.latitude!, patient.longitude!]
    : [31.5, 34.47];

  const mobilityLabel: Record<string, string> = {
    ambulatory: "Ambulatory",
    wheelchair: "Wheelchair",
    bedridden: "Bedridden",
    crutches: "Crutches",
  };

  const livingLabel: Record<string, string> = {
    home: "Home",
    shelter: "Shelter",
    hospital: "Hospital",
    displaced: "Displaced",
    tent: "Tent",
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate("/dashboard/patients")}
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Patients
      </button>

      {/* Patient Info Card + Map Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Patient Info */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {patient.name}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Registered {formatDate(patient.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(patient.mobility === "bedridden" ||
                patient.mobility === "wheelchair") && (
                <StatusBadge
                  severity={
                    patient.mobility === "bedridden" ? "critical" : "high"
                  }
                  size="md"
                />
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label={t("patients.phone")} value={patient.phone} />
            <InfoItem
              label="Blood Type"
              value={patient.blood_type ?? "Unknown"}
            />
            <InfoItem
              label={t("patients.mobility")}
              value={mobilityLabel[patient.mobility] ?? patient.mobility}
            />
            <InfoItem
              label="Living Situation"
              value={
                livingLabel[patient.living_situation] ??
                patient.living_situation
              }
            />
            <InfoItem
              label={t("patients.location")}
              value={
                hasLocation
                  ? `${patient.latitude!.toFixed(4)}, ${patient.longitude!.toFixed(4)}`
                  : "Unknown"
              }
            />
            <InfoItem
              label={t("patients.status")}
              value={patient.is_active ? "Active" : "Inactive"}
            />
          </div>

          {/* Emergency Contacts */}
          {patient.emergency_contacts.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
                Emergency Contacts
              </h3>
              <div className="space-y-2">
                {patient.emergency_contacts.map((contact, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2"
                  >
                    <span className="text-sm font-medium text-gray-700">
                      {contact.name}
                    </span>
                    <a
                      href={`tel:${contact.phone}`}
                      className="text-sm text-blue-600 hover:text-blue-800"
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

        {/* Mini Map */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Patient Location
            </h3>
          </div>
          <div className="h-64 lg:h-80">
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
                      <p className="text-gray-500">{patient.phone}</p>
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>
      </div>

      {/* Medical Records */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Medical Records
        </h2>
        {records ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                Conditions
              </h3>
              {records.conditions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {records.conditions.map((c, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">None recorded</p>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                Medications
              </h3>
              {records.medications.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {records.medications.map((m, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">None recorded</p>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                Allergies
              </h3>
              {records.allergies.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {records.allergies.map((a, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">None recorded</p>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                Special Equipment
              </h3>
              {records.special_equipment.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {records.special_equipment.map((e, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">None recorded</p>
              )}
            </div>

            {records.notes && (
              <div className="sm:col-span-2">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">
                  Notes
                </h3>
                <p className="text-sm text-gray-600">{records.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No medical records available</p>
        )}
      </div>

      {/* SOS History + Nearest Hospital */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* SOS History */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Recent SOS History
          </h2>
          {sosHistory.length > 0 ? (
            <div className="space-y-3">
              {sosHistory.map((sos) => (
                <div
                  key={sos.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex items-center justify-between">
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
                    <span className="text-xs text-gray-500">
                      {timeAgo(sos.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">
                    Status: <span className="font-medium">{sos.status}</span>
                  </p>
                  {sos.details && (
                    <p className="mt-1 text-xs text-gray-500">{sos.details}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    Location: {sos.latitude.toFixed(3)}, {sos.longitude.toFixed(3)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No SOS history</p>
          )}
        </div>

        {/* Nearest Hospital */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Nearest Hospital
          </h2>
          {nearestHospital ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {nearestHospital.name}
                </h3>
                <StatusBadge status={nearestHospital.status} size="sm" />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Distance</span>
                  <span className="font-medium text-gray-900">
                    {nearestHospital.distance_km.toFixed(1)} km
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Available Beds</span>
                  <span className="font-medium text-gray-900">
                    {nearestHospital.available_beds}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className="font-medium text-gray-900">
                    {nearestHospital.status}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              No nearby hospital information available
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// Sub-component for info items
const InfoItem: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div>
    <dt className="text-xs font-medium text-gray-400">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-gray-900">{value}</dd>
  </div>
);

export default PatientDetail;
