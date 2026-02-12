/**
 * Zustand map store for managing live map state.
 */

import { create } from "zustand";
import type { MapEvent } from "../services/api";

interface MapState {
  events: MapEvent[];
  activeLayers: Set<string>;
  timeRange: number; // hours
  selectedEvent: MapEvent | null;
}

interface MapActions {
  addEvent: (event: MapEvent) => void;
  setEvents: (events: MapEvent[]) => void;
  toggleLayer: (layer: string) => void;
  setTimeRange: (hours: number) => void;
  setSelectedEvent: (event: MapEvent | null) => void;
  clearEvents: () => void;
}

type MapStore = MapState & MapActions;

const DEFAULT_LAYERS = new Set(["crisis", "sos", "hospital"]);

export const useMapStore = create<MapStore>((set) => ({
  events: [],
  activeLayers: DEFAULT_LAYERS,
  timeRange: 24,
  selectedEvent: null,

  addEvent: (event: MapEvent) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 1000), // cap at 1000 events
    })),

  setEvents: (events: MapEvent[]) => set({ events }),

  toggleLayer: (layer: string) =>
    set((state) => {
      const newLayers = new Set(state.activeLayers);
      if (newLayers.has(layer)) {
        newLayers.delete(layer);
      } else {
        newLayers.add(layer);
      }
      return { activeLayers: newLayers };
    }),

  setTimeRange: (hours: number) => set({ timeRange: hours }),

  setSelectedEvent: (event: MapEvent | null) => set({ selectedEvent: event }),

  clearEvents: () => set({ events: [], selectedEvent: null }),
}));
