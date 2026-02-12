import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { getPatient, updatePatient, type Patient } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { getCurrentPosition } from "../../utils/locationCodec";

// Fix Leaflet default icon
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

// Extended patient type for fields beyond the base API type
interface ExtendedPatient extends Patient {
  chronic_conditions?: string[];
  medications?: string[];
  special_equipment?: string[];
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Map Click Handler ──────────────────────────────────────────

function MapClickHandler({
  onLocationSelect,
}: {
  onLocationSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ─── Section Wrapper ────────────────────────────────────────────

function Section({
  title,
  editing,
  onEdit,
  onSave,
  onCancel,
  saving,
  children,
}: {
  title: string;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 font-medium transition"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        ) : (
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg font-medium transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
            Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Read-only Field ────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-gray-900">{value || "Not set"}</p>
    </div>
  );
}

// ─── Tag Badge ──────────────────────────────────────────────────

function TagBadge({
  text,
  onRemove,
  editable,
}: {
  text: string;
  onRemove?: () => void;
  editable?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm">
      {text}
      {editable && onRemove && (
        <button onClick={onRemove} className="hover:text-red-900 ms-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const [patient, setPatient] = useState<ExtendedPatient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Edit states per section
  const [editingBasic, setEditingBasic] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [editingMedical, setEditingMedical] = useState(false);
  const [editingContacts, setEditingContacts] = useState(false);

  // Edit drafts
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftLat, setDraftLat] = useState<number | null>(null);
  const [draftLng, setDraftLng] = useState<number | null>(null);
  const [draftMobility, setDraftMobility] = useState("");
  const [draftBloodType, setDraftBloodType] = useState("");
  const [draftLivingSituation, setDraftLivingSituation] = useState("");
  const [draftChronicConditions, setDraftChronicConditions] = useState<string[]>([]);
  const [draftMedications, setDraftMedications] = useState<string[]>([]);
  const [draftSpecialEquipment, setDraftSpecialEquipment] = useState<string[]>([]);
  const [draftContacts, setDraftContacts] = useState<Array<{ name: string; phone: string }>>([]);
  const [medInput, setMedInput] = useState("");

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // GPS
  const [gpsLoading, setGpsLoading] = useState(false);

  // ─── Fetch Patient ─────────────────────────────────────────

  const fetchPatient = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await getPatient(user.id) as ExtendedPatient;
      setPatient(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load profile"
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchPatient();
  }, [fetchPatient]);

  // ─── Section Edit Handlers ────────────────────────────────

  const startEditBasic = () => {
    if (!patient) return;
    setDraftName(patient.name);
    setDraftPhone(patient.phone);
    setEditingBasic(true);
  };

  const saveBasic = async () => {
    if (!patient) return;
    setSaving(true);
    try {
      const updated = await updatePatient(patient.id, {
        name: draftName,
        phone: draftPhone,
      }) as ExtendedPatient;
      setPatient(updated);
      setEditingBasic(false);
      showSaveSuccess("Basic info updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const startEditLocation = () => {
    if (!patient) return;
    setDraftLat(patient.latitude);
    setDraftLng(patient.longitude);
    setEditingLocation(true);
  };

  const saveLocation = async () => {
    if (!patient || draftLat === null || draftLng === null) return;
    setSaving(true);
    try {
      const updated = await updatePatient(patient.id, {
        latitude: draftLat,
        longitude: draftLng,
      }) as ExtendedPatient;
      setPatient(updated);
      setEditingLocation(false);
      showSaveSuccess("Location updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const startEditMedical = () => {
    if (!patient) return;
    setDraftMobility(patient.mobility || "");
    setDraftBloodType(patient.blood_type || "");
    setDraftLivingSituation(patient.living_situation || "");
    setDraftChronicConditions(patient.chronic_conditions || []);
    setDraftMedications(patient.medications || []);
    setDraftSpecialEquipment(patient.special_equipment || []);
    setEditingMedical(true);
  };

  const saveMedical = async () => {
    if (!patient) return;
    setSaving(true);
    try {
      const updated = await updatePatient(patient.id, {
        mobility: draftMobility,
        blood_type: draftBloodType,
        living_situation: draftLivingSituation,
        ...({
          chronic_conditions: draftChronicConditions,
          medications: draftMedications,
          special_equipment: draftSpecialEquipment,
        } as Record<string, unknown>),
      } as Partial<Patient>) as ExtendedPatient;
      setPatient(updated);
      setEditingMedical(false);
      showSaveSuccess("Medical profile updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const startEditContacts = () => {
    if (!patient) return;
    setDraftContacts(
      patient.emergency_contacts?.length
        ? patient.emergency_contacts.map((c) => ({ ...c }))
        : [{ name: "", phone: "" }]
    );
    setEditingContacts(true);
  };

  const saveContacts = async () => {
    if (!patient) return;
    setSaving(true);
    const validContacts = draftContacts.filter(
      (c) => c.name.trim() && c.phone.trim()
    );
    try {
      const updated = await updatePatient(patient.id, {
        emergency_contacts: validContacts,
      } as Partial<Patient>) as ExtendedPatient;
      setPatient(updated);
      setEditingContacts(false);
      showSaveSuccess("Emergency contacts updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const showSaveSuccess = (msg: string) => {
    setSaveSuccess(msg);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  // GPS for location edit
  const handleDetectGPS = async () => {
    setGpsLoading(true);
    try {
      const pos = await getCurrentPosition();
      setDraftLat(pos.latitude);
      setDraftLng(pos.longitude);
    } catch {
      setError("Could not detect GPS location");
    } finally {
      setGpsLoading(false);
    }
  };

  // Delete account
  const handleDeleteAccount = async () => {
    if (!patient) return;
    setDeleteLoading(true);
    try {
      const token = localStorage.getItem("tmt-token");
      const res = await fetch(
        `${API_URL}/api/v1/patients/${patient.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!res.ok) throw new Error("Failed to delete account");
      logout();
      navigate("/register");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─── Loading / Error ──────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-12 h-12 text-red-500 animate-spin mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-gray-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error && !patient) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Could not load profile
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchPatient}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!patient) return null;

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
            <p className="text-gray-500 text-sm mt-1">
              Manage your personal and medical information
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                patient.is_active
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {patient.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        {/* Success Toast */}
        {saveSuccess && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 animate-fade-in">
            <svg
              className="w-5 h-5 text-green-500 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-green-700 text-sm font-medium">{saveSuccess}</p>
          </div>
        )}

        {/* Error Banner */}
        {error && patient && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <svg
              className="w-5 h-5 text-red-500 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-red-700 text-sm">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ms-auto text-red-400 hover:text-red-600"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        )}

        {/* ─── Basic Info Section ──────────────────────────── */}
        <Section
          title="Basic Information"
          editing={editingBasic}
          onEdit={startEditBasic}
          onSave={saveBasic}
          onCancel={() => setEditingBasic(false)}
          saving={saving}
        >
          {editingBasic ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={draftPhone}
                  onChange={(e) => setDraftPhone(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <ReadField label="Full Name" value={patient.name} />
              <ReadField label="Phone" value={patient.phone} />
              <ReadField
                label="Registered"
                value={new Date(patient.created_at).toLocaleDateString()}
              />
              <ReadField
                label="Last Updated"
                value={new Date(patient.updated_at).toLocaleDateString()}
              />
            </div>
          )}
        </Section>

        {/* ─── Location Section ───────────────────────────── */}
        <Section
          title="Location"
          editing={editingLocation}
          onEdit={startEditLocation}
          onSave={saveLocation}
          onCancel={() => setEditingLocation(false)}
          saving={saving}
        >
          {editingLocation ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleDetectGPS}
                disabled={gpsLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition"
              >
                {gpsLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Detecting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Use Current Location
                  </>
                )}
              </button>

              <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: "250px" }}>
                <MapContainer
                  center={
                    draftLat !== null && draftLng !== null
                      ? [draftLat, draftLng]
                      : [31.5, 34.47]
                  }
                  zoom={12}
                  style={{ height: "100%", width: "100%" }}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapClickHandler
                    onLocationSelect={(lat, lng) => {
                      setDraftLat(lat);
                      setDraftLng(lng);
                    }}
                  />
                  {draftLat !== null && draftLng !== null && (
                    <Marker position={[draftLat, draftLng]} />
                  )}
                </MapContainer>
              </div>

              {draftLat !== null && draftLng !== null && (
                <p className="text-sm text-green-700 font-medium">
                  Selected: {draftLat.toFixed(6)}, {draftLng.toFixed(6)}
                </p>
              )}
            </div>
          ) : (
            <div>
              {patient.latitude !== null && patient.longitude !== null ? (
                <>
                  <div className="rounded-lg overflow-hidden border border-gray-200 mb-3" style={{ height: "200px" }}>
                    <MapContainer
                      center={[patient.latitude, patient.longitude]}
                      zoom={14}
                      style={{ height: "100%", width: "100%" }}
                      scrollWheelZoom={false}
                      dragging={false}
                      zoomControl={false}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <Marker position={[patient.latitude, patient.longitude]} />
                    </MapContainer>
                  </div>
                  <p className="text-sm text-gray-600">
                    Coordinates: {patient.latitude.toFixed(6)},{" "}
                    {patient.longitude.toFixed(6)}
                  </p>
                </>
              ) : (
                <p className="text-gray-400 text-sm">No location set</p>
              )}
            </div>
          )}
        </Section>

        {/* ─── Medical Profile Section ────────────────────── */}
        <Section
          title="Medical Profile"
          editing={editingMedical}
          onEdit={startEditMedical}
          onSave={saveMedical}
          onCancel={() => setEditingMedical(false)}
          saving={saving}
        >
          {editingMedical ? (
            <div className="space-y-5">
              {/* Mobility */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mobility
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {["Can walk", "Wheelchair", "Bedridden", "Other"].map((opt) => (
                    <label
                      key={opt}
                      className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer text-sm transition ${
                        draftMobility === opt
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="editMobility"
                        value={opt}
                        checked={draftMobility === opt}
                        onChange={() => setDraftMobility(opt)}
                        className="sr-only"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              {/* Blood Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Blood Type
                </label>
                <select
                  value={draftBloodType}
                  onChange={(e) => setDraftBloodType(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white"
                >
                  <option value="">Not set</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                    (bt) => (
                      <option key={bt} value={bt}>
                        {bt}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Living Situation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Living Situation
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["Alone", "With family", "Care facility"].map((opt) => (
                    <label
                      key={opt}
                      className={`flex items-center justify-center px-3 py-2 border rounded-lg cursor-pointer text-sm transition ${
                        draftLivingSituation === opt
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="editLiving"
                        value={opt}
                        checked={draftLivingSituation === opt}
                        onChange={() => setDraftLivingSituation(opt)}
                        className="sr-only"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              {/* Chronic Conditions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chronic Conditions
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    "Diabetes",
                    "Heart disease",
                    "Respiratory",
                    "Kidney",
                    "Cancer",
                    "Other",
                  ].map((cond) => (
                    <label
                      key={cond}
                      className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer text-sm transition ${
                        draftChronicConditions.includes(cond)
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={draftChronicConditions.includes(cond)}
                        onChange={() => {
                          setDraftChronicConditions((prev) =>
                            prev.includes(cond)
                              ? prev.filter((c) => c !== cond)
                              : [...prev, cond]
                          );
                        }}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          draftChronicConditions.includes(cond)
                            ? "border-red-500 bg-red-500"
                            : "border-gray-300"
                        }`}
                      >
                        {draftChronicConditions.includes(cond) && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                      {cond}
                    </label>
                  ))}
                </div>
              </div>

              {/* Medications */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Medications
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={medInput}
                    onChange={(e) => setMedInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = medInput.trim();
                        if (val && !draftMedications.includes(val)) {
                          setDraftMedications((prev) => [...prev, val]);
                        }
                        setMedInput("");
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    placeholder="Type medication and press Enter"
                  />
                </div>
                {draftMedications.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {draftMedications.map((med) => (
                      <TagBadge
                        key={med}
                        text={med}
                        editable
                        onRemove={() =>
                          setDraftMedications((prev) =>
                            prev.filter((m) => m !== med)
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Special Equipment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Special Equipment
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {["Oxygen", "Dialysis", "Insulin pump", "Wheelchair", "None"].map(
                    (equip) => (
                      <label
                        key={equip}
                        className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer text-sm transition ${
                          draftSpecialEquipment.includes(equip)
                            ? "border-red-500 bg-red-50 text-red-700"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftSpecialEquipment.includes(equip)}
                          onChange={() => {
                            setDraftSpecialEquipment((prev) => {
                              if (equip === "None") {
                                return prev.includes("None") ? [] : ["None"];
                              }
                              if (prev.includes(equip)) {
                                return prev.filter((e) => e !== equip);
                              }
                              return [...prev.filter((e) => e !== "None"), equip];
                            });
                          }}
                          className="sr-only"
                        />
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                            draftSpecialEquipment.includes(equip)
                              ? "border-red-500 bg-red-500"
                              : "border-gray-300"
                          }`}
                        >
                          {draftSpecialEquipment.includes(equip) && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                        {equip}
                      </label>
                    )
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Mobility" value={patient.mobility} />
                <ReadField label="Blood Type" value={patient.blood_type} />
                <ReadField label="Living Situation" value={patient.living_situation} />
              </div>

              {/* Chronic Conditions Tags */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Chronic Conditions
                </p>
                {patient.chronic_conditions && patient.chronic_conditions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {patient.chronic_conditions.map((c) => (
                      <TagBadge key={c} text={c} />
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">None specified</p>
                )}
              </div>

              {/* Medications Tags */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Medications
                </p>
                {patient.medications && patient.medications.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {patient.medications.map((m) => (
                      <span
                        key={m}
                        className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">None specified</p>
                )}
              </div>

              {/* Special Equipment Tags */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Special Equipment
                </p>
                {patient.special_equipment && patient.special_equipment.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {patient.special_equipment.map((e) => (
                      <span
                        key={e}
                        className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-sm"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">None specified</p>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* ─── Emergency Contacts Section ─────────────────── */}
        <Section
          title="Emergency Contacts"
          editing={editingContacts}
          onEdit={startEditContacts}
          onSave={saveContacts}
          onCancel={() => setEditingContacts(false)}
          saving={saving}
        >
          {editingContacts ? (
            <div className="space-y-3">
              {draftContacts.map((contact, idx) => (
                <div
                  key={idx}
                  className="flex gap-3 items-start p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) => {
                        const updated = draftContacts.map((c, i) =>
                          i === idx ? { ...c, name: e.target.value } : c
                        );
                        setDraftContacts(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                      placeholder="Contact name"
                    />
                    <input
                      type="tel"
                      value={contact.phone}
                      onChange={(e) => {
                        const updated = draftContacts.map((c, i) =>
                          i === idx ? { ...c, phone: e.target.value } : c
                        );
                        setDraftContacts(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                      placeholder="Phone number"
                    />
                  </div>
                  {draftContacts.length > 1 && (
                    <button
                      onClick={() =>
                        setDraftContacts((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="mt-1 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {draftContacts.length < 3 && (
                <button
                  onClick={() =>
                    setDraftContacts((prev) => [
                      ...prev,
                      { name: "", phone: "" },
                    ])
                  }
                  className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Add contact
                </button>
              )}
            </div>
          ) : (
            <div>
              {patient.emergency_contacts && patient.emergency_contacts.length > 0 ? (
                <div className="space-y-3">
                  {patient.emergency_contacts.map((contact, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                        <svg
                          className="w-5 h-5 text-red-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">
                          {contact.name}
                        </p>
                        <p className="text-gray-500 text-sm">{contact.phone}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">
                  No emergency contacts added
                </p>
              )}
            </div>
          )}
        </Section>

        {/* ─── Danger Zone ────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6 mt-8">
          <h2 className="text-lg font-semibold text-red-700 mb-2">
            Danger Zone
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>

          {showDeleteConfirm ? (
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-red-700 font-medium text-sm mb-3">
                Are you sure? This will permanently delete your account, medical
                profile, and all SOS history.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition"
                >
                  {deleteLoading ? "Deleting..." : "Yes, Delete My Account"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition"
            >
              Delete My Account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
