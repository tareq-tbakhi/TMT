import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import {
  Check,
  Cross,
  Filter,
  Hospital as HospitalIcon,
  Layers,
  Map as MapIcon,
  MapPin,
  Phone,
  RotateCcw,
  Shield,
  Siren,
  Smartphone,
  RadioTower,
  TriangleAlert,
  Truck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useMapStore } from "../../store/mapStore";
import StatusBadge from "../../components/common/StatusBadge";
import {
  Badge,
  Button,
  PageHeader,
  Select,
  Spinner,
  statusTone,
} from "../../components/ui";
import { useSocketEvent } from "../../contexts/SocketContext";
import { timeAgo, eventTypeLabels } from "../../utils/formatting";
import type { MapEvent, Hospital, MapEventPatientInfo } from "../../services/api";
import { getHospitals } from "../../services/api";
import MapDetailPanel from "../../components/maps/MapDetailPanel";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/** Resolve a CSS custom property at runtime (Leaflet SVG attrs can't take var()). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

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

/** Token variable + fallback for every map layer color. */
const LAYER_COLOR_TOKENS: Record<string, [string, string]> = {
  sos: ["--t-sev-critical", "#c11f2f"],
  crisis: ["--t-sev-medium", "#855c00"],
  hospital: ["--t-success", "#157138"],
  police_station: ["--t-info", "#1d4ed8"],
  civil_defense: ["--t-sev-high", "#b03a06"],
  sms_activity: ["--t-info", "#1d4ed8"],
  patient_density: ["--t-link", "#1d4ed8"],
  telegram_intel: ["--t-info", "#1d4ed8"],
  patient: ["--t-accent", "#2050c8"],
};

/** Tailwind token classes for the legend dots (same palette as markers). */
const LAYER_LEGEND_DOT: Record<string, string> = {
  sos: "bg-sev-critical",
  crisis: "bg-sev-medium",
  hospital: "bg-success",
  police_station: "bg-info",
  civil_defense: "bg-sev-high",
  sms_activity: "bg-info",
  patient_density: "bg-link",
  telegram_intel: "bg-info",
  patient: "bg-accent",
};

function layerColor(layer: string): string {
  const [token, fallback] = LAYER_COLOR_TOKENS[layer] ?? ["--t-ink-faint", "#64748b"];
  return cssVar(token, fallback);
}

// Lazily-built (theme-resolved) icon cache
const layerIconCache = new Map<string, L.DivIcon>();
function getLayerIcon(layer: string): L.DivIcon {
  let icon = layerIconCache.get(layer);
  if (!icon) {
    icon = createColoredIcon(layerColor(layer));
    layerIconCache.set(layer, icon);
  }
  return icon;
}

function hospitalStatusColor(status: string): string {
  switch (status) {
    case "limited":
      return cssVar("--t-warning", "#92400e");
    case "full":
      return cssVar("--t-danger", "#c11f2f");
    case "destroyed":
      return cssVar("--t-ink", "#1f2937");
    case "operational":
    default:
      return cssVar("--t-success", "#157138");
  }
}

