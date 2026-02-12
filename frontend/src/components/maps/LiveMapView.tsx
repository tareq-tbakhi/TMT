import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Custom marker icons by type
const createIcon = (color: string) =>
  new L.DivIcon({
    className: 'custom-marker',
    html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

const SEVERITY_COLORS: Record<number, string> = {
  1: '#3b82f6', // blue
  2: '#eab308', // yellow
  3: '#f97316', // orange
  4: '#ef4444', // red
  5: '#7f1d1d', // dark red
};

const HOSPITAL_STATUS_COLORS: Record<string, string> = {
  operational: '#22c55e',
  limited: '#eab308',
  full: '#ef4444',
  destroyed: '#1f2937',
};

const LAYER_COLORS: Record<string, string> = {
  sos: '#ef4444',
  crisis: '#f97316',
  hospital: '#22c55e',
  sms_activity: '#a855f7',
  patient_density: '#3b82f6',
  telegram_intel: '#06b6d4',
};

interface MapEvent {
  id: string;
  event_type: string;
  latitude: number;
  longitude: number;
  source: string;
  severity: number;
  title: string;
  details: string;
  layer: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface LiveMapViewProps {
  events: MapEvent[];
  activeLayers: Set<string>;
  selectedTime?: number; // hours from now to filter
  onEventClick?: (event: MapEvent) => void;
  height?: string;
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

const LiveMapView: React.FC<LiveMapViewProps> = ({
  events,
  activeLayers,
  selectedTime = 24,
  onEventClick,
  height = '100%',
}) => {
  const center: [number, number] = [31.5, 34.47]; // Gaza default center

  const filteredEvents = useMemo(() => {
    const cutoff = new Date(Date.now() - selectedTime * 60 * 60 * 1000);
    return events.filter((e) => {
      if (!activeLayers.has(e.layer)) return false;
      if (e.created_at && new Date(e.created_at) < cutoff) return false;
      return e.latitude && e.longitude;
    });
  }, [events, activeLayers, selectedTime]);

  return (
    <MapContainer
      center={center}
      zoom={11}
      style={{ height, width: '100%' }}
      className="rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {filteredEvents.map((event) => {
        const color =
          event.layer === 'hospital'
            ? HOSPITAL_STATUS_COLORS[event.metadata?.status as string] || '#22c55e'
            : SEVERITY_COLORS[event.severity] || LAYER_COLORS[event.layer] || '#6b7280';

        return (
          <React.Fragment key={event.id}>
            <Marker
              position={[event.latitude, event.longitude]}
              icon={createIcon(color)}
              eventHandlers={{
                click: () => onEventClick?.(event),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-bold">{event.title || event.event_type}</div>
                  <div className="text-gray-600">{event.details}</div>
                  <div className="mt-1 text-xs text-gray-400">
                    {event.source} | Severity: {event.severity}
                  </div>
                  {event.created_at && (
                    <div className="text-xs text-gray-400">
                      {new Date(event.created_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>

            {/* Crisis zones get a circle overlay */}
            {event.layer === 'crisis' && (
              <Circle
                center={[event.latitude, event.longitude]}
                radius={event.metadata?.radius_m ? Number(event.metadata.radius_m) : 1000}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: 0.15,
                  weight: 2,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </MapContainer>
  );
};

export default LiveMapView;
