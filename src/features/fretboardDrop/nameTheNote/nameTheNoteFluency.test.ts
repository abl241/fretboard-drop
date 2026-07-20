import { afterEach, describe, expect, it } from "vitest";
import { DROP_BEST_FLUENCY_SCORE_KEY } from "../dropFluencyScore";
import {
  NAME_THE_NOTE_FLUENCY_STORAGE_PREFIX,
  calculateNameTheNoteFluencyScore,
  getNameTheNoteFluencyStorageKey,
  readBestNameTheNoteFluency,
  writeBestNameTheNoteFluency,
  type NameTheNoteFluencyEvidence,
} from "./nameTheNoteFluency";

describe("nameTheNoteFluency", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns near zero when no targets are completed", () => {
    expect(calculateNameTheNoteFluencyScore(evidence({ correct: 0 }))).toBe(0);
  });

  it("keeps few correct answers with low accuracy in the low range", () => {
    const score = calculateNameTheNoteFluencyScore(evidence({
      correct: 4,
      wrong: 5,
      timeouts: 2,
      bestStreak: 2,
      averageResponseMs: 2600,
    }));

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(260);
  });

  it("scores moderate volume with good accuracy and average speed in the midrange", () => {
    const score = calculateNameTheNoteFluencyScore(evidence({
      correct: 18,
      wrong: 2,
      timeouts: 1,
      bestStreak: 8,
      averageResponseMs: 2000,
    }));

    expect(score).toBeGreaterThanOrEqual(450);
    expect(score).toBeLessThan(750);
  });

  it("scores strong volume, high accuracy, and fast recall high without becoming elite", () => {
    const score = calculateNameTheNoteFluencyScore(evidence({
      correct: 30,
      wrong: 1,
      timeouts: 0,
      bestStreak: 20,
      averageResponseMs: 1000,
    }));

    expect(score).toBeGreaterThanOrEqual(800);
    expect(score).toBeLessThan(940);
  });

  it("allows elite and legendary scores only for exceptional evidence", () => {
    const elite = calculateNameTheNoteFluencyScore(evidence({
      correct: 38,
      wrong: 0,
      timeouts: 0,
      bestStreak: 30,
      averageResponseMs: 700,
    }));
    const legendary = calculateNameTheNoteFluencyScore(evidence({
      correct: 45,
      wrong: 0,
      timeouts: 0,
      bestStreak: 36,
      averageResponseMs: 500,
    }));

    expect(elite).toBeGreaterThanOrEqual(900);
    expect(elite).toBeLessThan(980);
    expect(legendary).toBeGreaterThanOrEqual(980);
    expect(legendary).toBeLessThanOrEqual(1000);
  });

  it("caps scores when wrong attempts, timeouts, or too few correct answers weaken the evidence", () => {
    expect(calculateNameTheNoteFluencyScore(evidence({
      correct: 34,
      wrong: 4,
      timeouts: 0,
      bestStreak: 24,
      averageResponseMs: 700,
    }))).toBeLessThan(900);

    expect(calculateNameTheNoteFluencyScore(evidence({
      correct: 34,
      wrong: 0,
      timeouts: 2,
      bestStreak: 24,
      averageResponseMs: 700,
    }))).toBeLessThan(820);

    expect(calculateNameTheNoteFluencyScore(evidence({
      correct: 8,
      wrong: 0,
      timeouts: 0,
      bestStreak: 8,
      averageResponseMs: 700,
    }))).toBeLessThanOrEqual(520);
  });

  it("persists best fluency separately by strings, notes, and open-string setting", () => {
    const highEOpen = {
      stringSelection: [0],
      selectedNotes: ["A"],
      includeOpenStrings: true,
    } as const;
    const highEClosed = {
      stringSelection: [0],
      selectedNotes: ["A"],
      includeOpenStrings: false,
    } as const;
    const lowEOpen = {
      stringSelection: [5],
      selectedNotes: ["A"],
      includeOpenStrings: true,
    } as const;
    const highEAllNotes = {
      stringSelection: [0],
      selectedNotes: ["C", "D", "E", "F", "G", "A", "B"],
      includeOpenStrings: true,
    } as const;

    writeBestNameTheNoteFluency(highEOpen, evidence({ correct: 24, averageResponseMs: 1200, bestStreak: 16 }));
    writeBestNameTheNoteFluency(highEClosed, evidence({ correct: 12, averageResponseMs: 1800, bestStreak: 6 }));

    expect(readBestNameTheNoteFluency(highEOpen)?.score).toBeGreaterThan(readBestNameTheNoteFluency(highEClosed)?.score ?? 0);
    expect(getNameTheNoteFluencyStorageKey(highEOpen)).not.toBe(getNameTheNoteFluencyStorageKey(highEClosed));
    expect(getNameTheNoteFluencyStorageKey(highEOpen)).not.toBe(getNameTheNoteFluencyStorageKey(lowEOpen));
    expect(getNameTheNoteFluencyStorageKey(highEOpen)).not.toBe(getNameTheNoteFluencyStorageKey(highEAllNotes));
    expect(window.localStorage.getItem(DROP_BEST_FLUENCY_SCORE_KEY)).toBeNull();
    expect(getNameTheNoteFluencyStorageKey(highEOpen)).toContain(NAME_THE_NOTE_FLUENCY_STORAGE_PREFIX);
  });
});

function evidence({
  correct,
  wrong = 0,
  timeouts = 0,
  bestStreak = correct,
  averageResponseMs = 1200,
}: {
  correct: number;
  wrong?: number;
  timeouts?: number;
  bestStreak?: number;
  averageResponseMs?: number;
}): NameTheNoteFluencyEvidence {
  return {
    correct,
    wrong,
    timeouts,
    bestStreak,
    correctResponseMsTotal: averageResponseMs * correct,
    correctResponseCount: correct,
    totalQuestionMs: 4000,
  };
}
