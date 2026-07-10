import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/** Resolve a CSS custom property at runtime (Leaflet SVG attrs can't take var()). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

// Custom marker icons by type
const createIcon = (color: string) =>
  new L.DivIcon({
    className: 'custom-marker',
    html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

/** Numeric severity (1–5) → severity token. */
function severityColor(severity: number): string | undefined {
  switch (severity) {
    case 1:
      return cssVar('--t-sev-low', '#1d4ed8');
    case 2:
      return cssVar('--t-sev-medium', '#855c00');
    case 3:
      return cssVar('--t-sev-high', '#b03a06');
    case 4:
      return cssVar('--t-sev-critical', '#c11f2f');
    case 5:
      return cssVar('--t-sev-critical', '#7f1d1d');
    default:
      return undefined;
  }
}

function hospitalStatusColor(status: string | undefined): string | undefined {
  switch (status) {
    case 'operational':
      return cssVar('--t-success', '#157138');
    case 'limited':
      return cssVar('--t-warning', '#92400e');
    case 'full':
      return cssVar('--t-danger', '#c11f2f');
    case 'destroyed':
      return cssVar('--t-ink', '#1f2937');
    default:
      return undefined;
  }
}

function layerColor(layer: string): string | undefined {
  switch (layer) {
    case 'sos':
      return cssVar('--t-sev-critical', '#c11f2f');
    case 'crisis':
      return cssVar('--t-sev-high', '#b03a06');
    case 'hospital':
      return cssVar('--t-success', '#157138');
    case 'sms_activity':
      return cssVar('--t-accent', '#2050c8');
    case 'patient_density':
      return cssVar('--t-link', '#1d4ed8');
    case 'telegram_intel':
      return cssVar('--t-info', '#1d4ed8');
    default:
      return undefined;
  }
}

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
            ? hospitalStatusColor(event.metadata?.status as string) ||
              cssVar('--t-success', '#157138')
            : severityColor(event.severity) ||
              layerColor(event.layer) ||
              cssVar('--t-ink-faint', '#64748b');

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
                  <div className="font-bold text-ink">{event.title || event.event_type}</div>
                  <div className="text-ink-muted">{event.details}</div>
                  <div className="mt-1 text-xs text-ink-faint">
                    {event.source} | Severity: {event.severity}
                  </div>
                  {event.created_at && (
                    <div className="text-xs text-ink-faint">
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
