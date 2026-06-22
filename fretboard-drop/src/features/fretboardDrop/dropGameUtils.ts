import { getNoteAtFret, type Note } from "@/lib/fretboard";
import type {
  DropFocusPoolCell,
  DropGameState,
  DropPracticeContext,
  DropRunMode,
  DropStringIndex,
  DropStringSelection,
  DropStringVisualState,
  DropTarget,
  DropPromptStagePosition,
  DropVisibleTargetContext,
} from "./dropGameTypes";

export const DROP_BEST_SCORE_KEY = "guitarrise:fretboard-drop:best-score:v1";
export const DROP_RUN_DURATION_MS = 60_000;
export const DROP_STARTING_LIVES = 3;
export const DROP_MIN_FRET = 0;
export const DROP_MAX_FRET = 11;
export const DROP_TARGET_HEIGHT_PX = 96;
export const DROP_COMPACT_LANDSCAPE_TARGET_HEIGHT_PX = 66;
export const DROP_TARGET_START_TOP_PERCENT = 5;
export const DROP_HIT_LINE_TOP_PERCENT = 85;
export const DROP_TARGET_MIN_DURATION_MS = 2_100;
export const DROP_TARGET_MAX_DURATION_MS = 6_400;
export const DROP_TARGET_GENERATION_VERSION = "v1";
export const DROP_TARGET_STREAM_SPAWN_INTERVAL_MS = 2_400;
export const DROP_TARGET_STREAM_MAX_ON_SCREEN = 5;
export const DROP_PROMPT_SIZE_PX = 88;
export const DROP_PROMPT_COMPACT_SIZE_PX = 72;
export const DROP_PROMPT_MIN_SLOT_DISTANCE = 16;
export const DROP_PROMPT_STAGE_SLOTS = [
  { stageXPercent: 20, stageYPercent: 20 },
  { stageXPercent: 50, stageYPercent: 16 },
  { stageXPercent: 80, stageYPercent: 24 },
  { stageXPercent: 26, stageYPercent: 40 },
  { stageXPercent: 54, stageYPercent: 44 },
  { stageXPercent: 78, stageYPercent: 38 },
  { stageXPercent: 18, stageYPercent: 58 },
  { stageXPercent: 48, stageYPercent: 62 },
  { stageXPercent: 82, stageYPercent: 56 },
] as const satisfies readonly DropPromptStagePosition[];
export const DROP_PACING_TIERS = [
  { minCombo: 15, speedUpMs: 2_300, message: "Max pace!" },
  { minCombo: 10, speedUpMs: 1_250, message: "Faster now!" },
  { minCombo: 5, speedUpMs: 650, message: "Let's speed up!" },
] as const;
export const NATURAL_DROP_NOTES = ["C", "D", "E", "F", "G", "A", "B"] as const satisfies readonly Note[];
export const DEFAULT_DROP_PRACTICE_CONTEXT = {
  practiceType: "string-focus",
  selectedNotes: null,
} as const satisfies DropPracticeContext;
export const CURRENT_DROP_NOTE_POOL = {
  id: "naturals",
  label: "natural notes only",
  notes: NATURAL_DROP_NOTES,
} as const satisfies {
  id: "naturals" | "accidentals" | "all";
  label: string;
  notes: readonly Note[];
};
export const ALL_DROP_STRING_INDEXES = [0, 1, 2, 3, 4, 5] as const satisfies readonly DropStringIndex[];
export const DEFAULT_DROP_STRING_SELECTION = [0] as const satisfies DropStringSelection;
export const DROP_STRING_FOCUS_OPTIONS = [
  { value: 0, label: "high E" },
  { value: 1, label: "B" },
  { value: 2, label: "G" },
  { value: 3, label: "D" },
  { value: 4, label: "A" },
  { value: 5, label: "low E" },
] as const satisfies readonly { value: DropStringIndex; label: string }[];
export const DROP_STRING_ACCENTS = [
  {
    value: 0,
    color: "#67e8f9",
    softColor: "rgba(103,232,249,0.11)",
    strongColor: "rgba(103,232,249,0.34)",
    glowColor: "rgba(103,232,249,0.58)",
  },
  {
    value: 1,
    color: "#93c5fd",
    softColor: "rgba(147,197,253,0.11)",
    strongColor: "rgba(147,197,253,0.32)",
    glowColor: "rgba(147,197,253,0.54)",
  },
  {
    value: 2,
    color: "#a7f3d0",
    softColor: "rgba(167,243,208,0.1)",
    strongColor: "rgba(167,243,208,0.3)",
    glowColor: "rgba(167,243,208,0.5)",
  },
  {
    value: 3,
    color: "#fde68a",
    softColor: "rgba(253,230,138,0.11)",
    strongColor: "rgba(253,230,138,0.32)",
    glowColor: "rgba(253,230,138,0.52)",
  },
  {
    value: 4,
    color: "#fbcfe8",
    softColor: "rgba(251,207,232,0.1)",
    strongColor: "rgba(251,207,232,0.28)",
    glowColor: "rgba(251,207,232,0.46)",
  },
  {
    value: 5,
    color: "#c4b5fd",
    softColor: "rgba(196,181,253,0.11)",
    strongColor: "rgba(196,181,253,0.3)",
    glowColor: "rgba(196,181,253,0.5)",
  },
] as const satisfies readonly {
  value: DropStringIndex;
  color: string;
  softColor: string;
  strongColor: string;
  glowColor: string;
}[];

