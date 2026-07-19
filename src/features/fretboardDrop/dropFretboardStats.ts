import { getNoteAtFret, type Note } from "@/lib/fretboard";
import { calculateCellFluency, type CellFluencyEvidenceLevel, type CellFluencyResult } from "./dropCellFluency";
import { createFretboardCellId, type CellProgressRecord, type FretboardCellId } from "./dropCellProgress";
import { DROP_FLUENCY_SCORE_LABELS } from "./dropFluencyScore";
import { ALL_DROP_STRING_INDEXES, CURRENT_DROP_NOTE_POOL, DROP_MAX_FRET, DROP_MIN_FRET, getStringFocusLabel, normalizePracticeNotes } from "./dropGameUtils";
import type { DropStringIndex } from "./dropGameTypes";
import type { DropFocusPoolCell } from "./dropGameTypes";

export const DROP_STATS_METRICS = ["fluency", "recall-speed", "accuracy", "attempts"] as const;

export type DropStatsMetric = (typeof DROP_STATS_METRICS)[number];

export type DropStatsFilters = {
  selectedNotes: readonly Note[];
  selectedStrings: readonly DropStringIndex[];
};

export type DropStatsCellViewModel = {
  cellId: FretboardCellId;
  stringIndex: DropStringIndex;
  stringLabel: string;
  fret: number;
  note: Note;
  progress: CellProgressRecord | null;
  fluency: CellFluencyResult;
  metricValue: number | null;
  metricLabel: string;
  strength: number | null;
  evidenceLevel: CellFluencyEvidenceLevel;
  isScored: boolean;
  isFilteredIn: boolean;
  accessibleLabel: string;
};

export type DropStatsLegend = {
  entries: readonly {
    label: string;
    color: string;
  }[];
  accessibleLabel: string;
};

export type DropStatsCellVisual = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  mutedTextColor: string;
  boxShadow: string;
  sideColor: string;
  categoryLabel: string;
};

export type DropStats3DRotation = {
  pitch: number;
  yaw: number;
};

export type DropStats3DViewPresetId = "top" | "angle" | "profile";

export type DropStatsPerformanceCategoryId =
  | "no-score"
  | "needs-work"
  | "developing"
  | "solid"
  | "strong";

export type DropStatsPerformanceCategory = {
  id: DropStatsPerformanceCategoryId;
  label: "No score" | "Needs work" | "Developing" | "Solid" | "Strong";
  color: string;
  borderColor: string;
  textColor: string;
  mutedTextColor: string;
  boxShadow: string;
};

export const DROP_FOCUS_PRACTICE_THRESHOLD_OPTIONS = [
  { value: "needs-work", label: "Needs work only", maxScoreExclusive: DROP_FLUENCY_SCORE_LABELS.find((label) => label.label === "Building recall")?.minScore ?? 300 },
  { value: "developing", label: "Needs work + Developing", maxScoreExclusive: DROP_FLUENCY_SCORE_LABELS.find((label) => label.label === "Solid run")?.minScore ?? 500 },
  { value: "below-strong", label: "Below Strong", maxScoreExclusive: DROP_FLUENCY_SCORE_LABELS.find((label) => label.label === "Strong fluency")?.minScore ?? 700 },
] as const;

export const DROP_FOCUS_PRACTICE_MIN_ATTEMPT_OPTIONS = [3, 5, 10] as const;
export const DROP_FOCUS_PRACTICE_POOL_SIZE_OPTIONS = [5, 10, 15] as const;
export const DEFAULT_DROP_FOCUS_PRACTICE_THRESHOLD = "developing";
export const DEFAULT_DROP_FOCUS_PRACTICE_MIN_ATTEMPTS = 3;
export const DEFAULT_DROP_FOCUS_PRACTICE_POOL_SIZE = 10;

export type DropFocusPracticeThreshold = (typeof DROP_FOCUS_PRACTICE_THRESHOLD_OPTIONS)[number]["value"];

