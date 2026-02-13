/**
 * Medical Records wizard page for elderly patients.
 * A guided 4-step flow: Conditions -> Medications -> Allergies -> Equipment & Notes.
 * Designed for accessibility with large text, high contrast, and clear navigation.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Types ───────────────────────────────────────────────────────

interface MedicalRecord {
  id: string;
  patient_id: string;
  conditions: string[];
  medications: string[];
  allergies: string[];
  special_equipment: string[];
  notes: string;
  created_at: string;
  updated_at: string;
}

interface RecordPayload {
  conditions: string[];
  medications: string[];
  allergies: string[];
  special_equipment: string[];
  notes: string;
}

// ─── Preset option lists ─────────────────────────────────────────

const CONDITION_PRESETS = [
  "Diabetes",
  "Heart Disease",
  "Respiratory",
  "Kidney Disease",
  "Hypertension",
  "Cancer",
  "Other",
];

const MEDICATION_PRESETS = [
  "Insulin",
  "Aspirin",
  "Blood pressure pills",
  "Pain medication",
  "Antibiotics",
];

const ALLERGY_PRESETS = [
  "Penicillin",
  "Sulfa drugs",
  "Aspirin",
  "Latex",
  "Peanuts",
  "None",
];

const EQUIPMENT_PRESETS = [
  "Oxygen",
  "Wheelchair",
  "Dialysis",
  "Insulin Pump",
  "None",
];

const TOTAL_STEPS = 4;

// ─── API helpers ─────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("tmt-token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchRecords(patientId: string): Promise<MedicalRecord[]> {
  const res = await fetch(
    `${API}/api/v1/patients/${patientId}/records`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`Failed to fetch records: ${res.status}`);
  const data = await res.json();
  return data.records ?? [];
}

async function createRecord(
  patientId: string,
  payload: RecordPayload
): Promise<MedicalRecord> {
  const res = await fetch(
    `${API}/api/v1/patients/${patientId}/records`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw new Error(`Failed to create record: ${res.status}`);
  return res.json();
}

async function updateRecord(
  recordId: string,
  payload: RecordPayload
): Promise<MedicalRecord> {
  const res = await fetch(`${API}/api/v1/records/${recordId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update record: ${res.status}`);
  return res.json();
}

// ─── Component ───────────────────────────────────────────────────

export default function MedicalRecords() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const patientId = user?.patientId ?? user?.id ?? "";

  // Wizard state
  const [step, setStep] = useState(1);
  const [conditions, setConditions] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // Custom input state
  const [customMedication, setCustomMedication] = useState("");
  const [customAllergy, setCustomAllergy] = useState("");

  // Data state
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showWizard, setShowWizard] = useState(false);

  // ─── Load existing records ───────────────────────────────────

  const loadRecords = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchRecords(patientId);
      setRecords(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // ─── Toggle helpers ──────────────────────────────────────────

  function toggleItem(
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    item: string
  ) {
    // "None" is exclusive: selecting it clears everything else
    if (item === "None") {
      setList((prev) => (prev.includes("None") ? [] : ["None"]));
      return;
    }
    setList((prev) => {
      const without = prev.filter((i) => i !== "None");
      return without.includes(item)
        ? without.filter((i) => i !== item)
        : [...without, item];
    });
  }

  function addCustom(
    value: string,
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    setInput: React.Dispatch<React.SetStateAction<string>>
  ) {
    const trimmed = value.trim();
    if (!trimmed || list.includes(trimmed)) return;
    setList((prev) => [...prev.filter((i) => i !== "None"), trimmed]);
    setInput("");
  }

  function removeTag(
    item: string,
    setList: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    setList((prev) => prev.filter((i) => i !== item));
  }

  // ─── Wizard navigation ──────────────────────────────────────

  function goNext() {
    if (step < TOTAL_STEPS) setStep(step + 1);
  }

  function goBack() {
    if (step > 1) setStep(step - 1);
  }

  // ─── Start new or edit ──────────────────────────────────────

  function startNew() {
    setConditions([]);
    setMedications([]);
    setAllergies([]);
    setEquipment([]);
    setNotes("");
    setEditingId(null);
    setStep(1);
    setShowWizard(true);
    setSuccessMsg("");
    setError("");
  }

  function startEdit(record: MedicalRecord) {
    setConditions(record.conditions ?? []);
    setMedications(record.medications ?? []);
    setAllergies(record.allergies ?? []);
    setEquipment(record.special_equipment ?? []);
    setNotes(record.notes ?? "");
    setEditingId(record.id);
    setStep(1);
    setShowWizard(true);
    setSuccessMsg("");
    setError("");
  }

  // ─── Save handler ───────────────────────────────────────────

  async function handleSave() {
    if (!patientId) return;
    setSaving(true);
    setError("");
    setSuccessMsg("");

    const payload: RecordPayload = {
      conditions: conditions.filter((c) => c !== "None"),
      medications: medications.filter((m) => m !== "None"),
      allergies: allergies.filter((a) => a !== "None"),
      special_equipment: equipment.filter((e) => e !== "None"),
      notes,
    };

    try {
      if (editingId) {
        await updateRecord(editingId, payload);
      } else {
        await createRecord(patientId, payload);
      }
      setSuccessMsg(t("records.saved"));
      setShowWizard(false);
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  // ─── Progress bar ───────────────────────────────────────────

  function ProgressBar() {
    const pct = (step / TOTAL_STEPS) * 100;
    return (
      <div className="mb-6">
        <p className="text-lg font-semibold text-gray-700 mb-2">
          {t("records.step", { current: step, total: TOTAL_STEPS })}
        </p>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // ─── Toggle button component ────────────────────────────────

  function ToggleButton({
    label,
    selected,
    onToggle,
    danger,
  }: {
    label: string;
    selected: boolean;
    onToggle: () => void;
    danger?: boolean;
  }) {
    const baseClasses =
      "py-4 px-6 text-lg font-semibold rounded-xl border-2 transition-all duration-200 text-center";

    let colorClasses: string;
    if (selected && danger) {
      colorClasses =
        "bg-red-600 border-red-600 text-white shadow-lg scale-[1.02]";
    } else if (selected) {
      colorClasses =
        "bg-blue-600 border-blue-600 text-white shadow-lg scale-[1.02]";
    } else {
      colorClasses =
        "bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50";
    }

    return (
      <button
        type="button"
        onClick={onToggle}
        className={`${baseClasses} ${colorClasses}`}
        aria-pressed={selected}
      >
        {label}
      </button>
    );
  }

  // ─── Removable tag component ────────────────────────────────

  function Tag({
    label,
    onRemove,
  }: {
    label: string;
    onRemove: () => void;
  }) {
    return (
      <span className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-base font-medium px-4 py-2 rounded-full">
        {label}
        <button
          type="button"
          onClick={onRemove}
          className="text-blue-600 hover:text-blue-900 text-xl leading-none font-bold"
          aria-label={`${t("common.delete")} ${label}`}
        >
          &times;
        </button>
      </span>
    );
  }

  // ─── Step renderers ─────────────────────────────────────────

  function renderStep1() {
    return (
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {t("records.conditions")}
        </h2>
        <p className="text-lg text-gray-600 mb-6">
          {t("records.conditionsHint")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {CONDITION_PRESETS.map((cond) => (
            <ToggleButton
              key={cond}
              label={cond}
              selected={conditions.includes(cond)}
              onToggle={() => toggleItem(conditions, setConditions, cond)}
            />
          ))}
        </div>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {t("records.medications")}
        </h2>
        <p className="text-lg text-gray-600 mb-6">
          {t("records.medicationsHint")}
        </p>

        {/* Preset buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {MEDICATION_PRESETS.map((med) => (
            <ToggleButton
              key={med}
              label={med}
              selected={medications.includes(med)}
              onToggle={() => toggleItem(medications, setMedications, med)}
            />
          ))}
        </div>

        {/* Custom input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={customMedication}
            onChange={(e) => setCustomMedication(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom(customMedication, medications, setMedications, setCustomMedication);
              }
            }}
            placeholder={t("records.addCustom")}
            className="flex-1 py-3 px-4 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() =>
              addCustom(customMedication, medications, setMedications, setCustomMedication)
            }
            className="py-3 px-6 text-lg font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            {t("records.add")}
          </button>
        </div>

        {/* Selected tags */}
        {medications.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {medications.map((med) => (
              <Tag
                key={med}
                label={med}
                onRemove={() => removeTag(med, setMedications)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderStep3() {
    return (
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {t("records.allergies")}
        </h2>
        <p className="text-lg text-gray-600 mb-6">
          {t("records.allergiesHint")}
        </p>

        {/* Preset buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {ALLERGY_PRESETS.map((allergy) => (
            <ToggleButton
              key={allergy}
              label={allergy}
              selected={allergies.includes(allergy)}
              onToggle={() => toggleItem(allergies, setAllergies, allergy)}
              danger={allergy !== "None"}
            />
          ))}
        </div>

        {/* Custom input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={customAllergy}
            onChange={(e) => setCustomAllergy(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom(customAllergy, allergies, setAllergies, setCustomAllergy);
              }
            }}
            placeholder={t("records.addCustom")}
            className="flex-1 py-3 px-4 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() =>
              addCustom(customAllergy, allergies, setAllergies, setCustomAllergy)
            }
            className="py-3 px-6 text-lg font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            {t("records.add")}
          </button>
        </div>

        {/* Selected tags */}
        {allergies.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allergies.map((allergy) => (
              <Tag
                key={allergy}
                label={allergy}
                onRemove={() => removeTag(allergy, setAllergies)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderStep4() {
    return (
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {t("records.equipment")}
        </h2>
        <p className="text-lg text-gray-600 mb-6">
          {t("records.equipmentHint")}
        </p>

        {/* Equipment toggles */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {EQUIPMENT_PRESETS.map((eq) => (
            <ToggleButton
              key={eq}
              label={eq}
              selected={equipment.includes(eq)}
              onToggle={() => toggleItem(equipment, setEquipment, eq)}
            />
          ))}
        </div>

        {/* Notes textarea */}
        <div className="mb-4">
          <label
            htmlFor="medical-notes"
            className="block text-xl font-bold text-gray-900 mb-3"
          >
            {t("records.notes")}
          </label>
          <textarea
            id="medical-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder={t("records.notesPlaceholder")}
            className="w-full py-4 px-4 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none resize-y"
          />
        </div>
      </div>
    );
  }

  // ─── Record card for existing records ───────────────────────

  function RecordCard({ record }: { record: MedicalRecord }) {
    return (
      <div className="bg-white rounded-2xl border-2 border-gray-200 p-5 shadow-sm">
        {/* Conditions */}
        {record.conditions.length > 0 && (
          <div className="mb-4">
            <h4 className="text-base font-bold text-gray-700 mb-2">
              {t("records.conditions")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {record.conditions.map((c) => (
                <span
                  key={c}
                  className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Medications */}
        {record.medications.length > 0 && (
          <div className="mb-4">
            <h4 className="text-base font-bold text-gray-700 mb-2">
              {t("records.medications")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {record.medications.map((m) => (
                <span
                  key={m}
                  className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Allergies */}
        {record.allergies.length > 0 && (
          <div className="mb-4">
            <h4 className="text-base font-bold text-gray-700 mb-2">
              {t("records.allergies")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {record.allergies.map((a) => (
                <span
                  key={a}
                  className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Equipment */}
        {record.special_equipment.length > 0 && (
          <div className="mb-4">
            <h4 className="text-base font-bold text-gray-700 mb-2">
              {t("records.equipment")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {record.special_equipment.map((e) => (
                <span
                  key={e}
                  className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-medium"
                >
                  {e}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {record.notes && (
          <div className="mb-4">
            <h4 className="text-base font-bold text-gray-700 mb-2">
              {t("records.notes")}
            </h4>
            <p className="text-gray-600 text-base whitespace-pre-wrap">
              {record.notes}
            </p>
          </div>
        )}

        {/* Edit button */}
        <button
          type="button"
          onClick={() => startEdit(record)}
          className="w-full py-3 px-6 text-lg font-semibold bg-gray-100 text-gray-700 rounded-xl border-2 border-gray-300 hover:bg-gray-200 transition-colors"
        >
          {t("records.edit")}
        </button>
      </div>
    );
  }

  // ─── Main render ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-xl text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t("records.title")}
      </h1>

      {/* Error message */}
      {error && (
        <div
          className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-lg"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div
          className="bg-green-50 border-2 border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-lg"
          role="status"
        >
          {successMsg}
        </div>
      )}

      {/* Wizard view */}
      {showWizard ? (
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-5 shadow-sm">
          <ProgressBar />

          {/* Step content */}
          <div className="min-h-[300px]">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="flex-1 py-4 px-6 text-lg font-semibold bg-gray-100 text-gray-700 rounded-xl border-2 border-gray-300 hover:bg-gray-200 transition-colors"
              >
                {t("records.back")}
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                className="flex-1 py-4 px-6 text-lg font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
              >
                {t("records.next")}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-4 px-6 text-lg font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? t("common.loading") : t("records.save")}
              </button>
            )}
          </div>

          {/* Cancel / go back to list */}
          <button
            type="button"
            onClick={() => setShowWizard(false)}
            className="w-full mt-3 py-3 text-base text-gray-500 hover:text-gray-700 transition-colors"
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        /* Records list view */
        <div>
          {/* Add new button */}
          <button
            type="button"
            onClick={startNew}
            className="w-full py-4 px-6 text-lg font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors mb-6"
          >
            {t("records.addNew")}
          </button>

          {records.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto mb-4"
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <path d="M12 11v6M9 14h6" />
              </svg>
              <p className="text-xl text-gray-500">
                {t("records.noRecords")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map((record) => (
                <RecordCard key={record.id} record={record} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
