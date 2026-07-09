import { describe, expect, it } from "vitest";
import { getResultsMotivationMessage, type DropResultsMotivationInput } from "./dropResultsMotivation";

const baseInput: DropResultsMotivationInput = {
  fluencyScore: 640,
  rawScore: 12,
  rawBestScore: 20,
  accuracy: 92,
  misses: 0,
  wrong: 0,
  isNewFluencyBest: false,
  isNewRawBest: false,
  practiceLabel: "high E",
  averageHitProgress: 0.35,
};

function expectSingleMessage(message: string) {
  expect(message).toBe(message.trim());
  expect(message).not.toContain("\n");
}

describe("Fretboard Drop Results motivation", () => {
  it("prioritizes new bests", () => {
    const message = getResultsMotivationMessage({
      ...baseInput,
      isNewFluencyBest: true,
    });

    expect(message).toBe("New best. Run it back while it's fresh.");
    expectSingleMessage(message);
  });

  it("points to the next close Fluency label", () => {
    const message = getResultsMotivationMessage({
      ...baseInput,
      fluencyScore: 792,
    });

    expect(message).toBe("You're 58 points from Excellent.");
    expectSingleMessage(message);
  });

  it("does not ask Legendary runs for the next label", () => {
    const message = getResultsMotivationMessage({
      ...baseInput,
      fluencyScore: 986,
    });

    expect(message).toBe("Run it back while it's fresh.");
    expectSingleMessage(message);
  });

  it("uses a close raw-best message when no Fluency label is close", () => {
    const message = getResultsMotivationMessage({
      ...baseInput,
      fluencyScore: 720,
      rawScore: 19,
      rawBestScore: 20,
      practiceLabel: "high E",
    });

    expect(message).toBe("You were 1 note from your high E best.");
    expectSingleMessage(message);
  });

  it("formats all-strings raw-best messages readably", () => {
    const message = getResultsMotivationMessage({
      ...baseInput,
      fluencyScore: 720,
      rawScore: 18,
      rawBestScore: 20,
      practiceLabel: "All",
    });

    expect(message).toBe("You were 2 notes from your all strings best.");
    expectSingleMessage(message);
  });

  it("nudges cleaner runs when misses or wrong clicks hurt the run", () => {
    const message = getResultsMotivationMessage({
      ...baseInput,
      fluencyScore: 610,
      misses: 1,
      wrong: 2,
    });

    expect(message).toBe("One cleaner run could lift your Fluency.");
    expectSingleMessage(message);
  });

  it("nudges earlier hits when accuracy is good but timing is slower", () => {
    const message = getResultsMotivationMessage({
      ...baseInput,
      fluencyScore: 760,
      accuracy: 96,
      averageHitProgress: 0.58,
    });

    expect(message).toBe("Hit earlier to raise Fluency.");
    expectSingleMessage(message);
  });

  it("falls back to a replay prompt", () => {
    const message = getResultsMotivationMessage({
      ...baseInput,
      fluencyScore: 610,
      rawScore: 12,
      rawBestScore: 24,
      accuracy: 90,
      averageHitProgress: 0.34,
    });

    expect(message).toBe("Run it back while it's fresh.");
    expectSingleMessage(message);
  });
});