export type DropFocusPracticePoolInput = {
  records: readonly CellProgressRecord[];
  selectedNotes: readonly Note[];
  selectedStrings: readonly DropStringIndex[];
  threshold: DropFocusPracticeThreshold;
  minResolvedAttempts: number;
  poolSize: number;
};

export type DropStatsSummary = {
  id: "strongest" | "needs-attention" | "least-practiced";
  label: string;
  value: string;
  description: string;
};

export type DropStatsFretboardViewModel = {
  metric: DropStatsMetric;
  filters: DropStatsFilters;
  hasProgress: boolean;
  summaries: readonly DropStatsSummary[];
  strings: readonly {
    stringIndex: DropStringIndex;
    stringLabel: string;
    cells: readonly DropStatsCellViewModel[];
  }[];
};

const METRIC_LABELS: Record<DropStatsMetric, string> = {
  fluency: "Fluency",
  "recall-speed": "Recall speed",
  accuracy: "Accuracy",
  attempts: "Attempts",
};

export const DROP_STATS_3D_CANONICAL_ROTATION: DropStats3DRotation = {
  pitch: 58,
  yaw: -18,
};

export const DROP_STATS_3D_VIEW_PRESETS = {
  top: {
    label: "Top",
    rotation: { pitch: 18, yaw: -4 },
  },
  angle: {
    label: "Angle",
    rotation: DROP_STATS_3D_CANONICAL_ROTATION,
  },
  profile: {
    label: "Profile",
    rotation: { pitch: 76, yaw: -28 },
  },
} as const satisfies Record<DropStats3DViewPresetId, { label: string; rotation: DropStats3DRotation }>;

export const DROP_STATS_3D_CANONICAL_ZOOM = 0.9;

export const DROP_STATS_3D_ZOOM_LIMITS = {
  min: 0.7,
  max: 1.25,
} as const;

export const DROP_STATS_3D_ZOOM_STEP = 0.1;

export const DROP_STATS_3D_ROTATION_LIMITS = {
  minPitch: 12,
  maxPitch: 78,
  minYaw: -42,
  maxYaw: 34,
} as const;

export const DROP_STATS_3D_STRING_THICKNESS_PX = [1, 1.2, 1.5, 1.9, 2.4, 3] as const;

export const DROP_STATS_3D_INLAY_FRETS = [3, 5, 7, 9] as const;

export const DROP_STATS_3D_COLUMN_HEIGHT_PX = {
  unscored: 4,
  scoredMin: 10,
  max: 100,
} as const;

export const DROP_STATS_PERFORMANCE_CATEGORIES = {
  noScore: {
    id: "no-score",
    label: "No score",
    color: "#182131",
    borderColor: "rgba(148,163,184,0.24)",
    textColor: "#cbd5e1",
    mutedTextColor: "#64748b",
    boxShadow: "none",
  },
  needsWork: {
    id: "needs-work",
    label: "Needs work",
    color: "#A94442",
    borderColor: "rgba(248,180,180,0.34)",
    textColor: "#fff7ed",
    mutedTextColor: "#ffe4e6",
    boxShadow: "inset 0 0 16px rgba(127,29,29,0.26)",
  },
  developing: {
    id: "developing",
    label: "Developing",
    color: "#C66A32",
    borderColor: "rgba(251,191,36,0.32)",
    textColor: "#111827",
    mutedTextColor: "#1f2937",
    boxShadow: "inset 0 0 14px rgba(124,45,18,0.18)",
  },
  solid: {
    id: "solid",
    label: "Solid",
    color: "#C9A33B",
    borderColor: "rgba(254,240,138,0.36)",
    textColor: "#111827",
    mutedTextColor: "#1f2937",
    boxShadow: "inset 0 0 14px rgba(120,53,15,0.16)",
  },
  strong: {
    id: "strong",
    label: "Strong",
    color: "#43A879",
    borderColor: "rgba(167,243,208,0.4)",
    textColor: "#06151b",
    mutedTextColor: "#0f2c2d",
    boxShadow: "inset 0 0 16px rgba(20,83,45,0.18)",
  },
} as const satisfies Record<string, DropStatsPerformanceCategory>;

