import { describe, expect, it } from "vitest";
import {
  buildEligibleFretboardTargets,
  createFretboardStringId,
  createFretboardTarget,
  createFretboardTargetKey,
} from "./fretboardTargets";

describe("fretboard targets", () => {
  it("creates stable semantic target identities", () => {
    expect(createFretboardTargetKey(0, 5)).toBe("standard:0:5");
    expect(createFretboardTargetKey(0, 5)).toBe(createFretboardTargetKey(0, 5));
    expect(createFretboardStringId(0)).toBe("standard:0");
    expect(createFretboardStringId(1)).not.toBe(createFretboardStringId(0));
  });

  it("calculates representative notes from standard tuning", () => {
    expect(createFretboardTarget(0, 0)).toMatchObject({
      targetKey: "standard:0:0",
      stringId: "standard:0",
      stringIndex: 0,
      fret: 0,
      note: "E",
    });
    expect(createFretboardTarget(0, 5).note).toBe("A");
    expect(createFretboardTarget(1, 1).note).toBe("C");
    expect(createFretboardTarget(5, 3).note).toBe("G");
  });

  it("filters eligible targets by selected strings and fret range", () => {
    const targets = buildEligibleFretboardTargets({
      selectedStringIndexes: [1, 3],
      minFret: 2,
      maxFret: 4,
    });

    expect(targets.map((target) => target.targetKey)).toEqual([
      "standard:1:2",
      "standard:1:3",
      "standard:1:4",
      "standard:3:2",
      "standard:3:3",
      "standard:3:4",
    ]);
  });

  it("filters eligible targets by selected notes", () => {
    const targets = buildEligibleFretboardTargets({
      selectedStringIndexes: [0, 1],
      minFret: 0,
      maxFret: 5,
      selectedNotes: ["A", "C"],
    });

    expect(targets.map((target) => target.targetKey)).toEqual([
      "standard:0:5",
      "standard:1:1",
    ]);
    expect(targets.map((target) => target.note)).toEqual(["A", "C"]);
  });

  it("includes or excludes open-string targets with fret 0 semantics", () => {
    const withOpen = buildEligibleFretboardTargets({
      selectedStringIndexes: [0],
      minFret: 0,
      maxFret: 2,
      selectedNotes: ["E", "F"],
      includeOpenStrings: true,
    });
    const withoutOpen = buildEligibleFretboardTargets({
      selectedStringIndexes: [0],
      minFret: 0,
      maxFret: 2,
      selectedNotes: ["E", "F"],
      includeOpenStrings: false,
    });

    expect(withOpen.map((target) => target.targetKey)).toEqual(["standard:0:0", "standard:0:1"]);
    expect(withoutOpen.map((target) => target.targetKey)).toEqual(["standard:0:1"]);
  });

  it("returns an empty target list when filters have no overlap", () => {
    expect(buildEligibleFretboardTargets({
      selectedStringIndexes: [0],
      minFret: 0,
      maxFret: 2,
      selectedNotes: ["B"],
    })).toEqual([]);
  });
});
