import type { Note } from "@/lib/fretboard";
import type { FretboardStringId, FretboardTargetKey } from "@/lib/fretboardTargets";
import type { FretboardCellId } from "./dropCellProgress";
import type { DropRunTrend } from "./dropRunHistory";

export type DropGameStatus = "start" | "playing" | "complete";

export type DropStringIndex = 0 | 1 | 2 | 3 | 4 | 5;

export type DropStringSelection = readonly DropStringIndex[];

export type DropTargetVisualRole = "active-target" | "upcoming-target";

export type DropVisibleTargetContext = {
  id: number;
  stringIndex: DropStringIndex;
  role: DropTargetVisualRole;
};

export type DropStringVisualState = "unselected" | "selected-inactive" | DropTargetVisualRole;

export type DropPracticeContext =
  | {
      practiceType: "string-focus";
      selectedNotes: null;
    }
  | {
      practiceType: "note-focus";
      selectedNotes: readonly Note[];
    };

export type DropPromptStagePosition = {
  stageXPercent: number;
  stageYPercent: number;
};

export type DropTarget = {
  id: number;
  targetKey: FretboardTargetKey;
  stringId: FretboardStringId;
  note: Note;
  stringIndex: DropStringIndex;
  fret: number;
  startedAt: number;
  durationMs: number;
  stageXPercent: number;
  stageYPercent: number;
};

export type DropRunMode = "normal" | "focus";

export type DropRunFormat = "timed" | "survival";

export type DropSpeedMode = "warm-up" | "practice-tempo" | "performance-tempo";

export type DropFocusPoolCell = {
  cellId: FretboardCellId;
  note: Note;
  stringIndex: DropStringIndex;
  fret: number;
  fluencyScore: number;
};

export type DropFeedback = {
  id: number;
  stringIndex: number;
  fret: number;
  kind: "correct" | "wrong";
  note: Note;
};

export type DropMissReveal = {
  id: number;
  stringIndex: DropStringIndex;
  fret: number;
  note: Note;
  score: number;
  completesRun: boolean;
};

export type DropStageCue = {
  id: number;
  kind: "correct" | "wrong" | "miss" | "tier-up";
  note: Note;
  message: string;
};

export type DropGameState = {
  status: DropGameStatus;
  fallingTargets: readonly DropTarget[];
  score: number;
  combo: number;
  lives: number;
  timeLeftMs: number;
  correct: number;
  wrong: number;
  misses: number;
  bestStreak: number;
  recentHitProgresses: readonly number[];
  hitProgresses: readonly number[];
  runStartedAt: number;
  now: number;
  targetSeed: number;
  nextStreamSpawnAt: number;
  lastStreamNote?: Note;
  feedback: DropFeedback | null;
  missReveal: DropMissReveal | null;
  stageCue: DropStageCue | null;
  stringSelection: DropStringSelection;
  practiceContext: DropPracticeContext;
  runMode: DropRunMode;
  runFormat: DropRunFormat;
  isHorizontalMode: boolean;
  speedMode: DropSpeedMode;
  focusPool: readonly DropFocusPoolCell[];
  bestScoreAtStart: number;
};

export type DropGameResult = {
  score: number;
  fluencyScore: number;
  accuracy: number;
  bestStreak: number;
  misses: number;
  wrong: number;
  correct: number;
  averageHitProgress: number | null;
  trend: DropRunTrend;
  isNewPersonalBest: boolean;
  isNewFluencyBest: boolean;
  runMode: DropRunMode;
  runFormat: DropRunFormat;
  speedMode: DropSpeedMode;
  focusPoolSize: number;
};
