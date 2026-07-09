import { describe, expect, it } from "vitest";
import { createPracticeNoteKey } from "./dropGameUtils";
import {
  DROP_RUN_HISTORY_STORAGE_KEY,
  appendCompletedRunToHistory,
  getLastFiveTrend,
  getRunHistoryForContext,
  getTrendDelta,
  type DropRunHistoryEntry,
} from "./dropRunHistory";

function historyEntry(fluencyScore: number): DropRunHistoryEntry {
  return {
    completedAt: fluencyScore,
    fluencyScore,
    fluencyScoreLabel: "Solid run",
    notesFound: Math.round(fluencyScore / 100),
    accuracy: 90,
  };
}

describe("Fretboard Drop run history", () => {
  it("appends the first run for a practice context", () => {
    appendCompletedRunToHistory("high-e-all", historyEntry(640));

    expect(getRunHistoryForContext("high-e-all").map((entry) => entry.fluencyScore)).toEqual([640]);
    expect(JSON.parse(window.localStorage.getItem(DROP_RUN_HISTORY_STORAGE_KEY) ?? "{}")).toHaveProperty("high-e-all");
  });

  it("keeps different practice contexts separate", () => {
    appendCompletedRunToHistory("high-e-all", historyEntry(640));
    appendCompletedRunToHistory("high-e-c-d", historyEntry(720));

    expect(getRunHistoryForContext("high-e-all").map((entry) => entry.fluencyScore)).toEqual([640]);
    expect(getRunHistoryForContext("high-e-c-d").map((entry) => entry.fluencyScore)).toEqual([720]);
  });

  it("uses order-independent selected note keys for multi-note contexts", () => {
    expect(createPracticeNoteKey({ practiceType: "note-focus", selectedNotes: ["D", "C"] })).toBe(
      createPracticeNoteKey({ practiceType: "note-focus", selectedNotes: ["C", "D"] }),
    );
  });

  it("keeps only the most recent stored runs per context", () => {
    for (let score = 100; score <= 1_200; score += 100) {
      appendCompletedRunToHistory("high-e-all", historyEntry(score));
    }

    expect(getRunHistoryForContext("high-e-all").map((entry) => entry.fluencyScore)).toEqual([
      300,
      400,
      500,
      600,
      700,
      800,
      900,
      1000,
      1000,
      1000,
    ]);
  });

  it("uses the last five runs for the trend", () => {
    const entries = [420, 500, 580, 610, 690, 720].map(historyEntry);
    const trend = getLastFiveTrend(entries);

    expect(trend.kind).toBe("trend");
    if (trend.kind === "trend") {
      expect(trend.scores).toEqual([500, 580, 610, 690, 720]);
    }
  });

  it("calculates delta from newest minus oldest displayed score", () => {
    expect(getTrendDelta([500, 560, 620, 650, 701].map(historyEntry))).toBe(201);
    expect(getTrendDelta([700, 660].map(historyEntry))).toBe(-40);
  });

  it("returns placeholder state for a one-run context", () => {
    expect(getLastFiveTrend([historyEntry(640)])).toEqual({
      kind: "placeholder",
      message: "Play again to start your trend.",
    });
  });
});
