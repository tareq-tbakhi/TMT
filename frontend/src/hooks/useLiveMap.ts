/**
 * Live map hook.
 * Combines map store state with websocket events.
 * Filters events by active layers and time range.
 */

import { useEffect, useMemo, useCallback } from "react";
import { useMapStore } from "../store/mapStore";
import { fetchMapEvents } from "../services/mapService";
import type { MapEvent } from "../services/api";

interface UseLiveMapReturn {
  /** Filtered events based on active layers and time range */
  filteredEvents: MapEvent[];
  /** All raw events */
  allEvents: MapEvent[];
  /** Currently active layer IDs */
  activeLayers: Set<string>;
  /** Current time range in hours */
  timeRange: number;
  /** Currently selected event */
  selectedEvent: MapEvent | null;
  /** Toggle a layer on/off */
  toggleLayer: (layer: string) => void;
  /** Set the time range */
  setTimeRange: (hours: number) => void;
  /** Select an event */
  setSelectedEvent: (event: MapEvent | null) => void;
  /** Refresh events from backend */
  refresh: () => Promise<void>;
}

export function useLiveMap(): UseLiveMapReturn {
  const {
    events,
    activeLayers,
    timeRange,
    selectedEvent,
    setEvents,
    toggleLayer,
    setTimeRange,
    setSelectedEvent,
  } = useMapStore();

  // Fetch initial events on mount and when timeRange changes
  const refresh = useCallback(async () => {
    try {
      const data = await fetchMapEvents(timeRange);
      setEvents(data);
    } catch (err) {
      console.error("Failed to fetch map events:", err);
    }
  }, [timeRange, setEvents]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Filter events by active layers and time range
  const filteredEvents = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - timeRange);

    return events.filter((event) => {
      // Filter by layer
      if (!activeLayers.has(event.layer)) return false;

      // Filter by time range
      const eventTime = new Date(event.created_at);
      if (eventTime < cutoff) return false;

      return true;
    });
  }, [events, activeLayers, timeRange]);

  return {
    filteredEvents,
    allEvents: events,
    activeLayers,
    timeRange,
    selectedEvent,
    toggleLayer,
    setTimeRange,
    setSelectedEvent,
    refresh,
  };
}
