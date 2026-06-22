import { describe, expect, it } from "vitest";
import { DROP_TARGET_MIN_DURATION_MS } from "../dropGameUtils";
import { getGuidedStepById } from "./guidedSteps";
import {
  createGuidedCellKey,
  createGuidedTargetSequence,
} from "./guidedTargetGeneration";

function hasMoreThanTwoIdenticalNotesInARow(notes: readonly string[]): boolean {
  return notes.some((note, index) => index >= 2 && notes[index - 1] === note && notes[index - 2] === note);
}

function hasImmediateDuplicateCells(sequence: ReturnType<typeof createGuidedTargetSequence>): boolean {
  return sequence.some((target, index) => {
    if (index === 0) return false;
    const previous = sequence[index - 1];
    return createGuidedCellKey(target.stringIndex, target.fret) === createGuidedCellKey(previous.stringIndex, previous.fret);
  });
}

function hasImmediateRepeatedStrings(sequence: ReturnType<typeof createGuidedTargetSequence>): boolean {
  return sequence.some((target, index) => index > 0 && target.stringIndex === sequence[index - 1].stringIndex);
}

describe("guided target generation", () => {
  it("creates the A step with 8 targets and all six strings", () => {
    const step = getGuidedStepById("a");
    const sequence = createGuidedTargetSequence(step, 4);

    expect(sequence).toHaveLength(8);
    expect(new Set(sequence.map((target) => target.stringIndex)).size).toBe(6);
    expect(sequence.every((target) => target.note === "A")).toBe(true);
    expect(sequence.every((target) => target.durationMs === step.durationMs)).toBe(true);
    expect(hasImmediateDuplicateCells(sequence)).toBe(false);
  });

  it("creates bc-assisted with only B and C falling targets", () => {
    const step = getGuidedStepById("bc-assisted");
    const sequence = createGuidedTargetSequence(step, 2);
    const notes = sequence.map((target) => target.note);

    expect(sequence).toHaveLength(8);
    expect(new Set(notes)).toEqual(new Set(["B", "C"]));
    expect(notes).not.toContain("A");
    expect(sequence.every((target) => target.durationMs === step.durationMs)).toBe(true);
    expect(step.durationMs).toBeGreaterThan(DROP_TARGET_MIN_DURATION_MS);
    expect(hasMoreThanTwoIdenticalNotesInARow(notes)).toBe(false);
    expect(hasImmediateDuplicateCells(sequence)).toBe(false);
  });

  it("creates D with only D falling targets", () => {
    const step = getGuidedStepById("d");
    const sequence = createGuidedTargetSequence(step, 3);
    const notes = sequence.map((target) => target.note);

    expect(sequence).toHaveLength(8);
    expect(new Set(notes)).toEqual(new Set(["D"]));
    expect(notes).not.toContain("A");
    expect(notes).not.toContain("C");
    expect(sequence.every((target) => target.durationMs === step.durationMs)).toBe(true);
    expect(hasImmediateDuplicateCells(sequence)).toBe(false);
  });

  it("creates ef-assisted with only E and F falling targets", () => {
    const step = getGuidedStepById("ef-assisted");
    const sequence = createGuidedTargetSequence(step, 4);
    const notes = sequence.map((target) => target.note);

    expect(sequence).toHaveLength(8);
    expect(new Set(notes)).toEqual(new Set(["E", "F"]));
    expect(notes).not.toContain("D");
    expect(sequence.every((target) => target.durationMs === step.durationMs)).toBe(true);
    expect(hasMoreThanTwoIdenticalNotesInARow(notes)).toBe(false);
    expect(hasImmediateDuplicateCells(sequence)).toBe(false);
  });

  it("creates abc-mix with every allowed note represented", () => {
    const step = getGuidedStepById("abc-mix");
    const sequence = createGuidedTargetSequence(step, 5);
    const notes = sequence.map((target) => target.note);

    expect(sequence).toHaveLength(12);
    for (const note of ["A", "B", "C"]) {
      expect(notes).toContain(note);
    }
    expect(notes).not.toContain("D");
    expect(hasMoreThanTwoIdenticalNotesInARow(notes)).toBe(false);
    expect(hasImmediateDuplicateCells(sequence)).toBe(false);
    expect(hasImmediateRepeatedStrings(sequence)).toBe(false);
  });

  it("creates abcdef-mix with every allowed note represented", () => {
    const step = getGuidedStepById("abcdef-mix");
    const sequence = createGuidedTargetSequence(step, 5);
    const notes = sequence.map((target) => target.note);

    expect(sequence).toHaveLength(18);
    for (const note of ["A", "B", "C", "D", "E", "F"]) {
      expect(notes).toContain(note);
    }
    expect(notes).not.toContain("G");
    expect(hasMoreThanTwoIdenticalNotesInARow(notes)).toBe(false);
    expect(hasImmediateDuplicateCells(sequence)).toBe(false);
    expect(hasImmediateRepeatedStrings(sequence)).toBe(false);
  });

  it("creates abcdefg-mix with every natural note represented", () => {
    const step = getGuidedStepById("abcdefg-mix");
    const sequence = createGuidedTargetSequence(step, 6);
    const notes = sequence.map((target) => target.note);

    expect(sequence).toHaveLength(21);
    for (const note of ["A", "B", "C", "D", "E", "F", "G"]) {
      expect(notes).toContain(note);
    }
    expect(step.durationMs).toBeGreaterThan(DROP_TARGET_MIN_DURATION_MS);
    expect(hasImmediateDuplicateCells(sequence)).toBe(false);
  });

  it("is deterministic from seed", () => {
    const step = getGuidedStepById("bc-unassisted");
    const firstSequence = createGuidedTargetSequence(step, 8);
    const secondSequence = createGuidedTargetSequence(step, 8);

    expect(secondSequence).toEqual(firstSequence);
    expect(hasImmediateRepeatedStrings(firstSequence)).toBe(false);
  });

  it("never emits ghost-anchor notes as falling targets", () => {
    for (const stepId of ["bc-assisted", "ef-assisted", "bcef-assisted"] as const) {
      const step = getGuidedStepById(stepId);
      const sequence = createGuidedTargetSequence(step, 11);
      const allowed = new Set(step.targetNotes);
      expect(sequence.every((target) => allowed.has(target.note))).toBe(true);
      if (stepId === "bc-assisted") {
        expect(sequence.some((target) => target.note === "A")).toBe(false);
      }
      if (stepId === "ef-assisted") {
        expect(sequence.some((target) => target.note === "D")).toBe(false);
      }
      if (stepId === "bcef-assisted") {
        expect(sequence.some((target) => target.note === "A" || target.note === "D")).toBe(false);
      }
    }
  });
});
