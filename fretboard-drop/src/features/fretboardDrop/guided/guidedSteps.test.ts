import { describe, expect, it } from "vitest";
import {
  GUIDED_STEPS,
  getGuidedGhostAnchor,
  getGuidedStepById,
  getGuidedStepIds,
} from "./guidedSteps";

const EXPECTED_STEP_IDS = [
  "a",
  "bc-assisted",
  "bc-unassisted",
  "abc-mix",
  "d",
  "ef-assisted",
  "ef-unassisted",
  "def-mix",
  "bcef-assisted",
  "bcef-unassisted",
  "abcdef-mix",
  "g",
  "abcdefg-mix",
] as const;

const EXPECTED_TARGET_POOLS: Record<(typeof EXPECTED_STEP_IDS)[number], readonly string[]> = {
  a: ["A"],
  "bc-assisted": ["B", "C"],
  "bc-unassisted": ["B", "C"],
  "abc-mix": ["A", "B", "C"],
  d: ["D"],
  "ef-assisted": ["E", "F"],
  "ef-unassisted": ["E", "F"],
  "def-mix": ["D", "E", "F"],
  "bcef-assisted": ["B", "C", "E", "F"],
  "bcef-unassisted": ["B", "C", "E", "F"],
  "abcdef-mix": ["A", "B", "C", "D", "E", "F"],
  g: ["G"],
  "abcdefg-mix": ["A", "B", "C", "D", "E", "F", "G"],
};

describe("guidedSteps", () => {
  it("defines the exact ordered 13 step IDs", () => {
    expect(getGuidedStepIds()).toEqual(EXPECTED_STEP_IDS);
    expect(GUIDED_STEPS).toHaveLength(13);
  });

  it("declares the exact target-note pool for every step", () => {
    for (const stepId of EXPECTED_STEP_IDS) {
      expect(getGuidedStepById(stepId).targetNotes).toEqual(EXPECTED_TARGET_POOLS[stepId]);
    }
  });

  it("maps B and C to A in bc-assisted", () => {
    const step = getGuidedStepById("bc-assisted");
    expect(getGuidedGhostAnchor(step, "B")).toBe("A");
    expect(getGuidedGhostAnchor(step, "C")).toBe("A");
    expect(getGuidedGhostAnchor(step, "A")).toBeNull();
  });

  it("maps E and F to D in ef-assisted", () => {
    const step = getGuidedStepById("ef-assisted");
    expect(getGuidedGhostAnchor(step, "E")).toBe("D");
    expect(getGuidedGhostAnchor(step, "F")).toBe("D");
    expect(getGuidedGhostAnchor(step, "D")).toBeNull();
  });

  it("maps dual anchors in bcef-assisted", () => {
    const step = getGuidedStepById("bcef-assisted");
    expect(getGuidedGhostAnchor(step, "B")).toBe("A");
    expect(getGuidedGhostAnchor(step, "C")).toBe("A");
    expect(getGuidedGhostAnchor(step, "E")).toBe("D");
    expect(getGuidedGhostAnchor(step, "F")).toBe("D");
  });

  it("returns null ghost anchors elsewhere", () => {
    for (const stepId of ["a", "bc-unassisted", "abc-mix", "d", "ef-unassisted", "def-mix", "bcef-unassisted", "abcdef-mix", "g", "abcdefg-mix"] as const) {
      const step = getGuidedStepById(stepId);
      for (const note of step.targetNotes) {
        expect(getGuidedGhostAnchor(step, note)).toBeNull();
      }
    }
  });

  it("marks only the final mix as repeatable", () => {
    expect(GUIDED_STEPS.filter((step) => step.isFinalRepeatable).map((step) => step.id)).toEqual(["abcdefg-mix"]);
  });
});
