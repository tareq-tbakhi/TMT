/**
 * Map - Ambulance driver's map view
 * Shows pickup location, destination, and route
 */

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { Map as MapIcon } from "lucide-react";
import { useResponderStore } from "../../../store/responderStore";
import { Badge, EmptyState, severityTone } from "../../../components/ui";
import "leaflet/dist/leaflet.css";

// Fix for default markers in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Marker colors — Leaflet data-URI markers may keep hex values (design-system
// exception); the legend swatches reuse these consts so they always match.
const PICKUP_COLOR = "#dc2626";
const DESTINATION_COLOR = "#16a34a";
const ROUTE_COLOR = "#3b82f6";

// Custom marker icons
const pickupIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${PICKUP_COLOR}" width="32" height="32">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const destinationIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${DESTINATION_COLOR}" width="32" height="32">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// Component to fit bounds when locations change
function FitBounds({ pickup, destination }: { pickup: [number, number]; destination?: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds([pickup]);
    if (destination) {
      bounds.extend(destination);
    }
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, pickup, destination]);

  return null;
}

export default function AmbulanceMap() {
  const { activeCase, currentLocation } = useResponderStore();
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Get user's current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => {
          console.warn("Could not get location:", err);
        },
        { enableHighAccuracy: true }
      );
    }
  }, []);

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

  const pickupPos: [number, number] = [
    activeCase.pickupLocation.lat,
    activeCase.pickupLocation.lng,
  ];

  const destinationPos: [number, number] | undefined = activeCase.destination
    ? [activeCase.destination.lat, activeCase.destination.lng]
    : undefined;

  // Simple straight line route (in production, use routing API)
  const routeLine = destinationPos ? [pickupPos, destinationPos] : undefined;

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
          center={pickupPos}
          zoom={14}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBounds pickup={pickupPos} destination={destinationPos} />

          {/* Pickup Marker */}
          {/* NOTE: Leaflet popups always render on a light surface, so popup
              text keeps fixed dark colors instead of theme tokens. */}
          <Marker position={pickupPos} icon={pickupIcon}>
            <Popup>
              <div className="text-center">
                <p className="font-bold text-red-600">Pickup Location</p>
                <p className="text-sm">{activeCase.pickupLocation.address}</p>
                {activeCase.pickupLocation.landmark && (
                  <p className="text-xs text-gray-500">{activeCase.pickupLocation.landmark}</p>
                )}
              </div>
            </Popup>
          </Marker>

          {/* Destination Marker */}
          {destinationPos && activeCase.destination && (
            <Marker position={destinationPos} icon={destinationIcon}>
              <Popup>
                <div className="text-center">
                  <p className="font-bold text-green-600">{activeCase.destination.name}</p>
                  <p className="text-sm">{activeCase.destination.address}</p>
                  {activeCase.destination.phone && (
                    <a
                      href={`tel:${activeCase.destination.phone}`}
                      className="text-blue-600 text-sm"
                    >
                      {activeCase.destination.phone}
                    </a>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Route Line */}
          {routeLine && (
            <Polyline
              positions={routeLine}
              color={ROUTE_COLOR}
              weight={4}
              opacity={0.7}
              dashArray="10, 10"
            />
          )}
        </MapContainer>

        {/* Legend — solid, sunlight-legible */}
        <div className="absolute bottom-3 start-3 z-[1000] rounded-lg border border-edge bg-surface px-3 py-2 shadow-2">
          <div className="space-y-1.5 text-sm font-semibold text-ink">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: PICKUP_COLOR }}
              />
              <span>Pickup</span>
            </div>
            {activeCase.destination && (
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: DESTINATION_COLOR }}
                />
                <span>Hospital</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
