import { describe, expect, it } from "vitest";
import { getGuidedStepById } from "./guidedSteps";
import { calculateGuidedFluency, getGuidedPresentationBand, isGuidedLessonReady } from "./guidedFluency";

describe("guided fluency", () => {
  const step = getGuidedStepById("a");
  const requiredStringIndexes = [0, 1, 2, 3, 4, 5] as const;

  it("scores a perfect fast run higher than a slow clean run", () => {
    const fast = calculateGuidedFluency({
      step,
      correct: 8,
      wrong: 0,
      misses: 0,
      bestStreak: 8,
      hitProgresses: [0.12, 0.18, 0.2, 0.16, 0.22, 0.18, 0.2, 0.14],
      successfulStringIndexes: requiredStringIndexes,
      requiredStringIndexes,
    });
    const slow = calculateGuidedFluency({
      step,
      correct: 8,
      wrong: 0,
      misses: 0,
      bestStreak: 8,
      hitProgresses: [0.78, 0.82, 0.74, 0.8, 0.77, 0.79, 0.81, 0.76],
      successfulStringIndexes: requiredStringIndexes,
      requiredStringIndexes,
    });

    expect(fast.guidedFluency).toBeGreaterThan(slow.guidedFluency);
    expect(fast.guidedFluency).toBeGreaterThanOrEqual(750);
  });

  it("reduces score for wrong answers and misses", () => {
    const clean = calculateGuidedFluency({
      step,
      correct: 8,
      wrong: 0,
      misses: 0,
      bestStreak: 8,
      hitProgresses: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
      successfulStringIndexes: requiredStringIndexes,
      requiredStringIndexes,
    });
    const messy = calculateGuidedFluency({
      step,
      correct: 5,
      wrong: 2,
      misses: 1,
      bestStreak: 3,
      hitProgresses: [0.2, 0.3, 0.4, 0.2, 0.3],
      successfulStringIndexes: [0, 1, 2, 3],
      requiredStringIndexes,
    });

    expect(messy.guidedFluency).toBeLessThan(clean.guidedFluency);
    expect(messy.guidedFluency).toBeGreaterThanOrEqual(0);
    expect(messy.guidedFluency).toBeLessThanOrEqual(1000);
  });

  it("reduces score when required string coverage is missing", () => {
    const covered = calculateGuidedFluency({
      step,
      correct: 8,
      wrong: 0,
      misses: 0,
      bestStreak: 8,
      hitProgresses: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
      successfulStringIndexes: requiredStringIndexes,
      requiredStringIndexes,
    });
    const uncovered = calculateGuidedFluency({
      step,
      correct: 8,
      wrong: 0,
      misses: 0,
      bestStreak: 8,
      hitProgresses: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
      successfulStringIndexes: [0, 1, 2],
      requiredStringIndexes,
    });

    expect(uncovered.guidedFluency).toBeLessThan(covered.guidedFluency);
  });

  it("presents high-scoring near-passes as Almost Ready without completing readiness", () => {
    const isReady = isGuidedLessonReady({
      guidedFluency: 780,
      accuracy: 95,
      wrong: 0,
      misses: 0,
      coverageMet: false,
      assisted: false,
      attempts: [],
    });

    expect(isReady).toBe(false);
    expect(getGuidedPresentationBand(780, isReady)).toBe("almost-ready");
  });

  it("presents true ready and below-600 runs explicitly", () => {
    expect(getGuidedPresentationBand(820, true)).toBe("ready");
    expect(getGuidedPresentationBand(590, false)).toBe("learning");
  });

  it("allows fast and standard unassisted passes with coverage", () => {
    expect(isGuidedLessonReady({
      guidedFluency: 750,
      accuracy: 90,
      wrong: 1,
      misses: 0,
      coverageMet: true,
      assisted: false,
      attempts: [],
    })).toBe(true);
    expect(isGuidedLessonReady({
      guidedFluency: 700,
      accuracy: 85,
      wrong: 2,
      misses: 0,
      coverageMet: true,
      assisted: false,
      attempts: [],
    })).toBe(true);
  });

  it("blocks assisted runs and missing coverage from advancement", () => {
    expect(isGuidedLessonReady({
      guidedFluency: 920,
      accuracy: 100,
      wrong: 0,
      misses: 0,
      coverageMet: true,
      assisted: true,
      attempts: [],
    })).toBe(false);
    expect(isGuidedLessonReady({
      guidedFluency: 760,
      accuracy: 95,
      wrong: 0,
      misses: 0,
      coverageMet: false,
      assisted: false,
      attempts: [],
    })).toBe(false);
  });

  it("allows two of the last three unassisted standard attempts to pass", () => {
    expect(isGuidedLessonReady({
      guidedFluency: 640,
      accuracy: 86,
      wrong: 2,
      misses: 0,
      coverageMet: true,
      assisted: false,
      attempts: [
        {
          completedAt: 1,
          stepId: "bc-unassisted",
          guidedFluency: 900,
          accuracy: 100,
          correct: 10,
          wrong: 0,
          misses: 0,
          targetCount: 10,
          assisted: true,
        },
        {
          completedAt: 2,
          stepId: "bc-unassisted",
          guidedFluency: 630,
          accuracy: 85,
          correct: 9,
          wrong: 1,
          misses: 0,
          targetCount: 10,
          assisted: false,
        },
      ],
    })).toBe(true);
  });
});
