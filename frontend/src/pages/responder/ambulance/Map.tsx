/**
 * Map - Ambulance driver's map view
 * Shows pickup location, destination, and route
 */

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { useResponderStore } from "../../../store/responderStore";
import { PRIORITY_COLORS } from "../../../types/responderTypes";
import "leaflet/dist/leaflet.css";

// Fix for default markers in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom marker icons
const pickupIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#dc2626" width="32" height="32">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const destinationIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#16a34a" width="32" height="32">
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
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center p-6">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-700">No Active Case</h3>
          <p className="text-gray-500 text-sm mt-1">Accept a case to see the map</p>
        </div>
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

  const priorityColors = PRIORITY_COLORS[activeCase.priority];

  return (
    <div className="h-full relative">
      {/* Case Info Overlay */}
      <div className="absolute top-4 left-4 right-4 z-[1000]">
        <div className={`${priorityColors.bg} rounded-xl p-3 shadow-lg`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${priorityColors.dot} animate-pulse`} />
              <span className={`font-bold ${priorityColors.text} uppercase text-sm`}>
                {activeCase.priority}
              </span>
            </div>
            <span className="text-gray-600 text-sm">{activeCase.caseNumber}</span>
          </div>
          <p className="text-gray-800 font-medium mt-1 text-sm line-clamp-1">
            {activeCase.briefDescription}
          </p>
        </div>
      </div>

      {/* Map */}
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
            color="#3b82f6"
            weight={4}
            opacity={0.7}
            dashArray="10, 10"
          />
        )}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-24 left-4 z-[1000] bg-white rounded-xl p-3 shadow-lg">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 bg-red-500 rounded-full" />
            <span className="text-gray-700">Pickup</span>
          </div>
          {activeCase.destination && (
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 bg-green-500 rounded-full" />
              <span className="text-gray-700">Hospital</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