// Facility marker icon — lucide symbol + color per department type
function createFacilityIcon(statusColor: string, SymbolIcon: LucideIcon): L.DivIcon {
  const symbol = renderToStaticMarkup(
    <SymbolIcon size={14} color={statusColor} strokeWidth={2.5} aria-hidden="true" />
  );
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
      line-height: 1;
    ">${symbol}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// Hospital marker icon — medical cross
function createHospitalIcon(statusColor: string): L.DivIcon {
  return createFacilityIcon(statusColor, Cross);
}

// Police station marker icon — shield
function createPoliceIcon(statusColor: string): L.DivIcon {
  return createFacilityIcon(statusColor, Shield);
}

// Civil defense marker icon — rescue truck
function createCivilDefenseIcon(statusColor: string): L.DivIcon {
  return createFacilityIcon(statusColor, Truck);
}

// Severity to color mapping for SOS/crisis circles
function severityToColor(severity: number): string {
  if (severity >= 4) return cssVar("--t-sev-critical", "#c11f2f");
  if (severity >= 3) return cssVar("--t-sev-high", "#b03a06");
  if (severity >= 2) return cssVar("--t-sev-medium", "#855c00");
  return cssVar("--t-sev-low", "#1d4ed8");
}

// Layer configuration
const LAYERS: {
  key: string;
  label: string;
  i18nKey: string;
  icon: LucideIcon;
}[] = [
  { key: "sos", label: "SOS Requests", i18nKey: "map.layer.sos", icon: Siren },
  { key: "crisis", label: "Crisis Events", i18nKey: "map.layer.crisis", icon: TriangleAlert },
  { key: "hospital", label: "Hospitals", i18nKey: "map.layer.hospital", icon: HospitalIcon },
  { key: "police_station", label: "Police Stations", i18nKey: "map.layer.police_station", icon: Shield },
  { key: "civil_defense", label: "Civil Defense", i18nKey: "map.layer.civil_defense", icon: Truck },
  {
    key: "sms_activity",
    label: "SMS Activity",
    i18nKey: "map.layer.sms_activity",
    icon: Smartphone,
  },
  {
    key: "patient_density",
    label: "Patient Density",
    i18nKey: "map.layer.patient_density",
    icon: UsersRound,
  },
  {
    key: "telegram_intel",
    label: "Telegram Intel",
    i18nKey: "map.layer.telegram_intel",
    icon: RadioTower,
  },
  {
    key: "patient",
    label: "Patient Locations",
    i18nKey: "map.layer.patient",
    icon: MapPin,
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
    selectedEvent,
    setEvents,
    addEvent,
    toggleLayer,
    setTimeRange,
    setSelectedEvent,
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
      <PageHeader
        icon={<MapIcon />}
        title={t("nav.map")}
        description={`${filteredEvents.length} events · ${hospitals.filter((h) => h.latitude != null).length} facilities on the map`}
        className="mb-3"
      />

      {/* Full-page map in a card frame */}
      <div className="relative flex-1 overflow-hidden rounded-lg border border-edge bg-surface shadow-1">
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-canvas/60">
            <Spinner size="lg" label="Loading map events" />
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

              const statusColor = hospitalStatusColor(facility.status);
              const deptColor = dept === "police" ? layerColor("police_station") : dept === "civil_defense" ? layerColor("civil_defense") : statusColor;
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
                    icon={getLayerIcon("crisis")}
                    eventHandlers={{ click: () => setSelectedEvent(event) }}
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
              const statusColor = hospitalStatusColor(
                (event.metadata?.status as string) ?? "operational"
              );
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
                  eventHandlers={{ click: () => setSelectedEvent(event) }}
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
                  icon={getLayerIcon("patient")}
                  eventHandlers={{ click: () => setSelectedEvent(event) }}
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
                icon={LAYER_COLOR_TOKENS[event.layer] ? getLayerIcon(event.layer) : defaultIcon}
                eventHandlers={{ click: () => setSelectedEvent(event) }}
              >
                <Popup>
                  <EventPopup event={event} />
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Layer Control Panel - floating top-end */}
        <div className="absolute end-3 top-3 z-[1000] w-60">
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-edge bg-surface shadow-2">
            <div className="flex items-center gap-2 border-b border-edge px-4 py-2.5">
              <Layers aria-hidden="true" className="h-4 w-4 text-ink-muted" />
              <h3 className="text-sm font-semibold text-ink">
                {t("map.layers")}
              </h3>
            </div>
            <div
              className="space-y-1 p-2"
              role="group"
              aria-label={t("map.layers")}
            >
              {LAYERS.map((layer) => {
                const active = activeLayers.has(layer.key);
                const LayerIcon = layer.icon;
                return (
                  <button
                    key={layer.key}
                    type="button"
                    onClick={() => toggleLayer(layer.key)}
                    aria-pressed={active}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                      active
                        ? "bg-accent-soft text-on-accent-soft"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${LAYER_LEGEND_DOT[layer.key] ?? "bg-ink-faint"} ${active ? "" : "opacity-40"}`}
                    />
                    <LayerIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span className="truncate">{layer.label}</span>
                    {active && (
                      <Check aria-hidden="true" className="ms-auto h-3.5 w-3.5 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-edge px-4 py-2">
              <p className="text-xs text-ink-muted">
                {filteredEvents.length} events, {hospitals.filter((h) => h.latitude != null).length} facilities
              </p>
            </div>
          </div>
        </div>

        {/* Filter panel toggle */}
        <button
          type="button"
          onClick={() => setFilterPanelOpen(!filterPanelOpen)}
          aria-expanded={filterPanelOpen}
          className="absolute start-3 top-3 z-[1000] inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 text-sm font-semibold text-ink shadow-2 transition-colors hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
        >
          <Filter aria-hidden="true" className="h-4 w-4" />
          Filters
        </button>

        {/* Filter Panel */}
        {filterPanelOpen && (
          <div className="absolute start-3 top-16 z-[1000] w-64 space-y-3 rounded-lg border border-edge bg-surface p-4 shadow-2">
            <Select
              label="Severity"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="critical">Critical (4+)</option>
              <option value="high">High (3+)</option>
              <option value="medium">Medium (2+)</option>
              <option value="low">Low (1+)</option>
            </Select>
            <Select
              label="Source"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="">All Sources</option>
              <option value="telegram">Telegram</option>
              <option value="sms">SMS</option>
              <option value="app">App</option>
              <option value="manual">Manual</option>
            </Select>
            <Select
              label="Time Range"
              value={timeRange}
              onChange={(e) => setTimeRange(parseInt(e.target.value))}
            >
              <option value={6}>Last 6 hours</option>
              <option value={12}>Last 12 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={48}>Last 48 hours</option>
              <option value={168}>Last 7 days</option>
            </Select>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-ink">Range</p>
              <button
                type="button"
                onClick={() => setWithinRange(!withinRange)}
                aria-pressed={withinRange}
                className={`min-h-11 w-full rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                  withinRange
                    ? "bg-accent text-on-accent"
                    : "border border-edge-strong bg-surface text-ink-muted hover:bg-surface-2"
                }`}
              >
                {withinRange ? "My Range" : "Show All"}
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              className="min-h-11"
              icon={<RotateCcw />}
              onClick={() => {
                setSeverityFilter("");
                setSourceFilter("");
                setTimeRange(24);
                setWithinRange(false);
              }}
            >
              Reset Filters
            </Button>
          </div>
        )}
      </div>

      {/* Time Slider */}
      <div className="mt-3 rounded-lg border border-edge bg-surface px-5 py-3 shadow-1">
        <div className="flex items-center gap-4">
          <span className="shrink-0 text-xs font-semibold text-ink-muted">
            {timeRange}h ago
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={timeSlider}
            onChange={(e) => setTimeSlider(parseInt(e.target.value))}
            aria-label={`Time window within the last ${timeRange} hours`}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-surface-3 accent-accent focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
          />
          <span className="shrink-0 text-xs font-semibold text-ink-muted">
            Now
          </span>
        </div>
        <p className="mt-1 text-center text-xs text-ink-faint">
          Scrub to filter events by time within the last {timeRange} hours
        </p>
      </div>

      {/* Detail side panel */}
      {selectedEvent && <MapDetailPanel />}
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
  const statusLabel = hospital.status.charAt(0).toUpperCase() + hospital.status.slice(1);

  return (
    <div className="min-w-[200px] text-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold text-ink">{hospital.name}</span>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <Badge tone={statusTone(hospital.status)} size="sm" dot>
          {statusLabel}
        </Badge>
        <Badge tone="neutral" size="sm">
          {deptTypeLabels[dept] || dept}
        </Badge>
      </div>
      <div className="space-y-0.5 text-xs text-ink-muted">
        {dept === "hospital" && (
          <>
            <p>Beds: {hospital.available_beds}/{hospital.bed_capacity}</p>
            <p>ICU: {hospital.icu_beds}</p>
          </>
        )}
        {hospital.coverage_radius_km > 0 && (
          <p>Coverage: {hospital.coverage_radius_km} km</p>
        )}
        {hospital.phone && (
          <p className="flex items-center gap-1">
            <Phone aria-hidden="true" className="h-3 w-3" />
            <span dir="ltr">{hospital.phone}</span>
          </p>
        )}
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
      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold text-ink">
          {event.title ?? eventLabel}
        </span>
      </div>
      <StatusBadge severity={severityLabel} size="sm" />
      <div className="mt-2 space-y-0.5 text-xs text-ink-muted">
        <p>Type: {eventLabel}</p>
        <p>Source: {event.source}</p>
        <p>Layer: {event.layer}</p>
        <p>{timeAgo(event.created_at)}</p>
        {event.details && (
          <p className="mt-1 text-ink-faint">{event.details}</p>
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
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-base font-bold text-danger">
          <Siren aria-hidden="true" className="h-4 w-4" />
          SOS{patientStatus ? ` — ${patientStatus}` : ""}
        </span>
        <StatusBadge severity={severityLabel} size="sm" />
      </div>

      {info ? (
        <>
          {/* Patient identity */}
          <div className="mb-2 flex items-center gap-2">
            <div
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-soft text-sm font-bold text-on-danger-soft"
            >
              {info.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-semibold text-ink">{info.name ?? "Unknown"}</p>
              {info.phone && (
                <a href={`tel:${info.phone}`} className="text-xs text-link underline-offset-2 hover:underline" dir="ltr">
                  {info.phone}
                </a>
              )}
            </div>
          </div>

          {/* Quick info badges */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {info.blood_type && (
              <Badge tone="danger" size="sm">
                {info.blood_type}
              </Badge>
            )}
            {info.mobility && info.mobility !== "can_walk" && (
              <Badge tone="high" size="sm">
                {mobilityLabels[info.mobility] ?? info.mobility}
              </Badge>
            )}
            {info.gender && (
              <Badge tone="neutral" size="sm">
                {info.gender}
              </Badge>
            )}
          </div>

          {/* Trust score mini-bar */}
          {info.trust_score != null && (
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs text-ink-faint">Trust</span>
              <div
                role="meter"
                aria-label="Trust score"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(info.trust_score * 100)}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
              >
                <div
                  className={`h-full rounded-full ${
                    info.trust_score >= 0.7
                      ? "bg-success"
                      : info.trust_score >= 0.4
                      ? "bg-warning"
                      : "bg-danger"
                  }`}
                  style={{ width: `${info.trust_score * 100}%` }}
                />
              </div>
              <span className="text-xs text-ink-muted">
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
                  <span className="text-xs font-semibold text-on-warning-soft">Allergies: </span>
                  <span className="text-xs text-ink-muted">{info.allergies!.join(", ")}</span>
                </div>
              )}
              {(info.chronic_conditions?.length ?? 0) > 0 && (
                <div>
                  <span className="text-xs font-semibold text-on-danger-soft">Conditions: </span>
                  <span className="text-xs text-ink-muted">{info.chronic_conditions!.join(", ")}</span>
                </div>
              )}
            </div>
          )}

          {/* Medications */}
          {(info.current_medications?.length ?? 0) > 0 && (
            <div className="mb-2">
              <span className="text-xs font-semibold text-on-info-soft">Medications: </span>
              <span className="text-xs text-ink-muted">{info.current_medications!.join(", ")}</span>
            </div>
          )}

          {/* Emergency contacts */}
          {(info.emergency_contacts?.length ?? 0) > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-xs font-semibold text-ink-muted">Emergency Contacts</p>
              {info.emergency_contacts!.slice(0, 2).map((c, i) => (
                <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                  <span className="text-ink">
                    {c.name}
                    {c.relation && <span className="ms-1 text-ink-faint">({c.relation})</span>}
                  </span>
                  <a href={`tel:${c.phone}`} className="text-link underline-offset-2 hover:underline" dir="ltr">
                    {c.phone}
                  </a>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mb-2 text-xs text-ink-muted">
          Patient ID: {(event.metadata?.patient_id as string) ?? "Unknown"}
        </div>
      )}

      {/* Footer */}
      <div className="mt-1.5 flex justify-between border-t border-edge pt-1.5 text-xs text-ink-faint">
        <span>{event.source}</span>
        <span>{timeAgo(event.created_at)}</span>
      </div>
      {event.details && (
        <p className="mt-1 text-xs italic text-ink-muted">{event.details}</p>
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
      <div className="mb-2 flex items-center gap-2">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-on-accent-soft"
        >
          {patientName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-ink">{patientName}</p>
          {info?.phone && (
            <a href={`tel:${info.phone}`} className="text-xs text-link underline-offset-2 hover:underline" dir="ltr">
              {info.phone}
            </a>
          )}
        </div>
      </div>

      {info && (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {info.blood_type && (
              <Badge tone="danger" size="sm">
                {info.blood_type}
              </Badge>
            )}
            {info.mobility && (
              <Badge tone="neutral" size="sm">
                {mobilityLabels[info.mobility] ?? info.mobility}
              </Badge>
            )}
          </div>

          {(info.allergies?.length ?? 0) > 0 && (
            <div className="mb-1">
              <span className="text-xs font-semibold text-on-warning-soft">Allergies: </span>
              <span className="text-xs text-ink-muted">{info.allergies!.join(", ")}</span>
            </div>
          )}

          {(info.emergency_contacts?.length ?? 0) > 0 && (
            <div className="mb-1">
              <p className="mb-0.5 text-xs font-semibold text-ink-muted">Emergency Contact</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink">
                  {info.emergency_contacts![0].name}
                  {info.emergency_contacts![0].relation && (
                    <span className="ms-1 text-ink-faint">
                      ({info.emergency_contacts![0].relation})
                    </span>
                  )}
                </span>
                <a
                  href={`tel:${info.emergency_contacts![0].phone}`}
                  className="text-link underline-offset-2 hover:underline"
                  dir="ltr"
                >
                  {info.emergency_contacts![0].phone}
                </a>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-1.5 border-t border-edge pt-1.5 text-xs text-ink-faint">
        {timeAgo(event.created_at)}
      </div>
    </div>
  );
};

export default LiveMap;