const LOW_COMBO_FEEDBACK = ["Nice", "Good", "Got it"] as const;
const MID_COMBO_FEEDBACK = ["Great", "Clean", "Keep going"] as const;
const HIGH_COMBO_FEEDBACK = ["Excellent", "Locked in", "Smooth"] as const;
const HOT_COMBO_FEEDBACK = ["On fire", "Perfect run", "You're flying"] as const;
const WRONG_FEEDBACK = ["Almost", "Try another fret", "Stay with it", "Find the fret", "You've got this", "Next pick"] as const;
const MISS_FEEDBACK = ["Next pick", "Stay with it", "You've got this", "Try the next one"] as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateAccuracy(correct: number, wrong: number, misses: number): number {
  const total = correct + wrong + misses;
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

export function getTargetProgress(target: DropTarget | null, now: number): number {
  if (!target) return 0;
  return clamp((now - target.startedAt) / target.durationMs, 0, 1);
}

export function getPromptTimeRemaining(progress: number): number {
  return clamp(1 - progress, 0, 1);
}

function getPromptSlotDistance(left: DropPromptStagePosition, right: DropPromptStagePosition): number {
  return Math.hypot(left.stageXPercent - right.stageXPercent, left.stageYPercent - right.stageYPercent);
}

export function pickPromptStagePosition(
  seed: number,
  occupiedStagePositions: readonly DropPromptStagePosition[] = [],
): DropPromptStagePosition {
  const available = DROP_PROMPT_STAGE_SLOTS.filter((slot) => (
    !occupiedStagePositions.some((occupied) => getPromptSlotDistance(slot, occupied) < DROP_PROMPT_MIN_SLOT_DISTANCE)
  ));
  const pool = available.length > 0 ? available : DROP_PROMPT_STAGE_SLOTS;
  return pool[Math.abs(seed) % pool.length];
}

export function sortFallingTargetsByProgress(targets: readonly DropTarget[], now: number): DropTarget[] {
  return [...targets].sort((left, right) => {
    const progressDelta = getTargetProgress(right, now) - getTargetProgress(left, now);
    if (progressDelta !== 0) return progressDelta;
    return left.id - right.id;
  });
}

export function getActiveFallingTarget(targets: readonly DropTarget[], now: number): DropTarget | null {
  return sortFallingTargetsByProgress(targets, now)[0] ?? null;
}

export function getFallingTargetVisibleContexts(
  targets: readonly DropTarget[],
  now: number,
  playableTargetId?: number | null,
): DropVisibleTargetContext[] {
  const activeId = playableTargetId === undefined
    ? getActiveFallingTarget(targets, now)?.id ?? null
    : playableTargetId;
  return targets.map((target) => ({
    id: target.id,
    stringIndex: target.stringIndex,
    role: activeId === target.id ? "active-target" : "upcoming-target",
  }));
}

export function getPlayableFallingTarget(
  targets: readonly DropTarget[],
  now: number,
  inputLocked = false,
): DropTarget | null {
  if (inputLocked) return null;
  return getActiveFallingTarget(targets, now);
}

export function getTargetTopStyle(progress: number, targetHeightPx = DROP_TARGET_HEIGHT_PX): string {
  const topPercent = DROP_TARGET_START_TOP_PERCENT
    + progress * (DROP_HIT_LINE_TOP_PERCENT - DROP_TARGET_START_TOP_PERCENT);
  const liftPx = progress * targetHeightPx;
  return `calc(${topPercent}% - ${liftPx}px)`;
}

export type DropDurationOptions = {
  seed?: number;
  combo?: number;
  elapsedMs?: number;
  afterMiss?: boolean;
  recentHitProgresses?: readonly number[];
  occupiedStagePositions?: readonly DropPromptStagePosition[];
};

function getSeededDurationVariation(seed: number): number {
  const mixed = (seed * 9_301 + 49_297) % 23_328;
  return Math.round(((mixed / 23_328) * 2 - 1) * 180);
}

function getHitTimingAdjustmentMs(recentHitProgresses: readonly number[] = []): number {
  if (recentHitProgresses.length < 3) return 0;
  const averageProgress = recentHitProgresses.reduce((sum, progress) => sum + clamp(progress, 0, 1), 0) / recentHitProgresses.length;
  const sustainedTimingWeight = clamp((recentHitProgresses.length - 2) / 4, 0, 1);

  if (averageProgress < 0.42) {
    const earlyHitSpeedUp = (0.42 - averageProgress) * 2_400 * sustainedTimingWeight;
    return -Math.min(700, Math.round(earlyHitSpeedUp));
  }

  if (averageProgress > 0.78) {
    return Math.round((averageProgress - 0.78) * 760);
  }

  return 0;
}

export function getDropDurationMs(score: number, options: DropDurationOptions = {}): number {
  const elapsedMs = options.elapsedMs ?? DROP_RUN_DURATION_MS;
  const earlyForgiveness = elapsedMs < 7_000 ? Math.round((1 - elapsedMs / 7_000) * 650) : 0;
  const scoreRamp = Math.min(650, Math.max(0, score) * 18);
  const tierRamp = getPacingTierSpeedUpMs(options.combo ?? 0);
  const missRecovery = options.afterMiss ? 520 : 0;
  const hitTimingAdjustment = getHitTimingAdjustmentMs(options.recentHitProgresses);
  const variation = getSeededDurationVariation(options.seed ?? 0);

  return clamp(
    5_450 + earlyForgiveness + missRecovery + hitTimingAdjustment + variation - scoreRamp - tierRamp,
    DROP_TARGET_MIN_DURATION_MS,
    DROP_TARGET_MAX_DURATION_MS,
  );
}

export function getPacingTierSpeedUpMs(combo: number): number {
  return DROP_PACING_TIERS.find((tier) => combo >= tier.minCombo)?.speedUpMs ?? 0;
}

export function getPacingTierUpMessage(combo: number): string | null {
  return DROP_PACING_TIERS.find((tier) => combo === tier.minCombo)?.message ?? null;
}

export function isMatchingFret(stringIndex: number, fret: number, target: DropTarget): boolean {
  return stringIndex === target.stringIndex && fret === target.fret;
}

export function getCorrectFeedback(combo: number): string {
  const options =
    combo >= 10
      ? HOT_COMBO_FEEDBACK
      : combo >= 6
        ? HIGH_COMBO_FEEDBACK
        : combo >= 3
          ? MID_COMBO_FEEDBACK
          : LOW_COMBO_FEEDBACK;
  return options[(combo - 1) % options.length];
}

export function getWrongFeedback(wrongCount: number): string {
  return WRONG_FEEDBACK[(wrongCount - 1) % WRONG_FEEDBACK.length];
}

export function getMissFeedback(missCount: number): string {
  return MISS_FEEDBACK[(missCount - 1) % MISS_FEEDBACK.length];
}

export function normalizeStringSelection(selection: DropStringSelection): DropStringSelection {
  const selected = ALL_DROP_STRING_INDEXES.filter((stringIndex) => selection.includes(stringIndex));
  return selected.length > 0 ? selected : DEFAULT_DROP_STRING_SELECTION;
}

export function getStringFocusLabel(stringIndex: DropStringIndex): string {
  return DROP_STRING_FOCUS_OPTIONS.find((option) => option.value === stringIndex)?.label ?? "high E";
}

export function getStringSelectionLabel(selection: DropStringSelection): string {
  const selected = normalizeStringSelection(selection);
  if (selected.length === ALL_DROP_STRING_INDEXES.length) return "All";
  if (selected.length <= 2) return selected.map(getStringFocusLabel).join(" + ");
  return `${selected.slice(0, 2).map(getStringFocusLabel).join(" + ")} + ${selected.length - 2} more`;
}

export function getStringAccent(stringIndex: DropStringIndex) {
  return DROP_STRING_ACCENTS.find((accent) => accent.value === stringIndex) ?? DROP_STRING_ACCENTS[0];
}

export function getStringVisualState(
  stringIndex: DropStringIndex,
  selection: DropStringSelection,
  visibleTargets: readonly DropVisibleTargetContext[] = [],
): DropStringVisualState {
  const targetForString = visibleTargets.find((target) => target.stringIndex === stringIndex);
  if (targetForString) return targetForString.role;

  return normalizeStringSelection(selection).includes(stringIndex) ? "selected-inactive" : "unselected";
}

export function isNoteInCurrentPool(note: Note): boolean {
  return (CURRENT_DROP_NOTE_POOL.notes as readonly Note[]).includes(note);
}

export function normalizePracticeNotes(notes: readonly Note[] = CURRENT_DROP_NOTE_POOL.notes): readonly Note[] {
  const selected = CURRENT_DROP_NOTE_POOL.notes.filter((note) => notes.includes(note));
  return selected.length > 0 ? selected : CURRENT_DROP_NOTE_POOL.notes;
}

export function normalizePracticeContext(practiceContext: DropPracticeContext = DEFAULT_DROP_PRACTICE_CONTEXT): DropPracticeContext {
  if (practiceContext.practiceType === "note-focus") {
    const selectedNotes = normalizePracticeNotes(practiceContext.selectedNotes);
    if (selectedNotes.length < CURRENT_DROP_NOTE_POOL.notes.length) {
      return {
        practiceType: "note-focus",
        selectedNotes,
      };
    }
  }

  return DEFAULT_DROP_PRACTICE_CONTEXT;
}

export function getSelectedPracticeNotes(practiceContext: DropPracticeContext = DEFAULT_DROP_PRACTICE_CONTEXT): readonly Note[] {
  const normalized = normalizePracticeContext(practiceContext);
  return normalized.practiceType === "note-focus" ? normalized.selectedNotes : CURRENT_DROP_NOTE_POOL.notes;
}

export function getStringSelectionKey(selection: DropStringSelection): string {
  const selected = normalizeStringSelection(selection);
  if (selected.length === ALL_DROP_STRING_INDEXES.length) return "all";
  return selected.join("-");
}

export function createPracticeNoteKey(practiceContext: DropPracticeContext = DEFAULT_DROP_PRACTICE_CONTEXT): string {
  const normalized = normalizePracticeContext(practiceContext);
  return normalized.practiceType === "note-focus" ? `notes-${normalized.selectedNotes.join("-")}` : "all-naturals";
}

export function formatPracticeNoteLabel(practiceContext: DropPracticeContext = DEFAULT_DROP_PRACTICE_CONTEXT): string {
  const normalized = normalizePracticeContext(practiceContext);
  if (normalized.practiceType !== "note-focus") return "all notes";
  if (normalized.selectedNotes.length === 1) return `${normalized.selectedNotes[0]} only`;
  return normalized.selectedNotes.join(",");
}

export function getPracticeLabel(
  selection: DropStringSelection,
  practiceContext: DropPracticeContext = DEFAULT_DROP_PRACTICE_CONTEXT,
): string {
  const selectionLabel = getStringSelectionLabel(selection);
  const normalized = normalizePracticeContext(practiceContext);
  return `${selectionLabel} · ${formatPracticeNoteLabel(normalized)}`;
}

function getBestScoreStorageKey(selection: DropStringSelection, practiceContext: DropPracticeContext = DEFAULT_DROP_PRACTICE_CONTEXT): string {
  const stringKey = getStringSelectionKey(selection);
  const practiceKey = createPracticeNoteKey(practiceContext);
  if (practiceKey === "all-naturals") return `${DROP_BEST_SCORE_KEY}:strings:${stringKey}`;
  return `${DROP_BEST_SCORE_KEY}:strings:${stringKey}:practice:${practiceKey}`;
}

function parseStoredBestScore(raw: string | null): number {
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function readBestDropScore(
  selection: DropStringSelection = DEFAULT_DROP_STRING_SELECTION,
  practiceContext: DropPracticeContext = DEFAULT_DROP_PRACTICE_CONTEXT,
): number {
  try {
    const selected = normalizeStringSelection(selection);
    const normalizedPractice = normalizePracticeContext(practiceContext);
    const selectedBest = parseStoredBestScore(window.localStorage.getItem(getBestScoreStorageKey(selected, normalizedPractice)));
    if (selectedBest > 0) return selectedBest;

    // Older versions stored one global best. Treat it as High E only so existing local progress does not vanish.
    if (
      normalizedPractice.practiceType === "string-focus"
      && getStringSelectionKey(selected) === getStringSelectionKey(DEFAULT_DROP_STRING_SELECTION)
    ) {
      return parseStoredBestScore(window.localStorage.getItem(DROP_BEST_SCORE_KEY));
    }

    return 0;
  } catch {
    return 0;
  }
}

export function writeBestDropScore(
  score: number,
  selection: DropStringSelection = DEFAULT_DROP_STRING_SELECTION,
  practiceContext: DropPracticeContext = DEFAULT_DROP_PRACTICE_CONTEXT,
): void {
  try {
    window.localStorage.setItem(getBestScoreStorageKey(selection, practiceContext), String(score));
  } catch {
    // Personal best is nice-to-have local state only.
  }
}

export type DropPostRunSuggestionInput = {
  score: number;
  bestScore: number;
  accuracy: number;
  misses: number;
  bestStreak: number;
  isNewPersonalBest: boolean;
  selectionLabel: string;
};

export function getPostRunSuggestion({
  score,
  bestScore,
  accuracy,
  misses,
  bestStreak,
  isNewPersonalBest,
  selectionLabel,
}: DropPostRunSuggestionInput): string {
  if (isNewPersonalBest) {
    return `New ${selectionLabel} best. Run it back while it's fresh.`;
  }

  if (score > 0 && score === bestScore) {
    return `You matched your ${selectionLabel} best. One more can beat it.`;
  }

  const bestGap = bestScore - score;
  const closeGap = Math.max(3, Math.ceil(bestScore * 0.15));
  if (bestGap > 0 && bestGap <= closeGap) {
    return `You were ${bestGap} away from your ${selectionLabel} best.`;
  }

  if (accuracy > 0 && accuracy < 65) {
    return "Aim for a cleaner run on these strings.";
  }

  if (misses >= 3) {
    return "Slow it down mentally and watch the target string.";
  }

  if (bestStreak >= 8) {
    return "Your streak is building. Try to keep it alive.";
  }

  return "Run it back and beat this score.";
}

function getPositionsForNote(note: Note, stringSelection: DropStringSelection): { stringIndex: DropStringIndex; fret: number }[] {
  const positions: { stringIndex: DropStringIndex; fret: number }[] = [];
  const stringIndexes = normalizeStringSelection(stringSelection);
  for (const stringIndex of stringIndexes) {
    for (let fret = DROP_MIN_FRET; fret <= DROP_MAX_FRET; fret += 1) {
      if (getNoteAtFret(stringIndex, fret) === note) {
        positions.push({ stringIndex, fret });
      }
    }
  }
  return positions;
}

export function makeDropTarget(
  seed: number,
  now: number,
  score: number,
  previousNote?: Note,
  stringSelection: DropStringSelection = ALL_DROP_STRING_INDEXES,
  practiceContext: DropPracticeContext = DEFAULT_DROP_PRACTICE_CONTEXT,
  durationOptions: DropDurationOptions = {},
): DropTarget {
  const playableNotes = getSelectedPracticeNotes(practiceContext);
  let note = playableNotes[Math.floor(Math.random() * playableNotes.length)];
  if (playableNotes.length > 1 && note === previousNote) {
    const currentIndex = playableNotes.indexOf(note);
    const offset = 1 + Math.floor(Math.random() * (playableNotes.length - 1));
    note = playableNotes[(currentIndex + offset) % playableNotes.length];
  }
  const focusedPositions = getPositionsForNote(note, stringSelection);
  const positions = focusedPositions.length > 0 ? focusedPositions : getPositionsForNote(note, ALL_DROP_STRING_INDEXES);
  const position = positions[Math.floor(Math.random() * positions.length)];
  const stagePosition = pickPromptStagePosition(seed, durationOptions.occupiedStagePositions ?? []);

  return {
    id: seed,
    note,
    stringIndex: position.stringIndex,
    fret: position.fret,
    startedAt: now,
    durationMs: getDropDurationMs(score, { ...durationOptions, seed }),
    stageXPercent: stagePosition.stageXPercent,
    stageYPercent: stagePosition.stageYPercent,
  };
}

function getFocusTargetCell(
  seed: number,
  focusPool: readonly DropFocusPoolCell[] = [],
  previousCellId?: string,
): DropFocusPoolCell | null {
  if (focusPool.length === 0) return null;
  if (focusPool.length === 1) return focusPool[0];

  const orderedPool = [...focusPool].sort((a, b) => (
    a.stringIndex - b.stringIndex
    || a.fret - b.fret
    || a.note.localeCompare(b.note)
  ));
  const candidates = orderedPool.filter((cell) => cell.cellId !== previousCellId);
  return candidates[Math.abs(seed - 1) % candidates.length] ?? orderedPool[0];
}

export function makeFocusDropTarget(
  seed: number,
  now: number,
  score: number,
  focusPool: readonly DropFocusPoolCell[],
  previousCellId?: string,
  durationOptions: DropDurationOptions = {},
): DropTarget {
  const cell = getFocusTargetCell(seed, focusPool, previousCellId);
  if (!cell) {
    return makeDropTarget(seed, now, score, undefined, DEFAULT_DROP_STRING_SELECTION, DEFAULT_DROP_PRACTICE_CONTEXT, durationOptions);
  }

  return {
    id: seed,
    note: cell.note,
    stringIndex: cell.stringIndex,
    fret: cell.fret,
    startedAt: now,
    durationMs: getDropDurationMs(score, { ...durationOptions, seed }),
    ...pickPromptStagePosition(seed, durationOptions.occupiedStagePositions ?? []),
  };
}

export type BuildFallingTargetsInput = {
  startSeed: number;
  now: number;
  score: number;
  count: number;
  stringSelection: DropStringSelection;
  practiceContext: DropPracticeContext;
  runMode: DropRunMode;
  focusPool: readonly DropFocusPoolCell[];
  durationOptions?: DropDurationOptions;
  verticalStaggerMs?: number;
};

export function buildFallingTargets({
  startSeed,
  now,
  score,
  count,
  stringSelection,
  practiceContext,
  runMode,
  focusPool,
  durationOptions = {},
  verticalStaggerMs = DROP_TARGET_STREAM_SPAWN_INTERVAL_MS,
}: BuildFallingTargetsInput): { targets: DropTarget[]; nextSeed: number } {
  const targets: DropTarget[] = [];
  let seed = startSeed;
  let previousNote: Note | undefined;
  let previousCellId: string | undefined;
  const occupiedStagePositions: DropPromptStagePosition[] = [];

  for (let index = 0; index < count; index += 1) {
    const startedAt = now - index * verticalStaggerMs;
    const sharedOptions = {
      ...durationOptions,
      occupiedStagePositions,
    };
    const target = runMode === "focus"
      ? makeFocusDropTarget(seed, startedAt, score, focusPool, previousCellId, sharedOptions)
      : makeDropTarget(
        seed,
        startedAt,
        score,
        previousNote,
        stringSelection,
        practiceContext,
        sharedOptions,
      );
    targets.push(target);
    occupiedStagePositions.push({
      stageXPercent: target.stageXPercent,
      stageYPercent: target.stageYPercent,
    });
    previousNote = target.note;
    previousCellId = `standard:${target.stringIndex}:${target.fret}`;
    seed += 1;
  }

  return { targets, nextSeed: seed };
}

export type SpawnStreamTargetInput = {
  fallingTargets: readonly DropTarget[];
  targetSeed: number;
  nextStreamSpawnAt: number;
  lastStreamNote?: Note;
  now: number;
  score: number;
  combo: number;
  elapsedMs: number;
  recentHitProgresses: readonly number[];
  stringSelection: DropStringSelection;
  practiceContext: DropPracticeContext;
  runMode: DropRunMode;
  focusPool: readonly DropFocusPoolCell[];
  inputLocked?: boolean;
};

export function shouldSpawnStreamTarget(
  now: number,
  nextStreamSpawnAt: number,
  fallingTargetCount: number,
  inputLocked = false,
  maxOnScreen = DROP_TARGET_STREAM_MAX_ON_SCREEN,
): boolean {
  if (inputLocked) return false;
  if (fallingTargetCount >= maxOnScreen) return false;
  if (fallingTargetCount === 0) return true;
  return now >= nextStreamSpawnAt;
}

export function spawnStreamTarget(input: SpawnStreamTargetInput): {
  fallingTargets: DropTarget[];
  targetSeed: number;
  nextStreamSpawnAt: number;
  lastStreamNote: Note;
} | null {
  if (!shouldSpawnStreamTarget(
    input.now,
    input.nextStreamSpawnAt,
    input.fallingTargets.length,
    input.inputLocked,
  )) {
    return null;
  }

  const occupiedStagePositions = input.fallingTargets.map((target) => ({
    stageXPercent: target.stageXPercent,
    stageYPercent: target.stageYPercent,
  }));
  const durationOptions = {
    combo: input.combo,
    elapsedMs: input.elapsedMs,
    recentHitProgresses: input.recentHitProgresses,
    occupiedStagePositions,
  };
  const previousCellId = input.fallingTargets.length > 0
    ? `standard:${input.fallingTargets[input.fallingTargets.length - 1].stringIndex}:${input.fallingTargets[input.fallingTargets.length - 1].fret}`
    : undefined;
  const target = input.runMode === "focus"
    ? makeFocusDropTarget(
      input.targetSeed,
      input.now,
      input.score,
      input.focusPool,
      previousCellId,
      durationOptions,
    )
    : makeDropTarget(
      input.targetSeed,
      input.now,
      input.score,
      input.lastStreamNote,
      input.stringSelection,
      input.practiceContext,
      durationOptions,
    );

  return {
    fallingTargets: [...input.fallingTargets, target],
    targetSeed: input.targetSeed + 1,
    nextStreamSpawnAt: input.now + DROP_TARGET_STREAM_SPAWN_INTERVAL_MS,
    lastStreamNote: target.note,
  };
}

export function createInitialDropState(now: number = 0): DropGameState {
  return {
    status: "start",
    fallingTargets: [],
    score: 0,
    combo: 0,
    lives: DROP_STARTING_LIVES,
    timeLeftMs: DROP_RUN_DURATION_MS,
    correct: 0,
    wrong: 0,
    misses: 0,
    bestStreak: 0,
    recentHitProgresses: [],
    hitProgresses: [],
    runStartedAt: now,
    now,
    targetSeed: 1,
    nextStreamSpawnAt: 0,
    feedback: null,
    missReveal: null,
    stageCue: null,
    stringSelection: DEFAULT_DROP_STRING_SELECTION,
    practiceContext: DEFAULT_DROP_PRACTICE_CONTEXT,
    runMode: "normal",
    focusPool: [],
    bestScoreAtStart: 0,
  };
}
