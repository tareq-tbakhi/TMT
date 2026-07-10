import React, { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import {
  Activity,
  BedDouble,
  Building2,
  CircleAlert,
  CircleCheck,
  History,
  LocateFixed,
  Package,
  Stethoscope,
} from "lucide-react";
import { useAuthStore, ROLE_TO_DEPARTMENT, DEPARTMENT_LABELS, type DepartmentType } from "../../store/authStore";
import StatusBadge from "../../components/common/StatusBadge";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Spinner,
} from "../../components/ui";
import { timeAgo } from "../../utils/formatting";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/** Resolve a CSS custom property at runtime (Leaflet SVG attrs can't take var()). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

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

interface PoliceSupplyLevels {
  ammunition: string;
  fuel: string;
  communication_equipment: string;
  protective_gear: string;
  vehicles: string;
}

interface CivilDefenseSupplyLevels {
  fuel: string;
  rescue_equipment: string;
  fire_suppression: string;
  medical_kits: string;
  protective_gear: string;
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
  { value: "operational", label: "Operational", color: "bg-success" },
  { value: "limited", label: "Limited Capacity", color: "bg-warning" },
  { value: "full", label: "Full / No Capacity", color: "bg-danger" },
  { value: "destroyed", label: "Destroyed / Non-functional", color: "bg-ink-faint" },
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
  high: "bg-success",
  medium: "bg-sev-medium",
  low: "bg-sev-high",
  critical: "bg-sev-critical",
};

const supplyBtnClasses = (selected: boolean, level: string): string => {
  const base =
    "min-h-11 flex-1 rounded-md border py-1.5 text-xs font-semibold capitalize transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2";
  if (!selected) {
    return `${base} border-edge bg-surface text-ink-muted hover:border-edge-strong hover:text-ink`;
  }
  switch (level) {
    case "critical":
      return `${base} border-sev-critical bg-sev-critical-soft text-on-sev-critical-soft`;
    case "low":
      return `${base} border-sev-high bg-sev-high-soft text-on-sev-high-soft`;
    case "medium":
      return `${base} border-sev-medium bg-sev-medium-soft text-on-sev-medium-soft`;
    default:
      return `${base} border-success bg-success-soft text-on-success-soft`;
  }
};

/* ------------------------------------------------------------------ */
/* Leaflet icon fix (bundlers break the default icon paths)            */
/* ------------------------------------------------------------------ */
const hospitalIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/* ------------------------------------------------------------------ */
/* Location Map Picker                                                 */
/* ------------------------------------------------------------------ */
interface LocationMapPickerProps {
  latitude: number | null;
  longitude: number | null;
  coverageRadius: number;
  onLocationChange: (lat: number, lng: number) => void;
  onRadiusChange: (km: number) => void;
}

