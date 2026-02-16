/**
 * Map - Firefighter's map view
 * Shows fire location
 */

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useResponderStore } from "../../../store/responderStore";
import { PRIORITY_COLORS } from "../../../types/responderTypes";
import "leaflet/dist/leaflet.css";

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom marker icon for fire
const fireIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#b91c1c" width="32" height="32">
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

export default function FirefighterMap() {
  const { activeCase } = useResponderStore();

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

  const firePos: [number, number] = [
    activeCase.pickupLocation.lat,
    activeCase.pickupLocation.lng,
  ];

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
        center={firePos}
        zoom={15}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <CenterMap position={firePos} />

        {/* Fire Marker */}
        <Marker position={firePos} icon={fireIcon}>
          <Popup>
            <div className="text-center">
              <p className="font-bold text-red-600">🔥 Fire Location</p>
              <p className="text-sm">{activeCase.pickupLocation.address}</p>
              {activeCase.pickupLocation.landmark && (
                <p className="text-xs text-gray-500">{activeCase.pickupLocation.landmark}</p>
              )}
              {activeCase.victimCount && (
                <p className="text-sm font-medium mt-1 text-red-600">
                  {activeCase.victimCount} {activeCase.victimCount === 1 ? "person" : "people"} at risk
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-24 left-4 z-[1000] bg-white rounded-xl p-3 shadow-lg">
        <div className="flex items-center gap-2 text-sm">
          <span className="w-4 h-4 bg-red-700 rounded-full" />
          <span className="text-gray-700">Fire Location</span>
        </div>
      </div>

      {/* Victim Alert */}
      {activeCase.victimCount && (
        <div className="absolute bottom-24 right-4 z-[1000] bg-red-600 text-white rounded-xl px-4 py-2 shadow-lg animate-pulse">
          <div className="text-center">
            <p className="text-2xl font-bold">{activeCase.victimCount}</p>
            <p className="text-xs">at risk</p>
          </div>
        </div>
      )}
    </div>
  );
}
