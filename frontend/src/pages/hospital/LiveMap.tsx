import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { useMapStore } from "../../store/mapStore";
import StatusBadge from "../../components/common/StatusBadge";
import { useSocketEvent } from "../../contexts/SocketContext";
import { timeAgo, eventTypeLabels } from "../../utils/formatting";
import type { MapEvent, Hospital, MapEventPatientInfo } from "../../services/api";
import { getHospitals } from "../../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Fix default marker icon
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

// Custom marker icons by layer type
function createColoredIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background-color: ${color};
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

// Pulsing SOS marker icon — radiating ring by severity color
function createPulsingSosIcon(severity: number): L.DivIcon {
  const color = severityToColor(severity);
  return L.divIcon({
    className: "sos-marker",
    html: `<div style="position:relative;">
      <div style="
        position:absolute; top:-10px; left:-10px;
        width:20px; height:20px; border-radius:50%;
        background-color:${color}; opacity:0.3;
        animation: sos-map-pulse 2s ease-out infinite;
      "></div>
      <div style="
        position:relative;
        background-color:${color};
        width:14px; height:14px; border-radius:50%;
        border:2px solid white;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);
      "></div>
    </div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

const layerIcons: Record<string, L.DivIcon> = {
  sos: createColoredIcon("#ef4444"),
  crisis: createColoredIcon("#f59e0b"),
  hospital: createColoredIcon("#22c55e"),
  police_station: createColoredIcon("#2563eb"),
  civil_defense: createColoredIcon("#ea580c"),
  sms_activity: createColoredIcon("#3b82f6"),
  patient_density: createColoredIcon("#8b5cf6"),
  telegram_intel: createColoredIcon("#06b6d4"),
  patient: createColoredIcon("#6366f1"),
};

const hospitalStatusColors: Record<string, string> = {
  operational: "#22c55e",
  limited: "#eab308",
  full: "#ef4444",
  destroyed: "#1f2937",
};

// Facility marker icon — symbol + color per department type
function createFacilityIcon(statusColor: string, symbol: string): L.DivIcon {
  return L.divIcon({
    className: "facility-marker",
    html: `<div style="
      background-color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 3px solid ${statusColor};
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
    ">${symbol}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// Hospital marker icon — red cross
function createHospitalIcon(statusColor: string): L.DivIcon {
  return createFacilityIcon(statusColor, '<span style="font-weight:bold;color:' + statusColor + '">+</span>');
}

// Police station marker icon — shield emoji
function createPoliceIcon(statusColor: string): L.DivIcon {
  return createFacilityIcon(statusColor, "\u{1F6E1}");
}

// Civil defense marker icon — fire truck emoji
function createCivilDefenseIcon(statusColor: string): L.DivIcon {
  return createFacilityIcon(statusColor, "\u{1F692}");
}

// Severity to color mapping for SOS/crisis circles
function severityToColor(severity: number): string {
  if (severity >= 4) return "#ef4444";
  if (severity >= 3) return "#f97316";
  if (severity >= 2) return "#eab308";
  return "#3b82f6";
}

// Layer configuration
const LAYERS: {
  key: string;
  label: string;
  i18nKey: string;
  icon: string;
}[] = [
  { key: "sos", label: "SOS Requests", i18nKey: "map.layer.sos", icon: "&#x1F198;" },
  { key: "crisis", label: "Crisis Events", i18nKey: "map.layer.crisis", icon: "&#x26A0;&#xFE0F;" },
  { key: "hospital", label: "Hospitals", i18nKey: "map.layer.hospital", icon: "&#x1F3E5;" },
  { key: "police_station", label: "Police Stations", i18nKey: "map.layer.police_station", icon: "&#x1F6E1;&#xFE0F;" },
  { key: "civil_defense", label: "Civil Defense", i18nKey: "map.layer.civil_defense", icon: "&#x1F692;" },
  {
    key: "sms_activity",
    label: "SMS Activity",
    i18nKey: "map.layer.sms_activity",
    icon: "&#x1F4F1;",
  },
  {
    key: "patient_density",
    label: "Patient Density",
    i18nKey: "map.layer.patient_density",
    icon: "&#x1F465;",
  },
  {
    key: "telegram_intel",
    label: "Telegram Intel",
    i18nKey: "map.layer.telegram_intel",
    icon: "&#x1F4E1;",
  },
  {
    key: "patient",
    label: "Patient Locations",
    i18nKey: "map.layer.patient",
    icon: "&#x1F4CD;",
  },
];

// Component to auto-fit map bounds when events change
const MapBoundsUpdater: React.FC<{ events: MapEvent[] }> = ({ events }) => {
  const map = useMap();

  useEffect(() => {
    if (events.length > 0) {
      const bounds = L.latLngBounds(
        events.map((e) => [e.latitude, e.longitude])
      );
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }, []); // Only on initial load

  return null;
};

const LiveMap: React.FC = () => {
  const { t } = useTranslation();
  const {
    events,
    activeLayers,
    timeRange,
    setEvents,
    addEvent,
    toggleLayer,
    setTimeRange,
  } = useMapStore();

  const [loading, setLoading] = useState(true);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [timeSlider, setTimeSlider] = useState(100);
  const [severityFilter, setSeverityFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [withinRange, setWithinRange] = useState(false);

  // Fetch initial events
  const fetchEvents = useCallback(async () => {
    const token = localStorage.getItem("tmt-token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      setLoading(true);
      const rangeParam = withinRange ? "&within_range=true" : "";
      const res = await fetch(
        `${API_URL}/api/v1/map/events?hours=${timeRange}${rangeParam}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        // Backend returns { events, total, hours, generated_at }
        const events = Array.isArray(data) ? data : (data.events ?? []);
        setEvents(events as MapEvent[]);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [timeRange, withinRange, setEvents]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Fetch hospitals for the hospital layer
  useEffect(() => {
    getHospitals()
      .then((data) => setHospitals(data))
      .catch(() => {});
  }, []);

  // Real-time map events via shared socket
  useSocketEvent<MapEvent>("map_event", (event) => {
    addEvent(event);
  });

  // Filter events based on active layers, time slider, and filters
  const filteredEvents = useMemo(() => {
    const now = new Date().getTime();
    const rangeMs = timeRange * 60 * 60 * 1000;
    const cutoffMs = now - rangeMs * (1 - timeSlider / 100);

    return events.filter((event) => {
      // Layer filter
      if (!activeLayers.has(event.layer)) return false;

      // Time slider filter
      const eventTime = new Date(event.created_at).getTime();
      if (eventTime < now - rangeMs) return false;
      if (eventTime > cutoffMs) return false;

      // Severity filter
      if (severityFilter) {
        const sevThreshold =
          severityFilter === "critical"
            ? 4
            : severityFilter === "high"
            ? 3
            : severityFilter === "medium"
            ? 2
            : 1;
        if (event.severity < sevThreshold) return false;
      }

      // Source filter
      if (sourceFilter && event.source !== sourceFilter) return false;

      return true;
    });
  }, [events, activeLayers, timeRange, timeSlider, severityFilter, sourceFilter]);

  // Map center (Palestine — fits Gaza + West Bank)
  const mapCenter: [number, number] = [31.8, 34.9];

  return (
    <div className="relative flex h-[calc(100vh-8rem)] flex-col">
      {/* Full-screen map */}
      <div className="relative flex-1 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/60">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          </div>
        )}

        <MapContainer
          center={mapCenter}
          zoom={8}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapBoundsUpdater events={filteredEvents} />

          {/* Render facility markers with coverage circles — split by department type */}
          {hospitals
            .filter((h) => h.latitude != null && h.longitude != null)
            .map((facility) => {
              const dept = facility.department_type || "hospital";
              const layerKey = dept === "police" ? "police_station" : dept === "civil_defense" ? "civil_defense" : "hospital";
              if (!activeLayers.has(layerKey)) return null;

              const statusColor = hospitalStatusColors[facility.status] ?? "#22c55e";
              const deptColor = dept === "police" ? "#2563eb" : dept === "civil_defense" ? "#ea580c" : statusColor;
              const radiusM = (facility.coverage_radius_km || 5) * 1000;
              const icon = dept === "police"
                ? createPoliceIcon(deptColor)
                : dept === "civil_defense"
                ? createCivilDefenseIcon(deptColor)
                : createHospitalIcon(statusColor);

              return (
                <React.Fragment key={`facility-${facility.id}`}>
                  <Circle
                    center={[facility.latitude!, facility.longitude!]}
                    radius={radiusM}
                    pathOptions={{
                      color: deptColor,
                      fillColor: deptColor,
                      fillOpacity: 0.07,
                      weight: 2,
                      dashArray: "6 4",
                    }}
                  />
                  <Marker
                    position={[facility.latitude!, facility.longitude!]}
                    icon={icon}
                  >
                    <Popup>
                      <HospitalPopup hospital={facility} />
                    </Popup>
                  </Marker>
                </React.Fragment>
              );
            })}

          {/* Render event markers */}
          {filteredEvents.map((event) => {
            // Crisis events get circle overlays
            if (event.layer === "crisis") {
              const radius =
                (event.metadata?.radius_m as number) || 500;
              return (
                <React.Fragment key={event.id}>
                  <Circle
                    center={[event.latitude, event.longitude]}
                    radius={radius}
                    pathOptions={{
                      color: severityToColor(event.severity),
                      fillColor: severityToColor(event.severity),
                      fillOpacity: 0.15,
                      weight: 2,
                    }}
                  />
                  <Marker
                    position={[event.latitude, event.longitude]}
                    icon={layerIcons.crisis}
                  >
                    <Popup>
                      <EventPopup event={event} />
                    </Popup>
                  </Marker>
                </React.Fragment>
              );
            }

            // Hospital markers with status colors
            if (event.layer === "hospital") {
              const statusColor =
                hospitalStatusColors[
                  (event.metadata?.status as string) ?? "operational"
                ] ?? "#22c55e";
              return (
                <Marker
                  key={event.id}
                  position={[event.latitude, event.longitude]}
                  icon={createColoredIcon(statusColor)}
                >
                  <Popup>
                    <EventPopup event={event} />
                  </Popup>
                </Marker>
              );
            }

            // SOS markers — pulsing icon + enriched popup
            if (event.layer === "sos") {
              return (
                <Marker
                  key={event.id}
                  position={[event.latitude, event.longitude]}
                  icon={createPulsingSosIcon(event.severity)}
                >
                  <Popup maxWidth={340}>
                    <SOSPopup event={event} />
                  </Popup>
                </Marker>
              );
            }

            // Patient location markers — enriched popup
            if (event.layer === "patient") {
              return (
                <Marker
                  key={event.id}
                  position={[event.latitude, event.longitude]}
                  icon={layerIcons.patient}
                >
                  <Popup maxWidth={300}>
                    <PatientLocationPopup event={event} />
                  </Popup>
                </Marker>
              );
            }

            // Default markers
            return (
              <Marker
                key={event.id}
                position={[event.latitude, event.longitude]}
                icon={layerIcons[event.layer] ?? defaultIcon}
              >
                <Popup>
                  <EventPopup event={event} />
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Layer Control Panel - floating top-right */}
        <div className="absolute top-3 end-3 z-[1000] w-56">
          <div className="rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 px-4 py-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {t("map.layers")}
              </h3>
            </div>
            <div className="space-y-1 p-3">
              {LAYERS.map((layer) => (
                <label
                  key={layer.key}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={activeLayers.has(layer.key)}
                    onChange={() => toggleLayer(layer.key)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span
                    className="text-sm"
                    dangerouslySetInnerHTML={{ __html: layer.icon }}
                  />
                  <span className="text-xs text-gray-700">
                    {layer.label}
                  </span>
                </label>
              ))}
            </div>
            <div className="border-t border-gray-100 px-4 py-2">
              <p className="text-xs text-gray-500">
                {filteredEvents.length} events, {hospitals.filter((h) => h.latitude != null).length} facilities
              </p>
            </div>
          </div>
        </div>

        {/* Filter panel toggle */}
        <button
          onClick={() => setFilterPanelOpen(!filterPanelOpen)}
          className="absolute top-3 start-3 z-[1000] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50"
        >
          <svg
            className="inline-block h-4 w-4 me-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filters
        </button>

        {/* Filter Panel */}
        {filterPanelOpen && (
          <div className="absolute top-14 start-3 z-[1000] w-60 rounded-lg border border-gray-200 bg-white p-4 shadow-lg space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Severity
              </label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              >
                <option value="">All</option>
                <option value="critical">Critical (4+)</option>
                <option value="high">High (3+)</option>
                <option value="medium">Medium (2+)</option>
                <option value="low">Low (1+)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Source
              </label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              >
                <option value="">All Sources</option>
                <option value="telegram">Telegram</option>
                <option value="sms">SMS</option>
                <option value="app">App</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Time Range
              </label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(parseInt(e.target.value))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              >
                <option value={6}>Last 6 hours</option>
                <option value={12}>Last 12 hours</option>
                <option value={24}>Last 24 hours</option>
                <option value={48}>Last 48 hours</option>
                <option value={168}>Last 7 days</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Range
              </label>
              <button
                onClick={() => setWithinRange(!withinRange)}
                className={`w-full rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  withinRange
                    ? "bg-blue-600 text-white"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {withinRange ? "My Range" : "Show All"}
              </button>
            </div>
            <button
              onClick={() => {
                setSeverityFilter("");
                setSourceFilter("");
                setTimeRange(24);
                setWithinRange(false);
              }}
              className="w-full text-xs text-blue-600 hover:text-blue-800"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Time Slider */}
      <div className="mt-3 rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-gray-500 shrink-0">
            {timeRange}h ago
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={timeSlider}
            onChange={(e) => setTimeSlider(parseInt(e.target.value))}
            className="flex-1 h-2 cursor-pointer appearance-none rounded-lg bg-gray-200 accent-blue-600"
          />
          <span className="text-xs font-medium text-gray-500 shrink-0">
            Now
          </span>
        </div>
        <p className="mt-1 text-center text-xs text-gray-400">
          Scrub to filter events by time within the last {timeRange} hours
        </p>
      </div>
    </div>
  );
};

// Department type labels
const deptTypeLabels: Record<string, string> = {
  hospital: "Hospital",
  police: "Police Station",
  civil_defense: "Civil Defense",
};

// Sub-component for facility popups (hospitals, police, civil defense)
const HospitalPopup: React.FC<{ hospital: Hospital }> = ({ hospital }) => {
  const dept = hospital.department_type || "hospital";
  const statusColor = hospitalStatusColors[hospital.status] ?? "#22c55e";
  const statusLabel = hospital.status.charAt(0).toUpperCase() + hospital.status.slice(1);

  return (
    <div className="min-w-[200px] text-sm">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
        <span className="font-semibold text-gray-900">{hospital.name}</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: statusColor + "20", color: statusColor }}
        >
          {statusLabel}
        </span>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {deptTypeLabels[dept] || dept}
        </span>
      </div>
      <div className="space-y-0.5 text-xs text-gray-600">
        {dept === "hospital" && (
          <>
            <p>Beds: {hospital.available_beds}/{hospital.bed_capacity}</p>
            <p>ICU: {hospital.icu_beds}</p>
          </>
        )}
        {hospital.coverage_radius_km > 0 && (
          <p>Coverage: {hospital.coverage_radius_km} km</p>
        )}
        {hospital.phone && <p>Phone: {hospital.phone}</p>}
        {hospital.address && <p>{hospital.address}</p>}
        {hospital.specialties?.length > 0 && (
          <p className="mt-1">
            {hospital.specialties.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
};

// Sub-component for map popups
const EventPopup: React.FC<{ event: MapEvent }> = ({ event }) => {
  const eventLabel =
    eventTypeLabels[event.event_type]?.en ?? event.event_type;

  const severityLabel =
    event.severity >= 4
      ? "critical"
      : event.severity >= 3
      ? "high"
      : event.severity >= 2
      ? "medium"
      : "low";

  return (
    <div className="min-w-[180px] text-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-gray-900">
          {event.title ?? eventLabel}
        </span>
      </div>
      <StatusBadge severity={severityLabel} size="sm" />
      <div className="mt-2 space-y-0.5 text-xs text-gray-600">
        <p>Type: {eventLabel}</p>
        <p>Source: {event.source}</p>
        <p>Layer: {event.layer}</p>
        <p>{timeAgo(event.created_at)}</p>
        {event.details && (
          <p className="mt-1 text-gray-500">{event.details}</p>
        )}
      </div>
    </div>
  );
};

// Sub-component for SOS event popups — rich patient info
const mobilityLabels: Record<string, string> = {
  can_walk: "Can Walk",
  wheelchair: "Wheelchair",
  bedridden: "Bedridden",
  other: "Other",
};

const SOSPopup: React.FC<{ event: MapEvent }> = ({ event }) => {
  const info = event.metadata?.patient_info as MapEventPatientInfo | undefined;
  const patientStatus = event.metadata?.patient_status as string | undefined;

  const severityLabel =
    event.severity >= 4
      ? "critical"
      : event.severity >= 3
      ? "high"
      : event.severity >= 2
      ? "medium"
      : "low";

  return (
    <div className="min-w-[280px] max-w-[320px] text-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-red-700 text-base">
          SOS{patientStatus ? ` — ${patientStatus}` : ""}
        </span>
        <StatusBadge severity={severityLabel} size="sm" />
      </div>

      {info ? (
        <>
          {/* Patient identity */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700">
              {info.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{info.name ?? "Unknown"}</p>
              {info.phone && (
                <a href={`tel:${info.phone}`} className="text-xs text-blue-600 hover:underline" dir="ltr">
                  {info.phone}
                </a>
              )}
            </div>
          </div>

          {/* Quick info badges */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {info.blood_type && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                {info.blood_type}
              </span>
            )}
            {info.mobility && info.mobility !== "can_walk" && (
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                {mobilityLabels[info.mobility] ?? info.mobility}
              </span>
            )}
            {info.gender && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {info.gender}
              </span>
            )}
          </div>

          {/* Trust score mini-bar */}
          {info.trust_score != null && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-400">Trust</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    info.trust_score >= 0.7
                      ? "bg-green-500"
                      : info.trust_score >= 0.4
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${info.trust_score * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">
                {(info.trust_score * 100).toFixed(0)}%
              </span>
            </div>
          )}

          {/* Medical alerts */}
          {((info.allergies?.length ?? 0) > 0 ||
            (info.chronic_conditions?.length ?? 0) > 0) && (
            <div className="mb-2 space-y-1">
              {(info.allergies?.length ?? 0) > 0 && (
                <div>
                  <span className="text-xs font-medium text-yellow-700">Allergies: </span>
                  <span className="text-xs text-gray-600">{info.allergies!.join(", ")}</span>
                </div>
              )}
              {(info.chronic_conditions?.length ?? 0) > 0 && (
                <div>
                  <span className="text-xs font-medium text-red-700">Conditions: </span>
                  <span className="text-xs text-gray-600">{info.chronic_conditions!.join(", ")}</span>
                </div>
              )}
            </div>
          )}

          {/* Medications */}
          {(info.current_medications?.length ?? 0) > 0 && (
            <div className="mb-2">
              <span className="text-xs font-medium text-blue-700">Medications: </span>
              <span className="text-xs text-gray-600">{info.current_medications!.join(", ")}</span>
            </div>
          )}

          {/* Emergency contacts */}
          {(info.emergency_contacts?.length ?? 0) > 0 && (
            <div className="mb-2">
              <p className="text-xs font-medium text-gray-500 mb-1">Emergency Contacts</p>
              {info.emergency_contacts!.slice(0, 2).map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-gray-700">
                    {c.name}
                    {c.relation && <span className="text-gray-400 ml-1">({c.relation})</span>}
                  </span>
                  <a href={`tel:${c.phone}`} className="text-blue-600 hover:underline" dir="ltr">
                    {c.phone}
                  </a>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-gray-500 mb-2">
          Patient ID: {(event.metadata?.patient_id as string) ?? "Unknown"}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-gray-100 pt-1.5 mt-1.5 flex justify-between text-xs text-gray-400">
        <span>{event.source}</span>
        <span>{timeAgo(event.created_at)}</span>
      </div>
      {event.details && (
        <p className="mt-1 text-xs text-gray-500 italic">{event.details}</p>
      )}
    </div>
  );
};

// Sub-component for patient location popups — lighter than SOS
const PatientLocationPopup: React.FC<{ event: MapEvent }> = ({ event }) => {
  const info = event.metadata?.patient_info as MapEventPatientInfo | undefined;
  const patientName =
    info?.name ?? (event.metadata?.patient_name as string) ?? "Unknown Patient";

  return (
    <div className="min-w-[240px] max-w-[280px] text-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
          {patientName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{patientName}</p>
          {info?.phone && (
            <a href={`tel:${info.phone}`} className="text-xs text-blue-600 hover:underline" dir="ltr">
              {info.phone}
            </a>
          )}
        </div>
      </div>

      {info && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {info.blood_type && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                {info.blood_type}
              </span>
            )}
            {info.mobility && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {mobilityLabels[info.mobility] ?? info.mobility}
              </span>
            )}
          </div>

          {(info.allergies?.length ?? 0) > 0 && (
            <div className="mb-1">
              <span className="text-xs font-medium text-yellow-700">Allergies: </span>
              <span className="text-xs text-gray-600">{info.allergies!.join(", ")}</span>
            </div>
          )}

          {(info.emergency_contacts?.length ?? 0) > 0 && (
            <div className="mb-1">
              <p className="text-xs font-medium text-gray-500 mb-0.5">Emergency Contact</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-700">
                  {info.emergency_contacts![0].name}
                  {info.emergency_contacts![0].relation && (
                    <span className="text-gray-400 ml-1">
                      ({info.emergency_contacts![0].relation})
                    </span>
                  )}
                </span>
                <a
                  href={`tel:${info.emergency_contacts![0].phone}`}
                  className="text-blue-600 hover:underline"
                  dir="ltr"
                >
                  {info.emergency_contacts![0].phone}
                </a>
              </div>
            </div>
          )}
        </>
      )}

      <div className="border-t border-gray-100 pt-1.5 mt-1.5 text-xs text-gray-400">
        {timeAgo(event.created_at)}
      </div>
    </div>
  );
};

export default LiveMap;
