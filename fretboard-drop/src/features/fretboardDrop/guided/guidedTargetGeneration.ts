import { getNoteAtFret, type Note } from "@/lib/fretboard";
import {
  ALL_DROP_STRING_INDEXES,
  DROP_MAX_FRET,
  DROP_MIN_FRET,
} from "../dropGameUtils";
import type { DropStringIndex } from "../dropGameTypes";
import { getGuidedStepById } from "./guidedSteps";
import type { GuidedStepDefinition, GuidedStepId, GuidedTarget } from "./guidedTypes";

export const GUIDED_TARGET_GENERATION_VERSION = "guided-targets-v2";

type GuidedTargetPlan = {
  note: Note;
  preferredString?: DropStringIndex;
};

export function createGuidedTargetSequence(
  step: GuidedStepDefinition,
  seed = 1,
): readonly GuidedTarget[] {
  const plan = createGuidedTargetPlan(step, seed);
  const previousCells = new Set<string>();
  let previousGeneratedTarget: GuidedTarget | null = null;

  return plan.map((plannedTarget, index) => {
    const stringIndex = chooseStringForNote(plannedTarget.note, {
      seed: seed + index,
      preferredString: plannedTarget.preferredString,
      previousTarget: previousGeneratedTarget,
      previousCells,
    });
    const fret = getFretForNoteOnString(plannedTarget.note, stringIndex);
    previousCells.add(createGuidedCellKey(stringIndex, fret));
    const target = {
      id: index + 1,
      note: plannedTarget.note,
      stringIndex,
      fret,
      durationMs: step.durationMs,
      startedAt: 0,
    };
    previousGeneratedTarget = target;
    return target;
  });
}

export function createGuidedTargetSequenceForStepId(stepId: GuidedStepId, seed = 1): readonly GuidedTarget[] {
  return createGuidedTargetSequence(getGuidedStepById(stepId), seed);
}

export function getGuidedTargetDurationMs(stepId: GuidedStepId): number {
  return getGuidedStepById(stepId).durationMs;
}

export function getGuidedPreviewCells(notes: readonly Note[]): readonly Pick<GuidedTarget, "note" | "stringIndex" | "fret">[] {
  return notes.flatMap((note) => (
    ALL_DROP_STRING_INDEXES.map((stringIndex) => ({
      note,
      stringIndex,
      fret: getFretForNoteOnString(note, stringIndex),
    }))
  ));
}

export function createGuidedCellKey(stringIndex: DropStringIndex, fret: number): string {
  return `${stringIndex}:${fret}`;
}

function createGuidedTargetPlan(step: GuidedStepDefinition, seed: number): readonly GuidedTargetPlan[] {
  const allowedNotes = [...step.targetNotes];
  if (allowedNotes.length === 1) {
    return createSingleNotePlan(allowedNotes[0], step.targetCount, seed);
  }
  return createBalancedMultiNotePlan(allowedNotes, step.targetCount, seed);
}

function createSingleNotePlan(note: Note, targetCount: number, seed: number): readonly GuidedTargetPlan[] {
  const requiredStrings = rotateStrings([0, 2, 4, 1, 3, 5], seed);
  const extras = targetCount - requiredStrings.length;
  const plan: GuidedTargetPlan[] = requiredStrings.map((stringIndex) => ({
    note,
    preferredString: stringIndex,
  }));

  for (let index = 0; index < extras; index += 1) {
    plan.push({
      note,
      preferredString: requiredStrings[(index + 1) % requiredStrings.length],
    });
  }

  return plan.slice(0, targetCount);
}

function createBalancedMultiNotePlan(
  notes: readonly Note[],
  targetCount: number,
  seed: number,
): readonly GuidedTargetPlan[] {
  const rotatedNotes = rotateNotes(notes, seed);
  const plan: GuidedTargetPlan[] = [];

  for (const note of rotatedNotes) {
    plan.push({ note });
  }

  let noteIndex = 0;
  while (plan.length < targetCount) {
    const note = rotatedNotes[noteIndex % rotatedNotes.length];
    if (!wouldCreateTripleRun(plan, note)) {
      plan.push({ note });
    } else {
      const alternate = rotatedNotes[(noteIndex + 1) % rotatedNotes.length];
      plan.push({ note: alternate });
      noteIndex += 1;
    }
    noteIndex += 1;
  }

  return rotatePlan(plan, seed);
}

