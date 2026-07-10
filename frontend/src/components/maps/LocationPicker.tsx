import React, { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { LocateFixed } from 'lucide-react';
import { Button } from '../ui';

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
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          icon={<LocateFixed />}
          onClick={handleGPS}
        >
          Use My Location
        </Button>
        {position && (
          <span className="text-sm text-ink-muted" dir="ltr">
            {position[0].toFixed(4)}, {position[1].toFixed(4)}
          </span>
        )}
      </div>
      <MapContainer
        center={position || [initialLat, initialLng]}
        zoom={13}
        style={{ height, width: '100%' }}
        className="rounded-lg border border-edge"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onLocationSelect={handleClick} />
        {position && <Marker position={position} />}
      </MapContainer>
      <p className="mt-1 text-xs text-ink-faint">Click on the map to set your location</p>
    </div>
  );
};

export default LocationPicker;
