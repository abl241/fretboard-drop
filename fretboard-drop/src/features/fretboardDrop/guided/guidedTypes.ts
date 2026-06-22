import type { Note } from "@/lib/fretboard";
import type { DropStringIndex } from "../dropGameTypes";

export type GuidedPreferredMode = "guided" | "free-play";

export type GuidedStepId =
  | "a"
  | "bc-assisted"
  | "bc-unassisted"
  | "abc-mix"
  | "d"
  | "ef-assisted"
  | "ef-unassisted"
  | "def-mix"
  | "bcef-assisted"
  | "bcef-unassisted"
  | "abcdef-mix"
  | "g"
  | "abcdefg-mix";

/** Maps falling target notes to ghost-anchor notes shown on the fretboard (visual only). */
export type GuidedGhostAnchorMap = Readonly<Partial<Record<Note, Note>>>;

export type GuidedStepDefinition = {
  id: GuidedStepId;
  levelNumber: number;
  partLabel: string;
  title: string;
  introTitle: string;
  playTitle: string;
  targetNotes: readonly Note[];
  ghostAnchors: GuidedGhostAnchorMap | null;
  targetCount: number;
  durationMs: number;
  introCopy: string;
  previewCopy: string;
  completionCopy: string;
  isAssisted: boolean;
  isFinalRepeatable: boolean;
  stepNumber: number;
  totalDisplayedSteps: number;
};

export type GuidedLessonPhase = "intro" | "preview" | "countdown" | "playing" | "correction" | "results";

export type GuidedResultBand = "ready" | "almost-ready" | "learning";

export type GuidedTarget = {
  id: number;
  note: Note;
  stringIndex: DropStringIndex;
  fret: number;
  durationMs: number;
  startedAt: number;
};

export type GuidedAttemptSummary = {
  completedAt: number;
  stepId: GuidedStepId;
  guidedFluency: number;
  accuracy: number;
  correct: number;
  wrong: number;
  misses: number;
  targetCount: number;
  assisted: boolean;
};

export type GuidedProgress = {
  currentStepId: GuidedStepId;
  completedStepIds: readonly GuidedStepId[];
  attemptsByStep: Partial<Record<GuidedStepId, readonly GuidedAttemptSummary[]>>;
  bestFluencyByStep: Partial<Record<GuidedStepId, number>>;
  fluencyExplanationSeen: boolean;
};

/** @deprecated v1 shape — read only for migration. */
export type GuidedProgressV1 = {
  currentLessonId?: string;
  completedLessonIds?: readonly string[];
  attemptsByLesson?: Record<string, unknown>;
  bestFluencyByLesson?: Record<string, unknown>;
  anchorStages?: Record<string, unknown>;
  fluencyExplanationSeen?: boolean;
};