const LocationMapPicker: React.FC<LocationMapPickerProps> = ({
  latitude,
  longitude,
  coverageRadius,
  onLocationChange,
  onRadiusChange,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const [locating, setLocating] = useState(false);

  // Place or move the marker + coverage circle
  const placeMarker = useCallback(
    (lat: number, lng: number, radius: number, panTo = true) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], {
          draggable: true,
          icon: hospitalIcon,
        })
          .addTo(map)
          .bindPopup("Drag me or click the map to move");
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current!.getLatLng();
          onLocationChange(
            parseFloat(pos.lat.toFixed(6)),
            parseFloat(pos.lng.toFixed(6))
          );
          if (circleRef.current) circleRef.current.setLatLng(pos);
        });
      }

      if (circleRef.current) {
        circleRef.current.setLatLng([lat, lng]);
        circleRef.current.setRadius(radius * 1000);
      } else {
        const accent = cssVar("--t-accent", "#2050c8");
        circleRef.current = L.circle([lat, lng], {
          radius: radius * 1000,
          color: accent,
          fillColor: accent,
          fillOpacity: 0.1,
          weight: 2,
          dashArray: "6 4",
        }).addTo(map);
      }

      if (panTo) map.setView([lat, lng], map.getZoom());
    },
    [onLocationChange]
  );

  // Initialise the Leaflet map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const center: [number, number] =
      latitude != null && longitude != null
        ? [latitude, longitude]
        : [31.5, 34.46]; // Default: Gaza

    const map = L.map(mapRef.current, {
      center,
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    // Click to place marker
    map.on("click", (e: L.LeafletMouseEvent) => {
      const lat = parseFloat(e.latlng.lat.toFixed(6));
      const lng = parseFloat(e.latlng.lng.toFixed(6));
      onLocationChange(lat, lng);
    });

    mapInstanceRef.current = map;

    // Place initial marker if coordinates exist
    if (latitude != null && longitude != null) {
      placeMarker(latitude, longitude, coverageRadius, false);
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to external lat/lng changes (including first load after fetch)
  useEffect(() => {
    if (latitude != null && longitude != null && mapInstanceRef.current) {
      placeMarker(latitude, longitude, coverageRadius);
    }
  }, [latitude, longitude, coverageRadius, placeMarker]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        onLocationChange(lat, lng);
        mapInstanceRef.current?.setView([lat, lng], 15);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          icon={<LocateFixed />}
          loading={locating}
          onClick={handleUseCurrentLocation}
        >
          Use Current Location
        </Button>

        {latitude != null && longitude != null && (
          <span className="text-xs text-ink-muted" dir="ltr">
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
        )}

        <div className="ms-auto flex items-center gap-2">
          <label
            htmlFor="coverage-radius-slider"
            className="text-xs font-semibold text-ink-muted"
          >
            Coverage Radius
          </label>
          <input
            id="coverage-radius-slider"
            type="range"
            min={1}
            max={50}
            value={coverageRadius}
            onChange={(e) => onRadiusChange(parseInt(e.target.value))}
            className="h-1.5 w-24 cursor-pointer accent-accent focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            aria-valuetext={`${coverageRadius} kilometers`}
          />
          <span className="w-12 text-xs font-bold text-on-accent-soft">
            {coverageRadius} km
          </span>
        </div>
      </div>

      {/* Map */}
      <div
        ref={mapRef}
        className="h-64 w-full rounded-lg border border-edge-strong sm:h-72"
        style={{ zIndex: 0 }}
      />

      {latitude == null && (
        <p className="text-xs text-ink-faint">
          Click the map or use current location to set the hospital position
        </p>
      )}
    </div>
  );
};

const StatusUpdate: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const hospitalId = user?.hospitalId ?? "";
  const dept: DepartmentType = user?.facilityType ?? ROLE_TO_DEPARTMENT[user?.role ?? ""] ?? "hospital";
  const deptLabel = DEPARTMENT_LABELS[dept] ?? "Hospital";

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
  // Police-specific
  const [patrolUnits, setPatrolUnits] = useState(0);
  const [availableUnits, setAvailableUnits] = useState(0);
  // Civil Defense-specific
  const [rescueTeams, setRescueTeams] = useState(0);
  const [availableTeams, setAvailableTeams] = useState(0);
  const [shelterCapacity, setShelterCapacity] = useState(0);

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

  const [policeSupplies, setPoliceSupplies] = useState<PoliceSupplyLevels>({
    ammunition: "medium",
    fuel: "medium",
    communication_equipment: "medium",
    protective_gear: "medium",
    vehicles: "medium",
  });

  const [cdSupplies, setCdSupplies] = useState<CivilDefenseSupplyLevels>({
    fuel: "medium",
    rescue_equipment: "medium",
    fire_suppression: "medium",
    medical_kits: "medium",
    protective_gear: "medium",
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
          // Police fields
          setPatrolUnits(data.patrol_units ?? 0);
          setAvailableUnits(data.available_units ?? 0);
          // Civil Defense fields
          setRescueTeams(data.rescue_teams ?? 0);
          setAvailableTeams(data.available_teams ?? 0);
          setShelterCapacity(data.shelter_capacity ?? 0);
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
            ...(dept === "hospital" ? {
              bed_capacity: totalBeds,
              icu_beds: icuBeds,
              available_beds: availableBeds,
              specialties,
              supply_levels: supplies,
            } : dept === "police" ? {
              patrol_units: patrolUnits,
              available_units: availableUnits,
              supply_levels: policeSupplies,
            } : {
              rescue_teams: rescueTeams,
              available_teams: availableTeams,
              shelter_capacity: shelterCapacity,
              supply_levels: cdSupplies,
            }),
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
    return <LoadingState label={t("common.loading")} />;
  }

  /** Occupancy-style progress bar shared by all departments. */
  const capacityBar = (used: number, totalCount: number, freeRatio: number, label: string) => (
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-xs text-ink-muted">
        <span>{label}</span>
        <span>{Math.round((used / totalCount) * 100)}%</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((used / totalCount) * 100)}
        className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={`h-full rounded-full transition-all ${
            freeRatio > 0.3 ? "bg-success" : freeRatio > 0.1 ? "bg-warning" : "bg-danger"
          }`}
          style={{ width: `${Math.min(100, (used / totalCount) * 100)}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Activity />}
        title={`${deptLabel} Status`}
        description="Update your facility's profile, operational status, and capacity"
      />

      {/* Success / Error messages */}
      {(saveSuccess || profileSuccess) && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success bg-success-soft p-4 text-sm font-semibold text-on-success-soft"
        >
          <CircleCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
          {profileSuccess ? "Profile saved successfully!" : "Status updated successfully!"}
        </div>
      )}
      {(saveError || profileError) && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-danger bg-danger-soft p-4 text-sm font-semibold text-on-danger-soft"
        >
          <CircleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
          {saveError || profileError}
        </div>
      )}

      {/* Hospital Profile Information */}
      <Card>
        <CardHeader icon={<Building2 />} title={t("hospital.profile")} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Facility Name"
            type="text"
            value={hospitalName}
            onChange={(e) => setHospitalName(e.target.value)}
          />
          <Input
            label="Phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+970-XXX-XXXXXXX"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hospital@example.com"
          />
          <Input
            label="Address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address, city, area"
            className="sm:col-span-2"
          />
          <Input
            label="Website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://..."
          />
          {/* Location Map Picker — spans full width */}
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="mb-1 text-sm font-semibold text-ink">Location</p>
            <LocationMapPicker
              latitude={latitude}
              longitude={longitude}
              coverageRadius={coverageRadius}
              onLocationChange={(lat, lng) => {
                setLatitude(lat);
                setLongitude(lng);
              }}
              onRadiusChange={setCoverageRadius}
            />
          </div>
        </div>
        <div className="mt-4">
          <Button loading={profileSaving} onClick={handleSaveProfile}>
            {profileSaving ? t("common.loading") : "Save Profile"}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Form */}
        <div className="space-y-6 lg:col-span-2">
          {/* Status Selector */}
          <Card>
            <CardHeader icon={<Activity />} title="Operational Status" />
            <div
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              role="group"
              aria-label="Operational status"
            >
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  aria-pressed={status === opt.value}
                  className={`flex min-h-12 items-center gap-3 rounded-lg border-2 p-4 text-start transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                    status === opt.value
                      ? "border-accent bg-accent-soft"
                      : "border-edge bg-surface hover:border-edge-strong"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 rounded-full ${opt.color}`}
                  />
                  <span className="text-sm font-semibold text-ink">
                    {opt.label}
                  </span>
                  {status === opt.value && (
                    <CircleCheck
                      aria-hidden="true"
                      className="ms-auto h-5 w-5 shrink-0 text-on-accent-soft"
                    />
                  )}
                </button>
              ))}
            </div>
          </Card>

          {/* Department-specific capacity */}
          {dept === "hospital" && (
            <Card>
              <CardHeader icon={<BedDouble />} title="Bed Capacity" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input label="Total Beds" type="number" min={0} value={totalBeds} onChange={(e) => setTotalBeds(parseInt(e.target.value) || 0)} />
                <Input label="ICU Beds" type="number" min={0} value={icuBeds} onChange={(e) => setIcuBeds(parseInt(e.target.value) || 0)} />
                <Input label="Available Beds" type="number" min={0} max={totalBeds} value={availableBeds} onChange={(e) => setAvailableBeds(parseInt(e.target.value) || 0)} />
              </div>
              {totalBeds > 0 &&
                capacityBar(totalBeds - availableBeds, totalBeds, availableBeds / totalBeds, "Occupancy")}
            </Card>
          )}

          {dept === "police" && (
            <Card>
              <CardHeader icon={<Building2 />} title="Patrol Units" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Total Patrol Units" type="number" min={0} value={patrolUnits} onChange={(e) => setPatrolUnits(parseInt(e.target.value) || 0)} />
                <Input label="Available Units" type="number" min={0} max={patrolUnits} value={availableUnits} onChange={(e) => setAvailableUnits(parseInt(e.target.value) || 0)} />
              </div>
              {patrolUnits > 0 &&
                capacityBar(patrolUnits - availableUnits, patrolUnits, availableUnits / patrolUnits, "Deployment")}
            </Card>
          )}

          {dept === "civil_defense" && (
            <Card>
              <CardHeader icon={<Building2 />} title="Rescue Teams & Shelter" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input label="Total Rescue Teams" type="number" min={0} value={rescueTeams} onChange={(e) => setRescueTeams(parseInt(e.target.value) || 0)} />
                <Input label="Available Teams" type="number" min={0} max={rescueTeams} value={availableTeams} onChange={(e) => setAvailableTeams(parseInt(e.target.value) || 0)} />
                <Input label="Shelter Capacity" type="number" min={0} value={shelterCapacity} onChange={(e) => setShelterCapacity(parseInt(e.target.value) || 0)} />
              </div>
              {rescueTeams > 0 &&
                capacityBar(rescueTeams - availableTeams, rescueTeams, availableTeams / rescueTeams, "Deployment")}
            </Card>
          )}

          {/* Specialties - hospital only */}
          {dept === "hospital" && (
            <Card>
              <CardHeader icon={<Stethoscope />} title="Specialties" />
              <div className="flex flex-wrap gap-2" role="group" aria-label="Specialties">
                {SPECIALTIES.map((specialty) => (
                  <button
                    key={specialty}
                    type="button"
                    onClick={() => handleSpecialtyToggle(specialty)}
                    aria-pressed={specialties.includes(specialty)}
                    className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                      specialties.includes(specialty)
                        ? "border-accent bg-accent-soft text-on-accent-soft"
                        : "border-edge-strong bg-surface text-ink-muted hover:border-edge-strong hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    {specialty}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Supply Levels — department-specific */}
          <Card>
            <CardHeader
              icon={<Package />}
              title={dept === "hospital" ? t("hospital.supplies") : dept === "police" ? "Equipment & Supplies" : "Rescue Supplies"}
            />
            <div className="space-y-4">
              {dept === "hospital" && (
                Object.entries(supplies) as [keyof SupplyLevels, string][]
              ).map(([key, value]) => (
                <div key={key} role="group" aria-label={key.replace(/_/g, " ")}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize text-ink">
                      {key.replace(/_/g, " ")}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`inline-flex h-3 w-3 rounded-full ${supplyLevelColors[value] ?? "bg-surface-3"}`}
                    />
                  </div>
                  <div className="flex gap-2">
                    {SUPPLY_LEVELS.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleSupplyChange(key, level)}
                        aria-pressed={value === level}
                        className={supplyBtnClasses(value === level, level)}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {dept === "police" && (
                Object.entries(policeSupplies) as [keyof PoliceSupplyLevels, string][]
              ).map(([key, value]) => (
                <div key={key} role="group" aria-label={key.replace(/_/g, " ")}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize text-ink">
                      {key.replace(/_/g, " ")}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`inline-flex h-3 w-3 rounded-full ${supplyLevelColors[value] ?? "bg-surface-3"}`}
                    />
                  </div>
                  <div className="flex gap-2">
                    {SUPPLY_LEVELS.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setPoliceSupplies(prev => ({ ...prev, [key]: level }))}
                        aria-pressed={value === level}
                        className={supplyBtnClasses(value === level, level)}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {dept === "civil_defense" && (
                Object.entries(cdSupplies) as [keyof CivilDefenseSupplyLevels, string][]
              ).map(([key, value]) => (
                <div key={key} role="group" aria-label={key.replace(/_/g, " ")}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize text-ink">
                      {key.replace(/_/g, " ")}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`inline-flex h-3 w-3 rounded-full ${supplyLevelColors[value] ?? "bg-surface-3"}`}
                    />
                  </div>
                  <div className="flex gap-2">
                    {SUPPLY_LEVELS.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setCdSupplies(prev => ({ ...prev, [key]: level }))}
                        aria-pressed={value === level}
                        className={supplyBtnClasses(value === level, level)}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Save Button */}
          <div className="flex items-center gap-4">
            <Button size="lg" loading={saving} onClick={handleSave}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </div>

        {/* Status History Sidebar */}
        <Card className="h-fit">
          <CardHeader icon={<History />} title="Status History" />
          {history.length > 0 ? (
            <div className="space-y-3">
              {history.slice(0, 10).map((change) => (
                <div
                  key={change.id}
                  className="rounded-lg border border-edge bg-surface-2 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={change.status} size="sm" />
                    <span className="text-xs text-ink-muted">
                      {timeAgo(change.changed_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {dept === "hospital" ? `Beds available: ${change.available_beds}` :
                     dept === "police" ? "Status update" :
                     "Status update"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<History />}
              title="No status changes recorded"
              className="py-8"
            />
          )}
        </Card>
      </div>
    </div>
  );
};

export default StatusUpdate;
