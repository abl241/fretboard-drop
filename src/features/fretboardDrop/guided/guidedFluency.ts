import type { DropStringIndex } from "../dropGameTypes";
import { clamp } from "../dropGameUtils";
import type { GuidedAttemptSummary, GuidedResultBand, GuidedStepDefinition } from "./guidedTypes";

export const GUIDED_FLUENCY_SCORE_VERSION = "guided-fluency-v1";

export type GuidedFluencyInput = {
  step: GuidedStepDefinition;
  correct: number;
  wrong: number;
  misses: number;
  hitProgresses: readonly number[];
  bestStreak: number;
  successfulStringIndexes: readonly DropStringIndex[];
  requiredStringIndexes: readonly DropStringIndex[];
};

export type GuidedFluencyResult = {
  guidedFluency: number;
  accuracy: number;
  recallSpeedScore: number;
  coverageScore: number;
  consistencyScore: number;
};

export function calculateGuidedAccuracy(correct: number, wrong: number, misses: number): number {
  const total = correct + wrong + misses;
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

export function calculateGuidedFluency(input: GuidedFluencyInput): GuidedFluencyResult {
  const accuracy = calculateGuidedAccuracy(input.correct, input.wrong, input.misses);
  const accuracyScore = accuracy / 100;
  const recallSpeedScore = getRecallSpeedScore(input.hitProgresses);
  const coverageScore = getCoverageScore(input.successfulStringIndexes, input.requiredStringIndexes);
  const consistencyScore = input.step.targetCount > 0
    ? clamp(input.bestStreak / input.step.targetCount, 0, 1)
    : 0;

  const guidedFluency = Math.round(
    accuracyScore * 400
    + recallSpeedScore * 350
    + coverageScore * 150
    + consistencyScore * 100,
  );

  return {
    guidedFluency: clamp(guidedFluency, 0, 1000),
    accuracy,
    recallSpeedScore: Math.round(recallSpeedScore * 100),
    coverageScore: Math.round(coverageScore * 100),
    consistencyScore: Math.round(consistencyScore * 100),
  };
}

export function getGuidedResultBand(guidedFluency: number): GuidedResultBand {
  if (guidedFluency >= 750) return "ready";
  if (guidedFluency >= 600) return "almost-ready";
  return "learning";
}

export function getGuidedPresentationBand(guidedFluency: number, isReady: boolean): GuidedResultBand {
  if (isReady) return "ready";
  if (guidedFluency >= 600) return "almost-ready";
  return "learning";
}

export function isGuidedLessonReady({
  guidedFluency,
  accuracy,
  wrong,
  misses,
  coverageMet,
  assisted,
  attempts,
}: {
  guidedFluency: number;
  accuracy: number;
  wrong: number;
  misses: number;
  coverageMet: boolean;
  assisted: boolean;
  attempts: readonly GuidedAttemptSummary[];
}): boolean {
  if (assisted || !coverageMet) return false;
  if (guidedFluency >= 750 && accuracy >= 90 && wrong + misses <= 1) return true;
  if (guidedFluency >= 700 && accuracy >= 85) return true;

  const recentAttempts = [...attempts, {
    completedAt: Date.now(),
    stepId: "a",
    guidedFluency,
    accuracy,
    correct: 0,
    wrong,
    misses,
    targetCount: 0,
    assisted: false,
  }].slice(-3);
  return recentAttempts
    .filter((attempt) => !attempt.assisted)
    .filter((attempt) => attempt.guidedFluency >= 600 && attempt.accuracy >= 85)
    .length >= 2;
}

export function getCoverageMet(successfulStringIndexes: readonly DropStringIndex[], requiredStringIndexes: readonly DropStringIndex[]): boolean {
  const successful = new Set(successfulStringIndexes);
  return requiredStringIndexes.every((stringIndex) => successful.has(stringIndex));
}

function getCoverageScore(successfulStringIndexes: readonly DropStringIndex[], requiredStringIndexes: readonly DropStringIndex[]): number {
  if (requiredStringIndexes.length === 0) return 1;
  const successful = new Set(successfulStringIndexes);
  const coveredCount = requiredStringIndexes.filter((stringIndex) => successful.has(stringIndex)).length;
  return clamp(coveredCount / requiredStringIndexes.length, 0, 1);
}

function getRecallSpeedScore(hitProgresses: readonly number[]): number {
  if (hitProgresses.length === 0) return 0;
  const averageCredit = hitProgresses.reduce((sum, progress) => {
    return sum + clamp(1 - progress, 0, 1);
  }, 0) / hitProgresses.length;
  return clamp(averageCredit, 0, 1);
}
