/**
 * Tests for pendingAlertStore (Human-in-the-Loop approval queue).
 * Mocks the API layer and asserts pending alerts (with their attributions)
 * load, and that approve/reject hit the right endpoint and update state.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Run the store against the REAL API path (not dummy mode) so we can assert
// the API functions are actually invoked.
vi.mock("../hooks/useDataMode", () => ({
  isDummyMode: () => false,
  isApiMode: () => true,
  useDummyData: () => false,
  useDataMode: () => "api",
}));

vi.mock("../services/api", () => ({
  getPendingAlerts: vi.fn(),
  approveAlert: vi.fn(),
  rejectAlert: vi.fn(),
}));

import { usePendingAlertStore } from "./pendingAlertStore";
import {
  getPendingAlerts,
  approveAlert,
  rejectAlert,
  type PendingAlert,
} from "../services/api";

const sampleAlert = (id: string): PendingAlert => ({
  id,
  event_type: "bombing",
  severity: "critical",
  latitude: 31.5,
  longitude: 34.46,
  radius_m: 1000,
  title: `Alert ${id}`,
  details: "test",
  source: "telegram",
  confidence: 0.8,
  acknowledged: null,
  affected_patients_count: 12,
  created_at: new Date().toISOString(),
  expires_at: null,
  approval_status: "pending_approval",
  routed_department: "hospital",
  metadata: {
    priority_score: 80,
    priority_explanation: [
      { factor: "sos_severity", contribution: 50, detail: "SOS severity 5/5", source: "rule" },
      { factor: "trust_penalty", contribution: -10, detail: "Low trust", source: "rule" },
    ],
  },
});

describe("pendingAlertStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePendingAlertStore.getState().reset();
  });

  it("loads pending alerts with their priority attributions", async () => {
    vi.mocked(getPendingAlerts).mockResolvedValue([
      sampleAlert("a1"),
      sampleAlert("a2"),
    ]);

    await usePendingAlertStore.getState().fetchPending();

    const state = usePendingAlertStore.getState();
    expect(getPendingAlerts).toHaveBeenCalledTimes(1);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.alerts).toHaveLength(2);
    // Attributions are carried through under metadata.priority_explanation.
    const exp = state.alerts[0].metadata?.priority_explanation;
    expect(exp).toHaveLength(2);
    expect(exp?.[0].contribution).toBe(50);
    expect(exp?.[1].contribution).toBe(-10);
  });

  it("sets an error when fetch fails", async () => {
    vi.mocked(getPendingAlerts).mockRejectedValue(new Error("boom"));

    await usePendingAlertStore.getState().fetchPending();

    const state = usePendingAlertStore.getState();
    expect(state.error).toBe("boom");
    expect(state.alerts).toHaveLength(0);
  });

  it("approve calls the approve endpoint and removes the alert from state", async () => {
    usePendingAlertStore.setState({ alerts: [sampleAlert("a1"), sampleAlert("a2")] });
    vi.mocked(approveAlert).mockResolvedValue(sampleAlert("a1"));

    await usePendingAlertStore.getState().approve("a1");

    const state = usePendingAlertStore.getState();
    expect(approveAlert).toHaveBeenCalledWith("a1");
    expect(rejectAlert).not.toHaveBeenCalled();
    expect(state.alerts.map((a) => a.id)).toEqual(["a2"]);
    expect(state.actingId).toBeNull();
  });

  it("reject calls the reject endpoint and removes the alert from state", async () => {
    usePendingAlertStore.setState({ alerts: [sampleAlert("a1"), sampleAlert("a2")] });
    vi.mocked(rejectAlert).mockResolvedValue(sampleAlert("a2"));

    await usePendingAlertStore.getState().reject("a2");

    const state = usePendingAlertStore.getState();
    expect(rejectAlert).toHaveBeenCalledWith("a2");
    expect(approveAlert).not.toHaveBeenCalled();
    expect(state.alerts.map((a) => a.id)).toEqual(["a1"]);
  });

  it("keeps the alert in state and records error if approve fails", async () => {
    usePendingAlertStore.setState({ alerts: [sampleAlert("a1")] });
    vi.mocked(approveAlert).mockRejectedValue(new Error("network"));

    await usePendingAlertStore.getState().approve("a1");

    const state = usePendingAlertStore.getState();
    expect(state.alerts).toHaveLength(1);
    expect(state.error).toBe("network");
    expect(state.actingId).toBeNull();
  });
});
