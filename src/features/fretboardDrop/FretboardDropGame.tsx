import { useEffect, useId, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, RotateCcw, Timer, Trophy, Volume2, X, Zap } from "lucide-react";
import { DOT_FRETS, DOUBLE_DOT_FRETS, OPEN_STRING_NOTES, getNoteAtFret, type Note } from "@/lib/fretboard";
import type {
  DropFeedback,
  DropFocusPoolCell,
  DropGameResult,
  DropGameState,
  DropMissReveal,
  DropPracticeContext,
  DropSpeedMode,
  DropStageCue,
  DropStringIndex,
  DropStringSelection,
  DropTarget,
  DropVisibleTargetContext,
} from "./dropGameTypes";
import {
  ALL_DROP_STRING_INDEXES,
  CURRENT_DROP_NOTE_POOL,
  DEFAULT_DROP_PRACTICE_CONTEXT,
  DEFAULT_DROP_STRING_SELECTION,
  DROP_MAX_FRET,
  DROP_MIN_FRET,
  DROP_PROMPT_COMPACT_SIZE_PX,
  DROP_PROMPT_SIZE_PX,
  DROP_RUN_DURATION_MS,
  DROP_SPEED_MODE_CONFIGS,
  DROP_STRING_FOCUS_OPTIONS,
  DROP_TARGET_GENERATION_VERSION,
  DROP_TARGET_STREAM_SPAWN_INTERVAL_MS,
  calculateAccuracy,
  createInitialDropState,
  getActiveFallingTarget,
  getPlayableFallingTarget,
  getFallingTargetVisibleContexts,
  spawnStreamTarget,
  getCorrectFeedback,
  formatPracticeNoteLabel,
  getSelectedPracticeNotes,
  getPracticeLabel,
  getPacingTierUpMessage,
  getStringAccent,
  getStringFocusLabel,
  getStringSelectionKey,
  getStringSelectionLabel,
  getStringVisualState,
  getTargetProgress,
  getPromptTimeRemaining,
  getDropSpeedModeConfig,
  getWrongFeedback,
  isMatchingFret,
  makeDropTarget,
  makeFocusDropTarget,
  normalizeStringSelection,
  normalizePracticeNotes,
  normalizePracticeContext,
  readBestDropScore,
  readDropSpeedMode,
  writeBestDropScore,
  writeDropSpeedMode,
} from "./dropGameUtils";
import { recordCompletedDropRunCounters, trackDropEvent, type DropAnalyticsPayload } from "./dropAnalytics";
import {
  DROP_FLUENCY_SCORE_VERSION,
  calculateFluencyScore,
  getAverageHitProgress,
  getFluencyScoreLabel,
  readBestFluencyScore,
  writeBestFluencyScore,
} from "./dropFluencyScore";
import { getResultsMotivation, getResultsMotivationMessage } from "./dropResultsMotivation";
import { playFretboardNote, playWrongBuzz, readNoteSoundEnabled, unlockNoteAudio, writeNoteSoundEnabled } from "./dropNoteAudio";
import {
  appendCompletedRunToHistory,
  getLastFiveTrend,
  getRunHistoryForContext,
  type DropRunHistoryEntry,
  type DropRunTrend,
} from "./dropRunHistory";
import {
  recordCellProgressSafely,
  recordCorrectTargetCellProgress,
  recordMissedTargetCellProgress,
  recordWrongTargetCellProgress,
} from "./dropCellProgress";
import { FretboardDropStats } from "./FretboardDropStats";
import { HorizontalDeadlineStage } from "./HorizontalDeadlineStage";

const DEV_BUILD_NOTE = "Dev note: 3D mouse zoom and material separation polished.";
const PHONE_LANDSCAPE_MEDIA_QUERY = "(orientation: landscape) and (max-height: 520px) and (max-width: 950px)";
const DROP_RUN_MODE = "standard-60s";
const DROP_FOCUS_RUN_MODE = "focus-practice";
const DROP_TUNING_KEY = `standard-${OPEN_STRING_NOTES.join("-").toLowerCase()}`;
const INSTANT_RECALL_PROGRESS_CUTOFF = 0.3;
export const USE_HORIZONTAL_DEADLINE_STAGE = true;

type DropGameAction =
  | {
    type: "start";
    now: number;
    bestScore: number;
    stringSelection: DropStringSelection;
    practiceContext: DropPracticeContext;
    speedMode: DropSpeedMode;
    runMode?: "normal" | "focus";
    focusPool?: readonly DropFocusPoolCell[];
  }
  | { type: "reset"; now: number }
  | { type: "tick"; now: number }
  | { type: "fret-click"; now: number; stringIndex: number; fret: number; note: Note }
  | { type: "clear-feedback"; id: number }
  | { type: "finish-miss-reveal"; id: number; now: number }
  | { type: "clear-stage-cue"; id: number };

function completeRun(state: DropGameState): DropGameState {
  return {
    ...state,
    status: "complete",
    fallingTargets: [],
    combo: 0,
    missReveal: null,
    timeLeftMs: Math.max(0, state.timeLeftMs),
  };
}

function resolveCorrectHit(
  state: DropGameState,
  activeTarget: DropTarget,
): DropGameState {
  return {
    ...state,
    fallingTargets: state.fallingTargets.filter((target) => target.id !== activeTarget.id),
  };
}

function applyStreamSpawn(state: DropGameState, now: number): DropGameState {
  // Horizontal deadline shows one pick at a time from the left; don't pre-spawn
  // upcoming targets while the active pick is still moving.
  if (USE_HORIZONTAL_DEADLINE_STAGE && state.fallingTargets.length > 0) {
    return state;
  }

  const spawned = spawnStreamTarget({
    fallingTargets: state.fallingTargets,
    targetSeed: state.targetSeed,
    nextStreamSpawnAt: state.nextStreamSpawnAt,
    lastStreamNote: state.lastStreamNote,
    now,
    score: state.score,
    combo: state.combo,
    elapsedMs: now - state.runStartedAt,
    recentHitProgresses: state.recentHitProgresses,
    stringSelection: state.stringSelection,
    practiceContext: state.practiceContext,
    runMode: state.runMode,
    focusPool: state.focusPool,
    speedMode: state.speedMode,
    inputLocked: state.missReveal !== null,
  });

  if (!spawned) return state;

  return {
    ...state,
    fallingTargets: spawned.fallingTargets,
    targetSeed: spawned.targetSeed,
    nextStreamSpawnAt: spawned.nextStreamSpawnAt,
    lastStreamNote: spawned.lastStreamNote,
  };
}

function createFirstStreamTarget(
  now: number,
  stringSelection: DropStringSelection,
  practiceContext: DropPracticeContext,
  runMode: DropGameState["runMode"],
  focusPool: readonly DropFocusPoolCell[],
  speedMode: DropSpeedMode,
): DropTarget {
  const durationOptions = { combo: 0, elapsedMs: 0, speedMode };
  return runMode === "focus"
    ? makeFocusDropTarget(1, now, 0, focusPool, undefined, durationOptions)
    : makeDropTarget(1, now, 0, undefined, stringSelection, practiceContext, durationOptions);
}

function dropGameReducer(state: DropGameState, action: DropGameAction): DropGameState {
  switch (action.type) {
    case "start": {
      const runMode = action.runMode ?? "normal";
      const focusPool = action.focusPool ?? [];
      const firstTarget = createFirstStreamTarget(
        action.now,
        action.stringSelection,
        action.practiceContext,
        runMode,
        focusPool,
        action.speedMode,
      );
      return {
        ...createInitialDropState(action.now),
        status: "playing",
        fallingTargets: [firstTarget],
        targetSeed: 2,
        nextStreamSpawnAt: action.now + DROP_TARGET_STREAM_SPAWN_INTERVAL_MS,
        lastStreamNote: firstTarget.note,
        stringSelection: action.stringSelection,
        practiceContext: action.practiceContext,
        runMode,
        speedMode: action.speedMode,
        focusPool,
        bestScoreAtStart: action.bestScore,
      };
    }

    case "reset":
      return createInitialDropState(action.now);

    case "tick": {
      if (state.status !== "playing") return state;

      const timeLeftMs = Math.max(0, DROP_RUN_DURATION_MS - (action.now - state.runStartedAt));
      let nextState: DropGameState = { ...state, now: action.now, timeLeftMs };

      if (state.missReveal) {
        return nextState;
      }

      if (timeLeftMs <= 0) {
        return completeRun(nextState);
      }

      const activeTarget = getActiveFallingTarget(state.fallingTargets, action.now);
      if (activeTarget && getTargetProgress(activeTarget, action.now) >= 1) {
        const nextLives = state.lives - 1;
        nextState = {
          ...nextState,
          lives: nextLives,
          combo: 0,
          misses: state.misses + 1,
          fallingTargets: state.fallingTargets.filter((target) => target.id !== activeTarget.id),
          feedback: null,
          missReveal: {
            id: action.now,
            stringIndex: activeTarget.stringIndex,
            fret: activeTarget.fret,
            note: activeTarget.note,
            score: state.score,
            completesRun: nextLives <= 0,
          },
          stageCue: {
            id: action.now,
            kind: "miss",
            note: activeTarget.note,
            message: `It was ${activeTarget.note}`,
          },
        };

        return nextState;
      }

      return applyStreamSpawn(nextState, action.now);
    }

    case "fret-click": {
      const playableTarget = getPlayableFallingTarget(state.fallingTargets, action.now, state.missReveal !== null);
      if (state.status !== "playing" || !playableTarget) return state;
      if (action.stringIndex !== playableTarget.stringIndex) {
        return { ...state, now: action.now };
      }

      const hit = isMatchingFret(action.stringIndex, action.fret, playableTarget);
      const feedback: DropFeedback = {
        id: action.now,
        stringIndex: action.stringIndex,
        fret: action.fret,
        kind: hit ? "correct" : "wrong",
        note: action.note,
      };

      if (!hit) {
        return {
          ...state,
          now: action.now,
          combo: 0,
          wrong: state.wrong + 1,
          feedback,
          missReveal: null,
          stageCue: {
            id: action.now,
            kind: "wrong",
            note: playableTarget.note,
            message: getWrongFeedback(state.wrong + 1),
          },
        };
      }

      const nextCombo = state.combo + 1;
      const nextScore = state.score + 1;
      const hitProgress = getTargetProgress(playableTarget, action.now);
      const recentHitProgresses = [...state.recentHitProgresses, hitProgress].slice(-6);
      const hitProgresses = [...state.hitProgresses, hitProgress];
      const tierUpMessage = getPacingTierUpMessage(nextCombo);
      const nextState: DropGameState = {
        ...state,
        now: action.now,
        score: nextScore,
        combo: nextCombo,
        correct: state.correct + 1,
        bestStreak: Math.max(state.bestStreak, nextCombo),
        recentHitProgresses,
        hitProgresses,
        feedback,
        missReveal: null,
        stageCue: {
          id: action.now,
          kind: tierUpMessage ? "tier-up" : "correct",
          note: playableTarget.note,
          message: tierUpMessage ?? getCorrectFeedback(nextCombo),
        },
      };

      return applyStreamSpawn(resolveCorrectHit(nextState, playableTarget), action.now);
    }

    case "clear-feedback":
      if (state.feedback?.id !== action.id) return state;
      return { ...state, feedback: null };

    case "finish-miss-reveal": {
      if (state.missReveal?.id !== action.id) return state;
      const shouldCompleteRun = state.missReveal.completesRun;
      const nextState = { ...state, now: action.now, missReveal: null };
      if (shouldCompleteRun) return completeRun(nextState);
      if (nextState.status !== "playing" || nextState.lives <= 0) return nextState;
      return applyStreamSpawn(nextState, action.now);
    }

    case "clear-stage-cue":
      if (state.stageCue?.id !== action.id) return state;
      return { ...state, stageCue: null };

    default:
      return state;
  }
}

