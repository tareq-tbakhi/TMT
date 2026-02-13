import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import StatusBadge from "../../components/common/StatusBadge";
import { timeAgo } from "../../utils/formatting";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

type HospitalStatusValue = "operational" | "limited" | "full" | "destroyed";

interface SupplyLevels {
  medical_supplies: string;
  surgical_supplies: string;
  blood_bank: string;
  medications: string;
  oxygen: string;
  fuel: string;
  water: string;
  food: string;
}

interface StatusChange {
  id: string;
  status: string;
  available_beds: number;
  changed_at: string;
  changed_by: string;
}

const STATUS_OPTIONS: { value: HospitalStatusValue; label: string; color: string }[] = [
  { value: "operational", label: "Operational", color: "bg-green-500" },
  { value: "limited", label: "Limited Capacity", color: "bg-yellow-500" },
  { value: "full", label: "Full / No Capacity", color: "bg-red-500" },
  { value: "destroyed", label: "Destroyed / Non-functional", color: "bg-gray-700" },
];

const SUPPLY_LEVELS = ["high", "medium", "low", "critical"];

const SPECIALTIES = [
  "Emergency Medicine",
  "Surgery",
  "Orthopedics",
  "Pediatrics",
  "Obstetrics",
  "Internal Medicine",
  "Cardiology",
  "Neurology",
  "Burn Unit",
  "ICU",
  "Dialysis",
  "Radiology",
];

const supplyLevelColors: Record<string, string> = {
  high: "bg-green-500",
  medium: "bg-yellow-500",
  low: "bg-orange-500",
  critical: "bg-red-500",
};

