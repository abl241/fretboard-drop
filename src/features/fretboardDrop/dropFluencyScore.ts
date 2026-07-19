import type { DropPracticeContext, DropRunFormat, DropSpeedMode, DropStringSelection } from "./dropGameTypes";
import { DEFAULT_DROP_RUN_FORMAT, DEFAULT_RETURNING_DROP_SPEED_MODE, createPracticeNoteKey, getStringSelectionKey } from "./dropGameUtils";

export const DROP_FLUENCY_SCORE_VERSION = "v1";
export const DROP_BEST_FLUENCY_SCORE_KEY = `fretboard-drop:best-fluency-score:${DROP_FLUENCY_SCORE_VERSION}`;

export type DropFluencyScoreInput = {
  correct: number;
  accuracy: number;
  bestStreak: number;
  misses: number;
  wrong: number;
  hitProgresses?: readonly number[];
};

export const DROP_FLUENCY_SCORE_LABELS = [
  { minScore: 0, label: "Getting started" },
  { minScore: 300, label: "Building recall" },
  { minScore: 500, label: "Solid run" },
  { minScore: 700, label: "Strong fluency" },
  { minScore: 850, label: "Excellent" },
  { minScore: 930, label: "Elite" },
  { minScore: 980, label: "Legendary!" },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getAverageHitProgress(hitProgresses: readonly number[] = []): number | null {
  if (hitProgresses.length < 3) return null;
  const total = hitProgresses.reduce((sum, progress) => sum + clamp(progress, 0, 1), 0);
  return total / hitProgresses.length;
}

export function calculateFluencyScore(input: DropFluencyScoreInput): number {
  const correct = Math.max(0, input.correct);
  const accuracy = clamp(input.accuracy, 0, 100);
  const bestStreak = Math.max(0, input.bestStreak);
  const misses = Math.max(0, input.misses);
  const wrong = Math.max(0, input.wrong);
  const averageHitProgress = getAverageHitProgress(input.hitProgresses);

  const volumeScore = Math.sqrt(clamp(correct / 40, 0, 1)) * 500;
  const accuracyScore = Math.pow(accuracy / 100, 2.6) * 300;
  const streakScore = Math.sqrt(clamp(bestStreak / 25, 0, 1)) * 150;
  const cleanlinessPenalty = clamp(misses * 0.1 + wrong * 0.06, 0, 1);
  const cleanlinessScore = correct > 0 ? (1 - cleanlinessPenalty) * 50 : 0;
  const instantRecallScore = averageHitProgress === null
    ? 0
    : Math.pow(clamp((0.62 - averageHitProgress) / 0.52, 0, 1), 1.4) * 50;
  let maxScore = 1000;

  if (averageHitProgress === null) maxScore = Math.min(maxScore, 929);
  else if (averageHitProgress > 0.6) maxScore = Math.min(maxScore, 900);
  else if (averageHitProgress > 0.5) maxScore = Math.min(maxScore, 925);
  else if (averageHitProgress > 0.4) maxScore = Math.min(maxScore, 949);
  else if (averageHitProgress > 0.3) maxScore = Math.min(maxScore, 979);
  else if (averageHitProgress > 0.22) maxScore = Math.min(maxScore, 990);

  if (misses > 0) maxScore = Math.min(maxScore, 930 - Math.min(misses - 1, 4) * 70);
  if (wrong > 0) maxScore = Math.min(maxScore, 930 - Math.min(wrong, 8) * 25);
  if (misses > 0 && accuracy < 95) maxScore = Math.min(maxScore, 849);
  if (accuracy < 95) maxScore = Math.min(maxScore, 900);
  if (accuracy < 90) maxScore = Math.min(maxScore, 849);
  if (accuracy < 85) maxScore = Math.min(maxScore, 699);
  if (accuracy < 75) maxScore = Math.min(maxScore, 549);

  return Math.round(clamp(volumeScore + accuracyScore + streakScore + cleanlinessScore + instantRecallScore, 0, maxScore));
}

export function getFluencyScoreLabel(score: number): string {
  const normalizedScore = clamp(Math.round(score), 0, 1000);
  for (let index = DROP_FLUENCY_SCORE_LABELS.length - 1; index >= 0; index -= 1) {
    const threshold = DROP_FLUENCY_SCORE_LABELS[index];
    if (normalizedScore >= threshold.minScore) return threshold.label;
  }
  return DROP_FLUENCY_SCORE_LABELS[0].label;
}

export function getNextFluencyScoreLabelTarget(score: number): { minScore: number; label: string; pointsAway: number } | null {
  const normalizedScore = clamp(Math.round(score), 0, 1000);
  const nextLabel = DROP_FLUENCY_SCORE_LABELS.find((threshold) => normalizedScore < threshold.minScore);
  if (!nextLabel) return null;
  return {
    ...nextLabel,
    pointsAway: nextLabel.minScore - normalizedScore,
  };
}

function getBestFluencyScoreStorageKey(
  selection: DropStringSelection,
  practiceContext: DropPracticeContext,
  speedMode?: DropSpeedMode,
  runFormat?: DropRunFormat | "timed",
): string {
  const stringKey = getStringSelectionKey(selection);
  const practiceKey = createPracticeNoteKey(practiceContext);
  const baseKey = practiceKey === "all-naturals"
    ? `${DROP_BEST_FLUENCY_SCORE_KEY}:strings:${stringKey}`
    : `${DROP_BEST_FLUENCY_SCORE_KEY}:strings:${stringKey}:practice:${practiceKey}`;
  const speedScopedKey = speedMode ? `${baseKey}:speed:${speedMode}` : baseKey;
  return runFormat ? `${speedScopedKey}:format:${runFormat}` : speedScopedKey;
}

function parseStoredBestFluencyScore(raw: string | null): number {
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) && value > 0 ? clamp(value, 0, 1000) : 0;
}

