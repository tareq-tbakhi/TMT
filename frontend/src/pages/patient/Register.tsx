import {
  useRef,
  useState,
  useCallback,
  useId,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Languages,
  Loader2,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";
import {
  registerPatient,
  login,
  ApiError,
} from "../../services/api";
import type {
  ApiFieldIssue,
  LoginResponse,
  Patient,
  RegisterPatientRequest,
  RegisterPatientResponse,
} from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { useProfileStore } from "../../store/profileStore";
import { getCurrentPosition } from "../../utils/locationCodec";
import { announce, Badge, Button, Card, Input, Select } from "../../components/ui";

// ─── Types ───────────────────────────────────────────────────────

interface ContactForm {
  name: string;
  phone: string;
  relationship: string;
}

interface FormData {
  // Step 1 — Account
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
  // Step 2 — Location
  latitude: number | null;
  longitude: number | null;
  manualLat: string;
  manualLng: string;
  // Step 3 — Medical profile
  bloodType: string;
  chronicConditions: string[];
  allergies: string[];
  medications: string[];
  // Step 4 — Special needs & living situation
  mobility: string;
  specialNeeds: string[];
  otherNeeds: string;
  specialEquipment: string[];
  livingSituation: string;
  // Step 5 — Emergency contacts
  emergencyContacts: ContactForm[];
  // Step 6 — Consent
  consentGiven: boolean;
}

const INITIAL_FORM: FormData = {
  name: "",
  phone: "",
  password: "",
  confirmPassword: "",
  latitude: null,
  longitude: null,
  manualLat: "",
  manualLng: "",
  bloodType: "",
  chronicConditions: [],
  allergies: [],
  medications: [],
  mobility: "",
  specialNeeds: [],
  otherNeeds: "",
  specialEquipment: [],
  livingSituation: "",
  emergencyContacts: [{ name: "", phone: "", relationship: "" }],
  consentGiven: false,
};

// ─── Option catalogs ────────────────────────────────────────────
// `value` strings are the exact tokens the backend stores / expects
// (see backend app/models/patient.py + seed conventions).

interface TokenOption {
  value: string;
  labelKey: string;
}

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const CHRONIC_CONDITION_OPTIONS: TokenOption[] = [
  { value: "diabetes", labelKey: "register.cond.diabetes" },
  { value: "hypertension", labelKey: "register.cond.hypertension" },
  { value: "heart_disease", labelKey: "register.cond.heartDisease" },
  { value: "asthma", labelKey: "register.cond.asthma" },
  { value: "chronic_kidney_disease", labelKey: "register.cond.kidney" },
  { value: "cancer", labelKey: "register.cond.cancer" },
  { value: "epilepsy", labelKey: "register.cond.epilepsy" },
];

const ALLERGY_SUGGESTIONS: TokenOption[] = [
  { value: "penicillin", labelKey: "register.allergy.penicillin" },
  { value: "aspirin", labelKey: "register.allergy.aspirin" },
  { value: "latex", labelKey: "register.allergy.latex" },
  { value: "iodine_contrast", labelKey: "register.allergy.iodine" },
];

// MobilityStatus enum: can_walk | wheelchair | bedridden | other
const MOBILITY_OPTIONS: TokenOption[] = [
  { value: "can_walk", labelKey: "register.mobility.can_walk" },
  { value: "wheelchair", labelKey: "register.mobility.wheelchair" },
  { value: "bedridden", labelKey: "register.mobility.bedridden" },
  { value: "other", labelKey: "register.mobility.other" },
];

// Flags merged into chronic_conditions on submit (feeds responder triage).
const SPECIAL_NEED_OPTIONS: TokenOption[] = [
  { value: "respiratory_condition", labelKey: "register.need.respiratory" },
  { value: "cognitive_impairment", labelKey: "register.need.cognitive" },
];

const EQUIPMENT_OPTIONS: TokenOption[] = [
  { value: "oxygen_tank", labelKey: "register.equip.oxygen_tank" },
  { value: "wheelchair", labelKey: "register.equip.wheelchair" },
  { value: "dialysis", labelKey: "register.equip.dialysis" },
  { value: "insulin_pump", labelKey: "register.equip.insulin_pump" },
  { value: "nebulizer", labelKey: "register.equip.nebulizer" },
  { value: "hospital_bed", labelKey: "register.equip.hospital_bed" },
  { value: "none", labelKey: "register.equip.none" },
];

// LivingSituation enum: alone | with_family | care_facility
const LIVING_OPTIONS: TokenOption[] = [
  { value: "alone", labelKey: "register.living.alone" },
  { value: "with_family", labelKey: "register.living.with_family" },
  { value: "care_facility", labelKey: "register.living.care_facility" },
];

const RELATIONSHIP_OPTIONS: TokenOption[] = [
  { value: "mother", labelKey: "register.rel.mother" },
  { value: "father", labelKey: "register.rel.father" },
  { value: "wife", labelKey: "register.rel.wife" },
  { value: "husband", labelKey: "register.rel.husband" },
  { value: "son", labelKey: "register.rel.son" },
  { value: "daughter", labelKey: "register.rel.daughter" },
  { value: "brother", labelKey: "register.rel.brother" },
  { value: "sister", labelKey: "register.rel.sister" },
  { value: "neighbor", labelKey: "register.rel.neighbor" },
  { value: "friend", labelKey: "register.rel.friend" },
  { value: "other", labelKey: "register.rel.other" },
];

const TOKEN_LABEL_KEYS: Record<string, string> = {};
for (const option of [
  ...CHRONIC_CONDITION_OPTIONS,
  ...ALLERGY_SUGGESTIONS,
  ...MOBILITY_OPTIONS,
  ...SPECIAL_NEED_OPTIONS,
  ...EQUIPMENT_OPTIONS,
  ...LIVING_OPTIONS,
  ...RELATIONSHIP_OPTIONS,
]) {
  TOKEN_LABEL_KEYS[option.value] = option.labelKey;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Translated label for a known backend token; prettified fallback otherwise. */
function tokenLabel(t: Translate, value: string): string {
  const key = TOKEN_LABEL_KEYS[value];
  return key ? t(key) : value.replace(/_/g, " ");
}

// ─── Wizard steps ───────────────────────────────────────────────

const STEP_KEYS = [
  "register.stepAccount",
  "register.stepLocation",
  "register.stepMedical",
  "register.stepNeeds",
  "register.stepContacts",
  "register.stepConsent",
  "register.stepReview",
];
const TOTAL_STEPS = STEP_KEYS.length;

// Maps backend field names (422 validation `loc` / 409 conflicts) back to
// the wizard step + local error key so we can send the user straight there.
const API_FIELD_MAP: Record<string, { step: number; field: string }> = {
  name: { step: 1, field: "name" },
  phone: { step: 1, field: "phone" },
  password: { step: 1, field: "password" },
  latitude: { step: 2, field: "gps" },
  longitude: { step: 2, field: "gps" },
  location_name: { step: 2, field: "gps" },
  blood_type: { step: 3, field: "bloodType" },
  chronic_conditions: { step: 3, field: "chronicConditions" },
  allergies: { step: 3, field: "allergies" },
  current_medications: { step: 3, field: "medications" },
  mobility: { step: 4, field: "mobility" },
  living_situation: { step: 4, field: "livingSituation" },
  special_equipment: { step: 4, field: "specialEquipment" },
  emergency_contacts: { step: 5, field: "contacts" },
  consent_given: { step: 6, field: "consent" },
};

function mapApiIssues(issues: ApiFieldIssue[]): {
  errors: Record<string, string>;
  firstStep: number | null;
} {
  const errors: Record<string, string> = {};
  let firstStep: number | null = null;
  for (const issue of issues) {
    const loc = issue.loc ?? [];
    const fieldName = typeof loc[1] === "string" ? loc[1] : undefined;
    if (!fieldName) continue;
    const target = API_FIELD_MAP[fieldName];
    if (!target) continue;
    if (issue.msg && !errors[target.field]) errors[target.field] = issue.msg;
    if (firstStep === null || target.step < firstStep) firstStep = target.step;
  }
  return { errors, firstStep };
}

// ─── Phone helpers (+970) ───────────────────────────────────────

const normalizePhone = (raw: string) =>
  raw.replace(/[\s-]/g, "").replace(/^0+/, "");

/** Palestinian mobile: 5XXXXXXXX (9 digits after the +970 prefix). */
const isValidLocalPhone = (raw: string) => /^5\d{8}$/.test(normalizePhone(raw));

const toInternationalPhone = (raw: string) => `+970${normalizePhone(raw)}`;

// Gaza default center
const DEFAULT_CENTER: [number, number] = [31.5, 34.47];

// Fix Leaflet default icon issue with bundlers
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

// ─── Step Progress ──────────────────────────────────────────────

function StepProgress({
  currentStep,
  labels,
  navLabel,
  stepText,
  completedText,
}: {
  currentStep: number;
  labels: string[];
  navLabel: string;
  stepText: (num: number, label: string) => string;
  completedText: string;
}) {
  return (
    <nav aria-label={navLabel} className="mb-8">
      <ol className="flex items-start justify-between">
        {labels.map((label, idx) => {
          const stepNum = idx + 1;
          const isActive = stepNum === currentStep;
          const isCompleted = stepNum < currentStep;
          return (
            <li
              key={label}
              aria-current={isActive ? "step" : undefined}
              className="flex min-w-0 flex-1 flex-col items-center"
            >
              <div className="flex w-full items-center">
                {idx > 0 && (
                  <span
                    aria-hidden="true"
                    className={`h-1 flex-1 rounded-full ${
                      isCompleted || isActive ? "bg-accent" : "bg-surface-3"
                    }`}
                  />
                )}
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    isCompleted
                      ? "bg-accent text-on-accent"
                      : isActive
                        ? "bg-accent text-on-accent ring-4 ring-accent-soft"
                        : "bg-surface-3 text-ink-muted"
                  }`}
                >
                  {isCompleted ? <Check className="h-5 w-5" strokeWidth={3} /> : stepNum}
                </span>
                {idx < labels.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`h-1 flex-1 rounded-full ${
                      isCompleted ? "bg-accent" : "bg-surface-3"
                    }`}
                  />
                )}
              </div>
              <span className="sr-only">
                {stepText(stepNum, label)}
                {isCompleted ? ` (${completedText})` : ""}
              </span>
              <span
                aria-hidden="true"
                className={`mt-2 max-w-full truncate text-xs ${
                  isActive
                    ? "font-bold text-accent"
                    : isCompleted
                      ? "hidden font-semibold text-ink sm:block"
                      : "hidden font-medium text-ink-muted sm:block"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ─── Choice chip (radio / checkbox as a large touch target) ─────

function ChoiceChip({
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
      className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-base transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-offset-2 ${
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
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
          type === "radio" ? "rounded-full" : "rounded-[0.3rem]"
        } ${
          checked
            ? "border-accent bg-accent text-on-accent"
            : "border-edge-strong bg-surface"
        }`}
      >
        {checked &&
          (type === "checkbox" ? (
            <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
          ) : (
            <span className="h-2 w-2 rounded-full bg-current" />
          ))}
      </span>
      <span className="min-w-0">{label}</span>
    </label>
  );
}

// ─── Phone field with +970 prefix ───────────────────────────────

function PhoneField({
  label,
  hideLabel,
  required,
  value,
  onChange,
  error,
  placeholder,
  autoComplete,
}: {
  label: string;
  hideLabel?: boolean;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={hideLabel ? "sr-only" : "text-sm font-semibold text-ink"}
      >
        {label}
        {required && (
          <span aria-hidden="true" className="ms-0.5 text-danger">
            *
          </span>
        )}
      </label>
      <div className="flex">
        <span className="inline-flex items-center rounded-s-md border border-e-0 border-edge-strong bg-surface-2 px-3.5 text-base font-semibold text-ink-muted">
          +970
        </span>
        <input
          id={id}
          type="tel"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={`min-h-11 w-full rounded-e-md border bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-1 ${
            error ? "border-danger" : "border-edge-strong"
          }`}
        />
      </div>
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-sm font-medium text-danger">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Inline error text for chip fieldsets / list inputs ─────────

function FieldErrorText({ children }: { children: ReactNode }) {
  return (
    <p
      tabIndex={-1}
      data-error-anchor="true"
      className="mt-2 flex items-center gap-1.5 text-sm font-medium text-danger"
    >
      <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}

// ─── Tag list input (medications / allergies) ───────────────────

function TagListInput({
  label,
  hint,
  placeholder,
  addLabel,
  items,
  itemLabel,
  onAdd,
  onRemove,
  removeLabel,
  suggestions,
  suggestionsLabel,
  error,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  addLabel: string;
  items: string[];
  itemLabel: (value: string) => string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  removeLabel: (label: string) => string;
  suggestions?: Array<{ value: string; label: string }>;
  suggestionsLabel?: string;
  error?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const value = draft.trim();
    if (value) onAdd(value);
    setDraft("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  const pendingSuggestions = (suggestions ?? []).filter(
    (s) => !items.includes(s.value)
  );

  return (
    <div>
      <div className="mb-2 flex items-end gap-2">
        <Input
          label={label}
          hint={hint}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" variant="secondary" icon={<Plus />} onClick={commit}>
          {addLabel}
        </Button>
      </div>
      {pendingSuggestions.length > 0 && (
        <div className="mb-2">
          {suggestionsLabel && (
            <p className="mb-1.5 text-xs font-semibold text-ink-muted">
              {suggestionsLabel}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {pendingSuggestions.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => onAdd(s.value)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-edge-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {items.map((item) => (
            <li key={item}>
              <Badge tone="accent" className="py-1.5 ps-3">
                {itemLabel(item)}
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  aria-label={removeLabel(itemLabel(item))}
                  className="-me-1.5 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-accent/15 focus-visible:outline-3 focus-visible:outline-focus"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {error && <FieldErrorText>{error}</FieldErrorText>}
    </div>
  );
}

// ─── Review helpers ─────────────────────────────────────────────

function ReviewSection({
  title,
  editText,
  editLabel,
  onEdit,
  children,
}: {
  title: string;
  editText: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-edge bg-surface-2 p-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<Pencil />}
          onClick={onEdit}
          aria-label={editLabel}
        >
          {editText}
        </Button>
      </div>
      <dl className="divide-y divide-edge">{children}</dl>
    </section>
  );
}

function ReviewRow({
  label,
  value,
  fallback,
  ltr,
}: {
  label: string;
  value: string;
  fallback: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-sm text-ink-muted">{label}</dt>
      <dd
        dir={ltr && value ? "ltr" : undefined}
        className={`min-w-0 break-words text-end text-sm ${
          value ? "font-semibold text-ink" : "text-ink-faint"
        }`}
      >
        {value || fallback}
      </dd>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function Register() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const storeLogin = useAuthStore((s) => s.login);
  const setRegisteredProfile = useProfileStore((s) => s.setRegisteredProfile);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginFailed, setLoginFailed] = useState(false);
  const [success, setSuccess] = useState(false);
  const [syncNotice, setSyncNotice] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  // Stages already completed during submission — survives retries so we
  // never re-register (409) or lose progress when a later stage fails.
  const progressRef = useRef<{
    patient?: RegisterPatientResponse;
    auth?: LoginResponse;
    creds?: { phone: string; password: string };
  }>({});

  const stepLabels = STEP_KEYS.map((key) => t(key));

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar");
  };

  // ─── Helpers ────────────────────────────────────────────────

  const updateField = useCallback(
    <K extends keyof FormData>(field: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setStepErrors((prev) => {
        if (!(field in prev)) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    []
  );

  const toggleArrayItem = useCallback(
    (
      field: "chronicConditions" | "specialEquipment" | "specialNeeds",
      item: string
    ) => {
      setForm((prev) => {
        const arr = prev[field];
        if (field === "specialEquipment" && item === "none") {
          return { ...prev, [field]: arr.includes("none") ? [] : ["none"] };
        }
        if (arr.includes(item)) {
          return { ...prev, [field]: arr.filter((i) => i !== item) };
        }
        return {
          ...prev,
          [field]: [...arr.filter((i) => i !== "none"), item],
        };
      });
    },
    []
  );

  const addListItem = useCallback(
    (field: "medications" | "allergies", value: string) => {
      setForm((prev) => {
        const exists = prev[field].some(
          (v) => v.toLowerCase() === value.toLowerCase()
        );
        if (exists) return prev;
        return { ...prev, [field]: [...prev[field], value] };
      });
    },
    []
  );

  const removeListItem = useCallback(
    (field: "medications" | "allergies", value: string) => {
      setForm((prev) => ({
        ...prev,
        [field]: prev[field].filter((v) => v !== value),
      }));
    },
    []
  );

  // Emergency contacts
  const addEmergencyContact = useCallback(() => {
    setForm((prev) =>
      prev.emergencyContacts.length >= 3
        ? prev
        : {
            ...prev,
            emergencyContacts: [
              ...prev.emergencyContacts,
              { name: "", phone: "", relationship: "" },
            ],
          }
    );
  }, []);

  const removeEmergencyContact = useCallback((idx: number) => {
    setForm((prev) => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.filter((_, i) => i !== idx),
    }));
    setStepErrors({});
  }, []);

  const updateEmergencyContact = useCallback(
    (idx: number, field: keyof ContactForm, value: string) => {
      setForm((prev) => ({
        ...prev,
        emergencyContacts: prev.emergencyContacts.map((c, i) =>
          i === idx ? { ...c, [field]: value } : c
        ),
      }));
      setStepErrors((prev) => {
        const key =
          field === "name"
            ? `contact${idx}Name`
            : field === "phone"
              ? `contact${idx}Phone`
              : "";
        if (!key || !(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        delete next.contacts;
        return next;
      });
    },
    []
  );

  // GPS
  const detectGPS = useCallback(async () => {
    setGpsLoading(true);
    try {
      const pos = await getCurrentPosition();
      setForm((prev) => ({
        ...prev,
        latitude: pos.latitude,
        longitude: pos.longitude,
        manualLat: pos.latitude.toFixed(6),
        manualLng: pos.longitude.toFixed(6),
      }));
      setStepErrors((prev) => {
        const next = { ...prev };
        delete next.gps;
        return next;
      });
    } catch {
      setStepErrors((prev) => ({ ...prev, gps: t("register.gpsError") }));
    } finally {
      setGpsLoading(false);
    }
  }, [t]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setForm((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      manualLat: lat.toFixed(6),
      manualLng: lng.toFixed(6),
    }));
    setStepErrors((prev) => {
      const next = { ...prev };
      delete next.gps;
      return next;
    });
  }, []);

  const applyManualCoords = useCallback(() => {
    const lat = parseFloat(form.manualLat);
    const lng = parseFloat(form.manualLng);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      setForm((prev) => ({ ...prev, latitude: lat, longitude: lng }));
      setStepErrors((prev) => {
        const next = { ...prev };
        delete next.gps;
        return next;
      });
    } else {
      setStepErrors((prev) => ({ ...prev, gps: t("register.coordsInvalid") }));
    }
  }, [form.manualLat, form.manualLng, t]);

  // ─── Validation ─────────────────────────────────────────────

  const getStepErrors = (stepNum: number): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (stepNum === 1) {
      if (!form.name.trim()) errors.name = t("register.errNameRequired");
      const rawPhone = form.phone.trim();
      if (!rawPhone) {
        errors.phone = t("register.errPhoneRequired");
      } else if (!isValidLocalPhone(rawPhone)) {
        errors.phone = t("register.errPhoneInvalid");
      }
      if (!form.password) {
        errors.password = t("register.errPasswordRequired");
      } else if (form.password.length < 8) {
        // Backend requires min 8 characters (PatientRegisterRequest).
        errors.password = t("register.errPasswordMin");
      }
      if (form.password !== form.confirmPassword) {
        errors.confirmPassword = t("register.errPasswordMismatch");
      }
    }

    if (stepNum === 5) {
      form.emergencyContacts.forEach((contact, idx) => {
        const touched = contact.name.trim() || contact.phone.trim();
        if (!touched) return;
        if (!contact.name.trim()) {
          errors[`contact${idx}Name`] = t("register.errContactName");
        }
        if (!contact.phone.trim() || !isValidLocalPhone(contact.phone)) {
          errors[`contact${idx}Phone`] = t("register.errContactPhone");
        }
      });
    }

    if (stepNum === 6 && !form.consentGiven) {
      errors.consent = t("register.errConsent");
    }

    return errors;
  };

  // ─── Navigation / focus management ──────────────────────────

  const focusFirstInvalid = () => {
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        '[aria-invalid="true"], [data-error-anchor="true"]'
      );
      el?.focus();
    }, 80);
  };

  const jumpToStep = (target: number, clearErrors = true) => {
    if (clearErrors) setStepErrors({});
    setStep(target);
    window.scrollTo({ top: 0 });
    announce(
      t("register.stepAnnounce", {
        current: target,
        total: TOTAL_STEPS,
        label: t(STEP_KEYS[target - 1]),
      }),
      "polite"
    );
    window.setTimeout(() => {
      document
        .getElementById("register-step-heading")
        ?.focus({ preventScroll: true });
    }, 60);
  };

  const failStep = (target: number, errors: Record<string, string>) => {
    setStepErrors(errors);
    if (step !== target) setStep(target);
    announce(t("register.errFixFields"), "assertive");
    focusFirstInvalid();
  };

  const nextStep = () => {
    const errors = getStepErrors(step);
    if (Object.keys(errors).length > 0) {
      failStep(step, errors);
      return;
    }
    jumpToStep(Math.min(step + 1, TOTAL_STEPS));
  };

  const prevStep = () => jumpToStep(Math.max(step - 1, 1));

  // ─── Submit payload builders ────────────────────────────────

  const buildChronicList = (): string[] => {
    const list = [...form.chronicConditions, ...form.specialNeeds];
    const other = form.otherNeeds.trim();
    if (other) list.push(other);
    return Array.from(new Set(list));
  };

  const buildEquipmentList = (): string[] =>
    form.specialEquipment.filter((v) => v !== "none");

  const buildContacts = () =>
    form.emergencyContacts
      .filter((c) => c.name.trim() && c.phone.trim())
      .map((c) => ({
        name: c.name.trim(),
        phone: toInternationalPhone(c.phone),
        ...(c.relationship ? { relationship: c.relationship } : {}),
      }));

  // ─── Submit ─────────────────────────────────────────────────

  const doSubmit = async () => {
    // Re-validate every step that can block submission; jump to the first
    // one that fails so nothing invalid ever reaches the API.
    for (const s of [1, 5, 6]) {
      const errors = getStepErrors(s);
      if (Object.keys(errors).length > 0) {
        setError(t("register.errFixFields"));
        failStep(s, errors);
        return;
      }
    }

    setLoading(true);
    setError(null);
    setLoginFailed(false);

    const chronicList = buildChronicList();
    const equipmentList = buildEquipmentList();
    const contacts = buildContacts();

    try {
      // Stage 1 — create the account (public endpoint, POST /patients).
      let patient = progressRef.current.patient;
      if (!patient) {
        const fullPhone = toInternationalPhone(form.phone);
        const payload: RegisterPatientRequest = {
          phone: fullPhone,
          password: form.password,
          name: form.name.trim(),
          latitude: form.latitude ?? undefined,
          longitude: form.longitude ?? undefined,
          ...(form.mobility ? { mobility: form.mobility } : {}),
          ...(form.livingSituation
            ? { living_situation: form.livingSituation }
            : {}),
          ...(form.bloodType ? { blood_type: form.bloodType } : {}),
          emergency_contacts: contacts,
          ...(chronicList.length ? { chronic_conditions: chronicList } : {}),
          ...(form.allergies.length ? { allergies: form.allergies } : {}),
          ...(form.medications.length
            ? { current_medications: form.medications }
            : {}),
          ...(equipmentList.length ? { special_equipment: equipmentList } : {}),
          consent_given: form.consentGiven,
        };

        patient = await registerPatient(payload);
        progressRef.current.patient = patient;
        progressRef.current.creds = { phone: fullPhone, password: form.password };

        // Offline-SOS provisioning — only present if the backend returns it.
        if (patient.sms_key) {
          localStorage.setItem("tmt-sms-key", patient.sms_key);
        }
        if (patient.short_id) {
          localStorage.setItem("tmt-patient-short-id", patient.short_id);
        }
      }

      // Stage 2 — sign in with the credentials the account was created with.
      let auth = progressRef.current.auth;
      if (!auth) {
        const creds = progressRef.current.creds ?? {
          phone: toInternationalPhone(form.phone),
          password: form.password,
        };
        auth = await login(creds);
        progressRef.current.auth = auth;
      }

      storeLogin(auth.access_token, {
        id: auth.user_id,
        role: "patient",
        patientId: auth.patient_id ?? patient.id,
      });

      // Stage 3 — persist the medical profile. POST /patients only stores
      // identity/location/mobility/living/blood/contacts/consent, so the
      // medical lists go through PUT /patients/{id} (via the profile store,
      // which caches them offline and queues a retry if the PUT fails).
      const enrichment: Partial<Patient> = {};
      if (chronicList.length) enrichment.chronic_conditions = chronicList;
      if (form.allergies.length) enrichment.allergies = form.allergies;
      if (form.medications.length)
        enrichment.current_medications = form.medications;
      if (equipmentList.length) enrichment.special_equipment = equipmentList;

      const mergedProfile = { ...patient, ...enrichment } as Patient;
      await setRegisteredProfile(mergedProfile);

      if (Object.keys(enrichment).length > 0) {
        await useProfileStore.getState().updateProfile(enrichment);
        if (useProfileStore.getState().syncStatus !== "synced") {
          setSyncNotice(true);
        }
      }

      setSuccess(true);
      announce(t("register.successTitle"), "polite");
      setTimeout(() => {
        navigate("/profile");
      }, 2500);
    } catch (err) {
      handleSubmitError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitError = (err: unknown) => {
    const accountCreated = Boolean(progressRef.current.patient);

    if (err instanceof ApiError) {
      // Phone already registered (409 from POST /patients).
      if (err.status === 409 && !accountCreated) {
        setError(t("register.errPhoneTaken"));
        announce(t("register.errPhoneTaken"), "assertive");
        failStep(1, { phone: t("register.errPhoneTaken") });
        return;
      }

      // Pydantic validation errors — map them back onto the wizard.
      if (err.status === 422) {
        const { errors, firstStep } = mapApiIssues(err.fieldIssues);
        if (firstStep !== null && Object.keys(errors).length > 0) {
          setError(t("register.errFixFields"));
          failStep(firstStep, errors);
          return;
        }
      }

      // Account exists but automatic sign-in failed.
      if (err.status === 401 && accountCreated) {
        setLoginFailed(true);
        setError(t("register.errAutoLogin"));
        announce(t("register.errAutoLogin"), "assertive");
        return;
      }

      const message = err.message || t("register.errGeneric");
      setError(message);
      announce(message, "assertive");
      return;
    }

    const message =
      err instanceof Error && err.message ? err.message : t("register.errGeneric");
    setError(message);
    announce(message, "assertive");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Implicit submission (Enter in a field) advances the wizard instead of
    // submitting from the middle of the flow.
    if (step < TOTAL_STEPS) {
      nextStep();
      return;
    }
    await doSubmit();
  };

  // ─── Success Screen ────────────────────────────────────────

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <Card className="w-full max-w-md p-8 text-center shadow-2">
          <span
            aria-hidden="true"
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success-soft text-on-success-soft"
          >
            <Check className="h-10 w-10" strokeWidth={3} />
          </span>
          <h1 className="mb-2 text-2xl font-bold text-ink">
            {t("register.successTitle")}
          </h1>
          <p className="mb-4 text-base text-ink-muted">
            {t("register.successBody", { name: form.name })}
          </p>
          {syncNotice && (
            <p className="mb-4 rounded-md bg-warning-soft p-3 text-sm font-medium text-on-warning-soft">
              {t("register.successSync")}
            </p>
          )}
          <p
            className="flex items-center justify-center gap-2 text-sm text-ink-faint"
            role="status"
          >
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("register.redirecting")}
          </p>
        </Card>
      </div>
    );
  }

  // ─── Render helpers for review step ────────────────────────

  const completeContacts = form.emergencyContacts.filter(
    (c) => c.name.trim() && c.phone.trim()
  );

  const equipmentDisplay = form.specialEquipment.includes("none")
    ? tokenLabel(t, "none")
    : buildEquipmentList()
        .map((v) => tokenLabel(t, v))
        .join(", ");

  const needsDisplay = [
    ...form.specialNeeds.map((v) => tokenLabel(t, v)),
    ...(form.otherNeeds.trim() ? [form.otherNeeds.trim()] : []),
  ].join(", ");

  // ─── Render Steps ──────────────────────────────────────────

  return (
    <div className="min-h-screen bg-canvas px-4 py-8">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <header className="mb-6 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-accent text-on-accent shadow-2"
          >
            <UserPlus className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {t("register.title")}
          </h1>
          <p className="mt-2 text-base text-ink-muted">{t("register.subtitle")}</p>
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-base font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              <Languages aria-hidden="true" className="h-4.5 w-4.5" />
              {i18n.language === "ar" ? "English" : "العربية"}
            </button>
          </div>
        </header>

        {/* Step Progress */}
        <StepProgress
          currentStep={step}
          labels={stepLabels}
          navLabel={t("register.progressLabel", {
            current: step,
            total: TOTAL_STEPS,
          })}
          stepText={(num, label) =>
            t("register.stepAnnounce", {
              current: num,
              total: TOTAL_STEPS,
              label,
            })
          }
          completedText={t("register.stepCompleted")}
        />

        {/* Error Banner */}
        {error && (
          <Card
            role="alert"
            className="mb-6 border-danger/40 bg-danger-soft p-4 sm:p-4"
          >
            <div className="flex items-start gap-3">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-on-danger-soft"
              />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-on-danger-soft">
                  {error}
                </p>
                {(loginFailed || step === TOTAL_STEPS) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!loginFailed && (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        icon={<RefreshCw />}
                        loading={loading}
                        onClick={doSubmit}
                      >
                        {t("register.retry")}
                      </Button>
                    )}
                    {loginFailed && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate("/login")}
                      >
                        {t("register.goToLogin")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <Card className="p-5 sm:p-6">
            {/* ─── Step 1: Account ────────────────────────────── */}
            {step === 1 && (
              <div className="flex flex-col gap-5">
                <h2
                  id="register-step-heading"
                  tabIndex={-1}
                  className="text-xl font-bold text-ink focus:outline-none"
                >
                  {t("register.accountTitle")}
                </h2>

                <Input
                  label={t("register.fullName")}
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  error={stepErrors.name}
                  placeholder={t("register.fullNamePlaceholder")}
                  autoComplete="name"
                />

                <PhoneField
                  label={t("register.phone")}
                  required
                  value={form.phone}
                  onChange={(value) => updateField("phone", value)}
                  error={stepErrors.phone}
                  placeholder={t("register.phonePlaceholder")}
                  autoComplete="tel"
                />

                <Input
                  label={t("register.password")}
                  required
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  error={stepErrors.password}
                  hint={t("register.passwordHint")}
                  autoComplete="new-password"
                />

                <Input
                  label={t("register.confirmPassword")}
                  required
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => updateField("confirmPassword", e.target.value)}
                  error={stepErrors.confirmPassword}
                  placeholder={t("register.confirmPasswordPlaceholder")}
                  autoComplete="new-password"
                />
              </div>
            )}

            {/* ─── Step 2: Location ──────────────────────────── */}
            {step === 2 && (
              <div className="flex flex-col gap-5">
                <div>
                  <h2
                    id="register-step-heading"
                    tabIndex={-1}
                    className="text-xl font-bold text-ink focus:outline-none"
                  >
                    {t("register.locationTitle")}
                  </h2>
                  <p className="mt-1 text-base text-ink-muted">
                    {t("register.locationHelp")}
                  </p>
                  <p className="mt-1 text-sm text-ink-faint">
                    {t("register.locationOptional")}
                  </p>
                </div>

                <Button
                  type="button"
                  size="lg"
                  fullWidth
                  icon={<LocateFixed />}
                  loading={gpsLoading}
                  onClick={detectGPS}
                >
                  {gpsLoading ? t("register.detecting") : t("register.useGps")}
                </Button>

                {stepErrors.gps && (
                  <p
                    role="alert"
                    tabIndex={-1}
                    data-error-anchor="true"
                    className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm font-medium text-on-warning-soft"
                  >
                    <TriangleAlert
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    {stepErrors.gps}
                  </p>
                )}

                <div
                  className="overflow-hidden rounded-lg border border-edge-strong"
                  style={{ height: "300px" }}
                >
                  <MapContainer
                    center={
                      form.latitude && form.longitude
                        ? [form.latitude, form.longitude]
                        : DEFAULT_CENTER
                    }
                    zoom={12}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom={true}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapClickHandler onLocationSelect={handleMapClick} />
                    {form.latitude !== null && form.longitude !== null && (
                      <Marker position={[form.latitude, form.longitude]} />
                    )}
                  </MapContainer>
                </div>

                {form.latitude !== null && form.longitude !== null && (
                  <div
                    role="status"
                    className="flex items-center gap-2.5 rounded-md bg-success-soft p-3"
                  >
                    <MapPin
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 text-on-success-soft"
                    />
                    <span className="text-sm font-semibold text-on-success-soft">
                      {t("register.locationSet", {
                        lat: form.latitude.toFixed(6),
                        lng: form.longitude.toFixed(6),
                      })}
                    </span>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-sm font-semibold text-ink">
                    {t("register.manualCoords")}
                  </p>
                  <div className="flex items-end gap-3">
                    <Input
                      label={t("register.latitude")}
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      value={form.manualLat}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, manualLat: e.target.value }))
                      }
                      placeholder="31.520000"
                      className="flex-1"
                    />
                    <Input
                      label={t("register.longitude")}
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      value={form.manualLng}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, manualLng: e.target.value }))
                      }
                      placeholder="34.440000"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={applyManualCoords}
                    >
                      {t("register.apply")}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 3: Medical Profile ───────────────────── */}
            {step === 3 && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2
                    id="register-step-heading"
                    tabIndex={-1}
                    className="text-xl font-bold text-ink focus:outline-none"
                  >
                    {t("register.medicalTitle")}
                  </h2>
                  <p className="mt-1 text-base text-ink-muted">
                    {t("register.medicalHelp")}
                  </p>
                </div>

                <Select
                  label={t("register.bloodType")}
                  value={form.bloodType}
                  onChange={(e) => updateField("bloodType", e.target.value)}
                  error={stepErrors.bloodType}
                >
                  <option value="">{t("register.bloodTypeSelect")}</option>
                  {BLOOD_TYPES.map((bt) => (
                    <option key={bt} value={bt}>
                      {bt}
                    </option>
                  ))}
                </Select>

                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-ink">
                    {t("register.chronicConditions")}
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {CHRONIC_CONDITION_OPTIONS.map((cond) => (
                      <ChoiceChip
                        key={cond.value}
                        type="checkbox"
                        label={t(cond.labelKey)}
                        checked={form.chronicConditions.includes(cond.value)}
                        onChange={() =>
                          toggleArrayItem("chronicConditions", cond.value)
                        }
                      />
                    ))}
                  </div>
                  {stepErrors.chronicConditions && (
                    <FieldErrorText>{stepErrors.chronicConditions}</FieldErrorText>
                  )}
                </fieldset>

                <TagListInput
                  label={t("register.allergies")}
                  hint={t("register.allergiesHint")}
                  placeholder={t("register.allergyPlaceholder")}
                  addLabel={t("register.add")}
                  items={form.allergies}
                  itemLabel={(v) => tokenLabel(t, v)}
                  onAdd={(v) => addListItem("allergies", v)}
                  onRemove={(v) => removeListItem("allergies", v)}
                  removeLabel={(label) => t("register.removeItem", { item: label })}
                  suggestions={ALLERGY_SUGGESTIONS.map((s) => ({
                    value: s.value,
                    label: t(s.labelKey),
                  }))}
                  suggestionsLabel={t("register.quickAdd")}
                  error={stepErrors.allergies}
                />

                <TagListInput
                  label={t("register.medications")}
                  hint={t("register.medicationsHint")}
                  placeholder={t("register.medicationPlaceholder")}
                  addLabel={t("register.add")}
                  items={form.medications}
                  itemLabel={(v) => v}
                  onAdd={(v) => addListItem("medications", v)}
                  onRemove={(v) => removeListItem("medications", v)}
                  removeLabel={(label) => t("register.removeItem", { item: label })}
                  error={stepErrors.medications}
                />
              </div>
            )}

            {/* ─── Step 4: Special Needs & Living Situation ──── */}
            {step === 4 && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2
                    id="register-step-heading"
                    tabIndex={-1}
                    className="text-xl font-bold text-ink focus:outline-none"
                  >
                    {t("register.needsTitle")}
                  </h2>
                  <p className="mt-1 text-base text-ink-muted">
                    {t("register.needsHelp")}
                  </p>
                </div>

                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-ink">
                    {t("register.mobility")}
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {MOBILITY_OPTIONS.map((opt) => (
                      <ChoiceChip
                        key={opt.value}
                        type="radio"
                        name="mobility"
                        label={t(opt.labelKey)}
                        checked={form.mobility === opt.value}
                        onChange={() => updateField("mobility", opt.value)}
                      />
                    ))}
                  </div>
                  {stepErrors.mobility && (
                    <FieldErrorText>{stepErrors.mobility}</FieldErrorText>
                  )}
                </fieldset>

                <fieldset>
                  <legend className="mb-1 text-sm font-semibold text-ink">
                    {t("register.specialNeeds")}
                  </legend>
                  <p className="mb-2 text-sm text-ink-muted">
                    {t("register.specialNeedsHint")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {SPECIAL_NEED_OPTIONS.map((opt) => (
                      <ChoiceChip
                        key={opt.value}
                        type="checkbox"
                        label={t(opt.labelKey)}
                        checked={form.specialNeeds.includes(opt.value)}
                        onChange={() => toggleArrayItem("specialNeeds", opt.value)}
                      />
                    ))}
                  </div>
                  <div className="mt-3">
                    <Input
                      label={t("register.otherNeeds")}
                      type="text"
                      value={form.otherNeeds}
                      onChange={(e) => updateField("otherNeeds", e.target.value)}
                      placeholder={t("register.otherNeedsPlaceholder")}
                    />
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-ink">
                    {t("register.equipment")}
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {EQUIPMENT_OPTIONS.map((equip) => (
                      <ChoiceChip
                        key={equip.value}
                        type="checkbox"
                        label={t(equip.labelKey)}
                        checked={form.specialEquipment.includes(equip.value)}
                        onChange={() =>
                          toggleArrayItem("specialEquipment", equip.value)
                        }
                      />
                    ))}
                  </div>
                  {stepErrors.specialEquipment && (
                    <FieldErrorText>{stepErrors.specialEquipment}</FieldErrorText>
                  )}
                </fieldset>

                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-ink">
                    {t("register.livingSituation")}
                  </legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {LIVING_OPTIONS.map((opt) => (
                      <ChoiceChip
                        key={opt.value}
                        type="radio"
                        name="livingSituation"
                        label={t(opt.labelKey)}
                        checked={form.livingSituation === opt.value}
                        onChange={() => updateField("livingSituation", opt.value)}
                      />
                    ))}
                  </div>
                  {stepErrors.livingSituation && (
                    <FieldErrorText>{stepErrors.livingSituation}</FieldErrorText>
                  )}
                </fieldset>
              </div>
            )}

            {/* ─── Step 5: Emergency Contacts ────────────────── */}
            {step === 5 && (
              <div className="flex flex-col gap-5">
                <div>
                  <h2
                    id="register-step-heading"
                    tabIndex={-1}
                    className="text-xl font-bold text-ink focus:outline-none"
                  >
                    {t("register.contactsTitle")}{" "}
                    <span className="text-base font-normal text-ink-muted">
                      {t("register.upTo3")}
                    </span>
                  </h2>
                  <p className="mt-1 text-base text-ink-muted">
                    {t("register.contactsHelp")}
                  </p>
                </div>

                {stepErrors.contacts && (
                  <FieldErrorText>{stepErrors.contacts}</FieldErrorText>
                )}

                <div className="flex flex-col gap-3">
                  {form.emergencyContacts.map((contact, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-edge bg-surface-2 p-3.5"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-ink">
                          {t("register.contactNum", { num: idx + 1 })}
                        </p>
                        {form.emergencyContacts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeEmergencyContact(idx)}
                            aria-label={t("register.removeContact", {
                              num: idx + 1,
                            })}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger-soft focus-visible:outline-3 focus-visible:outline-focus"
                          >
                            <X aria-hidden="true" className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col gap-2.5">
                        <Input
                          label={t("register.contactName")}
                          type="text"
                          value={contact.name}
                          onChange={(e) =>
                            updateEmergencyContact(idx, "name", e.target.value)
                          }
                          error={stepErrors[`contact${idx}Name`]}
                          autoComplete="off"
                        />
                        <PhoneField
                          label={t("register.contactPhone")}
                          value={contact.phone}
                          onChange={(value) =>
                            updateEmergencyContact(idx, "phone", value)
                          }
                          error={stepErrors[`contact${idx}Phone`]}
                          placeholder={t("register.phonePlaceholder")}
                        />
                        <Select
                          label={t("register.relationship")}
                          value={contact.relationship}
                          onChange={(e) =>
                            updateEmergencyContact(
                              idx,
                              "relationship",
                              e.target.value
                            )
                          }
                        >
                          <option value="">
                            {t("register.relationshipSelect")}
                          </option>
                          {RELATIONSHIP_OPTIONS.map((rel) => (
                            <option key={rel.value} value={rel.value}>
                              {t(rel.labelKey)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>

                {form.emergencyContacts.length < 3 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    icon={<Plus />}
                    onClick={addEmergencyContact}
                    className="self-start"
                  >
                    {t("register.addContact")}
                  </Button>
                )}
              </div>
            )}

            {/* ─── Step 6: Consent ───────────────────────────── */}
            {step === 6 && (
              <div className="flex flex-col gap-5">
                <h2
                  id="register-step-heading"
                  tabIndex={-1}
                  className="text-xl font-bold text-ink focus:outline-none"
                >
                  {t("register.consentTitle")}
                </h2>

                <div className="rounded-lg border border-edge bg-surface-2 p-4 text-sm leading-relaxed text-ink">
                  <p className="mb-3 font-medium">{t("register.consentIntro")}</p>
                  <ul className="flex flex-col gap-2.5">
                    {["register.consentPoint1", "register.consentPoint2", "register.consentPoint3"].map(
                      (key) => (
                        <li key={key} className="flex items-start gap-2.5">
                          <ShieldCheck
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                          />
                          <span>{t(key)}</span>
                        </li>
                      )
                    )}
                  </ul>
                  <p className="mt-3 text-ink-muted">
                    {t("register.consentSecurity")}
                  </p>
                </div>

                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-offset-2 ${
                    form.consentGiven
                      ? "border-accent bg-accent-soft"
                      : stepErrors.consent
                        ? "border-danger bg-surface"
                        : "border-edge bg-surface hover:bg-surface-2"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.consentGiven}
                    onChange={(e) => updateField("consentGiven", e.target.checked)}
                    aria-invalid={stepErrors.consent ? true : undefined}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.3rem] border-2 transition-colors ${
                      form.consentGiven
                        ? "border-accent bg-accent text-on-accent"
                        : "border-edge-strong bg-surface"
                    }`}
                  >
                    {form.consentGiven && (
                      <Check className="h-4 w-4" strokeWidth={3.5} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="text-base font-semibold text-ink">
                      {t("register.consentCheckbox")}{" "}
                      <span aria-hidden="true" className="text-danger">
                        *
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-muted">
                      {t("register.consentCheckboxHint")}
                    </span>
                  </span>
                </label>

                {stepErrors.consent && (
                  <FieldErrorText>{stepErrors.consent}</FieldErrorText>
                )}
              </div>
            )}

            {/* ─── Step 7: Review & Submit ───────────────────── */}
            {step === 7 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2
                    id="register-step-heading"
                    tabIndex={-1}
                    className="text-xl font-bold text-ink focus:outline-none"
                  >
                    {t("register.reviewTitle")}
                  </h2>
                  <p className="mt-1 text-base text-ink-muted">
                    {t("register.reviewHelp")}
                  </p>
                </div>

                <ReviewSection
                  title={t("register.accountTitle")}
                  editText={t("register.edit")}
                  editLabel={t("register.editSection", {
                    section: t("register.accountTitle"),
                  })}
                  onEdit={() => jumpToStep(1)}
                >
                  <ReviewRow
                    label={t("register.fullName")}
                    value={form.name.trim()}
                    fallback={t("register.notProvided")}
                  />
                  <ReviewRow
                    label={t("register.phone")}
                    value={
                      form.phone.trim() ? toInternationalPhone(form.phone) : ""
                    }
                    fallback={t("register.notProvided")}
                    ltr
                  />
                  <ReviewRow
                    label={t("register.password")}
                    value={form.password ? "••••••••" : ""}
                    fallback={t("register.notProvided")}
                    ltr
                  />
                </ReviewSection>

                <ReviewSection
                  title={t("register.locationTitle")}
                  editText={t("register.edit")}
                  editLabel={t("register.editSection", {
                    section: t("register.locationTitle"),
                  })}
                  onEdit={() => jumpToStep(2)}
                >
                  <ReviewRow
                    label={t("register.stepLocation")}
                    value={
                      form.latitude !== null && form.longitude !== null
                        ? `${form.latitude.toFixed(6)}, ${form.longitude.toFixed(6)}`
                        : ""
                    }
                    fallback={t("register.notProvided")}
                    ltr
                  />
                </ReviewSection>

                <ReviewSection
                  title={t("register.medicalTitle")}
                  editText={t("register.edit")}
                  editLabel={t("register.editSection", {
                    section: t("register.medicalTitle"),
                  })}
                  onEdit={() => jumpToStep(3)}
                >
                  <ReviewRow
                    label={t("register.bloodType")}
                    value={form.bloodType}
                    fallback={t("register.notProvided")}
                    ltr
                  />
                  <ReviewRow
                    label={t("register.chronicConditions")}
                    value={form.chronicConditions
                      .map((v) => tokenLabel(t, v))
                      .join(", ")}
                    fallback={t("register.notProvided")}
                  />
                  <ReviewRow
                    label={t("register.allergies")}
                    value={form.allergies.map((v) => tokenLabel(t, v)).join(", ")}
                    fallback={t("register.notProvided")}
                  />
                  <ReviewRow
                    label={t("register.medications")}
                    value={form.medications.join(", ")}
                    fallback={t("register.notProvided")}
                  />
                </ReviewSection>

                <ReviewSection
                  title={t("register.needsTitle")}
                  editText={t("register.edit")}
                  editLabel={t("register.editSection", {
                    section: t("register.needsTitle"),
                  })}
                  onEdit={() => jumpToStep(4)}
                >
                  <ReviewRow
                    label={t("register.mobility")}
                    value={form.mobility ? tokenLabel(t, form.mobility) : ""}
                    fallback={t("register.notProvided")}
                  />
                  <ReviewRow
                    label={t("register.specialNeeds")}
                    value={needsDisplay}
                    fallback={t("register.notProvided")}
                  />
                  <ReviewRow
                    label={t("register.equipment")}
                    value={equipmentDisplay}
                    fallback={t("register.notProvided")}
                  />
                  <ReviewRow
                    label={t("register.livingSituation")}
                    value={
                      form.livingSituation
                        ? tokenLabel(t, form.livingSituation)
                        : ""
                    }
                    fallback={t("register.notProvided")}
                  />
                </ReviewSection>

                <ReviewSection
                  title={t("register.contactsTitle")}
                  editText={t("register.edit")}
                  editLabel={t("register.editSection", {
                    section: t("register.contactsTitle"),
                  })}
                  onEdit={() => jumpToStep(5)}
                >
                  {completeContacts.length === 0 ? (
                    <div className="py-2 text-sm text-ink-faint">
                      {t("register.reviewContactsNone")}
                    </div>
                  ) : (
                    completeContacts.map((contact, idx) => (
                      <ReviewRow
                        key={idx}
                        label={
                          contact.relationship
                            ? tokenLabel(t, contact.relationship)
                            : t("register.contactNum", { num: idx + 1 })
                        }
                        value={`${contact.name.trim()} — ${toInternationalPhone(contact.phone)}`}
                        fallback={t("register.notProvided")}
                      />
                    ))
                  )}
                </ReviewSection>

                <ReviewSection
                  title={t("register.consentTitle")}
                  editText={t("register.edit")}
                  editLabel={t("register.editSection", {
                    section: t("register.consentTitle"),
                  })}
                  onEdit={() => jumpToStep(6)}
                >
                  <div className="flex items-center gap-2 py-2">
                    <Check
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 text-success"
                      strokeWidth={3}
                    />
                    <span className="text-sm font-semibold text-ink">
                      {t("register.reviewConsentGiven")}
                    </span>
                  </div>
                </ReviewSection>
              </div>
            )}

            {/* ─── Navigation Buttons ────────────────────────── */}
            <div className="mt-8 flex items-center justify-between gap-3 border-t border-edge pt-6">
              <div>
                {step > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    icon={<ArrowLeft className="rtl:-scale-x-100" />}
                    onClick={prevStep}
                  >
                    {t("register.back")}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {(step === 3 || step === 4) && (
                  <button
                    type="button"
                    onClick={() => jumpToStep(step + 1)}
                    className="min-h-11 rounded-md px-2 text-sm font-semibold text-ink-muted underline transition-colors hover:text-ink focus-visible:outline-3 focus-visible:outline-focus"
                  >
                    {t("register.skipStep")}
                  </button>
                )}

                {step < TOTAL_STEPS ? (
                  <Button
                    type="button"
                    size="lg"
                    iconEnd={<ArrowRight className="rtl:-scale-x-100" />}
                    onClick={nextStep}
                  >
                    {t("register.next")}
                  </Button>
                ) : (
                  <Button type="submit" size="xl" loading={loading}>
                    {loading ? t("register.submitting") : t("register.submit")}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </form>

        {/* Login Link */}
        <p className="mt-6 text-center text-base text-ink-muted">
          {t("register.alreadyHave")}{" "}
          <a
            href="/login"
            className="rounded-sm font-semibold text-link hover:underline focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
          >
            {t("register.signIn")}
          </a>
        </p>
      </div>
    </div>
  );
}
