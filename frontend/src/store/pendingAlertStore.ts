/**
 * Zustand store for the Human-in-the-Loop pending-alert approval queue.
 *
 * Lists alerts with approval_status="pending_approval" and lets a department
 * admin approve or reject them. Defaults to the real API; in dummy mode
 * (VITE_USE_DUMMY_DATA=true) it serves a small in-memory dataset so the review
 * screen is demoable without a backend.
 */

import { create } from "zustand";
import {
  getPendingAlerts,
  approveAlert,
  rejectAlert,
  type PendingAlert,
} from "../services/api";
import { isDummyMode } from "../hooks/useDataMode";

// ─── Dummy dataset (demo mode only) ─────────────────────────────

const DUMMY_PENDING_ALERTS: PendingAlert[] = [
  {
    id: "dummy-pending-1",
    event_type: "bombing",
    severity: "critical",
    latitude: 31.5017,
    longitude: 34.4668,
    radius_m: 1500,
    title: "Reported airstrike near Al-Shifa area",
    details: "Multiple secondary reports of an explosion with smoke visible.",
    source: "telegram",
    confidence: 0.82,
    acknowledged: null,
    affected_patients_count: 47,
    created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    expires_at: null,
    alert_type: "primary",
    parent_alert_id: null,
    approval_status: "pending_approval",
    routed_department: "hospital",
    metadata: {
      priority_score: 90,
      priority_explanation: [
        {
          factor: "sos_severity",
          contribution: 50,
          detail: "SOS severity 5/5 (base = severity * 10)",
          source: "rule",
        },
        {
          factor: "nearby_alert_density",
          contribution: 20,
          detail: "11 active alerts nearby (capped at +20)",
          source: "rule",
        },
        {
          factor: "telegram_corroboration",
          contribution: 10,
          detail: "3 corroborating Telegram event(s)",
          source: "rule",
        },
        {
          factor: "special_equipment",
          contribution: 20,
          detail: "Requires special equipment: oxygen concentrator",
          source: "rule",
        },
        {
          factor: "trust_penalty",
          contribution: -10,
          detail: "Reduced trust score 0.40 (2 false alarms)",
          source: "rule",
        },
      ],
    },
  },
  {
    id: "dummy-pending-2",
    event_type: "fire",
    severity: "high",
    latitude: 31.524,
    longitude: 34.452,
    radius_m: 800,
    title: "Building fire reported, eastern district",
    details: "Single source report; awaiting corroboration.",
    source: "telegram",
    confidence: 0.61,
    acknowledged: null,
    affected_patients_count: 8,
    created_at: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    expires_at: null,
    alert_type: "primary",
    parent_alert_id: null,
    approval_status: "pending_approval",
    routed_department: "civil_defense",
    metadata: {
      priority_score: 60,
      priority_explanation: [
        {
          factor: "sos_severity",
          contribution: 40,
          detail: "SOS severity 4/5 (base = severity * 10)",
          source: "rule",
        },
        {
          factor: "patient_status_injured",
          contribution: 10,
          detail: "Patient reported as injured",
          source: "rule",
        },
        {
          factor: "living_alone",
          contribution: 10,
          detail: "Patient lives alone",
          source: "rule",
        },
      ],
    },
  },
];

// ─── Store ──────────────────────────────────────────────────────

interface PendingAlertState {
  alerts: PendingAlert[];
  loading: boolean;
  error: string | null;
  actingId: string | null;
}

interface PendingAlertActions {
  fetchPending: () => Promise<void>;
  approve: (alertId: string) => Promise<void>;
  reject: (alertId: string) => Promise<void>;
  reset: () => void;
}

type PendingAlertStore = PendingAlertState & PendingAlertActions;

export const usePendingAlertStore = create<PendingAlertStore>((set) => ({
  alerts: [],
  loading: false,
  error: null,
  actingId: null,

  fetchPending: async () => {
    set({ loading: true, error: null });
    try {
      if (isDummyMode()) {
        set({ alerts: [...DUMMY_PENDING_ALERTS], loading: false });
        return;
      }
      const alerts = await getPendingAlerts();
      set({ alerts, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load pending alerts",
      });
    }
  },

  approve: async (alertId: string) => {
    set({ actingId: alertId, error: null });
    try {
      if (!isDummyMode()) {
        await approveAlert(alertId);
      }
      // Optimistic removal on success.
      set((state) => ({
        alerts: state.alerts.filter((a) => a.id !== alertId),
        actingId: null,
      }));
    } catch (err) {
      set({
        actingId: null,
        error: err instanceof Error ? err.message : "Failed to approve alert",
      });
    }
  },

  reject: async (alertId: string) => {
    set({ actingId: alertId, error: null });
    try {
      if (!isDummyMode()) {
        await rejectAlert(alertId);
      }
      set((state) => ({
        alerts: state.alerts.filter((a) => a.id !== alertId),
        actingId: null,
      }));
    } catch (err) {
      set({
        actingId: null,
        error: err instanceof Error ? err.message : "Failed to reject alert",
      });
    }
  },

  reset: () => set({ alerts: [], loading: false, error: null, actingId: null }),
}));

// Re-export so consumers can use a single import path if convenient.
export type { PendingAlert };
