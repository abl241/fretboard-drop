import type { Note } from "@/lib/fretboard";
import {
  DEFAULT_GUIDED_STEP_ID,
  getGuidedStepById,
  isGuidedStepId,
} from "./guidedSteps";
import type {
  GuidedPreferredMode,
  GuidedProgress,
  GuidedProgressV1,
  GuidedStepId,
} from "./guidedTypes";

export const GUIDED_PREFERRED_MODE_STORAGE_KEY = "fretboard-drop:guided:preferred-mode:v1";
export const GUIDED_ORIENTATION_SEEN_STORAGE_KEY = "fretboard-drop:guided:orientation-seen:v1";
/** @deprecated v1 progress — read only for migration. */
export const GUIDED_PROGRESS_V1_STORAGE_KEY = "fretboard-drop:guided:progress:v1";
export const GUIDED_PROGRESS_STORAGE_KEY = "fretboard-drop:guided:progress:v2";

export const DEFAULT_GUIDED_PROGRESS = {
  currentStepId: DEFAULT_GUIDED_STEP_ID,
  completedStepIds: [],
  attemptsByStep: {},
  bestFluencyByStep: {},
  fluencyExplanationSeen: false,
} as const satisfies GuidedProgress;

const OLD_LESSON_IDS = new Set(["a", "bc", "d", "ef"]);

function isGuidedPreferredMode(value: unknown): value is GuidedPreferredMode {
  return value === "guided" || value === "free-play" || value === "name-the-note";
}

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Guided Learning is local-only. Storage failures should never block the app.
  }
}

export function readGuidedPreferredMode(): GuidedPreferredMode | null {
  const value = safeGetItem(GUIDED_PREFERRED_MODE_STORAGE_KEY);
  return isGuidedPreferredMode(value) ? value : null;
}

export function writeGuidedPreferredMode(mode: GuidedPreferredMode): void {
  safeSetItem(GUIDED_PREFERRED_MODE_STORAGE_KEY, mode);
}

export function readGuidedOrientationSeen(): boolean {
  return safeGetItem(GUIDED_ORIENTATION_SEEN_STORAGE_KEY) === "true";
}

export function writeGuidedOrientationSeen(isSeen: boolean): void {
  safeSetItem(GUIDED_ORIENTATION_SEEN_STORAGE_KEY, isSeen ? "true" : "false");
}

function clampScore(value: unknown): number {
  const score = typeof value === "number" ? value : Number(value);
  return Number.isFinite(score) ? Math.min(1000, Math.max(0, Math.round(score))) : 0;
}

function clampPercent(value: unknown): number {
  const percent = typeof value === "number" ? value : Number(value);
  return Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : 0;
}

function normalizeAttemptsByStep(value: unknown): GuidedProgress["attemptsByStep"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value).reduce<GuidedProgress["attemptsByStep"]>((attemptsByStep, [stepId, attempts]) => {
    if (!isGuidedStepId(stepId) || !Array.isArray(attempts)) return attemptsByStep;
    attemptsByStep[stepId] = attempts
      .filter((attempt): attempt is NonNullable<GuidedProgress["attemptsByStep"][typeof stepId]>[number] => {
        return Boolean(attempt) && typeof attempt === "object";
      })
      .map((attempt) => ({
        completedAt: Number.isFinite(attempt.completedAt) ? attempt.completedAt : Date.now(),
        stepId,
        guidedFluency: clampScore(attempt.guidedFluency),
        accuracy: clampPercent(attempt.accuracy),
        correct: Math.max(0, Math.round(attempt.correct)),
        wrong: Math.max(0, Math.round(attempt.wrong)),
        misses: Math.max(0, Math.round(attempt.misses)),
        targetCount: Math.max(0, Math.round(attempt.targetCount)),
        assisted: attempt.assisted === true,
      }))
      .slice(-3);
    return attemptsByStep;
  }, {});
}

function normalizeBestFluencyByStep(value: unknown): GuidedProgress["bestFluencyByStep"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value).reduce<GuidedProgress["bestFluencyByStep"]>((bestByStep, [stepId, score]) => {
    if (!isGuidedStepId(stepId)) return bestByStep;
    bestByStep[stepId] = clampScore(score);
    return bestByStep;
  }, {});
}

