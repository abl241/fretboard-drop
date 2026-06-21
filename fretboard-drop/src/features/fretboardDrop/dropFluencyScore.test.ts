import { describe, expect, it } from "vitest";
import {
  DROP_FLUENCY_SCORE_VERSION,
  calculateFluencyScore,
  getFluencyScoreLabel,
  readBestFluencyScore,
  writeBestFluencyScore,
} from "./dropFluencyScore";

function hitProgresses(count: number, progress: number): number[] {
  return Array.from({ length: count }, () => progress);
}

describe("Fretboard Drop Fluency Score", () => {
  it("exports a formula version", () => {
    expect(DROP_FLUENCY_SCORE_VERSION).toBe("v1");
  });

  it("returns an integer from 0 to 1000", () => {
    const score = calculateFluencyScore({
      correct: 12,
      accuracy: 83,
      bestStreak: 7,
      misses: 1,
      wrong: 2,
    });

    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1000);
  });

  it("rewards a strong run more than a low-score run", () => {
    const strongRun = calculateFluencyScore({
      correct: 28,
      accuracy: 94,
      bestStreak: 14,
      misses: 0,
      wrong: 1,
    });
    const lowRun = calculateFluencyScore({
      correct: 4,
      accuracy: 70,
      bestStreak: 2,
      misses: 2,
      wrong: 2,
    });

    expect(strongRun).toBeGreaterThan(lowRun);
  });

  it("keeps a competent one-miss run out of the elite range", () => {
    const score = calculateFluencyScore({
      correct: 29,
      accuracy: 94,
      bestStreak: 20,
      misses: 1,
      wrong: 0,
      hitProgresses: hitProgresses(29, 0.36),
    });

    expect(score).toBeGreaterThanOrEqual(780);
    expect(score).toBeLessThanOrEqual(850);
    expect(score).toBeLessThan(900);
  });

  it("keeps a messy moderate run below strong fluency", () => {
    const score = calculateFluencyScore({
      correct: 13,
      accuracy: 68,
      bestStreak: 5,
      misses: 3,
      wrong: 3,
      hitProgresses: hitProgresses(13, 0.5),
    });

    expect(score).toBeGreaterThanOrEqual(350);
    expect(score).toBeLessThanOrEqual(550);
    expect(score).toBeLessThan(700);
  });

  it("lowers the score for poor accuracy", () => {
    const cleanRun = calculateFluencyScore({
      correct: 15,
      accuracy: 95,
      bestStreak: 8,
      misses: 0,
      wrong: 0,
    });
    const inaccurateRun = calculateFluencyScore({
      correct: 15,
      accuracy: 50,
      bestStreak: 8,
      misses: 0,
      wrong: 0,
    });

    expect(inaccurateRun).toBeLessThan(cleanRun);
  });

  it("reduces the score for misses and wrong clicks", () => {
    const cleanRun = calculateFluencyScore({
      correct: 12,
      accuracy: 86,
      bestStreak: 6,
      misses: 0,
      wrong: 0,
    });
    const messyRun = calculateFluencyScore({
      correct: 12,
      accuracy: 86,
      bestStreak: 6,
      misses: 3,
      wrong: 5,
    });

    expect(messyRun).toBeLessThan(cleanRun);
  });

  it("clamps extreme inputs", () => {
    expect(calculateFluencyScore({
      correct: -10,
      accuracy: -20,
      bestStreak: -5,
      misses: 0,
      wrong: 0,
    })).toBe(0);
    expect(calculateFluencyScore({
      correct: 500,
      accuracy: 250,
      bestStreak: 200,
      misses: 0,
      wrong: 0,
      hitProgresses: hitProgresses(500, 0.12),
    })).toBe(1000);
  });

  it("makes instant recall a major top-end scoring factor", () => {
    const latePerfectRun = calculateFluencyScore({
      correct: 34,
      accuracy: 100,
      bestStreak: 34,
      misses: 0,
      wrong: 0,
      hitProgresses: hitProgresses(34, 0.56),
    });
    const earlyPerfectRun = calculateFluencyScore({
      correct: 34,
      accuracy: 100,
      bestStreak: 34,
      misses: 0,
      wrong: 0,
      hitProgresses: hitProgresses(34, 0.18),
    });

    expect(latePerfectRun).toBeGreaterThanOrEqual(880);
    expect(latePerfectRun).toBeLessThan(930);
    expect(earlyPerfectRun).toBeGreaterThan(latePerfectRun);
    expect(earlyPerfectRun).toBeGreaterThanOrEqual(980);
  });

  it("prevents missed, wrong, late, or inaccurate runs from reaching elite scores", () => {
    expect(calculateFluencyScore({
      correct: 60,
      accuracy: 99,
      bestStreak: 40,
      misses: 1,
      wrong: 0,
      hitProgresses: hitProgresses(60, 0.12),
    })).toBeLessThan(980);
    expect(calculateFluencyScore({
      correct: 60,
      accuracy: 100,
      bestStreak: 40,
      misses: 0,
      wrong: 1,
      hitProgresses: hitProgresses(60, 0.12),
    })).toBeLessThan(950);
    expect(calculateFluencyScore({
      correct: 60,
      accuracy: 89,
      bestStreak: 40,
      misses: 0,
      wrong: 0,
      hitProgresses: hitProgresses(60, 0.12),
    })).toBeLessThan(930);
    expect(calculateFluencyScore({
      correct: 60,
      accuracy: 100,
      bestStreak: 40,
      misses: 0,
      wrong: 0,
      hitProgresses: hitProgresses(60, 0.7),
    })).toBeLessThan(930);
  });

  it("does not let high volume with poor accuracy beat a cleaner smaller run", () => {
    const highVolumeMessyRun = calculateFluencyScore({
      correct: 30,
      accuracy: 60,
      bestStreak: 10,
      misses: 5,
      wrong: 15,
      hitProgresses: hitProgresses(30, 0.28),
    });
    const cleanerSmallerRun = calculateFluencyScore({
      correct: 18,
      accuracy: 95,
      bestStreak: 10,
      misses: 0,
      wrong: 0,
      hitProgresses: hitProgresses(18, 0.38),
    });

    expect(highVolumeMessyRun).toBeLessThan(cleanerSmallerRun);
  });

  it("labels Fluency Score threshold boundaries", () => {
    expect(getFluencyScoreLabel(0)).toBe("Getting started");
    expect(getFluencyScoreLabel(299)).toBe("Getting started");
    expect(getFluencyScoreLabel(300)).toBe("Building recall");
    expect(getFluencyScoreLabel(499)).toBe("Building recall");
    expect(getFluencyScoreLabel(500)).toBe("Solid run");
    expect(getFluencyScoreLabel(699)).toBe("Solid run");
    expect(getFluencyScoreLabel(700)).toBe("Strong fluency");
    expect(getFluencyScoreLabel(849)).toBe("Strong fluency");
    expect(getFluencyScoreLabel(850)).toBe("Excellent");
    expect(getFluencyScoreLabel(929)).toBe("Excellent");
    expect(getFluencyScoreLabel(930)).toBe("Elite");
    expect(getFluencyScoreLabel(979)).toBe("Elite");
    expect(getFluencyScoreLabel(980)).toBe("Legendary!");
    expect(getFluencyScoreLabel(1000)).toBe("Legendary!");
  });

  it("stores Fluency bests separately by string and practice context", () => {
    writeBestFluencyScore(640, [0], { practiceType: "string-focus", selectedNotes: null });
    writeBestFluencyScore(720, [0], { practiceType: "note-focus", selectedNotes: ["A"] });

    expect(readBestFluencyScore([0], { practiceType: "string-focus", selectedNotes: null })).toBe(640);
    expect(readBestFluencyScore([0], { practiceType: "note-focus", selectedNotes: ["A"] })).toBe(720);
    expect(readBestFluencyScore([1], { practiceType: "string-focus", selectedNotes: null })).toBe(0);
  });
});
