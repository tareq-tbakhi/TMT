/**
 * Tests for aiAssistantStore's GLM-backed assistant call + scripted fallback.
 * The API layer is mocked — NO live network call is made.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/api", () => ({
  sosAssistant: vi.fn(),
}));

import { sosAssistant, type AssistantReply } from "../services/api";
import {
  useAIAssistantStore,
  scriptedNextTurn,
  mapTriage,
} from "./aiAssistantStore";

const mockedSosAssistant = vi.mocked(sosAssistant);

function resetStore() {
  useAIAssistantStore.getState().reset();
}

describe("aiAssistantStore.requestAssistantReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    // Default to online for the happy path.
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("calls the backend and merges returned triage when online", async () => {
    const reply: AssistantReply = {
      message: "How many people are with you?",
      triage: {
        emergency_type: "medical",
        severity: 5,
        num_people: 2,
        anyone_injured: true,
        needs: ["water"],
      },
      done: false,
      source: "glm",
    };
    mockedSosAssistant.mockResolvedValueOnce(reply);

    const turn = await useAIAssistantStore
      .getState()
      .requestAssistantReply([{ role: "user", content: "help" }], "en");

    expect(mockedSosAssistant).toHaveBeenCalledTimes(1);
    expect(turn.source).toBe("glm");
    expect(turn.message).toContain("How many");

    // Triage merged into local state.
    const td = useAIAssistantStore.getState().triageData;
    expect(td.emergencyType).toBe("medical");
    expect(td.injuryStatus).toBe("serious"); // severity 5 -> serious
    expect(td.peopleCount).toBe("2_3_people");
    expect(td.additionalDetails).toBe("water");
  });

  it("falls back to the scripted flow on backend error", async () => {
    mockedSosAssistant.mockRejectedValueOnce(new Error("500 boom"));

    const turn = await useAIAssistantStore
      .getState()
      .requestAssistantReply([{ role: "user", content: "help" }], "en");

    expect(mockedSosAssistant).toHaveBeenCalledTimes(1);
    expect(turn.source).toBe("fallback");
    expect(turn.message).toBeTruthy();
  });

  it("uses the scripted fallback without calling the API when offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    const turn = await useAIAssistantStore
      .getState()
      .requestAssistantReply([{ role: "user", content: "help" }], "en");

    expect(mockedSosAssistant).not.toHaveBeenCalled();
    expect(turn.source).toBe("fallback");
    expect(turn.message).toBeTruthy();
  });
});

describe("scriptedNextTurn", () => {
  it("returns the first question for an empty conversation", () => {
    const turn = scriptedNextTurn([]);
    expect(turn.done).toBe(false);
    expect(turn.source).toBe("fallback");
    expect(turn.message).toBeTruthy();
  });

  it("signals done once all scripted questions are answered", () => {
    const msgs = Array.from({ length: 6 }, () => ({
      role: "user" as const,
      content: "x",
    }));
    const turn = scriptedNextTurn(msgs);
    expect(turn.done).toBe(true);
  });
});

describe("mapTriage", () => {
  it("clamps people count buckets and maps severity to injury status", () => {
    expect(
      mapTriage({
        emergency_type: "trapped",
        severity: 3,
        num_people: 5,
        anyone_injured: true,
        needs: [],
      })
    ).toEqual({
      emergencyType: "trapped",
      injuryStatus: "minor",
      peopleCount: "more_than_3",
    });
  });

  it("maps no injuries and solo people count", () => {
    expect(
      mapTriage({
        emergency_type: null,
        severity: null,
        num_people: 1,
        anyone_injured: false,
        needs: [],
      })
    ).toEqual({ injuryStatus: "none", peopleCount: "just_me" });
  });
});