export function readBestFluencyScore(
  selection: DropStringSelection,
  practiceContext: DropPracticeContext,
  speedMode?: DropSpeedMode,
  runFormat: DropRunFormat = DEFAULT_DROP_RUN_FORMAT,
): number {
  try {
    const scopedScore = parseStoredBestFluencyScore(window.localStorage.getItem(getBestFluencyScoreStorageKey(selection, practiceContext, speedMode, runFormat)));
    if (scopedScore > 0) return scopedScore;
    if (runFormat === "timed-trial") {
      const legacyTimedScore = parseStoredBestFluencyScore(window.localStorage.getItem(getBestFluencyScoreStorageKey(selection, practiceContext, speedMode, "timed")));
      if (legacyTimedScore > 0) return legacyTimedScore;
    }
    if (speedMode && speedMode !== DEFAULT_RETURNING_DROP_SPEED_MODE) return 0;
    const formatScopedLegacyScore = parseStoredBestFluencyScore(window.localStorage.getItem(getBestFluencyScoreStorageKey(selection, practiceContext, undefined, runFormat)));
    if (formatScopedLegacyScore > 0) return formatScopedLegacyScore;
    return parseStoredBestFluencyScore(window.localStorage.getItem(getBestFluencyScoreStorageKey(selection, practiceContext)));
  } catch {
    return 0;
  }
}

export function writeBestFluencyScore(
  score: number,
  selection: DropStringSelection,
  practiceContext: DropPracticeContext,
  speedMode?: DropSpeedMode,
  runFormat: DropRunFormat = DEFAULT_DROP_RUN_FORMAT,
): void {
  try {
    window.localStorage.setItem(getBestFluencyScoreStorageKey(selection, practiceContext, speedMode, runFormat), String(clamp(Math.round(score), 0, 1000)));
  } catch {
    // Fluency best is nice-to-have local state only.
  }
}
