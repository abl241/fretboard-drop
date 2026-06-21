import { describe, expect, it } from "vitest";
import {
  DROP_CELL_FLUENCY_SCORE_VERSION,
  calculateCellFluency,
  getWeightedWrongCount,
} from "./dropCellFluency";
import type { CellProgressRecord } from "./dropCellProgress";

function makeRecord(overrides: Partial<CellProgressRecord> = {}): CellProgressRecord {
  return {
    schemaVersion: 1,
    cellId: "standard:0:5",
    tuningId: "standard",
    stringIndex: 0,
    fret: 5,
    noteName: "A",
    resolvedTargets: 0,
    correctHits: 0,
    misses: 0,
    adjacentWrongTaps: 0,
    otherWrongTaps: 0,
    hitProgressSum: 0,
    hitProgressCount: 0,
    consecutiveCorrect: 0,
    bestConsecutiveCorrect: 0,
    firstPracticedAt: "2026-06-13T16:00:00.000Z",
    lastPracticedAt: "2026-06-13T16:00:00.000Z",
    practicedDateKeys: ["2026-06-13"],
    recentResolutions: [],
    ...overrides,
  };
}

function recent(outcomes: readonly ("correct" | "miss")[]) {
  return outcomes.map((outcome, index) => ({
    occurredAt: new Date(2026, 5, 13, 12, index).toISOString(),
    outcome,
    ...(outcome === "correct" ? { hitProgress: 0.25 } : {}),
  }));
}