function normalizeGuidedProgress(value: unknown): GuidedProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_GUIDED_PROGRESS;
  }

  const maybeProgress = value as Partial<GuidedProgress>;
  const currentStepId = isGuidedStepId(maybeProgress.currentStepId)
    ? maybeProgress.currentStepId
    : DEFAULT_GUIDED_PROGRESS.currentStepId;
  const completedStepIds = Array.isArray(maybeProgress.completedStepIds)
    ? maybeProgress.completedStepIds.filter(isGuidedStepId)
    : DEFAULT_GUIDED_PROGRESS.completedStepIds;

  return {
    currentStepId,
    completedStepIds: Array.from(new Set(completedStepIds)),
    attemptsByStep: normalizeAttemptsByStep(maybeProgress.attemptsByStep),
    bestFluencyByStep: normalizeBestFluencyByStep(maybeProgress.bestFluencyByStep),
    fluencyExplanationSeen: maybeProgress.fluencyExplanationSeen === true,
  };
}

function isOldLessonId(value: string): boolean {
  return OLD_LESSON_IDS.has(value);
}

/** Infer v2 progress from legacy v1 lesson-based storage. */
export function migrateGuidedProgressFromV1(v1: GuidedProgressV1): GuidedProgress {
  const completedLessons = new Set(
    (v1.completedLessonIds ?? []).filter((id): id is string => typeof id === "string" && isOldLessonId(id)),
  );

  const completedStepIds: GuidedStepId[] = [];

  if (completedLessons.has("a")) {
    completedStepIds.push("a");
  }
  if (completedLessons.has("bc")) {
    completedStepIds.push("a", "bc-assisted", "bc-unassisted");
  }
  if (completedLessons.has("d")) {
    completedStepIds.push("a", "bc-assisted", "bc-unassisted", "abc-mix", "d");
  }
  if (completedLessons.has("ef")) {
    completedStepIds.push(
      "a",
      "bc-assisted",
      "bc-unassisted",
      "abc-mix",
      "d",
      "ef-assisted",
      "ef-unassisted",
      "def-mix",
    );
  }

  let currentStepId: GuidedStepId = "a";
  if (completedLessons.has("ef")) {
    currentStepId = "bcef-assisted";
  } else if (completedLessons.has("d")) {
    currentStepId = "ef-assisted";
  } else if (completedLessons.has("bc")) {
    currentStepId = "abc-mix";
  } else if (completedLessons.has("a")) {
    currentStepId = "bc-assisted";
  }

  const currentLesson = typeof v1.currentLessonId === "string" ? v1.currentLessonId : null;
  const anchorStages = v1.anchorStages ?? {};

  if (currentLesson === "a" && !completedLessons.has("a")) {
    currentStepId = "a";
  } else if (currentLesson === "bc" && !completedLessons.has("bc")) {
    currentStepId = anchorStages.bc === "unassisted" ? "bc-unassisted" : "bc-assisted";
  } else if (currentLesson === "d" && !completedLessons.has("d")) {
    currentStepId = "d";
  } else if (currentLesson === "ef" && !completedLessons.has("ef")) {
    currentStepId = anchorStages.ef === "unassisted" ? "ef-unassisted" : "ef-assisted";
  }

  return normalizeGuidedProgress({
    currentStepId,
    completedStepIds: Array.from(new Set(completedStepIds)),
    attemptsByStep: {},
    bestFluencyByStep: {},
    fluencyExplanationSeen: v1.fluencyExplanationSeen === true,
  });
}

function readRawV1Progress(): GuidedProgressV1 | null {
  const raw = safeGetItem(GUIDED_PROGRESS_V1_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuidedProgressV1;
  } catch {
    return null;
  }
}

export function readGuidedProgress(): GuidedProgress {
  const rawV2 = safeGetItem(GUIDED_PROGRESS_STORAGE_KEY);
  if (rawV2) {
    try {
      return normalizeGuidedProgress(JSON.parse(rawV2));
    } catch {
      return DEFAULT_GUIDED_PROGRESS;
    }
  }

  const v1 = readRawV1Progress();
  if (v1) {
    const migrated = migrateGuidedProgressFromV1(v1);
    writeGuidedProgress(migrated);
    return migrated;
  }

  return DEFAULT_GUIDED_PROGRESS;
}

export function writeGuidedProgress(progress: GuidedProgress): void {
  safeSetItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify(normalizeGuidedProgress(progress)));
}

/** Preview notes for intro/preview screens — target notes only, never ghost-only anchors. */
export function getGuidedPreviewNotes(stepId: GuidedStepId): readonly Note[] {
  return getGuidedStepById(stepId).targetNotes;
}
