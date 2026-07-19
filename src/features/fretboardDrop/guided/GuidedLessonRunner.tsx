import { useEffect, useMemo, useRef, useState } from "react";
import { DOT_FRETS, DOUBLE_DOT_FRETS, getNoteAtFret, type Note } from "@/lib/fretboard";
import type { DropStringIndex } from "../dropGameTypes";
import {
  ALL_DROP_STRING_INDEXES,
  DROP_MAX_FRET,
  DROP_MIN_FRET,
  DROP_TARGET_HEIGHT_PX,
  getStringAccent,
  getStringFocusLabel,
  getTargetProgress,
  getTargetTopStyle,
  isMatchingFret,
} from "../dropGameUtils";
import { playFretboardNote, playWrongBuzz, readNoteSoundEnabled } from "../dropNoteAudio";
import {
  GUIDED_FLUENCY_SCORE_VERSION,
  calculateGuidedFluency,
  getCoverageMet,
  getGuidedPresentationBand,
  isGuidedLessonReady,
} from "./guidedFluency";
import {
  GUIDED_TARGET_GENERATION_VERSION,
  createGuidedCellKey,
  createGuidedTargetSequence,
  getFretForNoteOnString,
  getGuidedPreviewCells,
} from "./guidedTargetGeneration";
import {
  getNextStepIdAfterAssistedSuccess,
  getNextStepIdAfterUnassistedSuccess,
} from "./guidedProgression";
import { getGuidedGhostAnchor, getGuidedStepById } from "./guidedSteps";
import { GuidedProgressBar } from "./GuidedProgressBar";
import { buildGuidedProgressView, getGuidedResultsCopy } from "./guidedProgressView";
import type {
  GuidedAttemptSummary,
  GuidedStepDefinition,
  GuidedStepId,
  GuidedLessonPhase,
  GuidedProgress,
  GuidedResultBand,
  GuidedTarget,
} from "./guidedTypes";

const GUIDED_PREVIEW_BEFORE_COUNTDOWN_MS = 1_000;
const GUIDED_COUNTDOWN_STEP_MS = 1_000;
const GUIDED_CORRECTION_MS = 1_500;
const GUIDED_FIRST_WRONG_GRACE_MS = 1_800;
const GUIDED_WRONG_CELL_FEEDBACK_MS = 760;
const GUIDED_PLAY_INSTRUCTION_MS = 1_500;
const GUIDED_ASSISTED_MIN_FLUENCY = 600;
const GUIDED_ASSISTED_MIN_ACCURACY = 80;
const GUIDED_VERY_POOR_MAX_FLUENCY = 450;
const GUIDED_VERY_POOR_MAX_ACCURACY = 60;

type GuidedRunStartMode = "preview" | "direct";

type GuidedRunStats = {
  correct: number;
  wrong: number;
  misses: number;
  combo: number;
  bestStreak: number;
  hitProgresses: readonly number[];
  successfulStringIndexes: readonly DropStringIndex[];
};

type GuidedActiveTarget = GuidedTarget & {
  wrongAttempts: number;
};

type GuidedCorrection = {
  target: GuidedTarget;
  kind: "wrong" | "miss";
};

type GuidedWrongCellFeedback = {
  stringIndex: DropStringIndex;
  fret: number;
};

type GuidedRunResult = {
  guidedFluency: number;
  band: GuidedResultBand;
  isReady: boolean;
  assisted: boolean;
  assistedThresholdMet: boolean;
  veryPoor: boolean;
  accuracy: number;
  coverageMet: boolean;
  correct: number;
  wrong: number;
  misses: number;
  bestStreak: number;
};

