import { useEffect, useRef, useState } from "react";
import type { DropPracticeContext, DropStageCue, DropStringSelection, DropTarget } from "./dropGameTypes";
import { getPracticeLabel, getPromptTimeRemaining, getStringAccent, getTargetProgress } from "./dropGameUtils";

const PICK_START_RIGHT_PERCENT = 12;
const DEADLINE_RIGHT_PERCENT = 86;

type ResolvedPickSnapshot = {
  target: DropTarget;
  progress: number;
};

export function getHorizontalDeadlinePickRightPercent(progress: number): number {
  return PICK_START_RIGHT_PERCENT + getTargetProgress({ startedAt: 0, durationMs: 1 }, progress) * (DEADLINE_RIGHT_PERCENT - PICK_START_RIGHT_PERCENT);
}

export function HorizontalDeadlineStage({
  cue,
  fallingTargets,
  animationTime,
  activeTargetId,
  combo,
  stringSelection,
  practiceContext,
  targetSizePx,
}: {
  cue: DropStageCue | null;
  fallingTargets: readonly DropTarget[];
  animationTime: number;
  activeTargetId: number | null;
  combo: number;
  stringSelection: DropStringSelection;
  practiceContext: DropPracticeContext;
  targetSizePx: number;
}) {
  const activeTarget = fallingTargets.find((target) => target.id === activeTargetId) ?? null;
  const activeProgress = getTargetProgress(activeTarget, animationTime);
  const isFinalSecond = Boolean(activeTarget && activeTarget.durationMs * getPromptTimeRemaining(activeProgress) <= 1_000);
  const lastActiveRef = useRef<ResolvedPickSnapshot | null>(null);
  const resolvedPick = cue && (cue.kind === "correct" || cue.kind === "tier-up" || cue.kind === "miss")
    ? lastActiveRef.current
    : null;
  const isResolvedHitCue = cue?.kind === "correct" || cue?.kind === "tier-up";
  const isMissCue = cue?.kind === "miss";
  const isReducedMotion = usePrefersReducedMotion();
  const focusLabel = `Focus: ${getPracticeLabel(stringSelection, practiceContext)}`;
  const deadlineState = cue?.kind === "miss" ? "miss" : activeProgress >= 0.8 ? "urgent" : "idle";

  useEffect(() => {
    if (!activeTarget) return;
    lastActiveRef.current = {
      target: activeTarget,
      progress: getTargetProgress(activeTarget, animationTime),
    };
  }, [activeTarget, animationTime]);

  return (
    <div
      className={`horizontal-deadline-stage relative min-h-[170px] overflow-hidden rounded-lg border border-cyan-200/18 bg-slate-950/88 transition-colors duration-150 sm:min-h-[190px] lg:min-h-[220px] ${
        cue?.kind === "miss" ? "border-red-300/48" : "border-cyan-300/18"
      }`}
      data-testid="horizontal-deadline-stage"
      data-motion={isReducedMotion ? "reduced" : "normal"}
    >
      <div className="absolute left-3 top-3 z-20 rounded-full border border-cyan-200/16 bg-slate-950/54 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/70">
        {focusLabel}
      </div>
      {combo >= 3 ? (
        <div className="absolute right-3 top-3 z-20 rounded-full border border-amber-100/28 bg-amber-300/12 px-3 py-1 text-xs font-black text-amber-100/82">
          {combo} streak
        </div>
      ) : null}
      <div
        className={`horizontal-deadline-line horizontal-deadline-line--${deadlineState} pointer-events-none absolute top-[20%] bottom-[18%] z-10 w-px`}
        style={{ left: `${DEADLINE_RIGHT_PERCENT}%` }}
        data-testid="horizontal-deadline-line"
        data-state={deadlineState}
        aria-hidden="true"
      />
      {activeTarget ? (
        <HorizontalDeadlinePick
          target={activeTarget}
          progress={activeProgress}
          targetSizePx={targetSizePx}
          state="active"
          isFinalSecond={isFinalSecond}
        />
      ) : null}
      {resolvedPick && isResolvedHitCue ? (
        <HorizontalDeadlinePick
          key={`resolved-${cue?.id}`}
          target={resolvedPick.target}
          progress={resolvedPick.progress}
          targetSizePx={targetSizePx}
          state="resolved-correct"
          isFinalSecond={false}
        />
      ) : null}
      {resolvedPick && isMissCue ? (
        <MissImpact
          key={`miss-${cue?.id}`}
          target={resolvedPick.target}
          progress={1}
          targetSizePx={targetSizePx}
          isReducedMotion={isReducedMotion}
        />
      ) : null}
      {cue && cue.kind !== "miss" ? <HorizontalStageCue cue={cue} /> : null}
    </div>
  );
}

