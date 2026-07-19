import { OPEN_STRING_NOTES, getNoteAtFret, type Note } from "./fretboard";

export const FRETBOARD_TARGET_TUNING_ID = "standard";

export type FretboardStringId = `${typeof FRETBOARD_TARGET_TUNING_ID}:${number}`;
export type FretboardTargetKey = `${typeof FRETBOARD_TARGET_TUNING_ID}:${number}:${number}`;

export type FretboardTarget = {
  targetKey: FretboardTargetKey;
  stringId: FretboardStringId;
  stringIndex: number;
  fret: number;
  note: Note;
};

export type BuildEligibleFretboardTargetsInput = {
  selectedStringIndexes?: readonly number[];
  minFret?: number;
  maxFret?: number;
  selectedNotes?: readonly Note[];
  includeOpenStrings?: boolean;
};

export function createFretboardStringId(stringIndex: number): FretboardStringId {
  return `${FRETBOARD_TARGET_TUNING_ID}:${stringIndex}` as FretboardStringId;
}

export function createFretboardTargetKey(stringIndex: number, fret: number): FretboardTargetKey {
  return `${FRETBOARD_TARGET_TUNING_ID}:${stringIndex}:${fret}` as FretboardTargetKey;
}

export function createFretboardTarget(stringIndex: number, fret: number): FretboardTarget {
  const normalizedFret = Math.max(0, Math.round(fret));
  return {
    targetKey: createFretboardTargetKey(stringIndex, normalizedFret),
    stringId: createFretboardStringId(stringIndex),
    stringIndex,
    fret: normalizedFret,
    note: getNoteAtFret(stringIndex, normalizedFret),
  };
}

export function buildEligibleFretboardTargets({
  selectedStringIndexes = OPEN_STRING_NOTES.map((_, index) => index),
  minFret = 0,
  maxFret = 11,
  selectedNotes,
  includeOpenStrings = true,
}: BuildEligibleFretboardTargetsInput = {}): FretboardTarget[] {
  const fretStart = Math.max(0, Math.round(minFret));
  const fretEnd = Math.max(fretStart, Math.round(maxFret));
  const selectedStringSet = new Set(selectedStringIndexes);
  const selectedNoteSet = selectedNotes ? new Set<Note>(selectedNotes) : null;
  const targets: FretboardTarget[] = [];

  for (let stringIndex = 0; stringIndex < OPEN_STRING_NOTES.length; stringIndex += 1) {
    if (!selectedStringSet.has(stringIndex)) continue;
    for (let fret = fretStart; fret <= fretEnd; fret += 1) {
      if (!includeOpenStrings && fret === 0) continue;
      const target = createFretboardTarget(stringIndex, fret);
      if (selectedNoteSet && !selectedNoteSet.has(target.note)) continue;
      targets.push(target);
    }
  }

  return targets;
}
