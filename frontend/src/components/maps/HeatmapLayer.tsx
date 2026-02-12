import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface HeatPoint {
  lat: number;
  lng: number;
  intensity: number;
}

interface HeatmapLayerProps {
  points: HeatPoint[];
  radius?: number;
  blur?: number;
  maxZoom?: number;
  visible?: boolean;
}

/**
 * Heatmap layer for Leaflet.
 * Falls back to circle markers if leaflet-heat is not available.
 */
const HeatmapLayer: React.FC<HeatmapLayerProps> = ({
  points,
  radius = 25,
  blur = 15,
  visible = true,
}) => {
  const map = useMap();

  useEffect(() => {
    if (!visible || points.length === 0) return;

    // Fallback: render as semi-transparent circles
    const circles = points.map((p) =>
      L.circleMarker([p.lat, p.lng], {
        radius: Math.max(5, Math.min(radius, p.intensity * 10)),
        color: 'transparent',
        fillColor: `hsl(${Math.max(0, 60 - p.intensity * 20)}, 100%, 50%)`,
        fillOpacity: 0.4,
      })
    );

    const layerGroup = L.layerGroup(circles);
    layerGroup.addTo(map);

    return () => {
      map.removeLayer(layerGroup);
    };
  }, [map, points, radius, blur, visible]);

  return null;
};

export default HeatmapLayer;