function getPracticeAnalyticsPayload(
  stringSelection: DropStringSelection,
  practiceContext: DropPracticeContext,
  runMode = DROP_RUN_MODE,
  speedMode?: DropSpeedMode,
): DropAnalyticsPayload {
  const normalizedPractice = normalizePracticeContext(practiceContext);
  const normalizedSelection = normalizeStringSelection(stringSelection);
  const selectedNotes = getSelectedPracticeNotes(normalizedPractice);
  const noteFocusMode = normalizedPractice.practiceType === "note-focus" ? "custom" : "all";
  const selectedNoteKey = noteFocusMode === "custom" ? selectedNotes.join("-").toLowerCase() : "all";
  const speedConfig = speedMode ? getDropSpeedModeConfig(speedMode) : null;
  const practiceContextKey = [
    `mode:${runMode}`,
    ...(speedMode ? [`speed:${speedMode}`] : []),
    `strings:${getStringSelectionKey(normalizedSelection)}`,
    `notes:${selectedNoteKey}`,
    `pool:${CURRENT_DROP_NOTE_POOL.id}`,
    `frets:${DROP_MIN_FRET}-${DROP_MAX_FRET}`,
    `tuning:${DROP_TUNING_KEY}`,
    `fluency:${DROP_FLUENCY_SCORE_VERSION}`,
    `targets:${DROP_TARGET_GENERATION_VERSION}`,
  ].join("|");

  return {
    runMode,
    ...(speedConfig ? {
      speedMode: speedConfig.id,
      speedModeLabel: speedConfig.label,
      speedTargetDurationMs: speedConfig.targetDurationMs,
    } : {}),
    practiceContextKey,
    practiceContext: normalizedPractice.practiceType,
    selectedStringIndexes: normalizedSelection,
    selectedStringSet: getStringSelectionKey(normalizedSelection),
    stringSelectionLabel: getStringSelectionLabel(normalizedSelection),
    practiceType: normalizedPractice.practiceType,
    selectedNotes,
    selectedNotesKey: selectedNoteKey,
    noteFocusMode,
    selectedNoteSet: selectedNoteKey,
    noteContext: selectedNotes.join(","),
    notePool: CURRENT_DROP_NOTE_POOL.id,
    fretRange: `${DROP_MIN_FRET}-${DROP_MAX_FRET}`,
    tuning: DROP_TUNING_KEY,
    fluencyScoreVersion: DROP_FLUENCY_SCORE_VERSION,
    targetGenerationVersion: DROP_TARGET_GENERATION_VERSION,
  };
}

function getRunModeKey(runMode: "normal" | "focus"): string {
  return runMode === "focus" ? DROP_FOCUS_RUN_MODE : DROP_RUN_MODE;
}

function createDropRunId(runStartedAt: number): string {
  return `run-${Math.max(0, Math.round(runStartedAt))}`;
}

function createRunHistoryEntry({
  completedAt,
  fluencyScore,
  fluencyScoreLabel,
  score,
  accuracy,
  averageHitProgress,
  speedMode,
}: {
  completedAt: number;
  fluencyScore: number;
  fluencyScoreLabel: string;
  score: number;
  accuracy: number;
  averageHitProgress: number | null;
  speedMode: DropSpeedMode;
}): DropRunHistoryEntry {
  return {
    completedAt,
    fluencyScore,
    fluencyScoreLabel,
    notesFound: score,
    accuracy,
    speedMode,
    ...(averageHitProgress === null ? {} : { averageHitProgress }),
  };
}

