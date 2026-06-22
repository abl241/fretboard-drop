import { describe, expect, it } from "vitest";
import { DEFAULT_GUIDED_PROGRESS } from "./guidedStorage";
import { getGuidedStepById } from "./guidedSteps";
import {
  buildGuidedProgressView,
  getGuidedCompletionRecognition,
  getGuidedPrimaryActionLabel,
  getGuidedResultsCopy,
} from "./guidedProgressView";

describe("guidedProgressView", () => {
  it("builds first-step progress at the start of the path", () => {
    const view = buildGuidedProgressView(getGuidedStepById("a"), [], { isReturning: false });

    expect(view.levelLabel).toBe("Level 1 of 6");
    expect(view.partLabel).toBeNull();
    expect(view.locationLabel).toBe("Level 1 of 6");
    expect(view.actionTitle).toBe("Learn A");
    expect(view.completedCount).toBe(0);
    expect(view.totalCount).toBe(13);
    expect(view.overallProgressLabel).toBe("0 of 13 runs complete");
    expect(view.nextStepPreview).toBe("Next: Learn B + C with help");
    expect(view.primaryActionLabel).toBe("Learn A");
    expect(view.resumeEyebrow).toBe("STEP 1 OF 13");
  });

  it("shows part labels only on multi-part levels", () => {
    const assisted = buildGuidedProgressView(getGuidedStepById("bc-assisted"), ["a"], { isReturning: true });
    const solo = buildGuidedProgressView(getGuidedStepById("d"), ["a", "bc-assisted", "bc-unassisted", "abc-mix"], { isReturning: true });

    expect(assisted.partLabel).toBe("Part A of C");
    expect(assisted.locationLabel).toBe("Level 2 of 6 · Part A of C");
    expect(solo.partLabel).toBeNull();
    expect(solo.locationLabel).toBe("Level 3 of 6");
  });

  it("builds middle-step and final-step progress correctly", () => {
    const middle = buildGuidedProgressView(
      getGuidedStepById("ef-unassisted"),
      ["a", "bc-assisted", "bc-unassisted", "abc-mix", "d", "ef-assisted"],
      { isReturning: true },
    );
    const finalStep = buildGuidedProgressView(
      getGuidedStepById("abcdefg-mix"),
      getGuidedStepById("abcdefg-mix").stepNumber === 13
        ? ["a", "bc-assisted", "bc-unassisted", "abc-mix", "d", "ef-assisted", "ef-unassisted", "def-mix", "bcef-assisted", "bcef-unassisted", "abcdef-mix", "g"]
        : [],
      { isReturning: true },
    );

    expect(middle.completedCount).toBe(6);
    expect(middle.progressPercent).toBe(46);
    expect(middle.resumeEyebrow).toBe("Continue Level 4");
    expect(middle.primaryActionLabel).toBe("Try E + F Without Hints");
    expect(finalStep.isFinalRepeatable).toBe(true);
    expect(finalStep.nextStepPreview).toBeNull();
    expect(finalStep.primaryActionLabel).toBe("Mix All Natural Notes");
  });

  it("uses specific primary action labels and next-step previews", () => {
    expect(getGuidedPrimaryActionLabel(getGuidedStepById("abc-mix"))).toBe("Mix A + B + C");
    expect(getGuidedPrimaryActionLabel(getGuidedStepById("bcef-unassisted"))).toBe("Connect Both Groups");

    const view = buildGuidedProgressView(getGuidedStepById("bc-assisted"), ["a"], { isReturning: true });
    expect(view.nextStepPreview).toBe("Next: Find B + C without hints");
    expect(view.hintIntroLabel).toBe("Hint: faint A shown");
    expect(view.hudHintLabel).toBe("Hints on");
  });

  it("returns completion recognition for milestone steps", () => {
    expect(getGuidedCompletionRecognition("abc-mix")).toBe("First note group connected");
    expect(getGuidedCompletionRecognition("abcdefg-mix")).toBe("All natural notes unlocked");
  });

  it("uses repeat copy for failed runs and specific success actions", () => {
    const failedAssisted = getGuidedResultsCopy(
      getGuidedStepById("bc-assisted"),
      { assisted: true, assistedThresholdMet: false, isReady: false, veryPoor: false, band: "learning" },
      [],
    );
    const failedUnassisted = getGuidedResultsCopy(
      getGuidedStepById("bc-unassisted"),
      { assisted: false, assistedThresholdMet: false, isReady: false, veryPoor: false, band: "learning" },
      ["a"],
    );
    const assistedSuccess = getGuidedResultsCopy(
      getGuidedStepById("bc-assisted"),
      { assisted: true, assistedThresholdMet: true, isReady: false, veryPoor: false, band: "ready" },
      ["a"],
    );
    const finalReady = getGuidedResultsCopy(
      getGuidedStepById("abcdefg-mix"),
      { assisted: false, assistedThresholdMet: false, isReady: true, veryPoor: false, band: "ready" },
      DEFAULT_GUIDED_PROGRESS.completedStepIds,
    );

    expect(failedAssisted.body).toContain("Repeat B + C with the A hint");
    expect(failedUnassisted.body).toContain("without hints again");
    expect(assistedSuccess.primaryAction).toBe("Try B + C Without Hints");
    expect(finalReady.primaryAction).toBe("Practice All Natural Notes Again");
    expect(finalReady.recognition).toBe("All natural notes unlocked");
  });

  it("marks the current segment without listing all step titles in gameplay data", () => {
    const view = buildGuidedProgressView(getGuidedStepById("d"), ["a", "bc-assisted", "bc-unassisted", "abc-mix"], { isReturning: true });
    expect(view.segmentStatuses.filter((status) => status === "current")).toHaveLength(1);
    expect(view.segmentStatuses[4]).toBe("current");
  });
});