export function GuidedLessonRunner({
  step,
  progress,
  startMode,
  runMode = "normal",
  onProgressChange,
  onAdvanceToStep,
  onReturnToIntro,
  onExitDevTest,
  onSwitchToFreePlay,
}: {
  step: GuidedStepDefinition;
  progress: GuidedProgress;
  startMode: GuidedRunStartMode;
  runMode?: "normal" | "dev-test";
  onProgressChange: (progress: GuidedProgress) => void;
  onAdvanceToStep: (stepId: GuidedStepId) => void;
  onReturnToIntro: () => void;
  onExitDevTest?: () => void;
  onSwitchToFreePlay: () => void;
}) {
  const isDevTestRun = runMode === "dev-test";
  const [runKey, setRunKey] = useState(1);
  const [phase, setPhase] = useState<GuidedLessonPhase>(startMode === "preview" ? "preview" : "playing");
  const [countdown, setCountdown] = useState(3);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTarget, setActiveTarget] = useState<GuidedActiveTarget | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const [correction, setCorrection] = useState<GuidedCorrection | null>(null);
  const [feedback, setFeedback] = useState<"nice" | "quick-find" | "try-again" | null>(null);
  const [wrongCellFeedback, setWrongCellFeedback] = useState<GuidedWrongCellFeedback | null>(null);
  const [stats, setStats] = useState<GuidedRunStats>(() => createEmptyGuidedRunStats());
  const [showFluencyExplanationForResult, setShowFluencyExplanationForResult] = useState(false);
  const [pendingDirectStart, setPendingDirectStart] = useState(startMode === "direct");
  const [showPlayInstruction, setShowPlayInstruction] = useState(false);
  const [currentRunAssisted, setCurrentRunAssisted] = useState(false);
  const savedResultRef = useRef<string | null>(null);

  const sequence = useMemo(() => createGuidedTargetSequence(step, runKey + step.stepNumber * 17), [step, runKey]);
  const previewCells = useMemo(() => getGuidedPreviewCells(step.targetNotes), [step.targetNotes]);
  const requiredStringIndexes = useMemo(() => getRequiredStringIndexes(step, sequence), [step, sequence]);
  const shouldUseAnchor = step.isAssisted;
  const activeAnchorCell = getGuidedAnchorCell(step, activeTarget, currentRunAssisted);
  const result = useMemo<GuidedRunResult | null>(() => {
    if (phase !== "results") return null;
    const fluency = calculateGuidedFluency({
      step,
      correct: stats.correct,
      wrong: stats.wrong,
      misses: stats.misses,
      bestStreak: stats.bestStreak,
      hitProgresses: stats.hitProgresses,
      successfulStringIndexes: stats.successfulStringIndexes,
      requiredStringIndexes,
    });
    const coverageMet = getCoverageMet(stats.successfulStringIndexes, requiredStringIndexes);
    const previousAttempts = progress.attemptsByStep[step.id] ?? [];
    const isReady = isGuidedLessonReady({
      guidedFluency: fluency.guidedFluency,
      accuracy: fluency.accuracy,
      wrong: stats.wrong,
      misses: stats.misses,
      coverageMet,
      assisted: currentRunAssisted,
      attempts: previousAttempts,
    });

    return {
      guidedFluency: fluency.guidedFluency,
      band: getGuidedPresentationBand(fluency.guidedFluency, isReady),
      isReady,
      assisted: currentRunAssisted,
      assistedThresholdMet: getGuidedAssistedThresholdMet({
        guidedFluency: fluency.guidedFluency,
        accuracy: fluency.accuracy,
        coverageMet,
      }),
      veryPoor: getGuidedVeryPoor({
        guidedFluency: fluency.guidedFluency,
        accuracy: fluency.accuracy,
        coverageMet,
      }),
      accuracy: fluency.accuracy,
      coverageMet,
      correct: stats.correct,
      wrong: stats.wrong,
      misses: stats.misses,
      bestStreak: stats.bestStreak,
    };
  }, [currentRunAssisted, step, phase, progress.attemptsByStep, requiredStringIndexes, stats]);

  useEffect(() => {
    if (phase !== "preview") return undefined;
    const timer = window.setTimeout(() => {
      setCountdown(3);
      setPhase("countdown");
    }, GUIDED_PREVIEW_BEFORE_COUNTDOWN_MS);
    return () => window.clearTimeout(timer);
  }, [phase, runKey]);

  useEffect(() => {
    if (phase !== "countdown") return undefined;
    const timer = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown((value) => value - 1);
        return;
      }
      startTarget(0);
    }, GUIDED_COUNTDOWN_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [countdown, phase]);

  useEffect(() => {
    if (phase !== "playing" || !activeTarget) return undefined;

    let frame = 0;
    const remainingMs = Math.max(0, activeTarget.startedAt + activeTarget.durationMs - performance.now());
    const missTimer = window.setTimeout(() => {
      beginCorrection(activeTarget, "miss");
    }, remainingMs);
    const tick = (frameNow: number) => {
      setNow(frameNow);
      if (getTargetProgress(activeTarget, frameNow) >= 1) {
        window.clearTimeout(missTimer);
        beginCorrection(activeTarget, "miss");
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(missTimer);
      cancelAnimationFrame(frame);
    };
  }, [activeTarget, phase]);

  useEffect(() => {
    if (phase !== "correction" || !correction) return undefined;
    const timer = window.setTimeout(() => {
      finishCorrection();
    }, GUIDED_CORRECTION_MS);
    return () => window.clearTimeout(timer);
  }, [correction, phase]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(null), 560);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!wrongCellFeedback) return undefined;
    const timer = window.setTimeout(() => setWrongCellFeedback(null), GUIDED_WRONG_CELL_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [wrongCellFeedback]);

  useEffect(() => {
    if (phase !== "playing" || !pendingDirectStart || activeTarget) return;
    setPendingDirectStart(false);
    startTarget(0);
  }, [activeTarget, pendingDirectStart, phase, sequence]);

  useEffect(() => {
    if (phase !== "playing" || !showPlayInstruction) return undefined;
    const timer = window.setTimeout(() => setShowPlayInstruction(false), GUIDED_PLAY_INSTRUCTION_MS);
    return () => window.clearTimeout(timer);
  }, [phase, runKey, showPlayInstruction]);

  useEffect(() => {
    if (!result || isDevTestRun) return;
    const resultKey = `${step.id}:${runKey}:${result.guidedFluency}:${result.correct}:${result.wrong}:${result.misses}`;
    if (savedResultRef.current === resultKey) return;
    savedResultRef.current = resultKey;

    const attempt = createGuidedAttemptSummary(step.id, result, sequence.length);
    const existingAttempts = progress.attemptsByStep[step.id] ?? [];
    const completedStepIds = result.isReady || (result.assisted && result.assistedThresholdMet)
      ? Array.from(new Set([...progress.completedStepIds, step.id]))
      : progress.completedStepIds;
    const nextProgress: GuidedProgress = {
      ...progress,
      completedStepIds,
      attemptsByStep: {
        ...progress.attemptsByStep,
        [step.id]: [...existingAttempts, attempt].slice(-3),
      },
      bestFluencyByStep: {
        ...progress.bestFluencyByStep,
        [step.id]: Math.max(progress.bestFluencyByStep[step.id] ?? 0, result.guidedFluency),
      },
      fluencyExplanationSeen: true,
    };
    onProgressChange(nextProgress);
  }, [isDevTestRun, onProgressChange, progress, result, runKey, sequence.length, step.id]);

  function startTarget(nextIndex: number) {
    const startedAt = performance.now();
    if (nextIndex === 0) {
      setCurrentRunAssisted(shouldUseAnchor);
    }
    setNow(startedAt);
    setActiveIndex(nextIndex);
    setActiveTarget({
      ...sequence[nextIndex],
      startedAt,
      wrongAttempts: 0,
    });
    setCorrection(null);
    setWrongCellFeedback(null);
    setShowPlayInstruction(nextIndex === 0);
    setPhase("playing");
  }

  function handleFretClick(stringIndex: number, fret: number) {
    if (phase !== "playing" || !activeTarget) return;
    if (activeTarget.stringIndex !== stringIndex) return;

    const clickedString = stringIndex as DropStringIndex;
    if (readNoteSoundEnabled()) {
      if (isMatchingFret(stringIndex, fret, activeTarget)) {
        playFretboardNote({ stringIndex: clickedString, fret });
      } else {
        playWrongBuzz();
      }
    }

    if (!isMatchingFret(stringIndex, fret, activeTarget)) {
      if (activeTarget.wrongAttempts === 0) {
        const wrongFeedback = { stringIndex: clickedString, fret };
        setActiveTarget((currentTarget) => (
          currentTarget?.id === activeTarget.id
            ? {
              ...currentTarget,
              wrongAttempts: 1,
              durationMs: currentTarget.durationMs + GUIDED_FIRST_WRONG_GRACE_MS,
            }
            : currentTarget
        ));
        setStats((currentStats) => ({
          ...currentStats,
          combo: 0,
        }));
        setWrongCellFeedback(wrongFeedback);
        setFeedback("try-again");
        return;
      }
      beginCorrection(activeTarget, "wrong");
      return;
    }

    const hitNow = performance.now();
    const hitProgress = getTargetProgress(activeTarget, hitNow);
    setStats((currentStats) => {
      const nextCombo = activeTarget.wrongAttempts > 0 ? 1 : currentStats.combo + 1;
      return {
        ...currentStats,
        correct: currentStats.correct + 1,
        wrong: activeTarget.wrongAttempts > 0 ? currentStats.wrong + 1 : currentStats.wrong,
        combo: nextCombo,
        bestStreak: Math.max(currentStats.bestStreak, nextCombo),
        hitProgresses: [...currentStats.hitProgresses, hitProgress],
        successfulStringIndexes: Array.from(new Set([...currentStats.successfulStringIndexes, activeTarget.stringIndex])),
      };
    });
    setWrongCellFeedback(null);
    setFeedback(hitProgress <= 0.35 ? "quick-find" : activeIndex % 3 === 1 ? "nice" : null);
    advanceAfterTarget();
  }

  function beginCorrection(target: GuidedTarget, kind: "wrong" | "miss") {
    setStats((currentStats) => ({
      ...currentStats,
      wrong: kind === "wrong" ? currentStats.wrong + 1 : currentStats.wrong,
      misses: kind === "miss" ? currentStats.misses + 1 : currentStats.misses,
      combo: 0,
    }));
    setActiveTarget(null);
    setCorrection({ target, kind });
    setFeedback(null);
    setWrongCellFeedback(null);
    setShowPlayInstruction(false);
    setPhase("correction");
  }

  function finishCorrection() {
    setCorrection(null);
    advanceAfterTarget();
  }

  function advanceAfterTarget() {
    setShowPlayInstruction(false);
    if (activeIndex + 1 >= sequence.length) {
      setActiveTarget(null);
      setShowFluencyExplanationForResult(!progress.fluencyExplanationSeen);
      setPhase("results");
      return;
    }

    startTarget(activeIndex + 1);
  }

  function restart(nextStartMode: GuidedRunStartMode) {
    savedResultRef.current = null;
    setRunKey((value) => value + 1);
    setStats(createEmptyGuidedRunStats());
    setActiveIndex(0);
    setActiveTarget(null);
    setCorrection(null);
    setFeedback(null);
    setWrongCellFeedback(null);
    setCountdown(3);
    setShowFluencyExplanationForResult(false);
    setShowPlayInstruction(false);
    setCurrentRunAssisted(false);
    setPendingDirectStart(nextStartMode === "direct");
    setPhase(nextStartMode === "preview" ? "preview" : "playing");
  }

  const activeProgress = getTargetProgress(activeTarget, now);
  const showPreviewMarkers = phase === "preview" || phase === "countdown";
  const progressView = useMemo(
    () => buildGuidedProgressView(step, progress.completedStepIds, { isReturning: true }),
    [progress.completedStepIds, step],
  );

  if (phase === "results" && result) {
    if (isDevTestRun) {
      return (
        <GuidedDevTestResults
          step={step}
          result={result}
          showFluencyExplanation={showFluencyExplanationForResult}
          onTestAgain={() => restart("preview")}
          onChooseAnotherStep={() => onExitDevTest?.()}
          onExitTestMode={() => onExitDevTest?.()}
        />
      );
    }

    return (
      <GuidedResults
        step={step}
        result={result}
        progress={progress}
        showFluencyExplanation={showFluencyExplanationForResult}
        onPrimaryAction={() => {
          if (result.assisted) {
            if (result.assistedThresholdMet) {
              onAdvanceToStep(getNextStepIdAfterAssistedSuccess(step.id));
              return;
            }
            restart("direct");
            return;
          }

          if (result.isReady) {
            if (step.isFinalRepeatable) {
              onReturnToIntro();
              return;
            }
            onAdvanceToStep(getNextStepIdAfterUnassistedSuccess(step.id));
            return;
          }

          restart(result.band === "learning" ? "preview" : "direct");
        }}
        onSwitchToFreePlay={onSwitchToFreePlay}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-1px)] bg-[#080a0f] text-slate-50">
      <div className="guided-run-shell mx-auto flex min-h-[calc(100vh-1px)] max-w-7xl flex-col gap-3 px-3 py-3 sm:px-5 sm:py-4">
        <GuidedRunHud
          progressView={progressView}
          targetNumber={Math.min(activeIndex + 1, sequence.length)}
          targetCount={sequence.length}
          onReturnToIntro={onReturnToIntro}
        />
        <div className="drop-game-field grid min-h-0 flex-1 gap-2 lg:grid-rows-[minmax(430px,1fr)_auto]">
          <GuidedStage
            step={step}
            phase={phase}
            countdown={countdown}
            target={activeTarget}
            progress={activeProgress}
            feedback={feedback}
            correction={correction}
            showPlayInstruction={showPlayInstruction}
          />
          <GuidedFretboard
            activeTarget={activeTarget}
            correction={correction}
            wrongCellFeedback={wrongCellFeedback}
            anchorCell={activeAnchorCell}
            previewCells={showPreviewMarkers ? previewCells : []}
            onFretClick={handleFretClick}
          />
        </div>
      </div>
    </div>
  );
}