const StatusUpdate: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const hospitalId = user?.hospitalId ?? "";

  // Hospital profile state
  const [hospitalName, setHospitalName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [coverageRadius, setCoverageRadius] = useState(15);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Form state
  const [status, setStatus] = useState<HospitalStatusValue>("operational");
  const [totalBeds, setTotalBeds] = useState(0);
  const [icuBeds, setIcuBeds] = useState(0);
  const [availableBeds, setAvailableBeds] = useState(0);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [supplies, setSupplies] = useState<SupplyLevels>({
    medical_supplies: "medium",
    surgical_supplies: "medium",
    blood_bank: "medium",
    medications: "medium",
    oxygen: "medium",
    fuel: "medium",
    water: "medium",
    food: "medium",
  });

  // UI state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [history, setHistory] = useState<StatusChange[]>([]);
  const [loading, setLoading] = useState(true);

  // Load current hospital data
  useEffect(() => {
    if (!hospitalId) {
      setLoading(false);
      return;
    }

    const token = localStorage.getItem("tmt-token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const fetchHospital = async () => {
      try {
        const [hospRes, historyRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/hospitals/${hospitalId}`, { headers }),
          fetch(`${API_URL}/api/v1/hospitals/${hospitalId}/status-history`, {
            headers,
          }).catch(() => null),
        ]);

        if (hospRes.ok) {
          const data = await hospRes.json();
          setStatus(data.status as HospitalStatusValue);
          setTotalBeds(data.bed_capacity ?? 0);
          setIcuBeds(data.icu_beds ?? 0);
          setAvailableBeds(data.available_beds ?? 0);
          setSpecialties(data.specialties ?? []);
          if (data.supply_levels) {
            setSupplies((prev) => ({ ...prev, ...data.supply_levels }));
          }
          // Profile fields
          setHospitalName(data.name ?? "");
          setPhone(data.phone ?? "");
          setEmail(data.email ?? "");
          setAddress(data.address ?? "");
          setWebsite(data.website ?? "");
          setLatitude(data.latitude);
          setLongitude(data.longitude);
          setCoverageRadius(data.coverage_radius_km ?? 15);
        }

        if (historyRes?.ok) {
          setHistory((await historyRes.json()) as StatusChange[]);
        }
      } catch {
        // Hospital data may not be available yet
      } finally {
        setLoading(false);
      }
    };

    fetchHospital();
  }, [hospitalId]);

  const handleSpecialtyToggle = (specialty: string) => {
    setSpecialties((prev) =>
      prev.includes(specialty)
        ? prev.filter((s) => s !== specialty)
        : [...prev, specialty]
    );
  };

  const handleSupplyChange = (key: keyof SupplyLevels, value: string) => {
    setSupplies((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveProfile = async () => {
    if (!hospitalId) return;
    setProfileSaving(true);
    setProfileSuccess(false);
    setProfileError(null);

    const token = localStorage.getItem("tmt-token");
    try {
      const body: Record<string, unknown> = {};
      if (hospitalName) body.name = hospitalName;
      if (phone) body.phone = phone;
      if (email) body.email = email;
      if (address) body.address = address;
      if (website) body.website = website;
      if (latitude != null) body.latitude = latitude;
      if (longitude != null) body.longitude = longitude;
      body.coverage_radius_km = coverageRadius;

      const res = await fetch(
        `${API_URL}/api/v1/hospitals/${hospitalId}/profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        setProfileSuccess(true);
        setTimeout(() => setProfileSuccess(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setProfileError(
          (data as { detail?: string }).detail || "Failed to save profile"
        );
      }
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Failed to save profile"
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSave = async () => {
    if (!hospitalId) {
      setSaveError("Hospital ID not found. Please log in again.");
      return;
    }

    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    const token = localStorage.getItem("tmt-token");
    try {
      const res = await fetch(
        `${API_URL}/api/v1/hospitals/${hospitalId}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status,
            bed_capacity: totalBeds,
            icu_beds: icuBeds,
            available_beds: availableBeds,
            specialties,
            supply_levels: supplies,
          }),
        }
      );

      if (res.ok) {
        setSaveSuccess(true);
        setHistory((prev) => [
          {
            id: Date.now().toString(),
            status,
            available_beds: availableBeds,
            changed_at: new Date().toISOString(),
            changed_by: user?.id ?? "unknown",
          },
          ...prev,
        ]);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(
          (data as { detail?: string }).detail || "Failed to update status"
        );
      }
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to update status"
      );
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

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t("hospital.status")}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Update your hospital's profile, operational status, and capacity
        </p>
      </div>

      {/* Success / Error messages */}
      {(saveSuccess || profileSuccess) && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {profileSuccess ? "Profile saved successfully!" : "Status updated successfully!"}
        </div>
      )}
      {(saveError || profileError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {saveError || profileError}
        </div>
      )}

      {/* Hospital Profile Information */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {t("hospital.profile")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Hospital Name
            </label>
            <input
              type="text"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+970-XXX-XXXXXXX"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hospital@example.com"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address, city, area"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Website
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Latitude
            </label>
            <input
              type="number"
              step="0.0001"
              value={latitude ?? ""}
              onChange={(e) =>
                setLatitude(e.target.value ? parseFloat(e.target.value) : null)
              }
              placeholder="31.5000"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Longitude
            </label>
            <input
              type="number"
              step="0.0001"
              value={longitude ?? ""}
              onChange={(e) =>
                setLongitude(e.target.value ? parseFloat(e.target.value) : null)
              }
              placeholder="34.4700"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Coverage Radius (km)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={coverageRadius}
              onChange={(e) =>
                setCoverageRadius(parseInt(e.target.value) || 15)
              }
              className={inputCls}
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={handleSaveProfile}
            disabled={profileSaving}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {profileSaving ? t("common.loading") : "Save Profile"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status Selector */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Operational Status
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`flex items-center gap-3 rounded-lg border-2 p-4 text-start transition-colors ${
                    status === opt.value
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full ${opt.color}`}
                  />
                  <span className="text-sm font-medium text-gray-900">
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Bed Capacity */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Bed Capacity
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Total Beds
                </label>
                <input
                  type="number"
                  min={0}
                  value={totalBeds}
                  onChange={(e) => setTotalBeds(parseInt(e.target.value) || 0)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  ICU Beds
                </label>
                <input
                  type="number"
                  min={0}
                  value={icuBeds}
                  onChange={(e) => setIcuBeds(parseInt(e.target.value) || 0)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Available Beds
                </label>
                <input
                  type="number"
                  min={0}
                  max={totalBeds}
                  value={availableBeds}
                  onChange={(e) =>
                    setAvailableBeds(parseInt(e.target.value) || 0)
                  }
                  className={inputCls}
                />
              </div>
            </div>

            {/* Capacity bar */}
            {totalBeds > 0 && (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                  <span>Occupancy</span>
                  <span>
                    {Math.round(
                      ((totalBeds - availableBeds) / totalBeds) * 100
                    )}
                    %
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      availableBeds / totalBeds > 0.3
                        ? "bg-green-500"
                        : availableBeds / totalBeds > 0.1
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        ((totalBeds - availableBeds) / totalBeds) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Specialties */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Specialties
            </h2>
            <div className="flex flex-wrap gap-2">
              {SPECIALTIES.map((specialty) => (
                <button
                  key={specialty}
                  onClick={() => handleSpecialtyToggle(specialty)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    specialties.includes(specialty)
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {specialty}
                </button>
              ))}
            </div>
          </div>

          {/* Supply Levels */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {t("hospital.supplies")}
            </h2>
            <div className="space-y-4">
              {(
                Object.entries(supplies) as [keyof SupplyLevels, string][]
              ).map(([key, value]) => (
                <div key={key}>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 capitalize">
                      {key.replace(/_/g, " ")}
                    </label>
                    <span
                      className={`inline-flex h-3 w-3 rounded-full ${
                        supplyLevelColors[value] ?? "bg-gray-300"
                      }`}
                    />
                  </div>
                  <div className="flex gap-2">
                    {SUPPLY_LEVELS.map((level) => (
                      <button
                        key={level}
                        onClick={() => handleSupplyChange(key, level)}
                        className={`flex-1 rounded-md border py-1.5 text-xs font-medium capitalize transition-colors ${
                          value === level
                            ? level === "critical"
                              ? "border-red-500 bg-red-50 text-red-700"
                              : level === "low"
                              ? "border-orange-500 bg-orange-50 text-orange-700"
                              : level === "medium"
                              ? "border-yellow-500 bg-yellow-50 text-yellow-700"
                              : "border-green-500 bg-green-50 text-green-700"
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </div>

        {/* Status History Sidebar */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm h-fit">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Status History
          </h2>
          {history.length > 0 ? (
            <div className="space-y-3">
              {history.slice(0, 10).map((change) => (
                <div
                  key={change.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <StatusBadge status={change.status} size="sm" />
                    <span className="text-xs text-gray-500">
                      {timeAgo(change.changed_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Beds available: {change.available_beds}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No status changes recorded</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatusUpdate;
