import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  Check,
  CheckCircle2,
  LocateFixed,
  PencilLine,
  Plus,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { getPatient, updatePatient, type Patient } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { getCurrentPosition } from "../../utils/locationCodec";
import { Badge, Button, Card, Input, LoadingState, Select } from "../../components/ui";

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
  medications?: string[];
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
    <Card as="section" className="mb-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onSave} loading={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            icon={<PencilLine />}
            onClick={onEdit}
            aria-label={`Edit ${title}`}
          >
            Edit
          </Button>
        )}
      </div>
      {children}
    </Card>
  );
}

// ─── Read-only Field ────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <p className={`text-base ${value ? "text-ink" : "text-ink-faint"}`}>
        {value || "Not set"}
      </p>
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
    <Badge tone="danger" className="py-1.5 ps-3">
      {text}
      {editable && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${text}`}
          className="-me-1.5 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-danger/15 focus-visible:outline-3 focus-visible:outline-focus"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </Badge>
  );
}

// ─── Option chip (radio / checkbox as a large touch target) ─────

function OptionChip({
  type,
  name,
  label,
  checked,
  onChange,
  centered,
}: {
  type: "radio" | "checkbox";
  name?: string;
  label: string;
  checked: boolean;
  onChange: () => void;
  centered?: boolean;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-base transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-offset-2 ${
        centered ? "justify-center text-center" : ""
      } ${
        checked
          ? "border-accent bg-accent-soft font-semibold text-on-accent-soft"
          : "border-edge-strong bg-surface text-ink hover:bg-surface-2"
      }`}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {type === "checkbox" && (
        <span
          aria-hidden="true"
          className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[0.3rem] border-2 ${
            checked
              ? "border-accent bg-accent text-on-accent"
              : "border-edge-strong bg-surface"
          }`}
        >
          {checked && <Check className="h-3 w-3" strokeWidth={3.5} />}
        </span>
      )}
      <span className="min-w-0">{label}</span>
    </label>
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
    if (!user?.patientId) return;
    setLoading(true);
    try {
      const data = await getPatient(user.patientId!) as ExtendedPatient;
      setPatient(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load profile"
      );
    } finally {
      setLoading(false);
    }
  }, [user?.patientId]);

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

  // ─── No Patient Record Guard ─────────────────────────────

  if (!user?.patientId) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <Card className="w-full max-w-lg p-8 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning-soft text-on-warning-soft"
          >
            <TriangleAlert className="h-8 w-8" />
          </span>
          <h2 className="mb-2 text-xl font-bold text-ink">
            No Patient Record
          </h2>
          <p className="text-base text-ink-muted">
            No patient record linked to this account.
          </p>
        </Card>
      </div>
    );
  }

  // ─── Loading / Error ──────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <LoadingState label="Loading profile" />
      </div>
    );
  }

  if (error && !patient) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <Card className="w-full max-w-lg p-8 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft text-on-danger-soft"
          >
            <TriangleAlert className="h-8 w-8" />
          </span>
          <h2 className="mb-2 text-xl font-bold text-ink">
            Could not load profile
          </h2>
          <p className="mb-5 text-base text-ink-muted">{error}</p>
          <Button size="lg" onClick={fetchPatient}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  if (!patient) return null;

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="px-4 py-6">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-ink">My Profile</h2>
            <p className="mt-1 text-base text-ink-muted">
              Manage your personal and medical information
            </p>
          </div>
          <Badge tone={patient.is_active ? "success" : "neutral"} dot>
            {patient.is_active ? "Active" : "Inactive"}
          </Badge>
        </header>

        {/* Success Toast */}
        {saveSuccess && (
          <div
            role="status"
            className="mb-5 flex items-center gap-3 rounded-lg border border-success/30 bg-success-soft p-4"
          >
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-on-success-soft" />
            <p className="text-base font-semibold text-on-success-soft">{saveSuccess}</p>
          </div>
        )}

        {/* Error Banner */}
        {error && patient && (
          <div
            role="alert"
            className="mb-5 flex items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4"
          >
            <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-on-danger-soft" />
            <p className="min-w-0 flex-1 text-base font-medium text-on-danger-soft">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-on-danger-soft transition-colors hover:bg-danger/15 focus-visible:outline-3 focus-visible:outline-focus"
            >
              <X aria-hidden="true" className="h-5 w-5" />
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
            <div className="flex flex-col gap-4">
              <Input
                label="Full Name"
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                autoComplete="name"
              />
              <Input
                label="Phone"
                type="tel"
                dir="ltr"
                value={draftPhone}
                onChange={(e) => setDraftPhone(e.target.value)}
                autoComplete="tel"
              />
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
            <div className="flex flex-col gap-4">
              <Button
                type="button"
                icon={<LocateFixed />}
                loading={gpsLoading}
                onClick={handleDetectGPS}
              >
                {gpsLoading ? "Detecting..." : "Use Current Location"}
              </Button>

              <div
                className="overflow-hidden rounded-lg border border-edge-strong"
                style={{ height: "250px" }}
              >
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
                <p
                  role="status"
                  className="rounded-md bg-success-soft p-3 text-sm font-semibold text-on-success-soft"
                >
                  Selected: {draftLat.toFixed(6)}, {draftLng.toFixed(6)}
                </p>
              )}
            </div>
          ) : (
            <div>
              {patient.latitude !== null && patient.longitude !== null ? (
                <>
                  <div
                    className="mb-3 overflow-hidden rounded-lg border border-edge"
                    style={{ height: "200px" }}
                  >
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
                  <p className="text-sm text-ink-muted">
                    Coordinates: {patient.latitude.toFixed(6)},{" "}
                    {patient.longitude.toFixed(6)}
                  </p>
                </>
              ) : (
                <p className="text-base text-ink-faint">No location set</p>
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
            <div className="flex flex-col gap-5">
              {/* Mobility */}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">
                  Mobility
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {["Can walk", "Wheelchair", "Bedridden", "Other"].map((opt) => (
                    <OptionChip
                      key={opt}
                      type="radio"
                      name="editMobility"
                      label={opt}
                      checked={draftMobility === opt}
                      onChange={() => setDraftMobility(opt)}
                    />
                  ))}
                </div>
              </fieldset>

              {/* Blood Type */}
              <Select
                label="Blood Type"
                value={draftBloodType}
                onChange={(e) => setDraftBloodType(e.target.value)}
              >
                <option value="">Not set</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                  (bt) => (
                    <option key={bt} value={bt}>
                      {bt}
                    </option>
                  )
                )}
              </Select>

              {/* Living Situation */}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">
                  Living Situation
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {["Alone", "With family", "Care facility"].map((opt) => (
                    <OptionChip
                      key={opt}
                      type="radio"
                      name="editLiving"
                      label={opt}
                      centered
                      checked={draftLivingSituation === opt}
                      onChange={() => setDraftLivingSituation(opt)}
                    />
                  ))}
                </div>
              </fieldset>

              {/* Chronic Conditions */}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">
                  Chronic Conditions
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    "Diabetes",
                    "Heart disease",
                    "Respiratory",
                    "Kidney",
                    "Cancer",
                    "Other",
                  ].map((cond) => (
                    <OptionChip
                      key={cond}
                      type="checkbox"
                      label={cond}
                      checked={draftChronicConditions.includes(cond)}
                      onChange={() => {
                        setDraftChronicConditions((prev) =>
                          prev.includes(cond)
                            ? prev.filter((c) => c !== cond)
                            : [...prev, cond]
                        );
                      }}
                    />
                  ))}
                </div>
              </fieldset>

              {/* Medications */}
              <div>
                <Input
                  label="Medications"
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
                  placeholder="Type medication and press Enter"
                  className="mb-2"
                />
                {draftMedications.length > 0 && (
                  <ul className="flex flex-wrap gap-2" aria-label="Medications">
                    {draftMedications.map((med) => (
                      <li key={med}>
                        <TagBadge
                          text={med}
                          editable
                          onRemove={() =>
                            setDraftMedications((prev) =>
                              prev.filter((m) => m !== med)
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Special Equipment */}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">
                  Special Equipment
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {["Oxygen", "Dialysis", "Insulin pump", "Wheelchair", "None"].map(
                    (equip) => (
                      <OptionChip
                        key={equip}
                        type="checkbox"
                        label={equip}
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
                      />
                    )
                  )}
                </div>
              </fieldset>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Mobility" value={patient.mobility} />
                <ReadField label="Blood Type" value={patient.blood_type} />
                <ReadField label="Living Situation" value={patient.living_situation} />
              </div>

              {/* Chronic Conditions Tags */}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Chronic Conditions
                </p>
                {patient.chronic_conditions && patient.chronic_conditions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {patient.chronic_conditions.map((c) => (
                      <TagBadge key={c} text={c} />
                    ))}
                  </div>
                ) : (
                  <p className="text-base text-ink-faint">None specified</p>
                )}
              </div>

              {/* Medications Tags */}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Medications
                </p>
                {patient.medications && patient.medications.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {patient.medications.map((m) => (
                      <Badge key={m} tone="info">
                        {m}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-base text-ink-faint">None specified</p>
                )}
              </div>

              {/* Special Equipment Tags */}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Special Equipment
                </p>
                {patient.special_equipment && patient.special_equipment.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {patient.special_equipment.map((e) => (
                      <Badge key={e} tone="warning">
                        {e}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-base text-ink-faint">None specified</p>
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
            <div className="flex flex-col gap-3">
              {draftContacts.map((contact, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-lg border border-edge bg-surface-2 p-3"
                >
                  <div className="flex flex-1 flex-col gap-2.5">
                    <Input
                      label={`Contact ${idx + 1} name`}
                      hideLabel
                      type="text"
                      value={contact.name}
                      onChange={(e) => {
                        const updated = draftContacts.map((c, i) =>
                          i === idx ? { ...c, name: e.target.value } : c
                        );
                        setDraftContacts(updated);
                      }}
                      placeholder="Contact name"
                    />
                    <Input
                      label={`Contact ${idx + 1} phone`}
                      hideLabel
                      type="tel"
                      dir="ltr"
                      value={contact.phone}
                      onChange={(e) => {
                        const updated = draftContacts.map((c, i) =>
                          i === idx ? { ...c, phone: e.target.value } : c
                        );
                        setDraftContacts(updated);
                      }}
                      placeholder="Phone number"
                    />
                  </div>
                  {draftContacts.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftContacts((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      aria-label={`Remove contact ${idx + 1}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger-soft focus-visible:outline-3 focus-visible:outline-focus"
                    >
                      <X aria-hidden="true" className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ))}
              {draftContacts.length < 3 && (
                <Button
                  variant="ghost"
                  icon={<Plus />}
                  onClick={() =>
                    setDraftContacts((prev) => [
                      ...prev,
                      { name: "", phone: "" },
                    ])
                  }
                  className="self-start"
                >
                  Add contact
                </Button>
              )}
            </div>
          ) : (
            <div>
              {patient.emergency_contacts && patient.emergency_contacts.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {patient.emergency_contacts.map((contact, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-3 rounded-lg bg-surface-2 p-3"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-on-accent-soft"
                      >
                        <UserRound className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold text-ink">
                          {contact.name}
                        </span>
                        <span className="block text-base text-ink-muted" dir="ltr">
                          {contact.phone}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-base text-ink-faint">
                  No emergency contacts added
                </p>
              )}
            </div>
          )}
        </Section>

        {/* ─── Danger Zone (commented out) ────────────────────────────────── */}
        {/* <Card className="mt-8 border-danger/30">
          <h3 className="mb-2 text-lg font-bold text-danger">
            Danger Zone
          </h3>
          <p className="mb-4 text-sm text-ink-muted">
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>

          {showDeleteConfirm ? (
            <div className="rounded-lg bg-danger-soft p-4">
              <p className="mb-3 text-sm font-semibold text-on-danger-soft">
                Are you sure? This will permanently delete your account, medical
                profile, and all SOS history.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="danger" loading={deleteLoading} onClick={handleDeleteAccount}>
                  {deleteLoading ? "Deleting..." : "Yes, Delete My Account"}
                </Button>
                <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" className="border-danger/40 text-danger" onClick={() => setShowDeleteConfirm(true)}>
              Delete My Account
            </Button>
          )}
        </Card> */}
      </div>
    </div>
  );
}
