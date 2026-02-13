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
import { io } from "socket.io-client";
import { useMapStore } from "../../store/mapStore";
import StatusBadge from "../../components/common/StatusBadge";
import { timeAgo, eventTypeLabels } from "../../utils/formatting";
import type { MapEvent } from "../../services/api";

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

const layerIcons: Record<string, L.DivIcon> = {
  sos: createColoredIcon("#ef4444"),
  crisis: createColoredIcon("#f59e0b"),
  hospital: createColoredIcon("#22c55e"),
  sms_activity: createColoredIcon("#3b82f6"),
  patient_density: createColoredIcon("#8b5cf6"),
  telegram_intel: createColoredIcon("#06b6d4"),
};

const hospitalStatusColors: Record<string, string> = {
  operational: "#22c55e",
  limited: "#eab308",
  full: "#ef4444",
  destroyed: "#1f2937",
};

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

  // Fetch initial events
  const fetchEvents = useCallback(async () => {
    const token = localStorage.getItem("tmt-token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      setLoading(true);
      const res = await fetch(
        `${API_URL}/api/v1/map/events?hours=${timeRange}`,
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
  }, [timeRange, setEvents]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // WebSocket for real-time updates
  useEffect(() => {
    const socket = io(API_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit("join_map");
    });

    socket.on("map_event", (event: MapEvent) => {
      addEvent(event);
    });

    return () => {
      socket.disconnect();
    };
  }, [addEvent]);

  // Filter events based on active layers, time slider, and filters
  const filteredEvents = useMemo(() => {
    const now = new Date().getTime();
    const rangeMs = timeRange * 60 * 60 * 1000;
    const cutoffMs = now - rangeMs * (timeSlider / 100);

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

  // Map center (Gaza strip)
  const mapCenter: [number, number] = [31.5, 34.47];

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
          zoom={10}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapBoundsUpdater events={filteredEvents} />

          {/* Render markers */}
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
                    {t(layer.i18nKey)}
                  </span>
                </label>
              ))}
            </div>
            <div className="border-t border-gray-100 px-4 py-2">
              <p className="text-xs text-gray-500">
                {filteredEvents.length} events visible
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
            <button
              onClick={() => {
                setSeverityFilter("");
                setSourceFilter("");
                setTimeRange(24);
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

export default LiveMap;
