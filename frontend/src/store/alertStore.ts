/**
 * Zustand alert store for managing alerts state.
 */

import { create } from "zustand";
import type { Alert } from "../services/api";

interface AlertState {
  alerts: Alert[];
  activeAlert: Alert | null;
  unreadCount: number;
}

interface AlertActions {
  addAlert: (alert: Alert) => void;
  setAlerts: (alerts: Alert[]) => void;
  acknowledgeAlert: (alertId: string) => void;
  setActiveAlert: (alert: Alert | null) => void;
  clearUnread: () => void;
}

type AlertStore = AlertState & AlertActions;

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  activeAlert: null,
  unreadCount: 0,

  addAlert: (alert: Alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts],
      unreadCount: state.unreadCount + 1,
    })),

  setAlerts: (alerts: Alert[]) =>
    set({
      alerts,
      unreadCount: alerts.filter((a) => !a.acknowledged).length,
    }),

  acknowledgeAlert: (alertId: string) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: "current" } : a
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
      activeAlert:
        state.activeAlert?.id === alertId
          ? { ...state.activeAlert, acknowledged: "current" }
          : state.activeAlert,
    })),

  setActiveAlert: (alert: Alert | null) => set({ activeAlert: alert }),

  clearUnread: () => set({ unreadCount: 0 }),
}));