describe("Fretboard Drop per-cell Fluency", () => {
  it("exports the exact scoring version", () => {
    expect(DROP_CELL_FLUENCY_SCORE_VERSION).toBe("cell-fluency-v1");
    expect(calculateCellFluency(makeRecord()).scoringVersion).toBe("cell-fluency-v1");
  });

  it("returns not-enough-data with a null score when there are no attempts", () => {
    const result = calculateCellFluency(makeRecord());

    expect(result.score).toBeNull();
    expect(result.evidenceLevel).toBe("not-enough-data");
    expect(result.attempts).toBe(0);
  });

  it("keeps one perfect hit as not-enough-data", () => {
    const result = calculateCellFluency(makeRecord({
      resolvedTargets: 1,
      correctHits: 1,
      hitProgressSum: 0.15,
      hitProgressCount: 1,
      recentResolutions: recent(["correct"]),
    }));

    expect(result.score).toBeNull();
    expect(result.evidenceLevel).toBe("not-enough-data");
    expect(result.dimensions.accuracyScore).toBe(1000);
  });

  it("transitions between evidence levels by resolved targets", () => {
    expect(calculateCellFluency(makeRecord({ resolvedTargets: 2, correctHits: 2 })).evidenceLevel).toBe("not-enough-data");
    expect(calculateCellFluency(makeRecord({ resolvedTargets: 3, correctHits: 3 })).evidenceLevel).toBe("early-estimate");
    expect(calculateCellFluency(makeRecord({ resolvedTargets: 4, correctHits: 4 })).evidenceLevel).toBe("early-estimate");
    expect(calculateCellFluency(makeRecord({ resolvedTargets: 5, correctHits: 5 })).evidenceLevel).toBe("developing-confidence");
    expect(calculateCellFluency(makeRecord({ resolvedTargets: 11, correctHits: 11 })).evidenceLevel).toBe("developing-confidence");
    expect(calculateCellFluency(makeRecord({ resolvedTargets: 12, correctHits: 12 })).evidenceLevel).toBe("established");
  });

  it("improves when more attempts are correct", () => {
    const weaker = calculateCellFluency(makeRecord({
      resolvedTargets: 5,
      correctHits: 3,
      misses: 2,
      hitProgressSum: 0.9,
      hitProgressCount: 3,
      recentResolutions: recent(["correct", "miss", "correct", "miss", "correct"]),
    }));
    const stronger = calculateCellFluency(makeRecord({
      resolvedTargets: 5,
      correctHits: 5,
      misses: 0,
      hitProgressSum: 1.5,
      hitProgressCount: 5,
      recentResolutions: recent(["correct", "correct", "correct", "correct", "correct"]),
    }));

    expect(stronger.score).not.toBeNull();
    expect(weaker.score).not.toBeNull();
    expect(stronger.score!).toBeGreaterThan(weaker.score!);
    expect(stronger.dimensions.accuracyScore).toBeGreaterThan(weaker.dimensions.accuracyScore);
  });

  it("rewards earlier hit timing in the speed dimension", () => {
    const early = calculateCellFluency(makeRecord({
      resolvedTargets: 5,
      correctHits: 5,
      hitProgressSum: 0.75,
      hitProgressCount: 5,
      recentResolutions: recent(["correct", "correct", "correct", "correct", "correct"]),
    }));
    const late = calculateCellFluency(makeRecord({
      resolvedTargets: 5,
      correctHits: 5,
      hitProgressSum: 3.0,
      hitProgressCount: 5,
      recentResolutions: recent(["correct", "correct", "correct", "correct", "correct"]),
    }));

    expect(early.dimensions.speedScore).toBeGreaterThan(late.dimensions.speedScore);
    expect(early.score!).toBeGreaterThan(late.score!);
  });

  it("misses reduce score with full mistake weight", () => {
    const clean = calculateCellFluency(makeRecord({
      resolvedTargets: 5,
      correctHits: 5,
      misses: 0,
      hitProgressSum: 1.5,
      hitProgressCount: 5,
      recentResolutions: recent(["correct", "correct", "correct", "correct", "correct"]),
    }));
    const missed = calculateCellFluency(makeRecord({
      resolvedTargets: 5,
      correctHits: 3,
      misses: 2,
      hitProgressSum: 0.9,
      hitProgressCount: 3,
      recentResolutions: recent(["correct", "miss", "correct", "miss", "correct"]),
    }));

    expect(missed.score!).toBeLessThan(clean.score!);
    expect(missed.dimensions.errorPenaltyScore).toBeLessThan(clean.dimensions.errorPenaltyScore);
  });

  it("counts adjacent wrong taps as half of distant wrong taps", () => {
    const adjacent = makeRecord({ resolvedTargets: 5, correctHits: 5, adjacentWrongTaps: 1 });
    const distant = makeRecord({ resolvedTargets: 5, correctHits: 5, otherWrongTaps: 1 });

    expect(getWeightedWrongCount(adjacent)).toBe(0.5);
    expect(getWeightedWrongCount(distant)).toBe(1);
    expect(calculateCellFluency(adjacent).dimensions.errorPenaltyScore).toBeGreaterThan(
      calculateCellFluency(distant).dimensions.errorPenaltyScore,
    );
  });

  it("treats two adjacent wrong taps like one distant wrong tap", () => {
    const twoAdjacent = calculateCellFluency(makeRecord({ resolvedTargets: 5, correctHits: 5, adjacentWrongTaps: 2 }));
    const oneDistant = calculateCellFluency(makeRecord({ resolvedTargets: 5, correctHits: 5, otherWrongTaps: 1 }));

    expect(twoAdjacent.dimensions.errorPenaltyScore).toBe(oneDistant.dimensions.errorPenaltyScore);
  });

  it("does not let distant wrong taps alter binary accuracy directly", () => {
    const clean = calculateCellFluency(makeRecord({ resolvedTargets: 5, correctHits: 5, otherWrongTaps: 0 }));
    const wrongTap = calculateCellFluency(makeRecord({ resolvedTargets: 5, correctHits: 5, otherWrongTaps: 3 }));

    expect(clean.dimensions.accuracyScore).toBe(1000);
    expect(wrongTap.dimensions.accuracyScore).toBe(1000);
    expect(wrongTap.dimensions.errorPenaltyScore).toBeLessThan(clean.dimensions.errorPenaltyScore);
  });

  it("reduces consistency for recent misses and improves it for repeated recent correct outcomes", () => {
    const missedRecently = calculateCellFluency(makeRecord({
      resolvedTargets: 5,
      correctHits: 5,
      recentResolutions: recent(["correct", "miss", "correct", "miss", "correct"]),
    }));
    const correctRecently = calculateCellFluency(makeRecord({
      resolvedTargets: 5,
      correctHits: 5,
      recentResolutions: recent(["correct", "correct", "correct", "correct", "correct"]),
    }));

    expect(correctRecently.dimensions.consistencyScore).toBeGreaterThan(missedRecently.dimensions.consistencyScore);
  });

  it("clamps all dimensions and the total score", () => {
    const result = calculateCellFluency(makeRecord({
      resolvedTargets: 999,
      correctHits: 999,
      misses: 0,
      adjacentWrongTaps: -10,
      otherWrongTaps: -20,
      hitProgressSum: -50,
      hitProgressCount: 999,
      recentResolutions: recent(["correct", "correct", "correct"]),
    }));

    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(1000);
    for (const dimensionScore of Object.values(result.dimensions)) {
      expect(dimensionScore).toBeGreaterThanOrEqual(0);
      expect(dimensionScore).toBeLessThanOrEqual(1000);
    }
  });

  it("handles malformed or incomplete records safely", () => {
    const result = calculateCellFluency({
      resolvedTargets: Number.NaN,
      correctHits: "nope" as unknown as number,
      practicedDateKeys: ["2026-06-13", "2026-06-13", null] as unknown as string[],
      recentResolutions: [{ outcome: "bad" }] as unknown as CellProgressRecord["recentResolutions"],
    });

    expect(result.score).toBeNull();
    expect(result.evidenceLevel).toBe("not-enough-data");
    expect(result.attempts).toBe(0);
    expect(result.distinctPracticeDays).toBe(1);
  });

  it("is deterministic for the same evidence", () => {
    const record = makeRecord({
      resolvedTargets: 12,
      correctHits: 10,
      misses: 2,
      adjacentWrongTaps: 2,
      otherWrongTaps: 1,
      hitProgressSum: 2.7,
      hitProgressCount: 10,
      practicedDateKeys: ["2026-06-13", "2026-06-14"],
      recentResolutions: recent(["correct", "correct", "miss", "correct", "correct", "correct", "miss", "correct"]),
    });

    expect(calculateCellFluency(record)).toEqual(calculateCellFluency(record));
  });
});
