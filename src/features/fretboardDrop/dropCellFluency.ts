import type { CellProgressRecord, CellResolutionSample } from "./dropCellProgress";

export const DROP_CELL_FLUENCY_SCORE_VERSION = "cell-fluency-v1";

export const DROP_CELL_FLUENCY_WEIGHTS = {
  accuracy: 0.4,
  speed: 0.3,
  consistency: 0.2,
  errorPenalty: 0.1,
} as const;

export type CellFluencyEvidenceLevel =
  | "not-enough-data"
  | "early-estimate"
  | "developing-confidence"
  | "established";

export type CellFluencyDimensions = {
  accuracyScore: number;
  speedScore: number;
  consistencyScore: number;
  errorPenaltyScore: number;
};

export type CellFluencyResult = {
  scoringVersion: typeof DROP_CELL_FLUENCY_SCORE_VERSION;
  score: number | null;
  evidenceLevel: CellFluencyEvidenceLevel;
  attempts: number;
  distinctPracticeDays: number;
  dimensions: CellFluencyDimensions;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeCount(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue)) : 0;
}

function safeScore(value: number): number {
  return Math.round(clamp(value, 0, 1000));
}

function getEvidenceLevel(attempts: number): CellFluencyEvidenceLevel {
  if (attempts < 3) return "not-enough-data";
  if (attempts < 5) return "early-estimate";
  if (attempts < 12) return "developing-confidence";
  return "established";
}

function getDistinctPracticeDays(record: Partial<CellProgressRecord>): number {
  if (!Array.isArray(record.practicedDateKeys)) return 0;
  return new Set(record.practicedDateKeys.filter((dateKey) => typeof dateKey === "string" && dateKey.length > 0)).size;
}

function getRecentResolutionSamples(record: Partial<CellProgressRecord>): CellResolutionSample[] {
  if (!Array.isArray(record.recentResolutions)) return [];
  return record.recentResolutions.filter((sample): sample is CellResolutionSample => (
    !!sample
    && typeof sample === "object"
    && (sample as Partial<CellResolutionSample>).occurredAt !== undefined
    && ((sample as Partial<CellResolutionSample>).outcome === "correct" || (sample as Partial<CellResolutionSample>).outcome === "miss")
  ));
}

function getAccuracyScore(correctHits: number, resolvedTargets: number): number {
  if (resolvedTargets <= 0) return 0;
  const accuracy = clamp(correctHits / resolvedTargets, 0, 1);
  return safeScore(Math.pow(accuracy, 2) * 1000);
}

function getSpeedScore(record: Partial<CellProgressRecord>): number {
  const hitProgressCount = safeCount(record.hitProgressCount);
  const hitProgressSum = Math.max(0, Number(record.hitProgressSum) || 0);
  if (hitProgressCount <= 0) return 0;

  const averageHitProgress = clamp(hitProgressSum / hitProgressCount, 0, 1);
  const instantRecallValue = clamp((0.68 - averageHitProgress) / 0.58, 0, 1);
  return safeScore(Math.pow(instantRecallValue, 1.25) * 1000);
}

function getConsistencyScore(record: Partial<CellProgressRecord>): number {
  const recentResolutions = getRecentResolutionSamples(record);
  if (recentResolutions.length === 0) return 0;

  const recentCorrect = recentResolutions.filter((sample) => sample.outcome === "correct").length;
  const recentCorrectRate = clamp(recentCorrect / recentResolutions.length, 0, 1);
  return safeScore(Math.pow(recentCorrectRate, 1.15) * 1000);
}

export function getWeightedWrongCount(record: Partial<CellProgressRecord>): number {
  return safeCount(record.adjacentWrongTaps) * 0.5 + safeCount(record.otherWrongTaps);
}

function getErrorPenaltyScore(record: Partial<CellProgressRecord>, resolvedTargets: number, misses: number): number {
  const weightedWrongCount = getWeightedWrongCount(record);
  const totalErrorBurden = misses + weightedWrongCount;
  const totalOpportunities = resolvedTargets + weightedWrongCount;
  if (totalOpportunities <= 0) return 1000;

  const errorRate = clamp(totalErrorBurden / totalOpportunities, 0, 1);
  return safeScore(Math.pow(1 - errorRate, 1.1) * 1000);
}

export function calculateCellFluency(record: Partial<CellProgressRecord> | null | undefined): CellFluencyResult {
  const safeRecord = record ?? {};
  const resolvedTargets = safeCount(safeRecord.resolvedTargets);
  const correctHits = Math.min(safeCount(safeRecord.correctHits), resolvedTargets);
  const misses = Math.min(safeCount(safeRecord.misses), resolvedTargets);
  const evidenceLevel = getEvidenceLevel(resolvedTargets);
  const dimensions: CellFluencyDimensions = {
    accuracyScore: getAccuracyScore(correctHits, resolvedTargets),
    speedScore: getSpeedScore(safeRecord),
    consistencyScore: getConsistencyScore(safeRecord),
    errorPenaltyScore: getErrorPenaltyScore(safeRecord, resolvedTargets, misses),
  };

  if (evidenceLevel === "not-enough-data") {
    return {
      scoringVersion: DROP_CELL_FLUENCY_SCORE_VERSION,
      score: null,
      evidenceLevel,
      attempts: resolvedTargets,
      distinctPracticeDays: getDistinctPracticeDays(safeRecord),
      dimensions,
    };
  }

  const weightedScore =
    dimensions.accuracyScore * DROP_CELL_FLUENCY_WEIGHTS.accuracy
    + dimensions.speedScore * DROP_CELL_FLUENCY_WEIGHTS.speed
    + dimensions.consistencyScore * DROP_CELL_FLUENCY_WEIGHTS.consistency
    + dimensions.errorPenaltyScore * DROP_CELL_FLUENCY_WEIGHTS.errorPenalty;

  return {
    scoringVersion: DROP_CELL_FLUENCY_SCORE_VERSION,
    score: safeScore(weightedScore),
    evidenceLevel,
    attempts: resolvedTargets,
    distinctPracticeDays: getDistinctPracticeDays(safeRecord),
    dimensions,
  };
}
