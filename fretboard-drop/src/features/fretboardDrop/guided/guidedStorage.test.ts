import { describe, expect, it } from "vitest";
import {
  DEFAULT_GUIDED_PROGRESS,
  GUIDED_ORIENTATION_SEEN_STORAGE_KEY,
  GUIDED_PREFERRED_MODE_STORAGE_KEY,
  GUIDED_PROGRESS_STORAGE_KEY,
  GUIDED_PROGRESS_V1_STORAGE_KEY,
  migrateGuidedProgressFromV1,
  readGuidedOrientationSeen,
  readGuidedPreferredMode,
  readGuidedProgress,
  writeGuidedOrientationSeen,
  writeGuidedPreferredMode,
  writeGuidedProgress,
} from "./guidedStorage";

describe("guidedStorage", () => {
  it("reads and writes the preferred Guided Learning mode safely", () => {
    expect(readGuidedPreferredMode()).toBeNull();

    writeGuidedPreferredMode("guided");
    expect(readGuidedPreferredMode()).toBe("guided");

    writeGuidedPreferredMode("free-play");
    expect(readGuidedPreferredMode()).toBe("free-play");
  });

  it("falls back safely when guided storage is malformed", () => {
    window.localStorage.setItem(GUIDED_PREFERRED_MODE_STORAGE_KEY, "lesson-mode");
    window.localStorage.setItem(GUIDED_ORIENTATION_SEEN_STORAGE_KEY, "maybe");
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, "{not-json");

    expect(readGuidedPreferredMode()).toBeNull();
    expect(readGuidedOrientationSeen()).toBe(false);
    expect(readGuidedProgress()).toEqual(DEFAULT_GUIDED_PROGRESS);
  });

  it("stores only valid guided progress values", () => {
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify({
      currentStepId: "bc-assisted",
      completedStepIds: ["a", "unknown", "a"],
    }));

    expect(readGuidedProgress()).toEqual({
      currentStepId: "bc-assisted",
      completedStepIds: ["a"],
      attemptsByStep: {},
      bestFluencyByStep: {},
      fluencyExplanationSeen: false,
    });

    writeGuidedProgress({
      currentStepId: "d",
      completedStepIds: ["a", "bc-assisted", "bc-unassisted", "abc-mix"],
      attemptsByStep: {},
      bestFluencyByStep: {},
      fluencyExplanationSeen: false,
    });
    expect(readGuidedProgress()).toEqual({
      currentStepId: "d",
      completedStepIds: ["a", "bc-assisted", "bc-unassisted", "abc-mix"],
      attemptsByStep: {},
      bestFluencyByStep: {},
      fluencyExplanationSeen: false,
    });
  });

  it("normalizes missing assisted attempt flags as unassisted", () => {
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify({
      currentStepId: "bc-unassisted",
      completedStepIds: ["a"],
      attemptsByStep: {
        "bc-unassisted": [{
          completedAt: 1,
          stepId: "bc-unassisted",
          guidedFluency: 720,
          accuracy: 90,
          correct: 9,
          wrong: 1,
          misses: 0,
          targetCount: 10,
        }],
      },
    }));

    expect(readGuidedProgress().attemptsByStep["bc-unassisted"]?.[0]).toMatchObject({
      targetCount: 10,
      assisted: false,
    });
  });

  it("reads and writes orientation seen state", () => {
    expect(readGuidedOrientationSeen()).toBe(false);
    writeGuidedOrientationSeen(true);
    expect(readGuidedOrientationSeen()).toBe(true);
  });

  it("migrates fresh v1 progress to step a", () => {
    expect(migrateGuidedProgressFromV1({})).toEqual(DEFAULT_GUIDED_PROGRESS);
  });

  it("migrates completed old A to bc-assisted", () => {
    expect(migrateGuidedProgressFromV1({
      completedLessonIds: ["a"],
    })).toMatchObject({
      currentStepId: "bc-assisted",
      completedStepIds: ["a"],
    });
  });

  it("migrates completed old B+C to abc-mix", () => {
    expect(migrateGuidedProgressFromV1({
      completedLessonIds: ["a", "bc"],
    })).toMatchObject({
      currentStepId: "abc-mix",
      completedStepIds: ["a", "bc-assisted", "bc-unassisted"],
    });
  });

  it("migrates completed old D to ef-assisted", () => {
    expect(migrateGuidedProgressFromV1({
      completedLessonIds: ["a", "bc", "d"],
    })).toMatchObject({
      currentStepId: "ef-assisted",
      completedStepIds: ["a", "bc-assisted", "bc-unassisted", "abc-mix", "d"],
    });
  });

  it("migrates completed old E+F to bcef-assisted without marking finished", () => {
    expect(migrateGuidedProgressFromV1({
      completedLessonIds: ["a", "bc", "d", "ef"],
    })).toMatchObject({
      currentStepId: "bcef-assisted",
      completedStepIds: [
        "a",
        "bc-assisted",
        "bc-unassisted",
        "abc-mix",
        "d",
        "ef-assisted",
        "ef-unassisted",
        "def-mix",
      ],
    });
  });

  it("migrates v1 storage on first read when v2 is absent", () => {
    window.localStorage.setItem(GUIDED_PROGRESS_V1_STORAGE_KEY, JSON.stringify({
      completedLessonIds: ["a"],
    }));

    expect(readGuidedProgress()).toMatchObject({
      currentStepId: "bc-assisted",
      completedStepIds: ["a"],
    });
    expect(window.localStorage.getItem(GUIDED_PROGRESS_STORAGE_KEY)).not.toBeNull();
  });
});
