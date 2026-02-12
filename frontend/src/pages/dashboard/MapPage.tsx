/**
 * Live Map page with Leaflet map and real-time event layers.
 */

import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { useLiveMap } from "../../hooks/useLiveMap";
import { MAP_LAYERS } from "../../services/mapService";
import { getSeverityInfo, timeAgo } from "../../utils/formatting";
import "leaflet/dist/leaflet.css";

// Map layer colors
const layerColors: Record<string, string> = {
  crisis: "#ef4444",
  sos: "#f97316",
  hospital: "#22c55e",
  sms_activity: "#3b82f6",
  patient_density: "#a855f7",
  telegram_intel: "#06b6d4",
};

// Gaza center coordinates
const DEFAULT_CENTER: [number, number] = [31.5, 34.47];
const DEFAULT_ZOOM = 11;

export default function MapPage() {
  const { t } = useTranslation();
  const {
    filteredEvents,
    activeLayers,
    timeRange,
    toggleLayer,
    setTimeRange,
    setSelectedEvent,
  } = useLiveMap();

  return (
    <div className="flex h-full">
      {/* Sidebar controls */}
      <div className="w-64 bg-white border-r border-gray-200 p-4 space-y-6 overflow-y-auto shrink-0">
        {/* Layers */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            {t("map.layers")}
          </h3>
          <div className="space-y-2">
            {MAP_LAYERS.map((layer) => (
              <label
                key={layer.id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={activeLayers.has(layer.id)}
                  onChange={() => toggleLayer(layer.id)}
                  className="rounded"
                />
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: layer.color }}
                />
                <span className="text-sm text-gray-700">{t(layer.label)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Time Range */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            {t("map.timeRange")}
          </h3>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value={1}>1 hour</option>
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
            <option value={24}>24 hours</option>
            <option value={48}>48 hours</option>
            <option value={168}>7 days</option>
          </select>
        </div>

        {/* Event count */}
        <div className="text-xs text-gray-500">
          {t("map.events")}: {filteredEvents.length}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          className="h-full w-full"
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredEvents.map((event) => (
            <CircleMarker
              key={event.id}
              center={[event.latitude, event.longitude]}
              radius={Math.max(6, event.severity * 3)}
              pathOptions={{
                color: layerColors[event.layer] ?? "#666",
                fillColor: layerColors[event.layer] ?? "#666",
                fillOpacity: 0.6,
                weight: 2,
              }}
              eventHandlers={{
                click: () => setSelectedEvent(event),
              }}
            >
              <Popup>
                <div className="min-w-48">
                  <h4 className="font-semibold text-sm">
                    {event.title || event.event_type}
                  </h4>
                  {event.details && (
                    <p className="text-xs text-gray-600 mt-1">
                      {event.details}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <span
                      className={`px-1.5 py-0.5 rounded ${getSeverityInfo(event.severity).bgColor} ${getSeverityInfo(event.severity).color}`}
                    >
                      {getSeverityInfo(event.severity).label}
                    </span>
                    <span>{timeAgo(event.created_at)}</span>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
