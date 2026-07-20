import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import blueGuitarPick from "../../assets/fretboard-drop/blue-guitar-pick.png";
import type { DropPracticeContext, DropStageCue, DropStringSelection, DropTarget } from "./dropGameTypes";
import { getPracticeLabel, getPromptTimeRemaining, getStringAccent, getTargetProgress } from "./dropGameUtils";

export const PICK_START_CONTACT_PERCENT = 12;
export const DEADLINE_CONTACT_PERCENT = 86;

type ResolvedPickSnapshot = {
  target: DropTarget;
  progress: number;
};

type PlayGateState = "idle" | "approach" | "urgent" | "correct" | "miss";

export function getHorizontalDeadlinePickContactPercent(progress: number): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return PICK_START_CONTACT_PERCENT + clampedProgress * (DEADLINE_CONTACT_PERCENT - PICK_START_CONTACT_PERCENT);
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
  const playGateState = getPlayGateState({
    progress: activeProgress,
    isFinalSecond,
    cue,
  });

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
      <HorizontalTravelLane />
      <HorizontalPlayGate state={playGateState} isReducedMotion={isReducedMotion} />
      {activeTarget ? (
        <HorizontalDeadlinePick
          key={activeTarget.id}
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

export function getPlayGateState({
  progress,
  isFinalSecond,
  cue,
}: {
  progress: number;
  isFinalSecond: boolean;
  cue: DropStageCue | null;
}): PlayGateState {
  if (cue?.kind === "miss") return "miss";
  if (cue?.kind === "correct" || cue?.kind === "tier-up") return "correct";
  if (isFinalSecond || progress >= 0.8) return "urgent";
  if (progress >= 0.65) return "approach";
  return "idle";
}

function HorizontalTravelLane() {
  return (
    <div className="horizontal-travel-lane pointer-events-none absolute inset-y-0 left-[12%] right-[14%] z-0" aria-hidden="true">
      <span className="horizontal-travel-lane-line" />
      {[31, 52, 70].map((position) => (
        <span key={position} className="horizontal-travel-lane-marker" style={{ left: `${position}%` }} />
      ))}
    </div>
  );
}

export function HorizontalPlayGate({
  state,
  isReducedMotion,
}: {
  state: PlayGateState;
  isReducedMotion: boolean;
}) {
  return (
    <div
      className={`horizontal-play-gate horizontal-play-gate--${state} pointer-events-none absolute top-[20%] bottom-[18%] z-10`}
      style={{ left: `${DEADLINE_CONTACT_PERCENT}%` }}
      data-testid="horizontal-play-gate"
      data-state={state}
      data-motion={isReducedMotion ? "reduced" : "normal"}
      aria-hidden="true"
    >
      <span className="horizontal-play-gate-zone" />
      <span className="horizontal-play-gate-rail horizontal-play-gate-rail--left" />
      <span className="horizontal-play-gate-rail horizontal-play-gate-rail--right" />
      <span className="horizontal-play-gate-contact" />
      <span className="horizontal-play-gate-charge" />
      <span className="horizontal-play-gate-wave" />
      <span className="horizontal-play-gate-cap horizontal-play-gate-cap--top"><i /><i /><i /></span>
      <span className="horizontal-play-gate-cap horizontal-play-gate-cap--bottom"><i /><i /><i /></span>
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
  const contactPercent = getHorizontalDeadlinePickContactPercent(progress);
  const sizePx = Math.max(52, Math.round(targetSizePx * 0.68));
  const isActive = state === "active";
  const travelRef = useRef<HTMLDivElement>(null);
  useActivePickTravel(travelRef, isActive ? target : null);
  const travelStyle: CSSProperties = {
    "--pick-contact-percent": `${contactPercent}%`,
    "--pick-art-size": `clamp(52px, 7vw, ${sizePx}px)`,
  } as CSSProperties;

  return (
    <div
      className={`horizontal-deadline-pick-travel horizontal-deadline-pick-travel--${state} pointer-events-none absolute top-1/2 z-20 ${
        isActive ? "horizontal-deadline-pick-travel--active" : ""
      }`}
      ref={travelRef}
      style={travelStyle}
      data-testid="horizontal-deadline-pick-travel"
      data-state={state}
      data-target-id={target.id}
    >
      <PickTargetIndicator
        note={target.note}
        state={state}
        isFinalSecond={isFinalSecond}
        progress={progress}
        contactPercent={contactPercent}
        aria-label={state === "active" ? `Note prompt ${target.note} (active)` : undefined}
      />
    </div>
  );
}

function PickTargetIndicator({
  note,
  state,
  isFinalSecond,
  progress,
  contactPercent,
  "aria-label": ariaLabel,
}: {
  note: string;
  state: "active" | "resolved-correct";
  isFinalSecond: boolean;
  progress: number;
  contactPercent: number;
  "aria-label"?: string;
}) {
  return (
    <div
      className={`horizontal-deadline-pick horizontal-deadline-pick--${state} ${isFinalSecond ? "horizontal-deadline-pick--final-second" : ""} pointer-events-none absolute left-0 top-0`}
      aria-label={ariaLabel}
      aria-hidden={state === "resolved-correct" ? "true" : undefined}
      data-testid="horizontal-deadline-pick"
      data-progress={progress.toFixed(3)}
      data-position-percent={contactPercent.toFixed(2)}
      data-state={state}
      data-final-second={isFinalSecond ? "true" : "false"}
    >
      <span className="horizontal-deadline-pick-contact" data-testid="horizontal-deadline-pick-contact" aria-hidden="true" />
      <img className="horizontal-deadline-pick-artwork" src={blueGuitarPick} alt="" aria-hidden="true" data-testid="horizontal-deadline-pick-artwork" />
      <span className="horizontal-deadline-pick-note" aria-hidden="true">{note}</span>
    </div>
  );
}

function useActivePickTravel(
  travelRef: RefObject<HTMLDivElement | null>,
  target: DropTarget | null,
): void {
  useLayoutEffect(() => {
    const travelElement = travelRef.current;
    if (!travelElement || !target) return undefined;

    const applyPosition = () => {
      const progress = getTargetProgress(target, performance.now());
      const contactPercent = getHorizontalDeadlinePickContactPercent(progress);
      travelElement.style.setProperty("--pick-contact-percent", `${contactPercent}%`);
      const pickElement = travelElement.querySelector<HTMLElement>("[data-testid='horizontal-deadline-pick']");
      if (pickElement) {
        pickElement.dataset.progress = progress.toFixed(3);
        pickElement.dataset.positionPercent = contactPercent.toFixed(2);
      }
    };

    let frame = 0;
    const advance = () => {
      applyPosition();
      frame = requestAnimationFrame(advance);
    };

    applyPosition();
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [target, travelRef]);
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
  const contactPercent = getHorizontalDeadlinePickContactPercent(progress);
  const sizePx = Math.max(64, Math.round(targetSizePx * 0.9));

  return (
    <div
      className="horizontal-deadline-impact pointer-events-none absolute top-1/2 z-20"
      style={{
        left: `${contactPercent}%`,
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
