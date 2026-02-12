import { useState, useCallback, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { registerPatient, login } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { getCurrentPosition } from "../../utils/locationCodec";

// ─── Types ───────────────────────────────────────────────────────

interface EmergencyContact {
  name: string;
  phone: string;
}

interface FormData {
  // Step 1
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
  emergencyContacts: EmergencyContact[];
  // Step 2
  latitude: number | null;
  longitude: number | null;
  manualLat: string;
  manualLng: string;
  // Step 3
  mobility: string;
  chronicConditions: string[];
  medications: string[];
  specialEquipment: string[];
  bloodType: string;
  livingSituation: string;
  // Step 4
  consentMedicalData: boolean;
  consentCrisisAlerts: boolean;
  consentLocationSOS: boolean;
}

const INITIAL_FORM: FormData = {
  name: "",
  phone: "",
  password: "",
  confirmPassword: "",
  emergencyContacts: [{ name: "", phone: "" }],
  latitude: null,
  longitude: null,
  manualLat: "",
  manualLng: "",
  mobility: "",
  chronicConditions: [],
  medications: [],
  specialEquipment: [],
  bloodType: "",
  livingSituation: "",
  consentMedicalData: false,
  consentCrisisAlerts: false,
  consentLocationSOS: false,
};

const CHRONIC_CONDITIONS = [
  "Diabetes",
  "Heart disease",
  "Respiratory",
  "Kidney",
  "Cancer",
  "Other",
];

const EQUIPMENT_OPTIONS = [
  "Oxygen",
  "Dialysis",
  "Insulin pump",
  "Wheelchair",
  "None",
];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const STEP_LABELS = ["Basic Info", "Location", "Medical Profile", "Consent"];

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

function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {STEP_LABELS.map((label, idx) => {
          const stepNum = idx + 1;
          const isActive = stepNum === currentStep;
          const isCompleted = stepNum < currentStep;
          return (
            <div key={label} className="flex flex-col items-center flex-1">
              <div className="flex items-center w-full">
                {idx > 0 && (
                  <div
                    className={`flex-1 h-0.5 ${
                      isCompleted || isActive ? "bg-red-500" : "bg-gray-300"
                    }`}
                  />
                )}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    isCompleted
                      ? "bg-red-500 text-white"
                      : isActive
                        ? "bg-red-500 text-white ring-4 ring-red-200"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    stepNum
                  )}
                </div>
                {idx < STEP_LABELS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 ${
                      isCompleted ? "bg-red-500" : "bg-gray-300"
                    }`}
                  />
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium ${
                  isActive ? "text-red-600" : isCompleted ? "text-red-500" : "text-gray-400"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function Register() {
  const navigate = useNavigate();
  const storeLogin = useAuthStore((s) => s.login);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [medicationInput, setMedicationInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  // ─── Helpers ────────────────────────────────────────────────

  const updateField = useCallback(
    <K extends keyof FormData>(field: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setStepErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    []
  );

  const toggleArrayItem = useCallback(
    (field: "chronicConditions" | "specialEquipment", item: string) => {
      setForm((prev) => {
        const arr = prev[field];
        if (field === "specialEquipment" && item === "None") {
          return { ...prev, [field]: arr.includes("None") ? [] : ["None"] };
        }
        if (arr.includes(item)) {
          return { ...prev, [field]: arr.filter((i) => i !== item) };
        }
        return {
          ...prev,
          [field]: [...arr.filter((i) => i !== "None"), item],
        };
      });
    },
    []
  );

  const addMedication = useCallback(() => {
    const med = medicationInput.trim();
    if (med && !form.medications.includes(med)) {
      updateField("medications", [...form.medications, med]);
    }
    setMedicationInput("");
  }, [medicationInput, form.medications, updateField]);

  const removeMedication = useCallback(
    (med: string) => {
      updateField(
        "medications",
        form.medications.filter((m) => m !== med)
      );
    },
    [form.medications, updateField]
  );

  const handleMedicationKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addMedication();
      }
    },
    [addMedication]
  );

  // Emergency contacts
  const addEmergencyContact = useCallback(() => {
    if (form.emergencyContacts.length < 3) {
      updateField("emergencyContacts", [
        ...form.emergencyContacts,
        { name: "", phone: "" },
      ]);
    }
  }, [form.emergencyContacts, updateField]);

  const removeEmergencyContact = useCallback(
    (idx: number) => {
      updateField(
        "emergencyContacts",
        form.emergencyContacts.filter((_, i) => i !== idx)
      );
    },
    [form.emergencyContacts, updateField]
  );

  const updateEmergencyContact = useCallback(
    (idx: number, field: "name" | "phone", value: string) => {
      const updated = form.emergencyContacts.map((c, i) =>
        i === idx ? { ...c, [field]: value } : c
      );
      updateField("emergencyContacts", updated);
    },
    [form.emergencyContacts, updateField]
  );

  // GPS
  const detectGPS = useCallback(async () => {
    setGpsLoading(true);
    try {
      const pos = await getCurrentPosition();
      updateField("latitude", pos.latitude);
      updateField("longitude", pos.longitude);
      setForm((prev) => ({
        ...prev,
        latitude: pos.latitude,
        longitude: pos.longitude,
        manualLat: pos.latitude.toFixed(6),
        manualLng: pos.longitude.toFixed(6),
      }));
    } catch {
      setStepErrors((prev) => ({
        ...prev,
        gps: "Could not detect location. Please select on map or enter manually.",
      }));
    } finally {
      setGpsLoading(false);
    }
  }, [updateField]);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
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
    },
    []
  );

  const applyManualCoords = useCallback(() => {
    const lat = parseFloat(form.manualLat);
    const lng = parseFloat(form.manualLng);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      updateField("latitude", lat);
      updateField("longitude", lng);
    } else {
      setStepErrors((prev) => ({
        ...prev,
        gps: "Invalid coordinates. Latitude: -90 to 90, Longitude: -180 to 180.",
      }));
    }
  }, [form.manualLat, form.manualLng, updateField]);

  // ─── Validation ─────────────────────────────────────────────

  const validateStep = (stepNum: number): boolean => {
    const errors: Record<string, string> = {};

    if (stepNum === 1) {
      if (!form.name.trim()) errors.name = "Full name is required";
      if (!form.phone.trim()) errors.phone = "Phone number is required";
      if (form.phone.trim() && !/^\d{7,15}$/.test(form.phone.replace(/[\s-]/g, ""))) {
        errors.phone = "Enter a valid phone number (digits only)";
      }
      if (!form.password) errors.password = "Password is required";
      if (form.password.length < 6) errors.password = "Password must be at least 6 characters";
      if (form.password !== form.confirmPassword) {
        errors.confirmPassword = "Passwords do not match";
      }
    }

    if (stepNum === 4) {
      if (!form.consentMedicalData) {
        errors.consent = "You must consent to medical data sharing to register";
      }
    }

    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ─── Navigation ─────────────────────────────────────────────

  const nextStep = () => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, 4));
    }
  };

  const prevStep = () => {
    setStep((s) => Math.max(s - 1, 1));
    setStepErrors({});
  };

  // ─── Submit ─────────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateStep(4)) return;

    setLoading(true);
    setError(null);

    try {
      const fullPhone = `+970${form.phone.replace(/^0+/, "")}`;

      const registrationData = {
        phone: fullPhone,
        password: form.password,
        name: form.name.trim(),
        latitude: form.latitude ?? undefined,
        longitude: form.longitude ?? undefined,
        mobility: form.mobility || undefined,
        living_situation: form.livingSituation || undefined,
        blood_type: form.bloodType || undefined,
        emergency_contacts: form.emergencyContacts.filter(
          (c) => c.name.trim() && c.phone.trim()
        ),
        chronic_conditions: form.chronicConditions.length > 0 ? form.chronicConditions : undefined,
        medications: form.medications.length > 0 ? form.medications : undefined,
        special_equipment: form.specialEquipment.length > 0 ? form.specialEquipment : undefined,
        consent_medical_data: form.consentMedicalData,
        consent_crisis_alerts: form.consentCrisisAlerts,
        consent_location_sos: form.consentLocationSOS,
      };

      const registerResult = await registerPatient(registrationData) as {
        patient_id?: string;
        short_id?: string;
        sms_key?: string;
      };

      // Store SMS encryption key and short ID for offline SOS
      if (registerResult.sms_key) {
        localStorage.setItem("tmt-sms-key", registerResult.sms_key);
      }
      if (registerResult.short_id) {
        localStorage.setItem("tmt-patient-short-id", registerResult.short_id);
      }

      // Auto-login after registration
      const loginResult = await login({
        phone: fullPhone,
        password: form.password,
      });

      storeLogin(loginResult.access_token, {
        id: loginResult.user_id,
        role: "patient",
        patientId: (loginResult as unknown as { patient_id?: string }).patient_id,
      });

      setSuccess(true);

      // Redirect after brief success screen
      setTimeout(() => {
        navigate("/profile");
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ─── Success Screen ────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-10 h-10 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Registration Successful
          </h2>
          <p className="text-gray-600 mb-4">
            Welcome to TMT, {form.name}. Your account has been created and you
            are now logged in.
          </p>
          <p className="text-sm text-gray-400">Redirecting to your profile...</p>
        </div>
      </div>
    );
  }

  // ─── Render Steps ──────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Patient Registration</h1>
          <p className="text-gray-500 mt-2">
            Register to receive emergency alerts and send SOS signals
          </p>
        </div>

        {/* Step Progress */}
        <StepProgress currentStep={step} />

        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-500 mt-0.5 shrink-0"
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
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
            {/* ─── Step 1: Basic Info ─────────────────────────── */}
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Basic Information
                </h2>

                {/* Full Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition ${
                      stepErrors.name ? "border-red-400" : "border-gray-300"
                    }`}
                    placeholder="Enter your full name"
                  />
                  {stepErrors.name && (
                    <p className="text-red-500 text-sm mt-1">{stepErrors.name}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-4 py-3 bg-gray-100 border border-e-0 border-gray-300 rounded-s-lg text-gray-600 text-sm font-medium">
                      +970
                    </span>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      className={`flex-1 px-4 py-3 border rounded-e-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition ${
                        stepErrors.phone ? "border-red-400" : "border-gray-300"
                      }`}
                      placeholder="599123456"
                    />
                  </div>
                  {stepErrors.phone && (
                    <p className="text-red-500 text-sm mt-1">{stepErrors.phone}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition ${
                      stepErrors.password ? "border-red-400" : "border-gray-300"
                    }`}
                    placeholder="Minimum 6 characters"
                  />
                  {stepErrors.password && (
                    <p className="text-red-500 text-sm mt-1">{stepErrors.password}</p>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => updateField("confirmPassword", e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition ${
                      stepErrors.confirmPassword
                        ? "border-red-400"
                        : "border-gray-300"
                    }`}
                    placeholder="Re-enter your password"
                  />
                  {stepErrors.confirmPassword && (
                    <p className="text-red-500 text-sm mt-1">
                      {stepErrors.confirmPassword}
                    </p>
                  )}
                </div>

                {/* Emergency Contacts */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Emergency Contacts{" "}
                    <span className="text-gray-400 font-normal">(up to 3)</span>
                  </label>
                  <div className="space-y-3">
                    {form.emergencyContacts.map((contact, idx) => (
                      <div
                        key={idx}
                        className="flex gap-3 items-start p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={contact.name}
                            onChange={(e) =>
                              updateEmergencyContact(idx, "name", e.target.value)
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                            placeholder="Contact name"
                          />
                          <div className="flex">
                            <span className="inline-flex items-center px-3 py-2 bg-gray-100 border border-e-0 border-gray-300 rounded-s-lg text-gray-500 text-xs">
                              +970
                            </span>
                            <input
                              type="tel"
                              value={contact.phone}
                              onChange={(e) =>
                                updateEmergencyContact(idx, "phone", e.target.value)
                              }
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-e-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                              placeholder="599123456"
                            />
                          </div>
                        </div>
                        {form.emergencyContacts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeEmergencyContact(idx)}
                            className="mt-1 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Remove contact"
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
                  </div>
                  {form.emergencyContacts.length < 3 && (
                    <button
                      type="button"
                      onClick={addEmergencyContact}
                      className="mt-3 flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Add another contact
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ─── Step 2: Location ──────────────────────────── */}
            {step === 2 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Your Location
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Your location helps hospitals reach you during emergencies. Tap
                  the map to set your location or use GPS.
                </p>

                {/* GPS Button */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={detectGPS}
                    disabled={gpsLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium"
                  >
                    {gpsLoading ? (
                      <>
                        <svg
                          className="w-5 h-5 animate-spin"
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
                        Detecting...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        Use My Current Location
                      </>
                    )}
                  </button>
                </div>

                {stepErrors.gps && (
                  <p className="text-amber-600 text-sm">{stepErrors.gps}</p>
                )}

                {/* Map */}
                <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: "300px" }}>
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

                {/* Current Position Display */}
                {form.latitude !== null && form.longitude !== null && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-green-600 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-green-800 text-sm font-medium">
                      Location set: {form.latitude.toFixed(6)},{" "}
                      {form.longitude.toFixed(6)}
                    </span>
                  </div>
                )}

                {/* Manual Entry */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Or enter coordinates manually
                  </p>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">
                        Latitude
                      </label>
                      <input
                        type="text"
                        value={form.manualLat}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, manualLat: e.target.value }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                        placeholder="31.520000"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">
                        Longitude
                      </label>
                      <input
                        type="text"
                        value={form.manualLng}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, manualLng: e.target.value }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                        placeholder="34.440000"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={applyManualCoords}
                      className="self-end px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 3: Medical Profile ───────────────────── */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-1">
                    Medical Profile
                  </h2>
                  <p className="text-sm text-gray-500">
                    This information helps hospitals prepare for your care. All
                    fields are optional.
                  </p>
                </div>

                {/* Mobility */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mobility
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Can walk", "Wheelchair", "Bedridden", "Other"].map(
                      (opt) => (
                        <label
                          key={opt}
                          className={`flex items-center gap-2 px-4 py-3 border rounded-lg cursor-pointer transition ${
                            form.mobility === opt
                              ? "border-red-500 bg-red-50 text-red-700"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="mobility"
                            value={opt}
                            checked={form.mobility === opt}
                            onChange={() => updateField("mobility", opt)}
                            className="sr-only"
                          />
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              form.mobility === opt
                                ? "border-red-500"
                                : "border-gray-300"
                            }`}
                          >
                            {form.mobility === opt && (
                              <div className="w-2 h-2 rounded-full bg-red-500" />
                            )}
                          </div>
                          <span className="text-sm">{opt}</span>
                        </label>
                      )
                    )}
                  </div>
                </div>

                {/* Chronic Conditions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chronic Conditions
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {CHRONIC_CONDITIONS.map((cond) => (
                      <label
                        key={cond}
                        className={`flex items-center gap-2 px-4 py-3 border rounded-lg cursor-pointer transition ${
                          form.chronicConditions.includes(cond)
                            ? "border-red-500 bg-red-50 text-red-700"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={form.chronicConditions.includes(cond)}
                          onChange={() =>
                            toggleArrayItem("chronicConditions", cond)
                          }
                          className="sr-only"
                        />
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                            form.chronicConditions.includes(cond)
                              ? "border-red-500 bg-red-500"
                              : "border-gray-300"
                          }`}
                        >
                          {form.chronicConditions.includes(cond) && (
                            <svg
                              className="w-3 h-3 text-white"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm">{cond}</span>
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
                      value={medicationInput}
                      onChange={(e) => setMedicationInput(e.target.value)}
                      onKeyDown={handleMedicationKeyDown}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                      placeholder="Type medication name and press Enter"
                    />
                    <button
                      type="button"
                      onClick={addMedication}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition"
                    >
                      Add
                    </button>
                  </div>
                  {form.medications.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {form.medications.map((med) => (
                        <span
                          key={med}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 rounded-full text-sm"
                        >
                          {med}
                          <button
                            type="button"
                            onClick={() => removeMedication(med)}
                            className="hover:text-red-900"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Special Equipment */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Special Equipment Needed
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {EQUIPMENT_OPTIONS.map((equip) => (
                      <label
                        key={equip}
                        className={`flex items-center gap-2 px-4 py-3 border rounded-lg cursor-pointer transition ${
                          form.specialEquipment.includes(equip)
                            ? "border-red-500 bg-red-50 text-red-700"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={form.specialEquipment.includes(equip)}
                          onChange={() =>
                            toggleArrayItem("specialEquipment", equip)
                          }
                          className="sr-only"
                        />
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                            form.specialEquipment.includes(equip)
                              ? "border-red-500 bg-red-500"
                              : "border-gray-300"
                          }`}
                        >
                          {form.specialEquipment.includes(equip) && (
                            <svg
                              className="w-3 h-3 text-white"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm">{equip}</span>
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
                    value={form.bloodType}
                    onChange={(e) => updateField("bloodType", e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white"
                  >
                    <option value="">Select blood type (optional)</option>
                    {BLOOD_TYPES.map((bt) => (
                      <option key={bt} value={bt}>
                        {bt}
                      </option>
                    ))}
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
                        className={`flex items-center justify-center gap-2 px-4 py-3 border rounded-lg cursor-pointer transition text-center ${
                          form.livingSituation === opt
                            ? "border-red-500 bg-red-50 text-red-700"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="livingSituation"
                          value={opt}
                          checked={form.livingSituation === opt}
                          onChange={() => updateField("livingSituation", opt)}
                          className="sr-only"
                        />
                        <span className="text-sm">{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 4: Consent ───────────────────────────── */}
            {step === 4 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Consent & Privacy
                </h2>

                {/* Consent Text */}
                <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto text-sm text-gray-700 leading-relaxed border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    TMT Emergency Response System - Data Consent
                  </h3>
                  <p className="mb-3">
                    By registering with the Triage Management Tool (TMT), you
                    agree to the following terms regarding the collection, use,
                    and sharing of your personal and medical data:
                  </p>
                  <p className="mb-2">
                    <strong>1. Medical Data Sharing:</strong> Your medical
                    profile information (including mobility status, chronic
                    conditions, medications, blood type, and special equipment
                    needs) may be shared with hospitals and emergency responders
                    during a crisis event to facilitate appropriate medical care
                    and triage decisions.
                  </p>
                  <p className="mb-2">
                    <strong>2. Crisis Alerts:</strong> TMT may send you
                    emergency alerts based on your registered location when
                    crisis events are detected in your area. These alerts help
                    you stay informed about nearby dangers and available
                    resources.
                  </p>
                  <p className="mb-2">
                    <strong>3. Location Sharing During SOS:</strong> When you
                    activate the SOS feature, your current GPS location will be
                    shared with the nearest operational hospital to enable
                    emergency response and rescue operations. In offline mode,
                    your location may be transmitted via encrypted SMS.
                  </p>
                  <p className="mb-2">
                    <strong>4. Data Security:</strong> All data is encrypted in
                    transit and at rest. SMS-based SOS signals use AES-128-GCM
                    encryption. Your data is only accessible to authorized
                    medical personnel and emergency coordinators.
                  </p>
                  <p>
                    <strong>5. Data Retention:</strong> Your data will be
                    retained for the duration of the crisis response period and
                    may be anonymized for post-crisis analysis. You may request
                    deletion of your account and data at any time.
                  </p>
                </div>

                {/* Consent Checkboxes */}
                <div className="space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <div className="mt-0.5">
                      <input
                        type="checkbox"
                        checked={form.consentMedicalData}
                        onChange={(e) =>
                          updateField("consentMedicalData", e.target.checked)
                        }
                        className="sr-only"
                      />
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          form.consentMedicalData
                            ? "border-red-500 bg-red-500"
                            : "border-gray-300"
                        }`}
                      >
                        {form.consentMedicalData && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        I consent to sharing my medical data with emergency
                        responders{" "}
                        <span className="text-red-500">* (required)</span>
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        This allows hospitals to prepare for your specific
                        medical needs during emergencies.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <div className="mt-0.5">
                      <input
                        type="checkbox"
                        checked={form.consentCrisisAlerts}
                        onChange={(e) =>
                          updateField("consentCrisisAlerts", e.target.checked)
                        }
                        className="sr-only"
                      />
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          form.consentCrisisAlerts
                            ? "border-red-500 bg-red-500"
                            : "border-gray-300"
                        }`}
                      >
                        {form.consentCrisisAlerts && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        I consent to receiving crisis alerts
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        You will receive notifications about emergencies near
                        your location.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <div className="mt-0.5">
                      <input
                        type="checkbox"
                        checked={form.consentLocationSOS}
                        onChange={(e) =>
                          updateField("consentLocationSOS", e.target.checked)
                        }
                        className="sr-only"
                      />
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          form.consentLocationSOS
                            ? "border-red-500 bg-red-500"
                            : "border-gray-300"
                        }`}
                      >
                        {form.consentLocationSOS && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        I consent to sharing my location during SOS
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Your GPS location will be sent to hospitals when you
                        trigger an SOS signal.
                      </p>
                    </div>
                  </label>
                </div>

                {stepErrors.consent && (
                  <p className="text-red-500 text-sm">{stepErrors.consent}</p>
                )}
              </div>
            )}

            {/* ─── Navigation Buttons ────────────────────────── */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
              <div>
                {step > 1 && (
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex items-center gap-2 px-5 py-2.5 text-gray-600 hover:text-gray-800 font-medium transition"
                  >
                    <svg
                      className="w-4 h-4"
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
                    Back
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {step === 3 && (
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="text-sm text-gray-400 hover:text-gray-600 underline transition"
                  >
                    Skip Medical Profile
                  </button>
                )}

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition"
                  >
                    Next
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-8 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-bold transition text-lg"
                  >
                    {loading ? (
                      <>
                        <svg
                          className="w-5 h-5 animate-spin"
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
                        Creating Account...
                      </>
                    ) : (
                      "I Consent & Register"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>

        {/* Login Link */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{" "}
          <a
            href="/login"
            className="text-red-600 hover:text-red-700 font-medium"
          >
            Sign in here
          </a>
        </p>
      </div>
    </div>
  );
}