function HorizontalDeadlinePick({
  target,
  progress,
  targetSizePx,
  state,
  isFinalSecond,
}: {
  target: DropTarget;
  progress: number;
  targetSizePx: number;
  state: "active" | "resolved-correct";
  isFinalSecond: boolean;
}) {
  const accent = getStringAccent(target.stringIndex);
  const rightEdgePercent = getHorizontalDeadlinePickRightPercent(progress);
  const sizePx = Math.max(64, Math.round(targetSizePx * 0.9));

  return (
    <div
      className={`horizontal-deadline-pick horizontal-deadline-pick--${state} ${isFinalSecond ? "horizontal-deadline-pick--final-second" : ""} pointer-events-none absolute top-1/2 z-20 flex items-center justify-center`}
      style={{
        left: `${rightEdgePercent}%`,
        width: sizePx,
        height: sizePx,
        color: accent.color,
      }}
      aria-label={state === "active" ? `Note prompt ${target.note} (active)` : undefined}
      aria-hidden={state === "resolved-correct" ? "true" : undefined}
      data-testid="horizontal-deadline-pick"
      data-progress={progress.toFixed(3)}
      data-position-percent={rightEdgePercent.toFixed(2)}
      data-state={state}
      data-final-second={isFinalSecond ? "true" : "false"}
    >
      <span className="horizontal-deadline-pick-body absolute inset-0" aria-hidden="true" />
      <span className="horizontal-deadline-pick-note relative z-10 font-black leading-none text-slate-950">
        {target.note}
      </span>
    </div>
  );
}

function MissImpact({
  target,
  progress,
  targetSizePx,
  isReducedMotion,
}: {
  target: DropTarget;
  progress: number;
  targetSizePx: number;
  isReducedMotion: boolean;
}) {
  const accent = getStringAccent(target.stringIndex);
  const rightEdgePercent = getHorizontalDeadlinePickRightPercent(progress);
  const sizePx = Math.max(64, Math.round(targetSizePx * 0.9));

  return (
    <div
      className="horizontal-deadline-impact pointer-events-none absolute top-1/2 z-20"
      style={{
        left: `${rightEdgePercent}%`,
        width: sizePx,
        height: sizePx,
        color: accent.color,
      }}
      data-testid="horizontal-deadline-impact"
      data-motion={isReducedMotion ? "reduced" : "normal"}
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={`horizontal-deadline-fragment horizontal-deadline-fragment-${index + 1}`}
        />
      ))}
    </div>
  );
}

function HorizontalStageCue({ cue }: { cue: DropStageCue }) {
  const cueClass =
    cue.kind === "wrong"
      ? "border-red-200/42 bg-red-400/12 text-red-50"
      : cue.kind === "tier-up"
        ? "border-cyan-100/58 bg-cyan-300/14 text-cyan-50"
        : "border-amber-100/58 bg-amber-300/16 text-amber-50";

  return (
    <div className={`absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-black shadow-lg backdrop-blur-sm ${cueClass}`}>
      {cue.message}
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [isReduced, setIsReduced] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setIsReduced(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isReduced;
}