function wouldCreateTripleRun(plan: readonly GuidedTargetPlan[], note: Note): boolean {
  const length = plan.length;
  if (length < 2) return false;
  return plan[length - 1].note === note && plan[length - 2].note === note;
}

function rotatePlan(plan: readonly GuidedTargetPlan[], seed: number): readonly GuidedTargetPlan[] {
  if (plan.length === 0) return plan;
  const offset = Math.abs(seed) % plan.length;
  return [...plan.slice(offset), ...plan.slice(0, offset)];
}

function rotateNotes(notes: readonly Note[], seed: number): readonly Note[] {
  if (notes.length === 0) return notes;
  const offset = Math.abs(seed) % notes.length;
  return [...notes.slice(offset), ...notes.slice(0, offset)];
}

function rotateStrings(strings: readonly DropStringIndex[], seed: number): readonly DropStringIndex[] {
  const offset = Math.abs(seed) % strings.length;
  return [...strings.slice(offset), ...strings.slice(0, offset)];
}

function chooseStringForNote(
  note: Note,
  {
    seed,
    preferredString,
    previousTarget,
    previousCells,
  }: {
    seed: number;
    preferredString?: DropStringIndex;
    previousTarget: GuidedTarget | null;
    previousCells: Set<string>;
  },
): DropStringIndex {
  const options = rotateStrings(ALL_DROP_STRING_INDEXES, seed);
  const preferredOptions = preferredString === undefined
    ? options
    : [preferredString, ...options.filter((stringIndex) => stringIndex !== preferredString)];

  return preferredOptions.find((stringIndex) => {
    const fret = getFretForNoteOnString(note, stringIndex);
    const cellKey = createGuidedCellKey(stringIndex, fret);
    const repeatsString = previousTarget?.stringIndex === stringIndex;
    const repeatsCell = previousTarget
      ? createGuidedCellKey(previousTarget.stringIndex, previousTarget.fret) === cellKey
      : false;
    return !repeatsCell && !previousCells.has(cellKey) && !repeatsString;
  }) ?? preferredOptions.find((stringIndex) => {
    const fret = getFretForNoteOnString(note, stringIndex);
    const cellKey = createGuidedCellKey(stringIndex, fret);
    const repeatsCell = previousTarget
      ? createGuidedCellKey(previousTarget.stringIndex, previousTarget.fret) === cellKey
      : false;
    return !repeatsCell && !previousCells.has(cellKey);
  }) ?? preferredOptions.find((stringIndex) => {
    const fret = getFretForNoteOnString(note, stringIndex);
    const repeatsString = previousTarget?.stringIndex === stringIndex;
    const repeatsCell = previousTarget
      ? createGuidedCellKey(previousTarget.stringIndex, previousTarget.fret) === createGuidedCellKey(stringIndex, fret)
      : false;
    return !repeatsCell && !repeatsString;
  }) ?? preferredOptions.find((stringIndex) => {
    const fret = getFretForNoteOnString(note, stringIndex);
    const repeatsCell = previousTarget
      ? createGuidedCellKey(previousTarget.stringIndex, previousTarget.fret) === createGuidedCellKey(stringIndex, fret)
      : false;
    return !repeatsCell;
  }) ?? preferredOptions[0];
}

export function getFretForNoteOnString(note: Note, stringIndex: DropStringIndex): number {
  for (let fret = DROP_MIN_FRET; fret <= DROP_MAX_FRET; fret += 1) {
    if (getNoteAtFret(stringIndex, fret) === note) return fret;
  }
  return DROP_MIN_FRET;
}

/** True when every allowed note appears at least once in the generated sequence. */
export function sequenceIncludesAllTargetNotes(
  step: GuidedStepDefinition,
  sequence: readonly GuidedTarget[],
): boolean {
  const notesInSequence = new Set(sequence.map((target) => target.note));
  return step.targetNotes.every((note) => notesInSequence.has(note));
}

/** Ghost-anchor notes must never appear as falling targets. */
export function sequenceRespectsTargetPool(step: GuidedStepDefinition, sequence: readonly GuidedTarget[]): boolean {
  const allowed = new Set(step.targetNotes);
  return sequence.every((target) => allowed.has(target.note));
}