export function FretboardDropGame({
  onSwitchToGuided,
  onSwitchToNameTheNote,
  useHorizontalDeadlineStage = USE_HORIZONTAL_DEADLINE_STAGE,
}: {
  onSwitchToGuided?: () => void;
  onSwitchToNameTheNote?: () => void;
  useHorizontalDeadlineStage?: boolean;
} = {}) {
  const [practiceContext, setPracticeContext] = useState<DropPracticeContext>(DEFAULT_DROP_PRACTICE_CONTEXT);
  const [speedMode, setSpeedMode] = useState<DropSpeedMode>(readDropSpeedMode);
  const [bestScore, setBestScore] = useState(() => readBestDropScore(DEFAULT_DROP_STRING_SELECTION, DEFAULT_DROP_PRACTICE_CONTEXT, speedMode));
  const [bestFluencyScore, setBestFluencyScore] = useState(() => readBestFluencyScore(DEFAULT_DROP_STRING_SELECTION, DEFAULT_DROP_PRACTICE_CONTEXT, speedMode));
  const [stringSelection, setStringSelection] = useState<DropStringSelection>(DEFAULT_DROP_STRING_SELECTION);
  const [showQuickPeekNotes, setShowQuickPeekNotes] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [noteSoundEnabled, setNoteSoundEnabled] = useState(readNoteSoundEnabled);
  const [state, dispatch] = useReducer(dropGameReducer, undefined, () => createInitialDropState(performance.now()));
  const [animationNow, setAnimationNow] = useState(() => performance.now());
  const promptSizePx = useDropPromptSizePx();
  const isWarmSurface = state.status === "start" || state.status === "complete";
  const shellScrollable = state.status !== "playing";
  const completedRunTrackedRef = useRef<number | null>(null);
  const missProgressRecordedRef = useRef<number | null>(null);

  const animationTime = state.status === "playing" ? animationNow : state.now;
  const inputLocked = state.missReveal !== null;
  const activeTarget = useMemo(
    () => getActiveFallingTarget(state.fallingTargets, animationTime),
    [animationTime, state.fallingTargets],
  );
  const playableTarget = useMemo(
    () => getPlayableFallingTarget(state.fallingTargets, animationTime, inputLocked),
    [animationTime, inputLocked, state.fallingTargets],
  );
  const visibleTargetContexts = useMemo(
    () => getFallingTargetVisibleContexts(state.fallingTargets, animationTime, playableTarget?.id ?? null),
    [animationTime, playableTarget?.id, state.fallingTargets],
  );
  const result = useMemo<DropGameResult | null>(() => {
    if (state.status !== "complete") return null;
    const accuracy = calculateAccuracy(state.correct, state.wrong, state.misses);
    const fluencyScore = calculateFluencyScore({
      correct: state.correct,
      accuracy,
      bestStreak: state.bestStreak,
      misses: state.misses,
      wrong: state.wrong,
      hitProgresses: state.hitProgresses,
    });
    const previousBestFluency = readBestFluencyScore(state.stringSelection, state.practiceContext, state.speedMode);
    const fluencyScoreLabel = getFluencyScoreLabel(fluencyScore);
    const averageHitProgress = getAverageHitProgress(state.hitProgresses);
    const practiceContextKey = String(getPracticeAnalyticsPayload(state.stringSelection, state.practiceContext, getRunModeKey(state.runMode), state.speedMode).practiceContextKey);
    const currentHistoryEntry = createRunHistoryEntry({
      completedAt: Date.now(),
      fluencyScore,
      fluencyScoreLabel,
      score: state.score,
      accuracy,
      averageHitProgress,
      speedMode: state.speedMode,
    });
    return {
      score: state.score,
      fluencyScore,
      accuracy,
      bestStreak: state.bestStreak,
      misses: state.misses,
      wrong: state.wrong,
      correct: state.correct,
      averageHitProgress,
      trend: getLastFiveTrend([...getRunHistoryForContext(practiceContextKey), currentHistoryEntry]),
      isNewPersonalBest: state.score > state.bestScoreAtStart,
      isNewFluencyBest: fluencyScore > previousBestFluency,
      runMode: state.runMode,
      speedMode: state.speedMode,
      focusPoolSize: state.focusPool.length,
    };
  }, [state]);

  useEffect(() => {
    trackDropEvent("app_opened");
  }, []);

  useEffect(() => {
    if (state.status !== "playing") return undefined;

    let frame = 0;
    const tick = (now: number) => {
      setAnimationNow(now);
      dispatch({ type: "tick", now });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.status]);

  useEffect(() => {
    if (!state.feedback) return undefined;
    const feedbackId = state.feedback.id;
    const timer = window.setTimeout(() => {
      dispatch({ type: "clear-feedback", id: feedbackId });
    }, 360);
    return () => window.clearTimeout(timer);
  }, [state.feedback]);

  useEffect(() => {
    if (!state.missReveal) return undefined;
    const revealId = state.missReveal.id;
    if (missProgressRecordedRef.current !== revealId) {
      missProgressRecordedRef.current = revealId;
      const missReveal = state.missReveal;
      recordCellProgressSafely(() => recordMissedTargetCellProgress(missReveal, new Date()));
    }
    const timer = window.setTimeout(() => {
      dispatch({ type: "finish-miss-reveal", id: revealId, now: performance.now() });
    }, 520);
    return () => window.clearTimeout(timer);
  }, [state.missReveal]);

  useEffect(() => {
    if (!state.stageCue) return undefined;
    const cueId = state.stageCue.id;
    const delayMs = state.stageCue.kind === "tier-up" ? 900 : 520;
    const timer = window.setTimeout(() => {
      dispatch({ type: "clear-stage-cue", id: cueId });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [state.stageCue]);

  useEffect(() => {
    if (state.status !== "complete") return;
    const latestBest = readBestDropScore(state.stringSelection, state.practiceContext, state.speedMode);
    const latestFluencyBest = readBestFluencyScore(state.stringSelection, state.practiceContext, state.speedMode);
    const accuracy = calculateAccuracy(state.correct, state.wrong, state.misses);
    const fluencyScore = calculateFluencyScore({
      correct: state.correct,
      accuracy,
      bestStreak: state.bestStreak,
      misses: state.misses,
      wrong: state.wrong,
      hitProgresses: state.hitProgresses,
    });
    const fluencyScoreLabel = getFluencyScoreLabel(fluencyScore);
    const isNewPersonalBest = state.score > latestBest;
    const isNewFluencyBest = fluencyScore > latestFluencyBest;

    if (completedRunTrackedRef.current !== state.runStartedAt) {
      completedRunTrackedRef.current = state.runStartedAt;
      const practicePayload = getPracticeAnalyticsPayload(state.stringSelection, state.practiceContext, getRunModeKey(state.runMode), state.speedMode);
      const practiceContextKey = String(practicePayload.practiceContextKey);
      const averageHitProgress = getAverageHitProgress(state.hitProgresses);
      appendCompletedRunToHistory(practiceContextKey, createRunHistoryEntry({
        completedAt: Date.now(),
        fluencyScore,
        fluencyScoreLabel,
        score: state.score,
        accuracy,
        averageHitProgress,
        speedMode: state.speedMode,
      }));
      const completedRunCounters = recordCompletedDropRunCounters({
        practiceContextKey,
        fluencyScore,
      });
      const motivation = getResultsMotivation({
        fluencyScore,
        rawScore: state.score,
        rawBestScore: latestBest,
        accuracy,
        misses: state.misses,
        wrong: state.wrong,
        isNewFluencyBest,
        isNewRawBest: isNewPersonalBest,
        practiceLabel: getPracticeLabel(state.stringSelection, state.practiceContext),
        averageHitProgress,
      });
      const runPayload = {
        ...practicePayload,
        ...completedRunCounters,
        runId: createDropRunId(state.runStartedAt),
        score: state.score,
        rawScore: state.score,
        notesFound: state.score,
        fluencyScore,
        fluencyLabel: fluencyScoreLabel,
        fluencyScoreVersion: DROP_FLUENCY_SCORE_VERSION,
        targetGenerationVersion: DROP_TARGET_GENERATION_VERSION,
        accuracy,
        accuracyPct: accuracy,
        bestStreak: state.bestStreak,
        maxStreak: state.bestStreak,
        misses: state.misses,
        missCount: state.misses,
        wrong: state.wrong,
        wrongCount: state.wrong,
        correct: state.correct,
        instantRecallCount: state.hitProgresses.filter((hitProgress) => hitProgress <= INSTANT_RECALL_PROGRESS_CUTOFF).length,
        runCompletedNormally: state.timeLeftMs <= 0 && state.lives > 0,
        actualRunDurationSec: Math.max(0, Math.round((state.now - state.runStartedAt) / 100) / 10),
        newBestForContext: isNewFluencyBest,
        previousBestFluencyForContext: latestFluencyBest,
        smartReplayPromptType: motivation.type,
        smartReplayPromptTextId: motivation.textId,
        distanceToNextFluencyLabel: motivation.distanceToNextFluencyLabel,
        nextFluencyLabel: motivation.nextFluencyLabel,
        isNewPersonalBest,
        isNewFluencyBest,
        durationMs: Math.max(0, Math.round(state.now - state.runStartedAt)),
      };
      trackDropEvent("run_completed", runPayload);
    }

    if (state.score > latestBest) {
      writeBestDropScore(state.score, state.stringSelection, state.practiceContext, state.speedMode);
      setBestScore(state.score);
    } else {
      setBestScore(latestBest);
    }

    if (fluencyScore > latestFluencyBest) {
      writeBestFluencyScore(fluencyScore, state.stringSelection, state.practiceContext, state.speedMode);
      setBestFluencyScore(fluencyScore);
    } else {
      setBestFluencyScore(latestFluencyBest);
    }
  }, [state.bestStreak, state.correct, state.focusPool.length, state.hitProgresses, state.misses, state.now, state.practiceContext, state.runMode, state.runStartedAt, state.score, state.speedMode, state.status, state.stringSelection, state.wrong]);

  function handleStringSelectionChange(nextSelection: DropStringSelection) {
    const selected = normalizeStringSelection(nextSelection);
    setStringSelection(selected);
    setBestScore(readBestDropScore(selected, practiceContext, speedMode));
    setBestFluencyScore(readBestFluencyScore(selected, practiceContext, speedMode));
    trackDropEvent("practice_settings_changed", {
      ...getPracticeAnalyticsPayload(selected, practiceContext, DROP_RUN_MODE, speedMode),
      changedSetting: "practice_strings",
    });
  }

  function handlePracticeContextChange(nextPracticeContext: DropPracticeContext) {
    const normalizedPractice = normalizePracticeContext(nextPracticeContext);
    setPracticeContext(normalizedPractice);
    setBestScore(readBestDropScore(stringSelection, normalizedPractice, speedMode));
    setBestFluencyScore(readBestFluencyScore(stringSelection, normalizedPractice, speedMode));
    trackDropEvent("practice_settings_changed", {
      ...getPracticeAnalyticsPayload(stringSelection, normalizedPractice, DROP_RUN_MODE, speedMode),
      changedSetting: "practice_notes",
    });
  }

  function handleSpeedModeChange(nextSpeedMode: DropSpeedMode) {
    setSpeedMode(nextSpeedMode);
    writeDropSpeedMode(nextSpeedMode);
    setBestScore(readBestDropScore(stringSelection, practiceContext, nextSpeedMode));
    setBestFluencyScore(readBestFluencyScore(stringSelection, practiceContext, nextSpeedMode));
    trackDropEvent("practice_settings_changed", {
      ...getPracticeAnalyticsPayload(stringSelection, practiceContext, DROP_RUN_MODE, nextSpeedMode),
      changedSetting: "speed_mode",
    });
  }

  function startRun(selectionOverride?: DropStringSelection) {
    void unlockNoteAudio();
    const runSelection = normalizeStringSelection(selectionOverride ?? stringSelection);
    const runPracticeContext = normalizePracticeContext(practiceContext);
    const latestBest = readBestDropScore(runSelection, runPracticeContext, speedMode);
    const latestFluencyBest = readBestFluencyScore(runSelection, runPracticeContext, speedMode);
    const now = performance.now();
    setShowQuickPeekNotes(false);
    setShowStats(false);
    setStringSelection(runSelection);
    setPracticeContext(runPracticeContext);
    setBestScore(latestBest);
    setBestFluencyScore(latestFluencyBest);
    setAnimationNow(now);
    completedRunTrackedRef.current = null;
    missProgressRecordedRef.current = null;
    dispatch({ type: "start", now, bestScore: latestBest, stringSelection: runSelection, practiceContext: runPracticeContext, speedMode });
    trackDropEvent("run_started", {
      ...getPracticeAnalyticsPayload(runSelection, runPracticeContext, DROP_RUN_MODE, speedMode),
      runId: createDropRunId(now),
      bestScoreAtStart: latestBest,
      bestFluencyScoreAtStart: latestFluencyBest,
      fluencyScoreVersion: DROP_FLUENCY_SCORE_VERSION,
      targetGenerationVersion: DROP_TARGET_GENERATION_VERSION,
    });
  }

  function startFocusPractice(focusPool: readonly DropFocusPoolCell[]) {
    if (focusPool.length === 0) return;
    void unlockNoteAudio();
    const runSelection = normalizeStringSelection(
      ALL_DROP_STRING_INDEXES.filter((stringIndex) => focusPool.some((cell) => cell.stringIndex === stringIndex)),
    );
    const focusNotes = normalizePracticeNotes(CURRENT_DROP_NOTE_POOL.notes.filter((note) => focusPool.some((cell) => cell.note === note)));
    const runPracticeContext = normalizePracticeContext({
      practiceType: "note-focus",
      selectedNotes: focusNotes,
    });
    const latestBest = readBestDropScore(runSelection, runPracticeContext, speedMode);
    const latestFluencyBest = readBestFluencyScore(runSelection, runPracticeContext, speedMode);
    const now = performance.now();
    setShowQuickPeekNotes(false);
    setShowStats(false);
    setStringSelection(runSelection);
    setPracticeContext(runPracticeContext);
    setBestScore(latestBest);
    setBestFluencyScore(latestFluencyBest);
    setAnimationNow(now);
    completedRunTrackedRef.current = null;
    missProgressRecordedRef.current = null;
    dispatch({
      type: "start",
      now,
      bestScore: latestBest,
      stringSelection: runSelection,
      practiceContext: runPracticeContext,
      speedMode,
      runMode: "focus",
      focusPool,
    });
    trackDropEvent("run_started", {
      ...getPracticeAnalyticsPayload(runSelection, runPracticeContext, DROP_FOCUS_RUN_MODE, speedMode),
      runId: createDropRunId(now),
      bestScoreAtStart: latestBest,
      bestFluencyScoreAtStart: latestFluencyBest,
      fluencyScoreVersion: DROP_FLUENCY_SCORE_VERSION,
      targetGenerationVersion: DROP_TARGET_GENERATION_VERSION,
      focusPoolSize: focusPool.length,
    });
  }

  function toggleQuickPeek() {
    if (!showQuickPeekNotes) {
      trackDropEvent("quick_peek_used", getPracticeAnalyticsPayload(stringSelection, practiceContext, DROP_RUN_MODE, speedMode));
    }
    setShowQuickPeekNotes((isVisible) => !isVisible);
  }

  function goHome() {
    const now = performance.now();
    setShowQuickPeekNotes(false);
    setShowStats(false);
    setAnimationNow(now);
    missProgressRecordedRef.current = null;
    dispatch({ type: "reset", now });
  }

  function handleFretClick(stringIndex: number, fret: number) {
    const now = performance.now();
    const playableTarget = getPlayableFallingTarget(state.fallingTargets, now);
    if (noteSoundEnabled && playableTarget?.stringIndex === stringIndex) {
      if (isMatchingFret(stringIndex, fret, playableTarget)) {
        playFretboardNote({ stringIndex: playableTarget.stringIndex, fret });
      } else {
        playWrongBuzz();
      }
    }
    if (state.status === "playing" && playableTarget?.stringIndex === stringIndex) {
      if (isMatchingFret(stringIndex, fret, playableTarget)) {
        recordCellProgressSafely(() => recordCorrectTargetCellProgress(playableTarget, getTargetProgress(playableTarget, now), new Date()));
      } else {
        recordCellProgressSafely(() => recordWrongTargetCellProgress(playableTarget, fret, new Date()));
      }
    }
    setAnimationNow(now);
    dispatch({
      type: "fret-click",
      now,
      stringIndex,
      fret,
      note: getNoteAtFret(stringIndex, fret),
    });
  }

  function handleNoteSoundChange(isEnabled: boolean) {
    setNoteSoundEnabled(isEnabled);
    writeNoteSoundEnabled(isEnabled);
    if (isEnabled) {
      void unlockNoteAudio();
    }
  }

  return (
    <div className="min-h-[calc(100vh-1px)] bg-[#080a0f] text-slate-50">
      <div
        className={`min-h-[calc(100vh-1px)] ${isWarmSurface
            ? "bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.24),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(120,53,15,0.22),transparent_40%),linear-gradient(180deg,rgba(14,165,233,0.035),transparent_36%)]"
            : "bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.18),transparent_30%),linear-gradient(180deg,rgba(14,165,233,0.08),transparent_40%)]"
          }`}
      >
        <div className={`drop-app-shell mx-auto flex min-h-[calc(100vh-1px)] max-w-7xl flex-col px-3 py-3 sm:px-5 sm:py-4${shellScrollable ? " drop-app-shell--scrollable" : ""}`}>
          {state.status === "start" && showStats ? (
            <FretboardDropStats
              onBack={() => setShowStats(false)}
              onPlay={() => {
                setShowStats(false);
                startRun();
              }}
              onStartFocusPractice={startFocusPractice}
            />
          ) : state.status === "start" ? (
            <DropStartScreen
              bestScore={bestScore}
              stringSelection={stringSelection}
              practiceContext={practiceContext}
              speedMode={speedMode}
              showQuickPeekNotes={showQuickPeekNotes}
              noteSoundEnabled={noteSoundEnabled}
              onStart={startRun}
              onQuickPeekToggle={toggleQuickPeek}
              onNoteSoundChange={handleNoteSoundChange}
              onPracticeContextChange={handlePracticeContextChange}
              onStringSelectionChange={handleStringSelectionChange}
              onSpeedModeChange={handleSpeedModeChange}
              onOpenStats={() => setShowStats(true)}
              onSwitchToGuided={onSwitchToGuided}
              onSwitchToNameTheNote={onSwitchToNameTheNote}
            />
          ) : state.status === "complete" && result ? (
            <DropGameResults
              result={result}
              bestScore={bestScore}
              bestFluencyScore={bestFluencyScore}
              stringSelection={state.stringSelection}
              practiceContext={state.practiceContext}
              onHome={goHome}
              onBackToStats={() => {
                const now = performance.now();
                setShowQuickPeekNotes(false);
                setShowStats(true);
                setAnimationNow(now);
                missProgressRecordedRef.current = null;
                dispatch({ type: "reset", now });
              }}
              onTryAgain={() => {
                trackDropEvent("play_again_clicked", {
                  ...getPracticeAnalyticsPayload(state.stringSelection, state.practiceContext, getRunModeKey(result.runMode), result.speedMode),
                  previousScore: result.score,
                  previousFluencyScore: result.fluencyScore,
                  fluencyScoreVersion: DROP_FLUENCY_SCORE_VERSION,
                  previousRunWasPersonalBest: result.isNewPersonalBest,
                  previousRunWasFluencyBest: result.isNewFluencyBest,
                });
                if (result.runMode === "focus") {
                  startFocusPractice(state.focusPool);
                } else {
                  startRun();
                }
              }}
            />
          ) : (
            <div className="drop-game-run flex min-h-0 flex-1 flex-col gap-3">
              <DropGameHud
                score={state.score}
                combo={state.combo}
                lives={state.lives}
                timeLeftMs={state.timeLeftMs}
                bestScore={Math.max(bestScore, state.score)}
                stringSelection={state.stringSelection}
                practiceContext={state.practiceContext}
                targetDurationMs={playableTarget?.durationMs ?? activeTarget?.durationMs ?? null}
                runMode={state.runMode}
                speedMode={state.speedMode}
                focusPoolSize={state.focusPool.length}
                onHome={goHome}
              />
              <div className={`drop-game-field grid min-h-0 flex-1 gap-2 ${useHorizontalDeadlineStage
                  ? "content-end lg:grid-rows-[minmax(120px,0.26fr)_minmax(0,1fr)]"
                  : "lg:grid-rows-[minmax(280px,0.55fr)_minmax(0,1fr)]"
                }`}>
                {useHorizontalDeadlineStage ? (
                  <HorizontalDeadlineStage
                    cue={state.stageCue}
                    fallingTargets={state.fallingTargets}
                    animationTime={animationTime}
                    activeTargetId={playableTarget?.id ?? null}
                    combo={state.combo}
                    stringSelection={state.stringSelection}
                    practiceContext={state.practiceContext}
                    targetSizePx={promptSizePx}
                  />
                ) : (
                  <DropStage
                    cue={state.stageCue}
                    fallingTargets={state.fallingTargets}
                    animationTime={animationTime}
                    activeTargetId={playableTarget?.id ?? null}
                    combo={state.combo}
                    stringSelection={state.stringSelection}
                    practiceContext={state.practiceContext}
                    targetHeightPx={promptSizePx}
                  />
                )}
                <div className="drop-fretboard-wrap relative">
                  <div className="pointer-events-none absolute -top-2 left-1/2 z-10 h-4 w-px -translate-x-1/2 bg-cyan-200/45 shadow-[0_0_16px_rgba(103,232,249,0.55)]" />
                  <DropGameFretboard
                    visibleTargets={visibleTargetContexts}
                    stringSelection={state.stringSelection}
                    feedback={state.feedback}
                    missReveal={state.missReveal}
                    onFretClick={handleFretClick}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function useDropPromptSizePx(): number {
  const getPromptSize = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return DROP_PROMPT_SIZE_PX;
    return window.matchMedia(PHONE_LANDSCAPE_MEDIA_QUERY).matches ? DROP_PROMPT_COMPACT_SIZE_PX : DROP_PROMPT_SIZE_PX;
  };
  const [promptSizePx, setPromptSizePx] = useState(getPromptSize);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia(PHONE_LANDSCAPE_MEDIA_QUERY);
    const updatePromptSize = () => {
      setPromptSizePx(mediaQuery.matches ? DROP_PROMPT_COMPACT_SIZE_PX : DROP_PROMPT_SIZE_PX);
    };

    updatePromptSize();
    mediaQuery.addEventListener("change", updatePromptSize);
    return () => mediaQuery.removeEventListener("change", updatePromptSize);
  }, []);

  return promptSizePx;
}

function DropStage({
  cue,
  fallingTargets,
  animationTime,
  activeTargetId,
  combo,
  stringSelection,
  practiceContext,
  targetHeightPx,
}: {
  cue: DropStageCue | null;
  fallingTargets: readonly DropTarget[];
  animationTime: number;
  activeTargetId: number | null;
  combo: number;
  stringSelection: DropStringSelection;
  practiceContext: DropPracticeContext;
  targetHeightPx: number;
}) {
  const cueClass =
    cue?.kind === "correct"
      ? "border-amber-200/80 shadow-[0_0_56px_rgba(251,191,36,0.32)_inset,0_0_24px_rgba(251,191,36,0.14)]"
      : cue?.kind === "wrong"
        ? "border-red-300/45 shadow-[0_0_32px_rgba(248,113,113,0.16)_inset]"
        : cue?.kind === "miss"
          ? "border-red-300/75 shadow-[0_0_54px_rgba(248,113,113,0.28)_inset,0_0_18px_rgba(248,113,113,0.16)]"
          : "border-cyan-300/20 shadow-[0_0_60px_rgba(14,165,233,0.12)_inset]";
  const stageCueText = `Focus: ${getPracticeLabel(stringSelection, practiceContext)}`;

  return (
    <div className={`drop-stage relative min-h-[430px] overflow-hidden rounded-lg border bg-slate-950/88 transition-colors duration-150 sm:min-h-[500px] lg:min-h-[56vh] ${cueClass}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(14,165,233,0.08),transparent_42%),radial-gradient(circle_at_18%_68%,rgba(245,158,11,0.05),transparent_34%),radial-gradient(circle_at_82%_62%,rgba(14,165,233,0.05),transparent_34%)]" />
      <div className="absolute left-3 top-3 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">
        {stageCueText}
      </div>
      {combo >= 3 ? (
        <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-amber-100/45 bg-amber-300/18 px-3 py-1 text-xs font-black text-amber-100 shadow-[0_0_22px_rgba(251,191,36,0.18)]">
          <Zap className="h-3.5 w-3.5 fill-amber-200/45" />
          {combo} streak
        </div>
      ) : null}
      {fallingTargets.map((target) => {
        const isActive = target.id === activeTargetId;
        const progress = getTargetProgress(target, animationTime);
        const isFinalSecond = isActive && target.durationMs * getPromptTimeRemaining(progress) <= 1_000;
        return (
          <NotePrompt
            key={target.id}
            note={target.note}
            progress={progress}
            stringIndex={target.stringIndex}
            promptSizePx={targetHeightPx}
            isActive={isActive}
            isFinalSecond={isFinalSecond}
            stageXPercent={target.stageXPercent}
            stageYPercent={target.stageYPercent}
          />
        );
      })}
      {cue?.kind === "correct" || cue?.kind === "tier-up" ? <HitBurst key={cue.id} /> : null}
      {cue?.kind === "miss" ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(248,113,113,0.16),transparent_42%)]" />
      ) : null}
      {cue && cue.kind !== "miss" ? <StageCue cue={cue} /> : null}
    </div>
  );
}

function StageCue({ cue }: { cue: DropStageCue }) {
  const Icon = cue.kind === "tier-up" ? Zap : cue.kind === "correct" ? Check : cue.kind === "wrong" ? X : null;
  const className =
    cue.kind === "tier-up"
      ? "border-cyan-100/75 bg-cyan-300/18 text-cyan-50 shadow-[0_0_34px_rgba(103,232,249,0.2)]"
      : cue.kind === "correct"
        ? "border-amber-100/80 bg-amber-300/25 text-amber-50 shadow-[0_0_30px_rgba(251,191,36,0.18)]"
        : cue.kind === "wrong"
          ? "border-red-200/55 bg-red-400/14 text-red-50"
          : "border-red-200/70 bg-red-400/18 text-red-50 shadow-[0_0_28px_rgba(248,113,113,0.14)]";
  const positionClass = cue.kind === "tier-up" ? "top-[30%] text-base sm:text-lg" : "top-[58%] text-sm";

  return (
    <div className={`absolute left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 font-black shadow-2xl backdrop-blur-sm ${positionClass} ${className}`}>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {cue.message}
    </div>
  );
}

function HitBurst() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-[58%] z-10 h-28 w-28 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
      <div className="absolute inset-5 rounded-full border border-amber-100/60 bg-amber-200/10 animate-ping" />
      <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/35 bg-[radial-gradient(circle,rgba(253,230,138,0.28),transparent_68%)] shadow-[0_0_30px_rgba(251,191,36,0.22)]" />
      <span className="absolute left-1/2 top-2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-amber-100 shadow-[0_0_12px_rgba(254,243,199,0.8)]" />
      <span className="absolute right-5 top-7 h-1.5 w-1.5 rounded-full bg-cyan-100 shadow-[0_0_12px_rgba(165,243,252,0.7)]" />
      <span className="absolute bottom-7 left-5 h-1.5 w-1.5 rounded-full bg-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.7)]" />
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-amber-100/45 bg-slate-950/72 px-2 py-0.5 text-xs font-black text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.18)]">
        +1
      </span>
    </div>
  );
}

function DropStartScreen({
  bestScore,
  stringSelection,
  practiceContext,
  speedMode,
  showQuickPeekNotes,
  noteSoundEnabled,
  onStart,
  onQuickPeekToggle,
  onNoteSoundChange,
  onPracticeContextChange,
  onStringSelectionChange,
  onSpeedModeChange,
  onOpenStats,
  onSwitchToGuided,
  onSwitchToNameTheNote,
}: {
  bestScore: number;
  stringSelection: DropStringSelection;
  practiceContext: DropPracticeContext;
  speedMode: DropSpeedMode;
  showQuickPeekNotes: boolean;
  noteSoundEnabled: boolean;
  onStart: () => void;
  onQuickPeekToggle: () => void;
  onNoteSoundChange: (isEnabled: boolean) => void;
  onPracticeContextChange: (practiceContext: DropPracticeContext) => void;
  onStringSelectionChange: (stringSelection: DropStringSelection) => void;
  onSpeedModeChange: (speedMode: DropSpeedMode) => void;
  onOpenStats: () => void;
  onSwitchToGuided?: () => void;
  onSwitchToNameTheNote?: () => void;
}) {
  const practiceLabel = getPracticeLabel(stringSelection, practiceContext);
  const normalizedPractice = normalizePracticeContext(practiceContext);
  const currentRunLabel = formatPracticeNoteLabel(normalizedPractice);

  return (
    <div className="drop-start-screen flex min-h-0 flex-1 items-center justify-center py-8">
      <div className="drop-start-panel w-full max-w-3xl text-center">
        <h1 className="drop-start-title text-5xl font-black tracking-tight text-white sm:text-7xl">Fretboard Drop</h1>
        {import.meta.env.DEV ? (
          <p className="drop-dev-note mt-2 text-xs font-semibold text-slate-500">{DEV_BUILD_NOTE}</p>
        ) : null}
        <p className="drop-start-subtitle mx-auto mt-3 text-sm font-semibold text-slate-200 sm:text-base">
          Read the note, find it on the fretboard, and answer before the pick reaches the line.
        </p>
        <StringPracticeSelector value={stringSelection} onChange={onStringSelectionChange} />
        <NoteFocusSelector value={practiceContext} onChange={onPracticeContextChange} />
        <SpeedModeSelector value={speedMode} onChange={onSpeedModeChange} />
        <p className="drop-start-helper mt-4 text-sm font-semibold text-slate-400">
          {showQuickPeekNotes ? "Notes hide when the run starts." : "New to these strings? Peek at the notes, then start from memory."}
        </p>
        {showQuickPeekNotes ? (
          <p className="drop-start-current-run mt-2 text-sm font-semibold text-amber-100/72">Current run: {currentRunLabel}</p>
        ) : null}
        <StartFretboardPreview stringSelection={stringSelection} practiceContext={practiceContext} showNotes={showQuickPeekNotes} />
        <div className="drop-start-meta mt-7 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold text-slate-300">
          <span className="rounded-full border border-slate-700/80 px-4 py-2">3 lives</span>
          <span className="rounded-full border border-slate-700/80 px-4 py-2">frets 0-11</span>
          <span className="rounded-full border border-slate-700/80 px-4 py-2">{practiceLabel} best {bestScore}</span>
        </div>
        <div className="drop-start-actions mt-9 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onStart()}
            className="drop-start-primary inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-amber-300 px-10 text-lg font-black text-slate-950 shadow-[0_0_34px_rgba(252,211,77,0.38)] transition hover:bg-amber-200"
          >
            <Zap className="h-5 w-5" />
            Start Run
          </button>
          <button
            type="button"
            onClick={onQuickPeekToggle}
            className="drop-start-secondary inline-flex min-h-12 items-center justify-center rounded-lg border border-cyan-200/30 px-5 text-sm font-black text-cyan-100 transition hover:border-cyan-100/70 hover:bg-cyan-200/10"
          >
            {showQuickPeekNotes ? "Hide Notes" : "Quick Peek Notes"}
          </button>
          <button
            type="button"
            onClick={onOpenStats}
            className="drop-start-secondary inline-flex min-h-12 items-center justify-center rounded-lg border border-cyan-200/30 px-5 text-sm font-black text-cyan-100 transition hover:border-cyan-100/70 hover:bg-cyan-200/10"
          >
            Stats
          </button>
          <button
            type="button"
            onClick={() => onNoteSoundChange(!noteSoundEnabled)}
            aria-pressed={noteSoundEnabled}
            className={`drop-sound-toggle inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-black transition ${noteSoundEnabled
                ? "border-amber-100/70 bg-amber-300/16 text-amber-100 shadow-[0_0_22px_rgba(251,191,36,0.12)]"
                : "border-slate-700/80 bg-slate-950/40 text-slate-300 hover:border-amber-100/45 hover:text-amber-100"
              }`}
          >
            <Volume2 className="h-4 w-4" />
            Sound {noteSoundEnabled ? "On" : "Off"}
          </button>
        </div>
        {onSwitchToGuided ? (
          <button
            type="button"
            onClick={onSwitchToGuided}
            className="mt-5 text-sm font-black text-cyan-100/74 underline decoration-cyan-100/24 underline-offset-4 transition hover:text-cyan-50 hover:decoration-cyan-100/70"
          >
            Want help learning the fretboard? Try Guided Learning
          </button>
        ) : null}
        {onSwitchToNameTheNote ? (
          <button
            type="button"
            onClick={onSwitchToNameTheNote}
            className="mt-3 block text-sm font-black text-cyan-100/74 underline decoration-cyan-100/24 underline-offset-4 transition hover:text-cyan-50 hover:decoration-cyan-100/70"
          >
            Try Name the Note
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StartFretboardPreview({
  stringSelection,
  practiceContext,
  showNotes,
}: {
  stringSelection: DropStringSelection;
  practiceContext: DropPracticeContext;
  showNotes: boolean;
}) {
  const frets = Array.from({ length: DROP_MAX_FRET - DROP_MIN_FRET + 1 }, (_, index) => index + DROP_MIN_FRET);
  const selectedStrings = normalizeStringSelection(stringSelection);
  const playableNotes = getSelectedPracticeNotes(practiceContext);

  return (
    <div className="drop-start-preview mx-auto mt-8 max-w-3xl overflow-hidden rounded-lg border border-cyan-200/18 bg-[#2d1d12] p-2 text-left shadow-[0_-18px_52px_rgba(0,0,0,0.35)_inset,0_0_28px_rgba(14,165,233,0.06)]">
      <PreviewFretNumberRow frets={frets} />
      <div className="grid h-3 grid-cols-[4rem_repeat(12,minmax(0,1fr))]">
        <div />
        {frets.map((fret) => (
          <div key={fret} className="flex justify-center">
            {DOT_FRETS.includes(fret) ? <span className="h-1.5 w-1.5 rounded-full bg-amber-100/38" /> : null}
          </div>
        ))}
      </div>
      {ALL_DROP_STRING_INDEXES.map((stringIndex) => {
        const isSelected = selectedStrings.includes(stringIndex);
        const accent = getStringAccent(stringIndex);
        return (
          <div
            key={stringIndex}
            className={`relative grid min-h-8 grid-cols-[4rem_repeat(12,minmax(0,1fr))] items-center overflow-hidden transition-opacity sm:min-h-9 ${showNotes && !isSelected ? "opacity-60" : ""
              }`}
            aria-label={`Quick peek ${getStringFocusLabel(stringIndex)} row`}
            data-testid={`quick-peek-row-${stringIndex}`}
          >
            {isSelected ? (
              <div
                className="pointer-events-none absolute left-16 right-0 top-1/2 z-0 h-3 -translate-y-1/2 rounded-full"
                style={{
                  background: `linear-gradient(90deg, transparent, ${getAccentRgba(accent.color, 0.045)} 18%, ${getAccentRgba(accent.color, 0.08)} 50%, ${getAccentRgba(accent.color, 0.045)} 82%, transparent)`,
                  boxShadow: `0 0 10px ${getAccentRgba(accent.color, 0.16)}`,
                }}
              />
            ) : null}
            <div className={`relative z-10 whitespace-nowrap pr-2 text-right text-xs font-black ${isSelected ? "text-cyan-50" : "text-amber-100/42"}`}>
              {getStringFocusLabel(stringIndex)}:
            </div>
            {frets.map((fret) => {
              const note = getNoteAtFret(stringIndex, fret);
              const isPlayableNote = playableNotes.includes(note);
              return (
                <div
                  key={fret}
                  className={`relative z-10 flex h-full min-h-8 items-center justify-center border-l border-amber-100/14 font-mono text-[10px] font-black sm:text-xs ${fret === 0 ? "border-r-4 border-r-amber-100/60 bg-slate-950/24" : ""
                    } ${isSelected ? "text-amber-50" : "text-transparent"}`}
                  aria-label={showNotes && isSelected && !isPlayableNote ? `${getStringFocusLabel(stringIndex)} fret ${fret} inactive note` : undefined}
                >
                  <span
                    className="absolute left-0 right-0 top-1/2 block -translate-y-1/2 rounded-full"
                    style={{
                      backgroundColor: isSelected ? accent.color : "#fef3c7",
                      boxShadow: isSelected ? `0 0 7px ${getAccentRgba(accent.color, 0.32)}` : undefined,
                      height: stringIndex < 2 ? "2px" : stringIndex < 4 ? "3px" : "4px",
                      opacity: isSelected ? 0.86 : 0.42,
                    }}
                  />
                  {showNotes && isSelected && isPlayableNote ? (
                    <span className="relative z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-amber-100/70 bg-amber-100/88 px-1 text-[10px] font-black leading-none text-[#3b2415] shadow-[0_0_10px_rgba(254,243,199,0.28)] sm:h-5 sm:min-w-6">
                      {note}
                    </span>
                  ) : null}
                  {showNotes && isSelected && !isPlayableNote ? <span className="relative z-10 h-1 w-1 rounded-full bg-amber-100/16" aria-hidden="true" /> : null}
                </div>
              );
            })}
          </div>
        );
      })}
      <PreviewFretNumberRow frets={frets} />
    </div>
  );
}

function PreviewFretNumberRow({ frets }: { frets: number[] }) {
  return (
    <div className="grid grid-cols-[4rem_repeat(12,minmax(0,1fr))] text-center font-mono text-[9px] font-bold text-amber-100/58">
      <div />
      {frets.map((fret) => (
        <div key={fret} className={fret === 0 ? "text-[8px] uppercase text-cyan-100/72" : ""}>
          {fret === 0 ? "Open" : fret}
        </div>
      ))}
    </div>
  );
}

function DropGameHud({
  score,
  combo,
  lives,
  timeLeftMs,
  bestScore,
  stringSelection,
  practiceContext,
  targetDurationMs,
  runMode,
  speedMode,
  focusPoolSize,
  onHome,
}: {
  score: number;
  combo: number;
  lives: number;
  timeLeftMs: number;
  bestScore: number;
  stringSelection: DropStringSelection;
  practiceContext: DropPracticeContext;
  targetDurationMs: number | null;
  runMode: "normal" | "focus";
  speedMode: DropSpeedMode;
  focusPoolSize: number;
  onHome: () => void;
}) {
  const seconds = Math.ceil(timeLeftMs / 1000);
  const speedConfig = getDropSpeedModeConfig(speedMode);
  return (
    <div className="drop-game-hud grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/86 p-2 shadow-lg sm:grid-cols-[auto_repeat(3,minmax(5.5rem,auto))_1fr_auto]">
      <button
        type="button"
        onClick={onHome}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 text-slate-200 hover:border-amber-300/70 hover:text-amber-100"
        aria-label="Home"
        title="Home"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <HudStat label="Score" value={score} strong />
      <HudStat label="Combo" value={combo} />
      <HudStat label="Best" value={bestScore} icon={<Trophy className="h-4 w-4 text-amber-200" />} className="hidden sm:flex" />
      <div className="hidden items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 text-xs font-black uppercase tracking-[0.14em] text-cyan-100 xl:flex">
        <span>{runMode === "focus" ? `Focus Practice · ${focusPoolSize} cells` : `Focus: ${getPracticeLabel(stringSelection, practiceContext)}`} · {speedConfig.label}</span>
        {import.meta.env.DEV && targetDurationMs ? (
          <span className="ml-3 border-l border-slate-700/80 pl-3 text-[10px] text-slate-500">Dev pacing: {targetDurationMs}ms</span>
        ) : null}
      </div>
      <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
        <Lives value={lives} />
        <div className="flex h-11 min-w-24 items-center justify-center gap-2 rounded-lg border border-cyan-200/25 bg-cyan-300/12 px-3 font-mono text-2xl font-black text-cyan-50">
          <Timer className="h-5 w-5 text-cyan-200" />
          {seconds}
        </div>
      </div>
    </div>
  );
}

function Lives({ value }: { value: number }) {
  return (
    <div className="flex h-11 items-center gap-1.5 rounded-lg border border-red-300/25 bg-red-400/12 px-3" aria-label={`${value} lives`}>
      {Array.from({ length: 3 }, (_, index) => (
        <LifePick
          key={index}
          active={index < value}
        />
      ))}
    </div>
  );
}

function LifePick({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-5 w-5 ${active ? "drop-shadow-[0_0_8px_rgba(248,113,113,0.45)]" : ""}`}
    >
      <path
        d="M12 2.8 C16.4 2.8 20 5.6 20.9 9.7 C21.8 14.1 18.7 18.3 13.5 21.6 C12.6 22.2 11.4 22.2 10.5 21.6 C5.3 18.3 2.2 14.1 3.1 9.7 C4 5.6 7.6 2.8 12 2.8 Z"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        className={active ? "text-red-300" : "text-slate-600"}
      />
      <path
        d="M7.5 9.2 C8.6 6.9 11.2 5.8 14.1 6.3 C11.2 7 9 8.8 7.4 12 C7 11.1 7 10 7.5 9.2 Z"
        fill="currentColor"
        className={active ? "text-red-50/65" : "text-slate-600/35"}
      />
    </svg>
  );
}

function getAccentRgba(hexColor: string, alpha: number): string {
  const hex = hexColor.replace("#", "");
  const value = Number.parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}

function HudStat({
  label,
  value,
  icon,
  strong = false,
  className = "flex",
}: {
  label: string;
  value: number;
  icon?: ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={`${className} h-11 min-w-20 items-center justify-between gap-3 rounded-lg border border-slate-700/80 bg-slate-900/70 px-3`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</span>
      <span className={`flex items-center gap-1 font-mono font-black text-white ${strong ? "text-2xl" : "text-xl"}`}>
        {icon}
        {value}
      </span>
    </div>
  );
}

function StringPracticeSelector({
  value,
  onChange,
}: {
  value: DropStringSelection;
  onChange: (stringSelection: DropStringSelection) => void;
}) {
  const selected = normalizeStringSelection(value);
  const allSelected = selected.length === ALL_DROP_STRING_INDEXES.length;

  function toggleString(stringIndex: DropStringIndex) {
    if (selected.includes(stringIndex)) {
      if (selected.length === 1) return;
      onChange(selected.filter((selectedString) => selectedString !== stringIndex));
      return;
    }

    onChange(ALL_DROP_STRING_INDEXES.filter((selectedString) => selectedString === stringIndex || selected.includes(selectedString)));
  }

  return (
    <div className="drop-string-selector mx-auto mt-5 max-w-2xl">
      <p className="drop-string-selector-heading text-xs font-black uppercase tracking-[0.24em] text-cyan-100/70">Practice Strings</p>
      <div className="drop-string-grid mt-2 flex flex-wrap justify-center gap-1.5">
        {DROP_STRING_FOCUS_OPTIONS.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => toggleString(option.value)}
              aria-pressed={isSelected}
              className={`drop-string-button min-h-8 min-w-14 rounded-md border px-2.5 text-xs font-black transition ${isSelected
                  ? "border-cyan-100 bg-cyan-200 text-slate-950 shadow-[0_0_22px_rgba(103,232,249,0.28)]"
                  : "border-slate-700/80 bg-slate-950/60 text-slate-200 hover:border-cyan-200/70 hover:text-cyan-100"
                }`}
            >
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(ALL_DROP_STRING_INDEXES)}
          aria-pressed={allSelected}
          className={`drop-string-button min-h-8 min-w-14 rounded-md border px-2.5 text-xs font-black transition ${allSelected
              ? "border-cyan-100 bg-cyan-200 text-slate-950 shadow-[0_0_22px_rgba(103,232,249,0.28)]"
              : "border-slate-700/80 bg-slate-950/60 text-slate-200 hover:border-cyan-200/70 hover:text-cyan-100"
            }`}
        >
          All
        </button>
      </div>
    </div>
  );
}

function NoteFocusSelector({
  value,
  onChange,
}: {
  value: DropPracticeContext;
  onChange: (practiceContext: DropPracticeContext) => void;
}) {
  const normalized = normalizePracticeContext(value);
  const selectedNotes = getSelectedPracticeNotes(normalized);
  const allNotesSelected = selectedNotes.length === CURRENT_DROP_NOTE_POOL.notes.length;

  function commitNotes(nextNotes: readonly Note[]) {
    const normalizedNotes = normalizePracticeNotes(nextNotes);
    onChange(
      normalizedNotes.length === CURRENT_DROP_NOTE_POOL.notes.length
        ? DEFAULT_DROP_PRACTICE_CONTEXT
        : { practiceType: "note-focus", selectedNotes: normalizedNotes },
    );
  }

  function toggleNote(note: Note) {
    if (selectedNotes.includes(note)) {
      if (selectedNotes.length === 1) return;
      commitNotes(selectedNotes.filter((selectedNote) => selectedNote !== note));
      return;
    }

    commitNotes([...selectedNotes, note]);
  }

  return (
    <div className="drop-note-focus mx-auto mt-5 max-w-2xl text-sm">
      <p className="drop-note-focus-heading font-semibold text-slate-300">Practice notes:</p>
      <div className="drop-note-focus-grid mt-2 flex flex-wrap items-center justify-center gap-1.5">
        {CURRENT_DROP_NOTE_POOL.notes.map((note) => {
          const isSelected = selectedNotes.includes(note);
          return (
            <button
              key={note}
              type="button"
              onClick={() => toggleNote(note)}
              aria-pressed={isSelected}
              aria-label={`Practice note ${note}`}
              className={`drop-note-button min-h-9 min-w-10 rounded-md border px-3 text-sm font-black transition ${isSelected
                  ? "border-amber-100 bg-amber-200 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.2)]"
                  : "border-slate-700/80 bg-slate-950/60 text-slate-300 hover:border-amber-100/60 hover:text-amber-100"
                }`}
            >
              {note}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => commitNotes(CURRENT_DROP_NOTE_POOL.notes)}
          aria-pressed={allNotesSelected}
          aria-label="All practice notes"
          className={`drop-note-button min-h-9 min-w-12 rounded-md border px-3 text-sm font-black transition ${allNotesSelected
              ? "border-amber-100 bg-amber-200 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.2)]"
              : "border-slate-700/80 bg-slate-950/60 text-slate-300 hover:border-amber-100/60 hover:text-amber-100"
            }`}
        >
          All
        </button>
      </div>
    </div>
  );
}

function SpeedModeSelector({
  value,
  onChange,
}: {
  value: DropSpeedMode;
  onChange: (speedMode: DropSpeedMode) => void;
}) {
  return (
    <div className="drop-speed-selector mx-auto mt-5 max-w-2xl">
      <p className="drop-speed-heading text-xs font-black uppercase tracking-[0.24em] text-cyan-100/70">Pick Speed</p>
      <div className="drop-speed-grid mt-2 grid gap-2 sm:grid-cols-3">
        {DROP_SPEED_MODE_CONFIGS.map((config) => {
          const isSelected = value === config.id;
          return (
            <button
              key={config.id}
              type="button"
              onClick={() => onChange(config.id)}
              aria-pressed={isSelected}
              className={`drop-speed-button min-h-20 rounded-lg border px-3 py-2 text-left transition ${isSelected
                  ? "border-amber-100 bg-amber-200 text-slate-950 shadow-[0_0_22px_rgba(251,191,36,0.22)]"
                  : "border-slate-700/80 bg-slate-950/60 text-slate-200 hover:border-amber-100/55 hover:text-amber-100"
                }`}
            >
              <span className="block text-sm font-black">{config.label}</span>
              <span className={`mt-1 block text-xs font-semibold leading-snug ${isSelected ? "text-slate-800" : "text-slate-400"}`}>
                {config.description}
              </span>
              <span className={`mt-1 block font-mono text-[10px] font-black uppercase tracking-[0.14em] ${isSelected ? "text-slate-700" : "text-cyan-100/62"}`}>
                about {(config.targetDurationMs / 1000).toFixed(config.targetDurationMs % 1000 === 0 ? 0 : 1)}s
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NotePrompt({
  note,
  progress,
  stringIndex,
  promptSizePx,
  isActive,
  isFinalSecond,
  stageXPercent,
  stageYPercent,
}: {
  note: Note;
  progress: number;
  stringIndex: DropStringIndex;
  promptSizePx: number;
  isActive: boolean;
  isFinalSecond: boolean;
  stageXPercent: number;
  stageYPercent: number;
}) {
  const accent = getStringAccent(stringIndex);
  const svgId = useId().replace(/:/g, "");
  const bodyGradientId = `${svgId}-pickGemBody`;
  const glowGradientId = `${svgId}-pickGemGlow`;
  const edgeGradientId = `${svgId}-pickGemEdge`;
  const upcomingBodyGradientId = `${svgId}-pickGemBodyUpcoming`;
  const upcomingGlowGradientId = `${svgId}-pickGemGlowUpcoming`;
  const scale = isActive ? 1 : 0.9;
  const gemSizePx = Math.round(promptSizePx * scale);
  const timeRemaining = getPromptTimeRemaining(progress);
  const zIndex = isActive ? 30 : 12 + Math.round(progress * 8);
  const barWidthPx = Math.round(gemSizePx * 1.08);

  return (
    <div
      className={`drop-note-prompt pointer-events-none absolute flex flex-col items-center ${isFinalSecond ? "animate-pulse" : ""}`}
      style={{
        left: `${stageXPercent}%`,
        top: `${stageYPercent}%`,
        transform: "translate3d(-50%, -50%, 0)",
        zIndex,
        opacity: isActive ? 1 : 0.62,
        width: barWidthPx,
      }}
      aria-label={`Note prompt ${note}${isActive ? " (active)" : " (upcoming)"}`}
      data-drop-target
      data-drop-target-active={isActive ? "true" : "false"}
      data-final-second={isFinalSecond ? "true" : "false"}
    >
      <div
        className={`relative flex items-center justify-center ${isActive
            ? "drop-shadow-[0_0_28px_rgba(252,211,77,0.55)]"
            : "drop-shadow-[0_0_14px_rgba(103,232,249,0.14)]"
          }`}
        style={{
          filter: isActive
            ? `drop-shadow(0 0 24px rgba(252,211,77,0.55)) drop-shadow(0 0 10px ${accent.glowColor})`
            : `drop-shadow(0 0 12px rgba(103,232,249,0.12))`,
          height: gemSizePx,
          width: gemSizePx,
        }}
      >
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 96 96" aria-hidden="true">
          <defs>
            <linearGradient id={bodyGradientId} x1="20" y1="10" x2="77" y2="88" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fff7d6" />
              <stop offset="0.32" stopColor="#facc15" />
              <stop offset="0.68" stopColor="#d97706" />
              <stop offset="1" stopColor="#7c2d12" />
            </linearGradient>
            <radialGradient id={glowGradientId} cx="34" cy="22" r="54" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.82" />
              <stop offset="0.24" stopColor="#fde68a" stopOpacity="0.5" />
              <stop offset="0.72" stopColor="#f59e0b" stopOpacity="0.12" />
              <stop offset="1" stopColor="#78350f" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={edgeGradientId} x1="25" y1="8" x2="70" y2="88" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fffbeb" />
              <stop offset="0.5" stopColor="#fef3c7" stopOpacity="0.62" />
              <stop offset="1" stopColor="#92400e" stopOpacity="0.72" />
            </linearGradient>
            <linearGradient id={upcomingBodyGradientId} x1="20" y1="10" x2="77" y2="88" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#e0f2fe" />
              <stop offset="0.34" stopColor="#7dd3fc" />
              <stop offset="0.72" stopColor="#0369a1" />
              <stop offset="1" stopColor="#0c4a6e" />
            </linearGradient>
            <radialGradient id={upcomingGlowGradientId} cx="34" cy="22" r="54" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="0.28" stopColor="#bae6fd" stopOpacity="0.34" />
              <stop offset="1" stopColor="#0c4a6e" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d="M48 7 C64 7 79 17 85 32 C92 51 80 70 55 88 C51 91 45 91 41 88 C16 70 4 51 11 32 C17 17 32 7 48 7 Z"
            fill={`url(#${isActive ? bodyGradientId : upcomingBodyGradientId})`}
          />
          <path
            d="M48 7 C64 7 79 17 85 32 C92 51 80 70 55 88 C51 91 45 91 41 88 C16 70 4 51 11 32 C17 17 32 7 48 7 Z"
            fill={`url(#${isActive ? glowGradientId : upcomingGlowGradientId})`}
          />
          <path
            d="M48 10 C62 10 75 19 80 33 C86 49 75 66 53 83 C50 85 46 85 43 83 C21 66 10 49 16 33 C21 19 34 10 48 10 Z"
            fill="none"
            stroke={isActive ? `url(#${edgeGradientId})` : accent.color}
            strokeOpacity={isActive ? 1 : 0.55}
            strokeWidth="3"
          />
        </svg>
        <span
          className={`relative z-10 font-black leading-none ${isActive ? "text-slate-950 drop-shadow-[0_2px_0_rgba(255,255,255,0.42)]" : "text-slate-100"
            }`}
          style={{
            fontSize: Math.round(gemSizePx * 0.52),
            WebkitTextStroke: isActive ? "1px rgba(255,251,235,0.32)" : "1px rgba(224,242,254,0.28)",
          }}
        >
          {note}
        </span>
      </div>
      <div
        className={`mt-2 h-1.5 overflow-hidden rounded-full border ${isActive ? "border-amber-100/35 bg-slate-900/70" : "border-cyan-100/20 bg-slate-900/55"
          }`}
        style={{ width: barWidthPx }}
        aria-hidden="true"
      >
        <div
          className={`h-full rounded-full ${isActive ? "bg-amber-200" : "bg-cyan-200/75"}`}
          style={{
            width: `${Math.round(timeRemaining * 100)}%`,
            boxShadow: isActive ? "0 0 10px rgba(251,191,36,0.35)" : undefined,
          }}
        />
      </div>
    </div>
  );
}

function DropGameFretboard({
  visibleTargets,
  stringSelection,
  feedback,
  missReveal,
  onFretClick,
}: {
  visibleTargets: readonly DropVisibleTargetContext[];
  stringSelection: DropStringSelection;
  feedback: DropFeedback | null;
  missReveal: DropMissReveal | null;
  onFretClick: (stringIndex: number, fret: number) => void;
}) {
  const frets = Array.from({ length: DROP_MAX_FRET - DROP_MIN_FRET + 1 }, (_, index) => index + DROP_MIN_FRET);
  const strings = Array.from({ length: 6 }, (_, index) => index);
  const selectedStrings = normalizeStringSelection(stringSelection);

  return (
    <div className="drop-fretboard overflow-hidden rounded-lg border border-cyan-200/20 bg-[#2d1d12] p-2 shadow-[0_-18px_52px_rgba(0,0,0,0.35)_inset,0_0_34px_rgba(14,165,233,0.08)]">
      <FretNumberRow frets={frets} />
      <PositionDotRow frets={frets} />
      <div className="mt-1">
        {strings.map((stringIndex) => {
          const typedStringIndex = stringIndex as DropStringIndex;
          const visualState = getStringVisualState(typedStringIndex, selectedStrings, visibleTargets);
          const isActiveTargetString = visualState === "active-target";
          const isSelectedInactiveString = visualState === "selected-inactive";
          const accent = getStringAccent(typedStringIndex);
          const activeRailSoft = getAccentRgba(accent.color, 0.06);
          const activeRailCore = getAccentRgba(accent.color, 0.14);
          const activeRailGlow = getAccentRgba(accent.color, 0.22);
          const activeStringGlow = getAccentRgba(accent.color, 0.4);
          const selectedLineColor = getAccentRgba(accent.color, 0.68);
          const unselectedLineColor = "rgba(254,243,199,0.25)";
          return (
            <div key={stringIndex} className="drop-fretboard-string-row relative grid min-h-8 grid-cols-[2rem_repeat(12,minmax(0,1fr))] items-center overflow-visible sm:min-h-9">
              {isActiveTargetString ? (
                <div
                  className="pointer-events-none absolute left-8 right-0 top-1/2 z-0 h-5 -translate-y-1/2 rounded-full border-y border-white/8"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${activeRailSoft} 18%, ${activeRailCore} 50%, ${activeRailSoft} 82%, transparent)`,
                    boxShadow: `0 0 10px ${activeRailGlow}, inset 0 0 8px ${accent.softColor}`,
                  }}
                />
              ) : null}
              <div
                className={`relative z-10 pr-2 text-right text-xs font-black tabular-nums ${isActiveTargetString ? "text-white" : isSelectedInactiveString ? "text-cyan-100/70" : "text-amber-100/34"
                  }`}
              >
                {stringIndex + 1}
              </div>
              {frets.map((fret) => {
                const activeFeedback = feedback?.stringIndex === stringIndex && feedback.fret === fret ? feedback : null;
                const activeMissReveal = missReveal?.stringIndex === typedStringIndex && missReveal.fret === fret ? missReveal : null;
                const isOpen = fret === 0;
                return (
                  <button
                    key={fret}
                    type="button"
                    onClick={() => onFretClick(stringIndex, fret)}
                    className={`drop-fretboard-cell relative z-10 h-full min-h-8 outline-none transition hover:bg-amber-200/12 focus-visible:bg-cyan-300/15 focus-visible:ring-2 focus-visible:ring-cyan-200 sm:min-h-9 ${isOpen
                        ? "border-r-4 border-r-amber-100/85 bg-slate-950/26"
                        : "border-l border-amber-100/18"
                      }`}
                    style={{
                      backgroundColor: isActiveTargetString ? "rgba(255,255,255,0.018)" : undefined,
                    }}
                    aria-label={`String ${stringIndex + 1}, ${fret === 0 ? "open string" : `fret ${fret}`}`}
                  >
                    <span
                      className="absolute left-0 right-0 top-1/2 block -translate-y-1/2 rounded-full"
                      style={{
                        backgroundColor: isActiveTargetString ? accent.color : isSelectedInactiveString ? selectedLineColor : unselectedLineColor,
                        boxShadow: isActiveTargetString
                          ? `0 0 9px ${activeStringGlow}, 0 0 2px ${accent.color}`
                          : isSelectedInactiveString
                            ? `0 0 3px ${getAccentRgba(accent.color, 0.16)}`
                            : undefined,
                        height: isActiveTargetString ? "4px" : isSelectedInactiveString ? "2px" : stringIndex < 2 ? "1px" : "2px",
                        opacity: isActiveTargetString ? 0.92 : isSelectedInactiveString ? 0.76 : 0.38,
                      }}
                    />
                    {isOpen ? (
                      <span className="absolute inset-y-1 right-0 w-1 rounded-full bg-amber-100 shadow-[0_0_10px_rgba(254,243,199,0.45)]" />
                    ) : null}
                    {activeMissReveal ? <MissReveal reveal={activeMissReveal} /> : null}
                    {activeFeedback ? <FretFeedback feedback={activeFeedback} /> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <PositionDotRow frets={frets} />
      <FretNumberRow frets={frets} />
    </div>
  );
}

function MissReveal({ reveal }: { reveal: DropMissReveal }) {
  return (
    <span
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border border-amber-100/90 bg-amber-200/24 shadow-[0_0_20px_rgba(251,191,36,0.36),inset_0_0_16px_rgba(253,230,138,0.24)]"
      aria-label={`Miss reveal ${reveal.note} on string ${reveal.stringIndex + 1}, ${reveal.fret === 0 ? "open string" : `fret ${reveal.fret}`}`}
      data-testid="miss-reveal"
    >
      <span className="relative z-10 flex h-7 min-w-7 items-center justify-center rounded-full border border-amber-50 bg-amber-200 px-1 font-mono text-sm font-black leading-none text-[#3b2415] shadow-[0_0_16px_rgba(254,243,199,0.58)]">
        {reveal.note}
      </span>
    </span>
  );
}

function FretFeedback({ feedback }: { feedback: DropFeedback }) {
  const Icon = feedback.kind === "correct" ? Check : X;
  const isCorrect = feedback.kind === "correct";
  return (
    <span
      className={`pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 shadow-lg ${isCorrect
          ? "border-amber-50 bg-amber-300 text-slate-950 shadow-amber-300/55"
          : "border-red-100/80 bg-red-400/85 text-red-50 shadow-red-400/24"
        }`}
    >
      {isCorrect ? (
        <span className="absolute inset-[-7px] rounded-full border border-amber-100/60 bg-amber-200/10 animate-ping" />
      ) : null}
      <Icon className={`${isCorrect ? "h-5 w-5" : "h-4 w-4"}`} />
    </span>
  );
}

function FretNumberRow({ frets }: { frets: number[] }) {
  return (
    <div className="grid grid-cols-[2rem_repeat(12,minmax(0,1fr))] text-center font-mono text-[9px] font-bold text-amber-100/62">
      <div />
      {frets.map((fret) => (
        <div key={fret} className={fret === 0 ? "text-[8px] uppercase text-cyan-100/80" : ""}>
          {fret === 0 ? "Open" : fret}
        </div>
      ))}
    </div>
  );
}

function PositionDotRow({ frets }: { frets: number[] }) {
  return (
    <div className="grid h-4 grid-cols-[2rem_repeat(12,minmax(0,1fr))] items-center">
      <div />
      {frets.map((fret) => {
        const isDouble = DOUBLE_DOT_FRETS.includes(fret);
        const isSingle = DOT_FRETS.includes(fret) && !isDouble;
        return (
          <div key={fret} className="flex justify-center">
            {isSingle ? <span className="h-2 w-2 rounded-full bg-amber-100/65 shadow-[0_0_8px_rgba(254,243,199,0.28)]" /> : null}
            {isDouble ? (
              <span className="flex gap-0.5 sm:gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-100/70 shadow-[0_0_8px_rgba(254,243,199,0.3)]" />
                <span className="h-2 w-2 rounded-full bg-amber-100/70 shadow-[0_0_8px_rgba(254,243,199,0.3)]" />
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function DropGameResults({
  result,
  bestScore,
  bestFluencyScore,
  stringSelection,
  practiceContext,
  onHome,
  onBackToStats,
  onTryAgain,
}: {
  result: DropGameResult;
  bestScore: number;
  bestFluencyScore: number;
  stringSelection: DropStringSelection;
  practiceContext: DropPracticeContext;
  onHome: () => void;
  onBackToStats: () => void;
  onTryAgain: () => void;
}) {
  const displayBest = Math.max(bestScore, result.score);
  const displayBestFluency = Math.max(bestFluencyScore, result.fluencyScore);
  const fluencyScoreLabel = getFluencyScoreLabel(result.fluencyScore);
  const selectionLabel = getPracticeLabel(stringSelection, practiceContext);
  const speedConfig = getDropSpeedModeConfig(result.speedMode);
  const motivationMessage = getResultsMotivationMessage({
    fluencyScore: result.fluencyScore,
    rawScore: result.score,
    rawBestScore: bestScore,
    accuracy: result.accuracy,
    misses: result.misses,
    wrong: result.wrong,
    isNewFluencyBest: result.isNewFluencyBest,
    isNewRawBest: result.isNewPersonalBest,
    practiceLabel: selectionLabel,
    averageHitProgress: result.averageHitProgress,
  });
  const isFocusRun = result.runMode === "focus";

  return (
    <div className="drop-results-screen flex flex-1 items-center justify-center py-8">
      <div className="drop-results-panel w-full max-w-2xl text-center">
        <p className="drop-results-eyebrow text-xs font-black uppercase tracking-[0.42em] text-amber-100/72">run complete</p>
        <h1 className="drop-results-score mt-4 text-6xl font-black tracking-tight text-white drop-shadow-[0_0_28px_rgba(252,211,77,0.2)] sm:text-8xl">{result.fluencyScore}</h1>
        <p className="drop-results-score-label mt-2 text-lg font-semibold text-amber-50/82">Fluency Score / 1000</p>
        <p className="mt-1 text-sm font-black uppercase tracking-[0.18em] text-cyan-100/80">{fluencyScoreLabel}</p>
        {result.isNewFluencyBest ? (
          <div className="drop-results-best mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-amber-100/55 bg-amber-300/18 px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-amber-100 shadow-[0_0_28px_rgba(252,211,77,0.18)]">
            <Trophy className="h-4 w-4" />
            New best Fluency
          </div>
        ) : (
          <p className="drop-results-best mt-4 text-base font-semibold text-slate-300">Best Fluency {displayBestFluency}</p>
        )}
        <p className="mt-2 text-xs font-semibold text-slate-400">{selectionLabel} · {speedConfig.label} · raw best {displayBest}</p>
        {isFocusRun ? (
          <div className="mx-auto mt-3 max-w-md rounded-lg border border-amber-200/20 bg-amber-300/8 px-4 py-3 text-sm font-semibold text-amber-50/82">
            <span className="font-black uppercase tracking-[0.14em] text-amber-100">Focus Practice</span>
            <span className="ml-2 text-slate-300">{result.focusPoolSize} pool cell{result.focusPoolSize === 1 ? "" : "s"} practiced</span>
          </div>
        ) : null}
        <p className="drop-results-suggestion mx-auto mt-4 max-w-md text-base font-semibold text-slate-300">{motivationMessage}</p>
        <ResultsTrendStrip trend={result.trend} />
        <div className="drop-results-stats mx-auto mt-8 grid max-w-lg grid-cols-2 gap-3 text-left sm:grid-cols-4">
          <ResultStat label="Notes found" value={result.score} tone="gold" />
          <ResultStat label="Accuracy" value={`${result.accuracy}%`} tone="muted" />
          <ResultStat label="Misses" value={result.misses} tone="muted" />
          <ResultStat label="Best Streak" value={result.bestStreak} />
        </div>
        <div className="drop-results-actions mt-10 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => onTryAgain()}
            className="drop-results-primary inline-flex min-h-16 items-center justify-center gap-2 rounded-lg bg-amber-300 px-11 text-xl font-black text-slate-950 shadow-[0_0_42px_rgba(252,211,77,0.45)] transition hover:bg-amber-200 hover:shadow-[0_0_52px_rgba(252,211,77,0.55)]"
          >
            <RotateCcw className="h-5 w-5" />
            {isFocusRun ? "Practice Again" : "Play Again"}
          </button>
          <button
            type="button"
            onClick={isFocusRun ? onBackToStats : onHome}
            className="drop-results-secondary inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-slate-700/80 px-6 text-base font-bold text-slate-300 hover:border-amber-200/55 hover:text-amber-100"
          >
            <ArrowLeft className="h-5 w-5" />
            {isFocusRun ? "Back to Stats" : "Home"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultsTrendStrip({ trend }: { trend: DropRunTrend }) {
  if (trend.kind === "placeholder") {
    return (
      <div className="drop-results-trend mx-auto mt-5 flex max-w-md items-center justify-center rounded-full border border-slate-700/65 bg-slate-950/36 px-4 py-2 text-xs font-bold text-slate-400">
        {trend.message}
      </div>
    );
  }

  const minScore = Math.min(...trend.scores);
  const maxScore = Math.max(...trend.scores);
  const range = Math.max(1, maxScore - minScore);
  const deltaLabel = trend.delta > 0 ? `+${trend.delta}` : trend.delta < 0 ? `-${Math.abs(trend.delta)}` : "±0";

  return (
    <div
      className="drop-results-trend mx-auto mt-5 flex max-w-md items-center justify-between gap-4 rounded-full border border-cyan-200/18 bg-slate-950/42 px-4 py-2 text-xs font-black text-slate-300"
      role="img"
      aria-label={trend.accessibleLabel}
      title={trend.accessibleLabel}
    >
      <span className="shrink-0 uppercase tracking-[0.16em] text-cyan-100/70">Last 5 here</span>
      <div className="flex min-w-24 flex-1 items-end justify-center gap-1.5" aria-hidden="true">
        {trend.scores.map((score, index) => {
          const height = 0.35 + ((score - minScore) / range) * 0.65;
          return (
            <span
              key={`${score}-${index}`}
              className="w-2 rounded-full bg-amber-200/80 shadow-[0_0_10px_rgba(251,191,36,0.14)]"
              style={{ height: `${Math.round(height * 26)}px` }}
            />
          );
        })}
      </div>
      <span className="shrink-0 font-mono text-sm text-amber-100">{deltaLabel}</span>
    </div>
  );
}

function ResultStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "gold" | "muted";
}) {
  const toneClass =
    tone === "gold"
      ? "border-amber-200/30 bg-amber-300/10"
      : tone === "muted"
        ? "border-slate-700/55 bg-slate-900/48"
        : "border-slate-700/80 bg-slate-900/70";
  const valueClass = tone === "gold" ? "text-amber-100" : tone === "muted" ? "text-slate-200" : "text-white";

  return (
    <div className={`drop-result-stat rounded-lg border p-4 ${toneClass}`}>
      <p className="drop-result-stat-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`drop-result-stat-value mt-1 font-mono text-2xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}
