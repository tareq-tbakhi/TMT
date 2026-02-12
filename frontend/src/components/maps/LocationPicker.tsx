import React, { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';

interface LocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  onLocationSelect: (lat: number, lng: number) => void;
  height?: string;
}

function ClickHandler({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

const LocationPicker: React.FC<LocationPickerProps> = ({
  initialLat = 31.5,
  initialLng = 34.47,
  onLocationSelect,
  height = '300px',
}) => {
  const [position, setPosition] = useState<[number, number] | null>(
    initialLat && initialLng ? [initialLat, initialLng] : null
  );

  const handleClick = useCallback(
    (lat: number, lng: number) => {
      setPosition([lat, lng]);
      onLocationSelect(lat, lng);
    },
    [onLocationSelect]
  );

  const handleGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPosition([lat, lng]);
        onLocationSelect(lat, lng);
      },
      (err) => console.error('GPS error:', err),
      { enableHighAccuracy: true }
    );
  }, [onLocationSelect]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleGPS}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          Use My Location
        </button>
        {position && (
          <span className="text-sm text-gray-500">
            {position[0].toFixed(4)}, {position[1].toFixed(4)}
          </span>
        )}
      </div>
      <MapContainer
        center={position || [initialLat, initialLng]}
        zoom={13}
        style={{ height, width: '100%' }}
        className="rounded-lg border"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onLocationSelect={handleClick} />
        {position && <Marker position={position} />}
      </MapContainer>
      <p className="mt-1 text-xs text-gray-400">Click on the map to set your location</p>
    </div>
  );
};

export default LocationPicker;
