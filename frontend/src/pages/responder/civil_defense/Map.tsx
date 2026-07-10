/**
 * Map - Civil Defense responder's map view
 * Shows emergency location
 */

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Map as MapIcon, Users } from "lucide-react";
import { useResponderStore } from "../../../store/responderStore";
import { Badge, EmptyState, severityTone } from "../../../components/ui";
import "leaflet/dist/leaflet.css";

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Marker color — Leaflet data-URI markers may keep hex values (design-system
// exception); the legend swatch reuses this const so they always match.
const EMERGENCY_COLOR = "#ea580c";

// Custom marker icon for civil defense
const emergencyIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${EMERGENCY_COLOR}" width="32" height="32">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

function CenterMap({ position }: { position: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(position, 15);
  }, [map, position]);

  return null;
}

export default function CivilDefenseMap() {
  const { activeCase } = useResponderStore();

  if (!activeCase) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <EmptyState
          icon={<MapIcon />}
          title="No Active Case"
          description="Accept a case to see the map"
        />
      </div>
    );
  }

  const emergencyPos: [number, number] = [
    activeCase.pickupLocation.lat,
    activeCase.pickupLocation.lng,
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col gap-3 px-4 pt-4">
      {/* Case Info — solid card for sunlight legibility */}
      <div className="shrink-0 rounded-lg border border-edge bg-surface p-3 shadow-2">
        <div className="flex items-center justify-between gap-2">
          <Badge tone={severityTone(activeCase.priority)} dot>
            <span className="uppercase">{activeCase.priority}</span>
          </Badge>
          <span className="text-sm font-semibold text-ink-muted">{activeCase.caseNumber}</span>
        </div>
        <p className="mt-1.5 line-clamp-1 text-base font-bold text-ink">
          {activeCase.briefDescription}
        </p>
      </div>

      {/* Map in a Card frame */}
      <div className="relative min-h-64 flex-1 overflow-hidden rounded-lg border border-edge bg-surface-2 shadow-1">
        <MapContainer
          center={emergencyPos}
          zoom={15}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <CenterMap position={emergencyPos} />

          {/* Emergency Marker */}
          {/* NOTE: Leaflet popups always render on a light surface, so popup
              text keeps fixed dark colors instead of theme tokens. */}
          <Marker position={emergencyPos} icon={emergencyIcon}>
            <Popup>
              <div className="text-center">
                <p className="font-bold text-orange-600">Emergency Location</p>
                <p className="text-sm">{activeCase.pickupLocation.address}</p>
                {activeCase.pickupLocation.landmark && (
                  <p className="text-xs text-gray-500">{activeCase.pickupLocation.landmark}</p>
                )}
                {activeCase.victimCount && (
                  <p className="text-sm font-medium mt-1">
                    {activeCase.victimCount} {activeCase.victimCount === 1 ? "person" : "people"} reported
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        </MapContainer>

        {/* Legend — solid, sunlight-legible */}
        <div className="absolute bottom-3 start-3 z-[1000] rounded-lg border border-edge bg-surface px-3 py-2 shadow-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: EMERGENCY_COLOR }}
            />
            <span>Emergency Site</span>
          </div>
        </div>

        {/* Victim Count Badge */}
        {activeCase.victimCount && (
          <div className="absolute bottom-3 end-3 z-[1000] flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-white shadow-2">
            <Users aria-hidden="true" className="h-5 w-5 shrink-0" />
            <div className="text-center">
              <p className="text-xl font-bold leading-tight">{activeCase.victimCount}</p>
              <p className="text-xs font-semibold">trapped</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
