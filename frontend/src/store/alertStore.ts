/**
 * Zustand alert store for managing alerts state.
 */

import { create } from "zustand";
import type { Alert } from "../services/api";

export interface AlertStats {
  total: number;
  sos_count: number;
  unacknowledged: number;
  by_severity: Record<string, number>;
}

interface AlertState {
  alerts: Alert[];
  activeAlert: Alert | null;
  unreadCount: number;
  totalCount: number;
  stats: AlertStats | null;
}

interface AlertActions {
  addAlert: (alert: Alert) => void;
  setAlerts: (alerts: Alert[], total?: number, stats?: AlertStats | null) => void;
  acknowledgeAlert: (alertId: string) => void;
  setActiveAlert: (alert: Alert | null) => void;
  clearUnread: () => void;
}

type AlertStore = AlertState & AlertActions;

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  activeAlert: null,
  unreadCount: 0,
  totalCount: 0,
  stats: null,

  addAlert: (alert: Alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts],
      unreadCount: state.unreadCount + 1,
      totalCount: state.totalCount + 1,
      stats: state.stats
        ? {
            ...state.stats,
            total: state.stats.total + 1,
            unacknowledged: state.stats.unacknowledged + 1,
            sos_count:
              alert.source === "sos"
                ? state.stats.sos_count + 1
                : state.stats.sos_count,
          }
        : null,
    })),

  setAlerts: (alerts: Alert[], total?: number, stats?: AlertStats | null) =>
    set({
      alerts,
      totalCount: total ?? alerts.length,
      unreadCount: stats?.unacknowledged ?? alerts.filter((a) => !a.acknowledged).length,
      stats: stats ?? null,
    }),

  acknowledgeAlert: (alertId: string) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: "current" } : a
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
      stats: state.stats
        ? {
            ...state.stats,
            unacknowledged: Math.max(0, state.stats.unacknowledged - 1),
          }
        : null,
      activeAlert:
        state.activeAlert?.id === alertId
          ? { ...state.activeAlert, acknowledged: "current" }
          : state.activeAlert,
    })),

  setActiveAlert: (alert: Alert | null) => set({ activeAlert: alert }),

  clearUnread: () => set({ unreadCount: 0 }),
}));
