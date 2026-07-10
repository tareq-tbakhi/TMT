/**
 * Medical Records wizard page for elderly patients.
 * A guided 4-step flow: Conditions -> Medications -> Allergies -> Equipment & Notes.
 * Designed for accessibility with large text, high contrast, and clear navigation.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Plus, TriangleAlert, X } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  Textarea,
} from "../../components/ui";

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
        <p className="mb-2 text-lg font-bold text-ink">
          {t("records.step", { current: step, total: TOTAL_STEPS })}
        </p>
        <div className="h-3 w-full rounded-full bg-surface-3" aria-hidden="true">
          <div
            className="h-3 rounded-full bg-accent transition-all duration-300"
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
      "min-h-14 rounded-lg border-2 px-4 py-3 text-center text-lg font-semibold transition-colors duration-200 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2";

    let colorClasses: string;
    if (selected && danger) {
      colorClasses =
        "border-danger bg-danger text-white shadow-1";
    } else if (selected) {
      colorClasses =
        "border-accent bg-accent text-on-accent shadow-1";
    } else {
      colorClasses =
        "border-edge-strong bg-surface text-ink hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft";
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
      <Badge tone="accent" className="py-1.5 ps-3 text-base">
        {label}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${t("common.delete")} ${label}`}
          className="-me-1.5 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-accent/15 focus-visible:outline-3 focus-visible:outline-focus"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </Badge>
    );
  }

  // ─── Step renderers ─────────────────────────────────────────

  function renderStep1() {
    return (
      <div>
        <h3 className="mb-2 text-xl font-bold text-ink">
          {t("records.conditions")}
        </h3>
        <p className="mb-6 text-lg text-ink-muted">
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
        <h3 className="mb-2 text-xl font-bold text-ink">
          {t("records.medications")}
        </h3>
        <p className="mb-6 text-lg text-ink-muted">
          {t("records.medicationsHint")}
        </p>

        {/* Preset buttons */}
        <div className="mb-6 grid grid-cols-2 gap-3">
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
        <div className="mb-4 flex items-end gap-2">
          <Input
            label={t("records.addCustom")}
            hideLabel
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
            className="flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            size="lg"
            icon={<Plus />}
            onClick={() =>
              addCustom(customMedication, medications, setMedications, setCustomMedication)
            }
          >
            {t("records.add")}
          </Button>
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
        <h3 className="mb-2 text-xl font-bold text-ink">
          {t("records.allergies")}
        </h3>
        <p className="mb-6 text-lg text-ink-muted">
          {t("records.allergiesHint")}
        </p>

        {/* Preset buttons */}
        <div className="mb-6 grid grid-cols-2 gap-3">
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
        <div className="mb-4 flex items-end gap-2">
          <Input
            label={t("records.addCustom")}
            hideLabel
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
            className="flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            size="lg"
            icon={<Plus />}
            onClick={() =>
              addCustom(customAllergy, allergies, setAllergies, setCustomAllergy)
            }
          >
            {t("records.add")}
          </Button>
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
        <h3 className="mb-2 text-xl font-bold text-ink">
          {t("records.equipment")}
        </h3>
        <p className="mb-6 text-lg text-ink-muted">
          {t("records.equipmentHint")}
        </p>

        {/* Equipment toggles */}
        <div className="mb-8 grid grid-cols-2 gap-3">
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
          <Textarea
            label={t("records.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder={t("records.notesPlaceholder")}
          />
        </div>
      </div>
    );
  }

  // ─── Record card for existing records ───────────────────────

  function RecordCard({ record }: { record: MedicalRecord }) {
    return (
      <Card as="article">
        {/* Conditions */}
        {record.conditions.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-base font-bold text-ink">
              {t("records.conditions")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {record.conditions.map((c) => (
                <Badge key={c} tone="warning">
                  {c}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Medications */}
        {record.medications.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-base font-bold text-ink">
              {t("records.medications")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {record.medications.map((m) => (
                <Badge key={m} tone="success">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Allergies */}
        {record.allergies.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-base font-bold text-ink">
              {t("records.allergies")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {record.allergies.map((a) => (
                <Badge key={a} tone="danger">
                  {a}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Equipment */}
        {record.special_equipment.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-base font-bold text-ink">
              {t("records.equipment")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {record.special_equipment.map((e) => (
                <Badge key={e} tone="accent">
                  {e}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {record.notes && (
          <div className="mb-4">
            <h4 className="mb-2 text-base font-bold text-ink">
              {t("records.notes")}
            </h4>
            <p className="whitespace-pre-wrap text-base text-ink-muted">
              {record.notes}
            </p>
          </div>
        )}

        {/* Edit button */}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          fullWidth
          onClick={() => startEdit(record)}
        >
          {t("records.edit")}
        </Button>
      </Card>
    );
  }

  // ─── Main render ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label={t("common.loading")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Page title */}
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-ink">
        {t("records.title")}
      </h2>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4"
        >
          <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-on-danger-soft" />
          <p className="min-w-0 flex-1 text-base font-medium text-on-danger-soft">{error}</p>
          <Button variant="danger" size="sm" onClick={loadRecords}>
            {t("admin.retry")}
          </Button>
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-success/30 bg-success-soft p-4 text-base font-semibold text-on-success-soft"
        >
          {successMsg}
        </div>
      )}

      {/* Wizard view */}
      {showWizard ? (
        <Card>
          <ProgressBar />

          {/* Step content */}
          <div className="min-h-[300px]">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </div>

          {/* Navigation buttons */}
          <div className="mt-8 flex gap-3">
            {step > 1 && (
              <Button
                type="button"
                variant="secondary"
                size="xl"
                onClick={goBack}
                className="flex-1"
              >
                {t("records.back")}
              </Button>
            )}

            {step < TOTAL_STEPS ? (
              <Button
                type="button"
                size="xl"
                onClick={goNext}
                className="flex-1"
              >
                {t("records.next")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="success"
                size="xl"
                onClick={handleSave}
                loading={saving}
                className="flex-1"
              >
                {saving ? t("common.loading") : t("records.save")}
              </Button>
            )}
          </div>

          {/* Cancel / go back to list */}
          <Button
            type="button"
            variant="ghost"
            fullWidth
            onClick={() => setShowWizard(false)}
            className="mt-3"
          >
            {t("common.cancel")}
          </Button>
        </Card>
      ) : (
        /* Records list view */
        <div>
          {/* Add new button */}
          <Button
            type="button"
            size="xl"
            fullWidth
            icon={<Plus />}
            onClick={startNew}
            className="mb-6"
          >
            {t("records.addNew")}
          </Button>

          {records.length === 0 ? (
            <EmptyState
              icon={<ClipboardList />}
              title={t("records.noRecords")}
            />
          ) : (
            <div className="flex flex-col gap-4">
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
