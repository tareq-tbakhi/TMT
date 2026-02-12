/**
 * Map data fetching service.
 * Provides functions to fetch map events and subscribe to live updates.
 */

import { getMapEvents, type MapEvent } from "./api";

/**
 * Fetches map events from the backend with optional filters.
 */
export async function fetchMapEvents(
  hours: number = 24,
  layer?: string
): Promise<MapEvent[]> {
  return getMapEvents({ hours, layer });
}

/**
 * Subscribes to the live map event stream via Server-Sent Events.
 * This is a fallback/supplement to the WebSocket-based live map.
 *
 * @returns A function to unsubscribe (close the EventSource).
 */
export function subscribeToMapStream(
  onEvent: (event: MapEvent) => void,
  onError?: (error: Event) => void
): () => void {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const token = localStorage.getItem("tmt-token");

  const url = new URL(`${API_BASE}/api/v1/map/stream`);
  if (token) {
    url.searchParams.set("token", token);
  }

  const eventSource = new EventSource(url.toString());

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as MapEvent;
      onEvent(data);
    } catch {
      // Ignore parse errors for non-JSON messages (e.g., heartbeat)
    }
  };

  eventSource.onerror = (e) => {
    if (onError) {
      onError(e);
    }
  };

  // Return cleanup function
  return () => {
    eventSource.close();
  };
}

/**
 * Available map layer definitions.
 */
export const MAP_LAYERS = [
  { id: "crisis", label: "map.layer.crisis", color: "#ef4444" },
  { id: "sos", label: "map.layer.sos", color: "#f97316" },
  { id: "hospital", label: "map.layer.hospital", color: "#22c55e" },
  { id: "sms_activity", label: "map.layer.sms_activity", color: "#3b82f6" },
  {
    id: "patient_density",
    label: "map.layer.patient_density",
    color: "#a855f7",
  },
  {
    id: "telegram_intel",
    label: "map.layer.telegram_intel",
    color: "#06b6d4",
  },
] as const;

export type MapLayerId = (typeof MAP_LAYERS)[number]["id"];