function createEmptyGuidedRunStats(): GuidedRunStats {
  return {
    correct: 0,
    wrong: 0,
    misses: 0,
    combo: 0,
    bestStreak: 0,
    hitProgresses: [],
    successfulStringIndexes: [],
  };
}

function GuidedRunHud({
  progressView,
  targetNumber,
  targetCount,
  onReturnToIntro,
}: {
  progressView: ReturnType<typeof buildGuidedProgressView>;
  targetNumber: number;
  targetCount: number;
  onReturnToIntro: () => void;
}) {
  return (
    <div className="drop-game-hud rounded-lg border border-slate-700/80 bg-slate-950/86 p-2 shadow-lg">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <button
          type="button"
          onClick={onReturnToIntro}
          className="flex h-11 items-center justify-center rounded-lg border border-slate-700 px-3 text-sm font-black text-slate-200 hover:border-amber-300/70 hover:text-amber-100"
        >
          Back
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/70">{progressView.locationLabel}</p>
          <p className="truncate text-lg font-black text-white">{progressView.actionTitle}</p>
        </div>
        <div className="flex h-11 min-w-24 items-center justify-center rounded-lg border border-amber-100/28 bg-amber-300/12 px-3 font-mono text-xl font-black text-amber-50">
          {targetNumber} of {targetCount}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <GuidedProgressBar
          className="flex-1"
          segmentStatuses={progressView.segmentStatuses}
          completedCount={progressView.completedCount}
          totalCount={progressView.totalCount}
        />
        {progressView.hudHintLabel ? (
          <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/65">
            {progressView.hudHintLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function GuidedStage({
  step,
  phase,
  countdown,
  target,
  progress,
  feedback,
  correction,
  showPlayInstruction,
}: {
  step: GuidedStepDefinition;
  phase: GuidedLessonPhase;
  countdown: number;
  target: GuidedTarget | null;
  progress: number;
  feedback: "nice" | "quick-find" | "try-again" | null;
  correction: GuidedCorrection | null;
  showPlayInstruction: boolean;
}) {
  const introCopy = getGuidedPlayingCopy(step);
  return (
    <div className="drop-stage relative min-h-[360px] overflow-hidden rounded-lg border border-cyan-200/20 bg-[linear-gradient(180deg,rgba(8,13,26,0.98),rgba(28,17,29,0.94)_58%,rgba(60,24,24,0.88))] shadow-[inset_0_-80px_120px_rgba(248,113,113,0.12),0_0_38px_rgba(14,165,233,0.08)]">
      <div className="absolute inset-x-0 top-[85%] z-0 h-1 bg-red-400 shadow-[0_0_28px_rgba(248,113,113,0.72)]" />
      <p className="absolute left-1/2 top-[76%] z-0 -translate-x-1/2 text-xs font-black uppercase tracking-[0.42em] text-red-50/86">hit zone</p>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(180deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[length:25%_100%,100%_25%] opacity-45" />
      {phase === "preview" || phase === "countdown" ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-4 text-center">
          <p className="text-xs font-black uppercase tracking-[0.34em] text-amber-100/70">guided preview</p>
          <h2 className="mt-3 text-4xl font-black text-white">{getGuidedPreviewHeading(step)}</h2>
          <p className="mt-3 max-w-lg text-base font-semibold text-slate-200">{getGuidedPreviewCopy(step)}</p>
          {phase === "countdown" ? (
            <p
              className="mt-6 font-mono text-7xl font-black text-amber-200 drop-shadow-[0_0_28px_rgba(251,191,36,0.38)]"
              data-testid="guided-countdown"
            >
              {countdown}
            </p>
          ) : null}
        </div>
      ) : null}
      {phase === "playing" && showPlayInstruction && introCopy ? (
        <div className="pointer-events-none absolute left-1/2 top-7 z-20 -translate-x-1/2 text-center">
          <h2 className="text-2xl font-black text-white">{step.playTitle}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-300">{introCopy}</p>
        </div>
      ) : null}
      {feedback ? (
        <div className={`pointer-events-none absolute left-1/2 top-[28%] z-30 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-black shadow-[0_0_22px_rgba(251,191,36,0.18)] ${
          feedback === "try-again"
            ? "border border-rose-200/42 bg-rose-950/70 text-rose-100"
            : "border border-amber-100/40 bg-slate-950/74 text-amber-100"
        }`}
        >
          {feedback === "try-again" ? "Try again" : feedback === "quick-find" ? "Quick find!" : "Nice!"}
        </div>
      ) : null}
      {correction ? (
        <div className="pointer-events-none absolute left-1/2 top-[32%] z-30 -translate-x-1/2 rounded-full border border-amber-100/60 bg-amber-200/16 px-5 py-3 text-2xl font-black text-amber-50 shadow-[0_0_28px_rgba(251,191,36,0.22)]">
          {correction.target.note} is here
        </div>
      ) : null}
      {target && phase === "playing" ? <GuidedFallingTarget target={target} progress={progress} /> : null}
    </div>
  );
}

function GuidedFallingTarget({ target, progress }: { target: GuidedTarget; progress: number }) {
  const accent = getStringAccent(target.stringIndex);
  return (
    <div
      className="drop-target absolute left-1/2 z-10 flex h-24 w-24 items-center justify-center rounded-[48%_52%_54%_46%/42%_42%_58%_58%] text-slate-950 drop-shadow-[0_0_32px_rgba(252,211,77,0.72)] will-change-[top]"
      data-target-duration-ms={target.durationMs}
      {...getGuidedTargetTestAttributes(target)}
      style={{
        background: "radial-gradient(circle at 35% 24%, #fff7d6, #facc15 34%, #d97706 68%, #7c2d12)",
        boxShadow: `0 0 34px rgba(252,211,77,0.5), 0 0 14px ${accent.glowColor}`,
        height: DROP_TARGET_HEIGHT_PX,
        top: getTargetTopStyle(progress, DROP_TARGET_HEIGHT_PX),
        transform: "translate3d(-50%, 0, 0) rotate(45deg)",
        width: DROP_TARGET_HEIGHT_PX,
      }}
      aria-label={`Falling target ${target.note}`}
    >
      <span
        className="relative z-10 text-5xl font-black leading-none text-slate-950"
        style={{
          transform: "rotate(-45deg)",
          WebkitTextStroke: "1px rgba(255,251,235,0.32)",
        }}
      >
        {target.note}
      </span>
    </div>
  );
}

export function getGuidedTargetTestAttributes(
  target: GuidedTarget,
  mode = import.meta.env.MODE,
): { "data-target-cell"?: string } {
  if (mode !== "test") return {};
  return { "data-target-cell": createGuidedCellKey(target.stringIndex, target.fret) };
}

function GuidedFretboard({
  activeTarget,
  correction,
  wrongCellFeedback,
  anchorCell,
  previewCells,
  onFretClick,
}: {
  activeTarget: GuidedTarget | null;
  correction: GuidedCorrection | null;
  wrongCellFeedback: GuidedWrongCellFeedback | null;
  anchorCell: Pick<GuidedTarget, "note" | "stringIndex" | "fret"> | null;
  previewCells: readonly Pick<GuidedTarget, "note" | "stringIndex" | "fret">[];
  onFretClick: (stringIndex: number, fret: number) => void;
}) {
  const frets = Array.from({ length: DROP_MAX_FRET - DROP_MIN_FRET + 1 }, (_, index) => index + DROP_MIN_FRET);
  const strings = Array.from({ length: 6 }, (_, index) => index as DropStringIndex);
  return (
    <div className="drop-fretboard overflow-hidden rounded-lg border border-cyan-200/20 bg-[#2d1d12] p-2 shadow-[0_-18px_52px_rgba(0,0,0,0.35)_inset,0_0_34px_rgba(14,165,233,0.08)]">
      <GuidedFretNumberRow frets={frets} />
      <GuidedPositionDotRow frets={frets} />
      {strings.map((stringIndex) => {
          const isActive = activeTarget?.stringIndex === stringIndex;
          const isCorrectionString = correction?.target.stringIndex === stringIndex;
          const accent = getStringAccent(stringIndex);
          return (
            <div key={stringIndex} className="drop-fretboard-string-row relative min-h-8 items-center overflow-visible sm:min-h-9">
              {isActive ? (
                <div
                  className="drop-fretboard-active-rail pointer-events-none absolute top-1/2 right-0 z-0 h-5 -translate-y-1/2 rounded-full border-y border-white/8"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${accent.softColor} 18%, ${accent.strongColor} 50%, ${accent.softColor} 82%, transparent)`,
                    boxShadow: `0 0 10px ${accent.glowColor}`,
                  }}
                />
              ) : null}
              <div className={`relative z-10 pr-2 text-right text-xs font-black ${isActive ? "text-white" : "text-amber-100/40"}`}>
                {stringIndex + 1}
              </div>
              {frets.map((fret) => {
                const previewCell = previewCells.find((cell) => cell.stringIndex === stringIndex && cell.fret === fret);
                const isAnchorCell = anchorCell?.stringIndex === stringIndex && anchorCell.fret === fret;
                const isCorrectionCell = correction?.target.stringIndex === stringIndex && correction.target.fret === fret;
                const isWrongFeedbackCell = wrongCellFeedback?.stringIndex === stringIndex && wrongCellFeedback.fret === fret;
                const isOpen = fret === 0;
                return (
                  <button
                    key={fret}
                    type="button"
                    onClick={() => onFretClick(stringIndex, fret)}
                    className={`drop-fretboard-cell relative z-10 h-full min-h-8 outline-none transition hover:bg-amber-200/12 focus-visible:bg-cyan-300/15 focus-visible:ring-2 focus-visible:ring-cyan-200 sm:min-h-9 ${
                      isOpen ? "border-r-4 border-r-amber-100/85 bg-slate-950/26" : "border-l border-amber-100/18"
                    }`}
                    aria-label={`${getStringFocusLabel(stringIndex)}, ${fret === 0 ? "open string" : `fret ${fret}`}`}
                  >
                    <span
                      className="absolute left-0 right-0 top-1/2 block -translate-y-1/2 rounded-full"
                      style={{
                        backgroundColor: isActive ? accent.color : "rgba(254,243,199,0.26)",
                        boxShadow: isActive ? `0 0 9px ${accent.glowColor}` : undefined,
                        height: isActive ? "4px" : stringIndex < 2 ? "1px" : "2px",
                        opacity: isActive ? 0.92 : 0.38,
                      }}
                    />
                    {previewCell ? (
                      <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-amber-50 bg-amber-200 px-1 font-mono text-sm font-black leading-none text-[#3b2415] shadow-[0_0_16px_rgba(254,243,199,0.52)]">
                        {previewCell.note}
                      </span>
                    ) : null}
                    {isAnchorCell ? (
                      <span
                        className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-100/42 bg-cyan-100/10 px-1 font-mono text-xs font-black leading-none text-cyan-50/72 shadow-[0_0_12px_rgba(125,211,252,0.16)]"
                        data-testid="guided-anchor-cell"
                        aria-label={`${anchorCell.note} anchor on ${getStringFocusLabel(anchorCell.stringIndex)}`}
                      >
                        {anchorCell.note}
                      </span>
                    ) : null}
                    {isCorrectionCell ? (
                      <span
                        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border border-amber-100/90 bg-amber-200/24 shadow-[0_0_20px_rgba(251,191,36,0.36),inset_0_0_16px_rgba(253,230,138,0.24)]"
                        data-testid="guided-correction-cell"
                      >
                        <span className="relative z-10 flex h-7 min-w-7 items-center justify-center rounded-full border border-amber-50 bg-amber-200 px-1 font-mono text-sm font-black leading-none text-[#3b2415]">
                          {correction.target.note}
                        </span>
                      </span>
                    ) : null}
                    {isWrongFeedbackCell ? (
                      <span
                        className="pointer-events-none absolute inset-0 z-10 rounded-md border border-rose-200/80 bg-rose-500/22 shadow-[0_0_18px_rgba(251,113,133,0.28),inset_0_0_14px_rgba(251,113,133,0.18)]"
                        data-testid="guided-wrong-cell"
                      />
                    ) : null}
                    {isOpen ? <span className="absolute inset-y-1 right-0 w-1 rounded-full bg-amber-100 shadow-[0_0_10px_rgba(254,243,199,0.45)]" /> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      <GuidedPositionDotRow frets={frets} />
      <GuidedFretNumberRow frets={frets} />
    </div>
  );
}

function GuidedDevTestResults({
  step,
  result,
  showFluencyExplanation,
  onTestAgain,
  onChooseAnotherStep,
  onExitTestMode,
}: {
  step: GuidedStepDefinition;
  result: GuidedRunResult;
  showFluencyExplanation: boolean;
  onTestAgain: () => void;
  onChooseAnotherStep: () => void;
  onExitTestMode: () => void;
}) {
  const copy = getGuidedResultsCopy(step, result, []);
  return (
    <div className="min-h-[calc(100vh-1px)] bg-[#080a0f] px-4 py-6 text-slate-50">
      <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-2xl border border-cyan-100/12 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.16),transparent_38%),rgba(15,23,42,0.66)] p-5 text-center shadow-[0_28px_90px_rgba(0,0,0,0.36)] sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.38em] text-amber-200/74">development test</p>
          <h1 className="mt-4 text-6xl font-black tracking-tight text-white sm:text-8xl">{result.guidedFluency}</h1>
          <p className="mt-2 text-lg font-semibold text-amber-50/82">Fluency</p>
          {showFluencyExplanation ? (
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-slate-400">Fluency reflects your accuracy and speed.</p>
          ) : null}
          <h2 className="mt-6 text-3xl font-black tracking-tight text-white">{copy.heading}</h2>
          <p className="mx-auto mt-3 max-w-lg text-base font-semibold text-slate-300">{copy.body}</p>
          <p className="mx-auto mt-5 rounded-full border border-cyan-100/16 bg-slate-950/44 px-4 py-2 text-sm font-black text-amber-100">
            {step.partLabel} · {step.title}
          </p>
          <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-2 text-left">
            <GuidedResultStat label="Accuracy" value={`${result.accuracy}%`} />
            <GuidedResultStat label="Correct" value={result.correct} />
            <GuidedResultStat label="Misses" value={result.misses} />
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-3">
            <button
              type="button"
              onClick={onTestAgain}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-amber-300 px-7 text-base font-black text-slate-950 shadow-[0_0_30px_rgba(252,211,77,0.26)] transition hover:bg-amber-200"
            >
              Test this step again
            </button>
            <button
              type="button"
              onClick={onChooseAnotherStep}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-600 px-6 text-sm font-black text-slate-200 transition hover:border-amber-200/40 hover:text-amber-100"
            >
              Choose another step
            </button>
            <button
              type="button"
              onClick={onExitTestMode}
              className="text-sm font-black text-cyan-100/72 underline decoration-cyan-100/24 underline-offset-4 transition hover:text-cyan-50 hover:decoration-cyan-100/70"
            >
              Exit test mode
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function GuidedResults({
  step,
  result,
  progress,
  showFluencyExplanation,
  onPrimaryAction,
  onSwitchToFreePlay,
}: {
  step: GuidedStepDefinition;
  result: GuidedRunResult;
  progress: GuidedProgress;
  showFluencyExplanation: boolean;
  onPrimaryAction: () => void;
  onSwitchToFreePlay: () => void;
}) {
  const completedStepIds = result.isReady || (result.assisted && result.assistedThresholdMet)
    ? Array.from(new Set([...progress.completedStepIds, step.id]))
    : progress.completedStepIds;
  const copy = getGuidedResultsCopy(step, result, completedStepIds);
  const displayProgressView = buildGuidedProgressView(step, completedStepIds, { isReturning: true });
  return (
    <div className="min-h-[calc(100vh-1px)] bg-[#080a0f] px-4 py-6 text-slate-50">
      <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-2xl border border-cyan-100/12 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.16),transparent_38%),rgba(15,23,42,0.66)] p-5 text-center shadow-[0_28px_90px_rgba(0,0,0,0.36)] sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.38em] text-cyan-200/74">guided result</p>
          <h1 className="mt-4 text-6xl font-black tracking-tight text-white sm:text-8xl">{result.guidedFluency}</h1>
          <p className="mt-2 text-lg font-semibold text-amber-50/82">Fluency</p>
          {showFluencyExplanation ? (
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-slate-400">Fluency reflects your accuracy and speed.</p>
          ) : null}
          <h2 className="mt-6 text-3xl font-black tracking-tight text-white">{copy.heading}</h2>
          <p className="mx-auto mt-3 max-w-lg text-base font-semibold text-slate-300">{copy.body}</p>
          {copy.recognition ? (
            <p className="mx-auto mt-4 rounded-full border border-amber-100/20 bg-amber-300/10 px-4 py-2 text-sm font-black text-amber-100">
              {copy.recognition}
            </p>
          ) : null}
          <p className="mx-auto mt-5 text-sm font-semibold text-slate-400">{displayProgressView.overallProgressLabel}</p>
          <GuidedProgressBar
            className="mx-auto mt-2 max-w-md"
            segmentStatuses={displayProgressView.segmentStatuses}
            completedCount={displayProgressView.completedCount}
            totalCount={displayProgressView.totalCount}
          />
          {copy.nextStepPreview ? (
            <p className="mt-4 text-sm font-semibold text-slate-400">{copy.nextStepPreview}</p>
          ) : null}
          {copy.support ? <p className="mt-4 text-sm font-semibold text-slate-400">{copy.support}</p> : null}
          <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-2 text-left">
            <GuidedResultStat label="Accuracy" value={`${result.accuracy}%`} />
            <GuidedResultStat label="Correct" value={result.correct} />
            <GuidedResultStat label="Misses" value={result.misses} />
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-4">
            <button
              type="button"
              onClick={onPrimaryAction}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-amber-300 px-7 text-base font-black text-slate-950 shadow-[0_0_30px_rgba(252,211,77,0.26)] transition hover:bg-amber-200"
            >
              {copy.primaryAction}
            </button>
            <button
              type="button"
              onClick={onSwitchToFreePlay}
              className="text-sm font-black text-cyan-100/72 underline decoration-cyan-100/24 underline-offset-4 transition hover:text-cyan-50 hover:decoration-cyan-100/70"
            >
              Switch to Free Play
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function GuidedResultStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-950/48 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-black text-white">{value}</p>
    </div>
  );
}

function GuidedFretNumberRow({ frets }: { frets: number[] }) {
  return (
    <div className="drop-fretboard-header-row text-center font-mono text-[9px] font-bold text-amber-100/62">
      <div />
      {frets.map((fret) => (
        <div key={fret} className={fret === 0 ? "text-[8px] uppercase text-cyan-100/80" : ""}>
          {fret === 0 ? "Open" : fret}
        </div>
      ))}
    </div>
  );
}

function GuidedPositionDotRow({ frets }: { frets: number[] }) {
  return (
    <div className="drop-fretboard-header-row h-4 items-center">
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

function createGuidedAttemptSummary(stepId: GuidedStepId, result: GuidedRunResult, targetCount: number): GuidedAttemptSummary {
  return {
    completedAt: Date.now(),
    stepId,
    guidedFluency: result.guidedFluency,
    accuracy: result.accuracy,
    correct: result.correct,
    wrong: result.wrong,
    misses: result.misses,
    targetCount,
    assisted: result.assisted,
  };
}

function getGuidedAnchorCell(
  step: GuidedStepDefinition,
  activeTarget: GuidedTarget | null,
  isAssistedRun: boolean,
): Pick<GuidedTarget, "note" | "stringIndex" | "fret"> | null {
  if (!isAssistedRun || !activeTarget || !step.ghostAnchors) return null;
  const anchorNote = getGuidedGhostAnchor(step, activeTarget.note);
  if (!anchorNote) return null;
  return {
    note: anchorNote as Note,
    stringIndex: activeTarget.stringIndex,
    fret: getFretForNoteOnString(anchorNote as Note, activeTarget.stringIndex),
  };
}

function getGuidedAssistedThresholdMet({
  guidedFluency,
  accuracy,
  coverageMet,
}: Pick<GuidedRunResult, "guidedFluency" | "accuracy" | "coverageMet">): boolean {
  return guidedFluency >= GUIDED_ASSISTED_MIN_FLUENCY
    && accuracy >= GUIDED_ASSISTED_MIN_ACCURACY
    && coverageMet;
}

function getGuidedVeryPoor({
  guidedFluency,
  accuracy,
  coverageMet,
}: Pick<GuidedRunResult, "guidedFluency" | "accuracy" | "coverageMet">): boolean {
  return guidedFluency < GUIDED_VERY_POOR_MAX_FLUENCY
    || accuracy < GUIDED_VERY_POOR_MAX_ACCURACY
    || !coverageMet;
}

function getRequiredStringIndexes(step: GuidedStepDefinition, sequence: readonly GuidedTarget[]): readonly DropStringIndex[] {
  if (step.targetNotes.length === 1) return ALL_DROP_STRING_INDEXES;
  return Array.from(new Set(sequence.filter((target) => step.targetNotes.includes(target.note)).map((target) => target.stringIndex)));
}

function getGuidedPreviewHeading(step: GuidedStepDefinition): string {
  return step.introTitle;
}

function getGuidedPreviewCopy(step: GuidedStepDefinition): string {
  return step.previewCopy;
}

function getGuidedPlayingCopy(step: GuidedStepDefinition): string {
  if (step.id === "a") return "Click A on the highlighted string.";
  return "";
}