const METRIC_LEGENDS: Record<DropStatsMetric, DropStatsLegend> = {
  fluency: {
    entries: [
      DROP_STATS_PERFORMANCE_CATEGORIES.noScore,
      DROP_STATS_PERFORMANCE_CATEGORIES.needsWork,
      DROP_STATS_PERFORMANCE_CATEGORIES.developing,
      DROP_STATS_PERFORMANCE_CATEGORIES.solid,
      DROP_STATS_PERFORMANCE_CATEGORIES.strong,
    ],
    accessibleLabel: "Fluency legend: No score, Needs work, Developing, Solid, Strong.",
  },
  "recall-speed": {
    entries: [
      { label: "No timing", color: "#182131" },
      { label: "Slower", color: "rgba(103,232,249,0.18)" },
      { label: "Faster", color: "rgba(103,232,249,0.7)" },
    ],
    accessibleLabel: "Recall speed legend: No timing, Slower, Faster.",
  },
  accuracy: {
    entries: [
      { label: "No results", color: "#182131" },
      { label: "Lower", color: "rgba(103,232,249,0.18)" },
      { label: "Higher", color: "rgba(103,232,249,0.7)" },
    ],
    accessibleLabel: "Accuracy legend: No results, Lower, Higher.",
  },
  attempts: {
    entries: [
      { label: "Not asked", color: "#182131" },
      { label: "Some exposure", color: "rgba(103,232,249,0.18)" },
      { label: "Well sampled", color: "rgba(103,232,249,0.7)" },
    ],
    accessibleLabel: "Attempts legend: Not asked, Some exposure, Well sampled.",
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getCyanMetricColor(strength: number): string {
  return `rgba(103,232,249,${0.18 + clamp(strength, 0, 1) * 0.52})`;
}

function getCyanMetricSideColor(strength: number): string {
  return `rgba(8,47,73,${0.38 + clamp(strength, 0, 1) * 0.34})`;
}

function getPerformanceSideColor(color: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgb(${Math.round(red * 0.58)}, ${Math.round(green * 0.58)}, ${Math.round(blue * 0.58)})`;
}

function getRecordMap(records: readonly CellProgressRecord[]): Map<FretboardCellId, CellProgressRecord> {
  return new Map(records.map((record) => [record.cellId, record]));
}

function isDropStringIndex(value: number): value is DropStringIndex {
  return (ALL_DROP_STRING_INDEXES as readonly number[]).includes(value);
}

function getRecallSpeedMetric(record: CellProgressRecord | null, fluency: CellFluencyResult): { value: number | null; label: string; strength: number | null } {
  if (!record || record.hitProgressCount <= 0) return { value: null, label: "No timing yet", strength: null };
  const speedScore = fluency.dimensions.speedScore;
  return {
    value: speedScore,
    label: `${speedScore} speed`,
    strength: speedScore / 1000,
  };
}

function getAccuracyMetric(record: CellProgressRecord | null): { value: number | null; label: string; strength: number | null } {
  if (!record || record.resolvedTargets <= 0) return { value: null, label: "No accuracy yet", strength: null };
  const accuracy = Math.round(clamp(record.correctHits / record.resolvedTargets, 0, 1) * 100);
  return {
    value: accuracy,
    label: `${accuracy}% accuracy`,
    strength: accuracy / 100,
  };
}

function getAttemptsMetric(record: CellProgressRecord | null): { value: number | null; label: string; strength: number | null } {
  const attempts = Math.max(0, Math.round(record?.resolvedTargets ?? 0));
  if (attempts <= 0) return { value: null, label: "No attempts yet", strength: null };
  return {
    value: attempts,
    label: `${attempts} attempt${attempts === 1 ? "" : "s"}`,
    strength: Math.sqrt(clamp(attempts / 12, 0, 1)),
  };
}

function getFluencyMetric(fluency: CellFluencyResult): { value: number | null; label: string; strength: number | null } {
  if (fluency.score === null) return { value: null, label: "Not enough data", strength: null };
  return {
    value: fluency.score,
    label: `${fluency.score} Fluency`,
    strength: fluency.score / 1000,
  };
}

function getMetric(record: CellProgressRecord | null, fluency: CellFluencyResult, metric: DropStatsMetric) {
  if (metric === "fluency") return getFluencyMetric(fluency);
  if (metric === "recall-speed") return getRecallSpeedMetric(record, fluency);
  if (metric === "accuracy") return getAccuracyMetric(record);
  return getAttemptsMetric(record);
}

const FLUENCY_DEVELOPING_MIN_SCORE = DROP_FLUENCY_SCORE_LABELS.find((label) => label.label === "Building recall")?.minScore ?? 300;
const FLUENCY_SOLID_MIN_SCORE = DROP_FLUENCY_SCORE_LABELS.find((label) => label.label === "Solid run")?.minScore ?? 500;
const FLUENCY_STRONG_MIN_SCORE = DROP_FLUENCY_SCORE_LABELS.find((label) => label.label === "Strong fluency")?.minScore ?? 700;

export const DROP_STATS_FLUENCY_CATEGORY_THRESHOLDS = {
  needsWork: 0,
  developing: FLUENCY_DEVELOPING_MIN_SCORE,
  solid: FLUENCY_SOLID_MIN_SCORE,
  strong: FLUENCY_STRONG_MIN_SCORE,
} as const;

export function getDropStatsFluencyPerformanceCategory(score: number | null): DropStatsPerformanceCategory {
  if (score === null) return DROP_STATS_PERFORMANCE_CATEGORIES.noScore;
  const normalizedScore = clamp(Math.round(score), 0, 1000);
  if (normalizedScore >= DROP_STATS_FLUENCY_CATEGORY_THRESHOLDS.strong) return DROP_STATS_PERFORMANCE_CATEGORIES.strong;
  if (normalizedScore >= DROP_STATS_FLUENCY_CATEGORY_THRESHOLDS.solid) return DROP_STATS_PERFORMANCE_CATEGORIES.solid;
  if (normalizedScore >= DROP_STATS_FLUENCY_CATEGORY_THRESHOLDS.developing) return DROP_STATS_PERFORMANCE_CATEGORIES.developing;
  return DROP_STATS_PERFORMANCE_CATEGORIES.needsWork;
}

export function getDropStatsCellVisual(metric: DropStatsMetric, cell: DropStatsCellViewModel): DropStatsCellVisual {
  if (metric === "fluency") {
    const category = getDropStatsFluencyPerformanceCategory(cell.fluency.score);
    return {
      backgroundColor: category.color,
      borderColor: category.borderColor,
      textColor: category.textColor,
      mutedTextColor: category.mutedTextColor,
      boxShadow: category.boxShadow,
      sideColor: getPerformanceSideColor(category.color),
      categoryLabel: category.label,
    };
  }

  const strength = cell.strength ?? 0;
  if (!cell.isScored) {
    const category = DROP_STATS_PERFORMANCE_CATEGORIES.noScore;
    return {
      backgroundColor: category.color,
      borderColor: category.borderColor,
      textColor: category.textColor,
      mutedTextColor: category.mutedTextColor,
      boxShadow: category.boxShadow,
      sideColor: getPerformanceSideColor(category.color),
      categoryLabel: metric === "attempts" ? "Not asked" : metric === "accuracy" ? "No results" : "No timing",
    };
  }

  const backgroundColor = getCyanMetricColor(strength);
  return {
    backgroundColor,
    borderColor: `rgba(165,243,252,${0.22 + strength * 0.52})`,
    textColor: strength < 0.48 ? "#e0f2fe" : "#06151b",
    mutedTextColor: strength < 0.48 ? "#bae6fd" : "#0f2c2d",
    boxShadow: `inset 0 0 16px rgba(14,165,233,${0.08 + strength * 0.16})`,
    sideColor: getCyanMetricSideColor(strength),
    categoryLabel: cell.metricLabel,
  };
}

export function getDropStatsColumnHeight(metric: DropStatsMetric, cell: DropStatsCellViewModel): number {
  if (!cell.isScored || cell.metricValue === null || cell.strength === null) {
    return DROP_STATS_3D_COLUMN_HEIGHT_PX.unscored;
  }
  const normalizedStrength = metric === "fluency"
    ? clamp(cell.metricValue / 1000, 0, 1)
    : clamp(cell.strength, 0, 1);
  return Math.round(
    DROP_STATS_3D_COLUMN_HEIGHT_PX.scoredMin
    + normalizedStrength * (DROP_STATS_3D_COLUMN_HEIGHT_PX.max - DROP_STATS_3D_COLUMN_HEIGHT_PX.scoredMin),
  );
}

export function clampDropStats3DRotation(rotation: DropStats3DRotation): DropStats3DRotation {
  return {
    pitch: Math.round(clamp(rotation.pitch, DROP_STATS_3D_ROTATION_LIMITS.minPitch, DROP_STATS_3D_ROTATION_LIMITS.maxPitch) * 10) / 10,
    yaw: Math.round(clamp(rotation.yaw, DROP_STATS_3D_ROTATION_LIMITS.minYaw, DROP_STATS_3D_ROTATION_LIMITS.maxYaw) * 10) / 10,
  };
}

export function clampDropStats3DZoom(zoom: number): number {
  return Math.round(clamp(zoom, DROP_STATS_3D_ZOOM_LIMITS.min, DROP_STATS_3D_ZOOM_LIMITS.max) * 100) / 100;
}

export function getDropStats3DStringThickness(stringPosition: number): number {
  const stringIndex = clamp(Math.round(stringPosition), 0, DROP_STATS_3D_STRING_THICKNESS_PX.length - 1);
  return DROP_STATS_3D_STRING_THICKNESS_PX[stringIndex];
}

function getFocusThresholdMaxScore(threshold: DropFocusPracticeThreshold): number {
  return DROP_FOCUS_PRACTICE_THRESHOLD_OPTIONS.find((option) => option.value === threshold)?.maxScoreExclusive
    ?? DROP_FOCUS_PRACTICE_THRESHOLD_OPTIONS[1].maxScoreExclusive;
}

function normalizeFocusMinAttempts(minResolvedAttempts: number): number {
  const normalized = Math.max(DEFAULT_DROP_FOCUS_PRACTICE_MIN_ATTEMPTS, Math.round(minResolvedAttempts));
  return DROP_FOCUS_PRACTICE_MIN_ATTEMPT_OPTIONS.includes(normalized as (typeof DROP_FOCUS_PRACTICE_MIN_ATTEMPT_OPTIONS)[number])
    ? normalized
    : DEFAULT_DROP_FOCUS_PRACTICE_MIN_ATTEMPTS;
}

function normalizeFocusPoolSize(poolSize: number): number {
  const normalized = Math.round(poolSize);
  return DROP_FOCUS_PRACTICE_POOL_SIZE_OPTIONS.includes(normalized as (typeof DROP_FOCUS_PRACTICE_POOL_SIZE_OPTIONS)[number])
    ? normalized
    : DEFAULT_DROP_FOCUS_PRACTICE_POOL_SIZE;
}

export function buildFocusPracticePool(input: DropFocusPracticePoolInput): readonly DropFocusPoolCell[] {
  const filters = normalizeDropStatsFilters({
    selectedNotes: input.selectedNotes,
    selectedStrings: input.selectedStrings,
  });
  const thresholdMaxScore = getFocusThresholdMaxScore(input.threshold);
  const minResolvedAttempts = normalizeFocusMinAttempts(input.minResolvedAttempts);
  const poolSize = normalizeFocusPoolSize(input.poolSize);
  const seenCells = new Set<FretboardCellId>();

  const eligibleCells = input.records.flatMap((record): DropFocusPoolCell[] => {
    const stringIndex = record.stringIndex;
    if (!isDropStringIndex(stringIndex)) return [];
    const fret = Math.round(record.fret);
    if (fret < DROP_MIN_FRET || fret > DROP_MAX_FRET) return [];
    const cellId = createFretboardCellId(stringIndex, fret);
    if (seenCells.has(cellId)) return [];
    seenCells.add(cellId);

    const note = getNoteAtFret(stringIndex, fret);
    if (!filters.selectedNotes.includes(note) || !filters.selectedStrings.includes(stringIndex)) return [];
    if (record.resolvedTargets < minResolvedAttempts) return [];

    const fluency = calculateCellFluency(record);
    if (fluency.score === null || fluency.score >= thresholdMaxScore) return [];

    return [{
      cellId,
      note,
      stringIndex,
      fret,
      fluencyScore: fluency.score,
    }];
  });

  return eligibleCells
    .sort((a, b) => (
      a.fluencyScore - b.fluencyScore
      || a.stringIndex - b.stringIndex
      || a.fret - b.fret
      || a.note.localeCompare(b.note)
    ))
    .slice(0, poolSize);
}

function getEvidenceLabel(metric: DropStatsMetric, fluency: CellFluencyResult, record: CellProgressRecord | null): CellFluencyEvidenceLevel {
  if (metric === "fluency") return fluency.evidenceLevel;
  if (metric === "recall-speed" && (!record || record.hitProgressCount <= 0)) return "not-enough-data";
  if (metric === "accuracy" && (!record || record.resolvedTargets <= 0)) return "not-enough-data";
  if (metric === "attempts" && (!record || record.resolvedTargets <= 0)) return "not-enough-data";
  return fluency.evidenceLevel;
}

export function normalizeDropStatsFilters(filters: Partial<DropStatsFilters> = {}): DropStatsFilters {
  const selectedNotes = normalizePracticeNotes(filters.selectedNotes ?? CURRENT_DROP_NOTE_POOL.notes);
  const selectedStrings = ALL_DROP_STRING_INDEXES.filter((stringIndex) => filters.selectedStrings?.includes(stringIndex) ?? true);

  return {
    selectedNotes,
    selectedStrings: selectedStrings.length > 0 ? selectedStrings : ALL_DROP_STRING_INDEXES,
  };
}

function getFilteredState(note: Note, stringIndex: DropStringIndex, filters: DropStatsFilters): boolean {
  return filters.selectedNotes.includes(note) && filters.selectedStrings.includes(stringIndex);
}

function createDropStatsCellViewModelFromMap(
  recordMap: Map<FretboardCellId, CellProgressRecord>,
  stringIndex: DropStringIndex,
  fret: number,
  metric: DropStatsMetric,
  filters: DropStatsFilters,
): DropStatsCellViewModel {
  const cellId = createFretboardCellId(stringIndex, fret);
  const progress = recordMap.get(cellId) ?? null;
  const fluency = calculateCellFluency(progress);
  const metricResult = getMetric(progress, fluency, metric);
  const stringLabel = getStringFocusLabel(stringIndex);
  const note = getNoteAtFret(stringIndex, fret);
  const evidenceLevel = getEvidenceLabel(metric, fluency, progress);
  const isScored = metricResult.value !== null;
  const isFilteredIn = getFilteredState(note, stringIndex, filters);
  const performanceCategory = metric === "fluency" ? getDropStatsFluencyPerformanceCategory(fluency.score) : null;
  const fretLabel = fret === 0 ? "open string" : `fret ${fret}`;
  const filterLabel = isFilteredIn ? "" : " Filtered out by current Stats filters.";
  const categoryLabel = performanceCategory ? ` Performance: ${performanceCategory.label}.` : "";

  return {
    cellId,
    stringIndex,
    stringLabel,
    fret,
    note,
    progress,
    fluency,
    metricValue: metricResult.value,
    metricLabel: metricResult.label,
    strength: metricResult.strength,
    evidenceLevel,
    isScored,
    isFilteredIn,
    accessibleLabel: `${note}, ${stringLabel}, ${fretLabel}. ${METRIC_LABELS[metric]}: ${metricResult.label}.${categoryLabel} Evidence: ${getEvidenceDisplayLabel(evidenceLevel)}.${filterLabel}`,
  };
}

export function createDropStatsCellViewModel(
  records: readonly CellProgressRecord[],
  stringIndex: DropStringIndex,
  fret: number,
  metric: DropStatsMetric,
  filters: Partial<DropStatsFilters> = {},
): DropStatsCellViewModel {
  const recordMap = getRecordMap(records);
  return createDropStatsCellViewModelFromMap(recordMap, stringIndex, fret, metric, normalizeDropStatsFilters(filters));
}

export function createDropStatsFretboardViewModel(
  records: readonly CellProgressRecord[],
  metric: DropStatsMetric = "fluency",
  filters: Partial<DropStatsFilters> = {},
): DropStatsFretboardViewModel {
  const normalizedMetric = DROP_STATS_METRICS.includes(metric) ? metric : "fluency";
  const normalizedFilters = normalizeDropStatsFilters(filters);
  const frets = Array.from({ length: DROP_MAX_FRET - DROP_MIN_FRET + 1 }, (_, index) => index + DROP_MIN_FRET);
  const recordMap = getRecordMap(records);
  const strings = ALL_DROP_STRING_INDEXES.map((stringIndex) => ({
    stringIndex,
    stringLabel: getStringFocusLabel(stringIndex),
    cells: frets.map((fret) => createDropStatsCellViewModelFromMap(recordMap, stringIndex, fret, normalizedMetric, normalizedFilters)),
  }));

  return {
    metric: normalizedMetric,
    filters: normalizedFilters,
    hasProgress: records.length > 0,
    summaries: createDropStatsSummaries(strings.flatMap((stringRow) => stringRow.cells)),
    strings,
  };
}

export function getDropStatsMetricLabel(metric: DropStatsMetric): string {
  return METRIC_LABELS[metric] ?? METRIC_LABELS.fluency;
}

export function getDropStatsLegend(metric: DropStatsMetric): DropStatsLegend {
  return METRIC_LEGENDS[metric] ?? METRIC_LEGENDS.fluency;
}

export function getEvidenceDisplayLabel(evidenceLevel: CellFluencyEvidenceLevel): string {
  if (evidenceLevel === "early-estimate") return "Early estimate";
  if (evidenceLevel === "developing-confidence") return "Developing confidence";
  if (evidenceLevel === "established") return "Established";
  return "Not enough data";
}

export function getAccuracyDetailLabel(record: CellProgressRecord | null): string {
  if (!record || record.resolvedTargets <= 0) return "No results";
  return `${Math.round(clamp(record.correctHits / record.resolvedTargets, 0, 1) * 100)}% (${record.correctHits}/${record.resolvedTargets})`;
}

export function getRecallSpeedDetailLabel(record: CellProgressRecord | null): string {
  if (!record || record.hitProgressCount <= 0) return "No timing";
  const averageHitProgress = clamp(record.hitProgressSum / record.hitProgressCount, 0, 1);
  const fallPercent = Math.round(averageHitProgress * 100);
  if (averageHitProgress <= 0.32) return `Very early (${fallPercent}% down)`;
  if (averageHitProgress <= 0.52) return `Early (${fallPercent}% down)`;
  if (averageHitProgress <= 0.72) return `Steady (${fallPercent}% down)`;
  return `Late (${fallPercent}% down)`;
}

export function getFretDisplayLabel(fret: number): string {
  return fret === 0 ? "Open" : `Fret ${fret}`;
}

function getCellLocationLabel(cell: DropStatsCellViewModel): string {
  return `${cell.note} · ${cell.stringLabel} · ${getFretDisplayLabel(cell.fret)}`;
}

function getScoredCells(cells: readonly DropStatsCellViewModel[]): DropStatsCellViewModel[] {
  return cells.filter((cell) => cell.isFilteredIn && cell.fluency.score !== null);
}

function createDropStatsSummaries(cells: readonly DropStatsCellViewModel[]): DropStatsSummary[] {
  const filteredCells = cells.filter((cell) => cell.isFilteredIn);
  const scoredCells = getScoredCells(cells);
  const strongest = scoredCells.reduce<DropStatsCellViewModel | null>((best, cell) => {
    if (!best) return cell;
    return (cell.fluency.score ?? 0) > (best.fluency.score ?? 0) ? cell : best;
  }, null);
  const needsAttention = scoredCells.reduce<DropStatsCellViewModel | null>((lowest, cell) => {
    if (!lowest) return cell;
    return (cell.fluency.score ?? 0) < (lowest.fluency.score ?? 0) ? cell : lowest;
  }, null);
  const leastPracticed = filteredCells.reduce<DropStatsCellViewModel | null>((least, cell) => {
    const attempts = cell.progress?.resolvedTargets ?? 0;
    if (!least) return cell;
    const leastAttempts = least.progress?.resolvedTargets ?? 0;
    return attempts < leastAttempts ? cell : least;
  }, null);
  const strongestScore = strongest?.fluency.score;
  const needsAttentionScore = needsAttention?.fluency.score;

  return [
    {
      id: "strongest",
      label: "Strongest area",
      value: strongest ? getCellLocationLabel(strongest) : "Not enough data yet",
      description: strongestScore !== null && strongestScore !== undefined ? `${strongestScore} Fluency` : "Keep playing to build a clearer map",
    },
    {
      id: "needs-attention",
      label: "Needs attention",
      value: needsAttention ? getCellLocationLabel(needsAttention) : "Not enough data yet",
      description: needsAttentionScore !== null && needsAttentionScore !== undefined ? `${needsAttentionScore} Fluency` : "Keep playing to build a clearer map",
    },
    {
      id: "least-practiced",
      label: "Least practiced",
      value: leastPracticed ? getCellLocationLabel(leastPracticed) : "Not enough data yet",
      description: leastPracticed
        ? `${leastPracticed.progress?.resolvedTargets ?? 0} resolved attempt${(leastPracticed.progress?.resolvedTargets ?? 0) === 1 ? "" : "s"}`
        : "Coverage only, not weakness",
    },
  ];
}

export function toggleDropStatsNoteFilter(currentNotes: readonly Note[], note: Note): readonly Note[] {
  const normalized = normalizePracticeNotes(currentNotes);
  if (!(CURRENT_DROP_NOTE_POOL.notes as readonly Note[]).includes(note)) return normalized;
  if (normalized.length === CURRENT_DROP_NOTE_POOL.notes.length) return [note];
  if (normalized.includes(note)) {
    const next = normalized.filter((selectedNote) => selectedNote !== note);
    return next.length > 0 ? normalizePracticeNotes(next) : normalized;
  }
  return normalizePracticeNotes([...normalized, note]);
}

export function toggleDropStatsStringFilter(currentStrings: readonly DropStringIndex[], stringIndex: DropStringIndex): readonly DropStringIndex[] {
  const normalized = normalizeDropStatsFilters({ selectedStrings: currentStrings }).selectedStrings;
  if (!isDropStringIndex(stringIndex)) return normalized;
  if (normalized.length === ALL_DROP_STRING_INDEXES.length) return [stringIndex];
  if (normalized.includes(stringIndex)) {
    const next = normalized.filter((selectedString) => selectedString !== stringIndex);
    return next.length > 0 ? normalizeDropStatsFilters({ selectedStrings: next }).selectedStrings : normalized;
  }
  return normalizeDropStatsFilters({ selectedStrings: [...normalized, stringIndex] }).selectedStrings;
}
