import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DROP_PRACTICE_CONTEXT,
  DROP_RUN_FORMAT_STORAGE_KEY,
  DROP_SPEED_MODE_STORAGE_KEY,
  createInitialDropState,
  getDropSpeedModeConfig,
  getTargetProgress,
  writeBestDropScore,
} from "./dropGameUtils";
import { appendCompletedRunToHistory } from "./dropRunHistory";
import { FretboardDropGame, dropGameReducer } from "./FretboardDropGame";
import type { DropFocusPoolCell, DropSpeedMode } from "./dropGameTypes";
import {
  DEADLINE_CONTACT_PERCENT,
  HorizontalDeadlineStage,
  PICK_START_CONTACT_PERCENT,
  getHorizontalDeadlinePickContactPercent,
} from "./HorizontalDeadlineStage";
import {
  DROP_CELL_PROGRESS_STORAGE_KEY,
  LocalStorageCellProgressRepository,
  createEmptyCellProgress,
  createFretboardCellId,
  recordCorrectResolution,
  recordMissResolution,
  recordWrongFretTap,
} from "./dropCellProgress";

function getActiveNotePromptLabel(label: string | RegExp = /.+/) {
  if (typeof label === "string") {
    return screen.getByLabelText(`Note prompt ${label} (active)`);
  }
  return screen.getByLabelText(new RegExp(`Note prompt ${label.source} \\(active\\)`));
}

function getStringButton(label: string): HTMLElement {
  return screen.getAllByRole("button", { name: label })[0];
}

function getPracticeNoteButton(note: string): HTMLElement {
  return screen.getByRole("button", { name: `Practice note ${note}` });
}

function getHorizontalDeadlinePick(state = "active"): HTMLElement {
  return screen.getAllByTestId("horizontal-deadline-pick").find((pick) => pick.getAttribute("data-state") === state)!;
}

function getHorizontalDeadlinePickTravel(state = "active"): HTMLElement {
  return screen.getAllByTestId("horizontal-deadline-pick-travel").find((pick) => pick.getAttribute("data-state") === state)!;
}

function togglePracticeNote(note: string): void {
  fireEvent.click(getPracticeNoteButton(note));
}

function selectAOnly(): void {
  for (const note of ["C", "D", "E", "F", "G", "B"]) togglePracticeNote(note);
}

function selectPracticeTempo(): void {
  fireEvent.click(screen.getByRole("button", { name: /Practice Tempo/ }));
}

function readCellProgressRecord(cellId: string) {
  const rawSnapshot = window.localStorage.getItem(DROP_CELL_PROGRESS_STORAGE_KEY);
  if (!rawSnapshot) return undefined;
  return JSON.parse(rawSnapshot).cells?.[cellId];
}

async function flushCellProgress(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function seedStatsCell(): Promise<void> {
  let record = createEmptyCellProgress({ stringIndex: 0, fret: 5, noteName: "A" }, "2026-06-13T16:00:00.000Z");
  for (let index = 0; index < 3; index += 1) {
    record = recordCorrectResolution(record, 0.22, `2026-06-13T16:0${index}:00.000Z`);
  }
  await new LocalStorageCellProgressRepository().upsertCells([record]);
}

async function seedDetailedStatsCell(): Promise<void> {
  let record = createEmptyCellProgress({ stringIndex: 0, fret: 5, noteName: "A" }, "2026-06-13T16:00:00.000Z");
  record = recordCorrectResolution(record, 0.24, "2026-06-13T16:00:00.000Z");
  record = recordCorrectResolution(record, 0.24, "2026-06-13T16:01:00.000Z");
  record = recordMissResolution(record, "2026-06-13T16:02:00.000Z");
  record = recordWrongFretTap(recordWrongFretTap(record, 4, "2026-06-13T16:03:00.000Z"), 1, "2026-06-13T16:04:00.000Z");
  await new LocalStorageCellProgressRepository().upsertCells([record]);
}

async function seedWeakFocusCell(): Promise<void> {
  const record = {
    ...createEmptyCellProgress({ stringIndex: 0, fret: 5, noteName: "A" }, "2026-06-13T16:00:00.000Z"),
    resolvedTargets: 3,
    correctHits: 0,
    misses: 3,
    recentResolutions: [
      { occurredAt: "2026-06-13T16:00:00.000Z", outcome: "miss" as const },
      { occurredAt: "2026-06-13T16:01:00.000Z", outcome: "miss" as const },
      { occurredAt: "2026-06-13T16:02:00.000Z", outcome: "miss" as const },
    ],
  };
  await new LocalStorageCellProgressRepository().upsertCells([record]);
}

function startHorizontalReducerGame({
  now = 1_000,
  speedMode = "warm-up",
  runMode = "normal",
  runFormat = "timed-trial",
  focusPool = [],
}: {
  now?: number;
  speedMode?: DropSpeedMode;
  runMode?: "normal" | "focus";
  runFormat?: "timed-trial" | "survival";
  focusPool?: readonly DropFocusPoolCell[];
} = {}) {
  return dropGameReducer(createInitialDropState(now), {
    type: "start",
    now,
    bestScore: 0,
    stringSelection: [0],
    practiceContext: DEFAULT_DROP_PRACTICE_CONTEXT,
    speedMode,
    runFormat,
    runMode,
    focusPool,
    isHorizontalMode: true,
  });
}

describe("FretboardDropGame", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("keeps the active horizontal target unchanged after a wrong answer until its original deadline", () => {
    let state = startHorizontalReducerGame();
    const original = state.fallingTargets[0]!;
    const wrongFret = original.fret === 0 ? 1 : 0;

    state = dropGameReducer(state, {
      type: "fret-click",
      now: original.startedAt + 2_000,
      stringIndex: original.stringIndex,
      fret: wrongFret,
      note: original.note,
    });

    expect(state.fallingTargets).toEqual([original]);
    expect(getTargetProgress(state.fallingTargets[0]!, original.startedAt + 2_000)).toBeCloseTo(2_000 / original.durationMs);

    state = dropGameReducer(state, { type: "tick", now: state.nextStreamSpawnAt + 1 });
    expect(state.fallingTargets).toEqual([original]);

    state = dropGameReducer(state, { type: "tick", now: original.startedAt + original.durationMs - 1 });
    expect(state.fallingTargets).toEqual([original]);

    state = dropGameReducer(state, { type: "tick", now: original.startedAt + original.durationMs });
    expect(state.fallingTargets).toHaveLength(0);
    expect(state.missReveal).not.toBeNull();
  });

  it("creates a fresh horizontal target after a correct answer, even after a long-lived wrong-answer target", () => {
    let state = startHorizontalReducerGame();
    const original = state.fallingTargets[0]!;

    state = dropGameReducer(state, {
      type: "fret-click",
      now: original.startedAt + 3_000,
      stringIndex: original.stringIndex,
      fret: original.fret === 0 ? 1 : 0,
      note: original.note,
    });

    const correctAt = original.startedAt + 5_000;
    state = dropGameReducer(state, {
      type: "fret-click",
      now: correctAt,
      stringIndex: original.stringIndex,
      fret: original.fret,
      note: original.note,
    });

    const replacement = state.fallingTargets[0]!;
    expect(state.fallingTargets).toHaveLength(1);
    expect(replacement.id).not.toBe(original.id);
    expect(replacement.startedAt).toBe(correctAt);
    expect(getTargetProgress(replacement, correctAt)).toBe(0);
  });

  it("rebases the post-miss horizontal replacement to the miss-recovery action time", () => {
    let state = startHorizontalReducerGame();
    const original = state.fallingTargets[0]!;
    const expiredAt = original.startedAt + original.durationMs;

    state = dropGameReducer(state, { type: "tick", now: expiredAt });
    const missReveal = state.missReveal!;
    expect(state.nextStreamSpawnAt).toBeLessThan(expiredAt);

    const recoveryAt = expiredAt + 520;
    state = dropGameReducer(state, { type: "finish-miss-reveal", id: missReveal.id, now: recoveryAt });

    const replacement = state.fallingTargets[0]!;
    expect(state.fallingTargets).toHaveLength(1);
    expect(replacement.startedAt).toBe(recoveryAt);
    expect(getTargetProgress(replacement, recoveryAt)).toBe(0);
    expect(state.nextStreamSpawnAt).toBeGreaterThan(recoveryAt);
  });

  it("creates fresh focus-practice replacements from the selected focus pool", () => {
    const focusPool: readonly DropFocusPoolCell[] = [{
      cellId: "standard:0:5",
      note: "A",
      stringIndex: 0,
      fret: 5,
      fluencyScore: 12,
    }];
    let state = startHorizontalReducerGame({ runMode: "focus", focusPool });
    const original = state.fallingTargets[0]!;
    const correctAt = original.startedAt + 1_500;

    state = dropGameReducer(state, {
      type: "fret-click",
      now: correctAt,
      stringIndex: original.stringIndex,
      fret: original.fret,
      note: original.note,
    });

    const replacement = state.fallingTargets[0]!;
    expect(replacement).toMatchObject({
      startedAt: correctAt,
      note: focusPool[0].note,
      stringIndex: focusPool[0].stringIndex,
      fret: focusPool[0].fret,
    });
    expect(getTargetProgress(replacement, correctAt)).toBe(0);
  });

  it("uses a fresh replacement timestamp across every speed mode without changing configured durations", () => {
    for (const speedMode of ["warm-up", "practice-tempo", "performance-tempo"] as const) {
      let state = startHorizontalReducerGame({ speedMode });
      const original = state.fallingTargets[0]!;
      const correctAt = original.startedAt + 250;

      state = dropGameReducer(state, {
        type: "fret-click",
        now: correctAt,
        stringIndex: original.stringIndex,
        fret: original.fret,
        note: original.note,
      });

      const replacement = state.fallingTargets[0]!;
      const speedConfig = getDropSpeedModeConfig(speedMode);
      expect(replacement.startedAt).toBe(correctAt);
      expect(getTargetProgress(replacement, correctAt)).toBe(0);
      expect(replacement.durationMs).toBeGreaterThanOrEqual(speedConfig.minDurationMs);
      expect(replacement.durationMs).toBeLessThanOrEqual(speedConfig.maxDurationMs);
    }
  });

  it("shows practice strings on the start screen with high E selected by default", () => {
    render(<FretboardDropGame />);

    expect(screen.getByText("Read the note, find it on the fretboard, and answer before the pick reaches the line.")).toBeInTheDocument();
    expect(screen.getByText("Practice Strings")).toBeInTheDocument();
    expect(screen.getByText("Practice notes:")).toBeInTheDocument();
    expect(screen.getByText("Pick Speed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Warm-Up/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Practice Tempo/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Performance Tempo/ })).toHaveAttribute("aria-pressed", "false");
    for (const note of ["C", "D", "E", "F", "G", "A", "B"]) {
      expect(getPracticeNoteButton(note)).toHaveAttribute("aria-pressed", "true");
    }
    expect(screen.getByRole("button", { name: "All practice notes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "high E" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stats" })).toBeInTheDocument();
  });

  it("persists the selected Fretboard Drop speed mode from setup", () => {
    window.localStorage.clear();
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: /Performance Tempo/ }));

    expect(screen.getByRole("button", { name: /Performance Tempo/ })).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem(DROP_SPEED_MODE_STORAGE_KEY)).toBe("performance-tempo");
  });

  it("opens Stats from the start screen and returns back", async () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));

    expect(await screen.findByRole("heading", { name: "Your Fretboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fluency" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Play a few runs to start mapping your fretboard.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: "Start Run" })).toBeInTheDocument();
  });

  it("starts a run from the Stats play action", async () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(await screen.findByRole("heading", { name: "Your Fretboard" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Play" })[0]);

    expect(getActiveNotePromptLabel()).toBeInTheDocument();
  });

  it("renders the horizontal deadline stage when the feature flag is enabled", () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    const stage = screen.getByTestId("horizontal-deadline-stage");
    expect(stage).toBeInTheDocument();
    expect(getActiveNotePromptLabel()).toBeInTheDocument();
    expect(stage.querySelector(".drop-note-prompt")).toBeNull();
  });

  it("preserves the old drop stage when the horizontal deadline feature flag is disabled", () => {
    const { container } = render(<FretboardDropGame useHorizontalDeadlineStage={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(screen.queryByTestId("horizontal-deadline-stage")).not.toBeInTheDocument();
    expect(container.querySelector(".drop-stage")).toBeInTheDocument();
    expect(getActiveNotePromptLabel()).toBeInTheDocument();
  });

  it("maps the active pick position from existing target progress", () => {
    vi.spyOn(performance, "now").mockReturnValue(1_500);
    const target = {
      id: 7,
      targetKey: "standard:0:5" as const,
      stringId: "standard:0" as const,
      note: "A" as const,
      stringIndex: 0 as const,
      fret: 5,
      startedAt: 1_000,
      durationMs: 5_000,
      stageXPercent: 20,
      stageYPercent: 20,
    };
    const progress = getTargetProgress(target, 1_500);

    render(
      <HorizontalDeadlineStage
        cue={null}
        fallingTargets={[target]}
        animationTime={1_500}
        activeTargetId={target.id}
        combo={0}
        stringSelection={[0]}
        practiceContext={{ practiceType: "string-focus", selectedNotes: null }}
        targetSizePx={88}
      />,
    );

    const pick = getHorizontalDeadlinePick();
    const travel = getHorizontalDeadlinePickTravel();
    expect(pick).toHaveAttribute("data-progress", progress.toFixed(3));
    expect(pick).toHaveAttribute("data-position-percent", getHorizontalDeadlinePickContactPercent(progress).toFixed(2));
    expect(travel).toHaveClass("horizontal-deadline-pick-travel--active");
    expect(travel.style.getPropertyValue("--pick-contact-percent")).toBe(`${getHorizontalDeadlinePickContactPercent(progress)}%`);
    expect(screen.getByTestId("horizontal-play-gate")).toHaveStyle({ left: `${DEADLINE_CONTACT_PERCENT}%` });
    expect(screen.getByTestId("horizontal-play-gate")).toHaveAttribute("data-state", "idle");
    expect(getHorizontalDeadlinePickContactPercent(0)).toBe(PICK_START_CONTACT_PERCENT);
    expect(getHorizontalDeadlinePickContactPercent(1)).toBe(DEADLINE_CONTACT_PERCENT);
  });

  it("derives Play Gate approach, urgent, success, and miss states from existing progress and cues", () => {
    const target = {
      id: 17,
      targetKey: "standard:0:5" as const,
      stringId: "standard:0" as const,
      note: "A" as const,
      stringIndex: 0 as const,
      fret: 5,
      startedAt: 1_000,
      durationMs: 5_000,
      stageXPercent: 20,
      stageYPercent: 20,
    };
    const stageProps = {
      fallingTargets: [target],
      activeTargetId: target.id,
      combo: 0,
      stringSelection: [0] as const,
      practiceContext: { practiceType: "string-focus" as const, selectedNotes: null },
      targetSizePx: 88,
    };
    const { rerender } = render(<HorizontalDeadlineStage {...stageProps} cue={null} animationTime={4_500} />);

    expect(screen.getByTestId("horizontal-play-gate")).toHaveAttribute("data-state", "approach");

    rerender(<HorizontalDeadlineStage {...stageProps} cue={null} animationTime={5_250} />);
    expect(screen.getByTestId("horizontal-play-gate")).toHaveAttribute("data-state", "urgent");

    rerender(<HorizontalDeadlineStage {...stageProps} cue={{ id: 1, kind: "correct", note: "A", message: "Correct" }} animationTime={5_250} />);
    expect(screen.getByTestId("horizontal-play-gate")).toHaveAttribute("data-state", "correct");

    rerender(<HorizontalDeadlineStage {...stageProps} cue={{ id: 2, kind: "tier-up", note: "A", message: "Tier up" }} animationTime={5_250} />);
    expect(screen.getByTestId("horizontal-play-gate")).toHaveAttribute("data-state", "correct");

    rerender(<HorizontalDeadlineStage {...stageProps} cue={{ id: 3, kind: "miss", note: "A", message: "Miss" }} animationTime={5_250} />);
    expect(screen.getByTestId("horizontal-play-gate")).toHaveAttribute("data-state", "miss");
  });

  it("moves the normal-run horizontal pick from the reducer game clock through the deadline", () => {
    let nextAnimationFrame: FrameRequestCallback | null = null;
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    render(<FretboardDropGame />);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    const startPick = getHorizontalDeadlinePick();
    expect(getHorizontalDeadlinePickTravel()).toHaveClass("horizontal-deadline-pick-travel--active");
    expect(startPick).toHaveAttribute("data-progress", "0.000");
    expect(startPick).toHaveAttribute("data-position-percent", "12.00");

    now.mockReturnValue(4_000);
    act(() => {
      nextAnimationFrame?.(4_000);
    });
    const middlePick = getHorizontalDeadlinePick();
    const middleProgress = Number(middlePick.dataset.progress);
    expect(middleProgress).toBeGreaterThan(0);
    expect(Number(middlePick.dataset.positionPercent)).toBeGreaterThan(12);

    now.mockReturnValue(7_900);
    act(() => {
      nextAnimationFrame?.(7_900);
    });
    const deadlinePick = getHorizontalDeadlinePick();
    expect(Number(deadlinePick.dataset.progress)).toBeGreaterThan(middleProgress);
    expect(Number(deadlinePick.dataset.positionPercent)).toBeGreaterThan(80);
  });

  it("moves the Focus Practice pick from the reducer game clock while retaining the selected pool target", async () => {
    let nextAnimationFrame: FrameRequestCallback | null = null;
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    await seedWeakFocusCell();
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(await screen.findByText("1 eligible cell found. Using all of them.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Practice weakest" }));
    expect(getActiveNotePromptLabel("A")).toBeInTheDocument();

    const startPick = getHorizontalDeadlinePick();
    const startProgress = Number(startPick.dataset.progress);
    const startPosition = Number(startPick.dataset.positionPercent);
    now.mockReturnValue(4_000);
    act(() => {
      nextAnimationFrame?.(4_000);
    });

    const movingPick = getHorizontalDeadlinePick();
    expect(getActiveNotePromptLabel("A")).toBeInTheDocument();
    expect(getHorizontalDeadlinePickTravel()).toHaveClass("horizontal-deadline-pick-travel--active");
    expect(Number(movingPick.dataset.progress)).toBeGreaterThan(startProgress);
    expect(Number(movingPick.dataset.positionPercent)).toBeGreaterThan(startPosition);
  });

  it("spawns the next horizontal pick from the left after the active pick is resolved", () => {
    let nextAnimationFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    render(<FretboardDropGame />);
    selectAOnly();
    selectPracticeTempo();
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    const startPosition = getHorizontalDeadlinePickRightPercent(0).toFixed(2);

    act(() => {
      nextAnimationFrame?.(performance.now() + 3_000);
    });

    expect(
      screen.getAllByTestId("horizontal-deadline-pick").filter((pick) => pick.getAttribute("data-state") === "active"),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "String 1, fret 5" }));

    const newPick = getHorizontalDeadlinePick("active");
    expect(newPick).toHaveAttribute("data-position-percent", startPosition);
    expect(newPick).toHaveAttribute("data-progress", "0.000");
  });

  it("uses compact pick sizing in phone landscape while keeping the deadline visible", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query.includes("orientation: landscape"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(<FretboardDropGame />);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(screen.getByTestId("horizontal-play-gate")).toBeInTheDocument();
    expect(getHorizontalDeadlinePickTravel()).toHaveStyle({ width: "65px", height: "65px" });
  });

  it("keeps setup and run details available behind a toggle in phone landscape", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query.includes("orientation: landscape"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(<FretboardDropGame />);

    expect(screen.getByRole("button", { name: "Show details" })).toBeInTheDocument();
    expect(screen.queryByText(/New to these strings/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByText(/New to these strings/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide details" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(screen.queryByText("Combo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show run details" }));
    expect(screen.getByText("Combo")).toBeInTheDocument();
    expect(screen.getByText("Best")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide run details" })).toBeInTheDocument();
    expect(screen.getAllByText(/Focus:/).length).toBeGreaterThan(0);
  });

  it("marks the horizontal stage reduced-motion fallback when requested", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(<FretboardDropGame />);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(screen.getByTestId("horizontal-deadline-stage")).toHaveAttribute("data-motion", "reduced");
  });

  it("keeps horizontal pick travel active when reduced motion is requested", () => {
    let nextAnimationFrame: FrameRequestCallback | null = null;
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    render(<FretboardDropGame />);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));
    const startPick = getHorizontalDeadlinePick();
    const startPosition = Number(startPick.dataset.positionPercent);

    now.mockReturnValue(4_000);
    act(() => {
      nextAnimationFrame?.(4_000);
    });

    const movingPick = getHorizontalDeadlinePick();
    expect(screen.getByTestId("horizontal-deadline-stage")).toHaveAttribute("data-motion", "reduced");
    expect(getHorizontalDeadlinePickTravel()).toHaveClass("horizontal-deadline-pick-travel--active");
    expect(Number(movingPick.dataset.positionPercent)).toBeGreaterThan(startPosition);
  });

  it("switches Stats metrics and keeps no-data cells neutral", async () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(await screen.findByRole("heading", { name: "Your Fretboard" })).toBeInTheDocument();
    expect(screen.getByLabelText("Fluency legend: No score, Needs work, Developing, Solid, Strong.")).toBeInTheDocument();
    for (const label of ["No score", "Needs work", "Developing", "Solid", "Strong"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    const expectedLegendLabel = {
      "Recall speed": "Recall speed legend: No timing, Slower, Faster.",
      Accuracy: "Accuracy legend: No results, Lower, Higher.",
      Attempts: "Attempts legend: Not asked, Some exposure, Well sampled.",
    };

    for (const metric of ["Recall speed", "Accuracy", "Attempts"] as const) {
      fireEvent.click(screen.getByRole("button", { name: metric }));
      expect(screen.getByRole("button", { name: metric })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByLabelText(expectedLegendLabel[metric])).toBeInTheDocument();
    }

    const unstudiedCell = screen.getByTestId("stats-cell-standard:0:5");
    expect(unstudiedCell).toHaveAccessibleName(/Evidence: Not enough data/);
    expect(unstudiedCell).not.toHaveAccessibleName(/weak/i);
    expect(screen.getByLabelText("Attempts legend: Not asked, Some exposure, Well sampled.")).not.toHaveTextContent(/Strong/);
  });

  it("shows scored cell data on the Stats fretboard", async () => {
    await seedStatsCell();
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));

    const scoredCell = await screen.findByRole("button", {
      name: /A, high E, fret 5.*Fluency: \d+ Fluency/,
    });
    expect(scoredCell).toHaveAccessibleName(/A, high E, fret 5/);

    fireEvent.click(screen.getByRole("button", { name: "Accuracy" }));

    expect(scoredCell).toHaveAccessibleName(/Accuracy: 100% accuracy/);
  });

  it("selects a Stats cell and shows compact evidence details", async () => {
    await seedDetailedStatsCell();
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));

    const scoredCell = await screen.findByTestId("stats-cell-standard:0:5");
    fireEvent.click(scoredCell);

    const details = screen.getByRole("region", { name: "A · high E · Fret 5" });
    expect(within(details).getByText("Fluency")).toBeInTheDocument();
    expect(within(details).getByText("Early estimate")).toBeInTheDocument();
    expect(within(details).getByText("Resolved attempts")).toBeInTheDocument();
    expect(within(details).getByText("3")).toBeInTheDocument();
    expect(within(details).getByText("Correct hits")).toBeInTheDocument();
    expect(within(details).getByText("2")).toBeInTheDocument();
    expect(within(details).getByText("Misses")).toBeInTheDocument();
    expect(within(details).getByText("67% (2/3)")).toBeInTheDocument();
    expect(within(details).getByText("Very early (24% down)")).toBeInTheDocument();
    expect(within(details).getByText("Adjacent wrong taps")).toBeInTheDocument();
    expect(within(details).getByText("Other wrong taps")).toBeInTheDocument();
  });

  it("filters Stats cells without changing gameplay practice settings", async () => {
    render(<FretboardDropGame />);

    fireEvent.click(getStringButton("B"));
    selectAOnly();
    expect(getStringButton("B")).toHaveAttribute("aria-pressed", "true");
    expect(getPracticeNoteButton("A")).toHaveAttribute("aria-pressed", "true");
    expect(getPracticeNoteButton("C")).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(await screen.findByRole("heading", { name: "Your Fretboard" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "C" }));
    fireEvent.click(screen.getAllByRole("button", { name: "G" })[1]);

    expect(screen.getByRole("button", { name: "All notes" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "C" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: "G" })[1]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("stats-cell-standard:0:5")).toHaveAccessibleName(/Filtered out by current Stats filters/);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { name: "All notes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All strings" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(getStringButton("B")).toHaveAttribute("aria-pressed", "true");
    expect(getPracticeNoteButton("A")).toHaveAttribute("aria-pressed", "true");
    expect(getPracticeNoteButton("C")).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps 2D Stats as default and preserves state when toggling 3D Explore", async () => {
    await seedWeakFocusCell();
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));

    expect(await screen.findByText("1 eligible cell found. Using all of them.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2D Map" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("stats-3d-view")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accuracy" }));
    fireEvent.click(screen.getAllByRole("button", { name: "A" })[0]);
    fireEvent.change(screen.getByLabelText("Pool"), { target: { value: "5" } });
    fireEvent.click(screen.getByTestId("stats-cell-standard:0:5"));
    fireEvent.click(screen.getByRole("button", { name: "3D Explore" }));

    expect(await screen.findByTestId("stats-3d-view")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3D Explore" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Accuracy" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: "A" })[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Pool")).toHaveValue("5");
    expect(screen.getByRole("region", { name: "A · high E · Fret 5" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2D Map" }));

    expect(screen.queryByTestId("stats-3d-view")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2D Map" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "A · high E · Fret 5" })).toBeInTheDocument();
  });

  it("selects a 3D column through the existing details panel and resets the 3D view", async () => {
    await seedStatsCell();
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(await screen.findByTestId("stats-cell-standard:0:5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3D Explore" }));

    const view = await screen.findByTestId("stats-3d-view");
    const column = screen.getByTestId("stats-3d-cell-standard:0:5");
    const openColumn = screen.getByTestId("stats-3d-cell-standard:0:0");
    const highERail = screen.getByTestId("stats-3d-string-rail-0");
    expect(column).toHaveAccessibleName(/A, high E, fret 5/);
    expect(column).toHaveAccessibleName(/3D column category:/);
    expect(column).not.toHaveAttribute("title");
    expect(column.querySelectorAll(".drop-stats-3d-column-face")).toHaveLength(6);
    expect(screen.getByTestId("stats-3d-fretboard-surface")).toHaveClass("drop-stats-3d-fretboard-surface");
    expect(screen.getByTestId("stats-3d-open-zone")).toBeInTheDocument();
    expect(screen.getByTestId("stats-3d-nut")).toBeInTheDocument();
    expect(openColumn).toHaveAttribute("data-zone", "open");
    expect(column).toHaveAttribute("data-zone", "fretted");
    expect(openColumn).toHaveAttribute("data-fret-position", screen.getByTestId("stats-3d-open-zone").getAttribute("data-open-center"));
    expect(screen.getAllByTestId("stats-3d-fret-wire")[0]).toHaveAttribute("data-fret", "1");
    expect(screen.getByTestId("stats-3d-headstock")).toBeInTheDocument();
    expect(screen.getAllByTestId("stats-3d-headstock-tuner")).toHaveLength(6);
    expect(screen.getAllByTestId("stats-3d-headstock-tuner").filter((tuner) => tuner.getAttribute("data-side") === "left")).toHaveLength(3);
    expect(screen.getAllByTestId("stats-3d-headstock-tuner").filter((tuner) => tuner.getAttribute("data-side") === "right")).toHaveLength(3);
    expect(screen.getAllByTestId("stats-3d-string-label").map((label) => label.textContent)).toEqual(["high E", "B", "G", "D", "A", "low E"]);
    expect(screen.getAllByTestId("stats-3d-fret-label").map((label) => label.textContent)).toEqual(["Open", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
    expect(screen.getAllByTestId("stats-3d-fret-label")[0]).toHaveAttribute("data-fret-position", openColumn.getAttribute("data-fret-position"));
    for (const fret of [3, 5, 7, 9]) {
      expect(screen.getByTestId(`stats-3d-inlay-${fret}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("stats-3d-inlay-3")).toHaveAttribute("data-inlay-position", "20% 25%");
    expect(screen.getByTestId("stats-3d-inlay-5")).toHaveAttribute("data-inlay-position", "55% 45%");
    expect(screen.getByTestId("stats-3d-inlay-7")).toHaveAttribute("data-inlay-position", "75% 65%");
    expect(screen.getByTestId("stats-3d-inlay-9")).toHaveAttribute("data-inlay-position", "35% 80%");
    expect(screen.queryAllByTestId(/stats-3d-inlay-/)).toHaveLength(4);
    expect(screen.queryByTestId("stats-3d-inlay-12")).not.toBeInTheDocument();
    expect(column).toHaveAttribute("data-string-position", highERail.getAttribute("data-string-position"));
    expect(column).toHaveAttribute("data-board-surface", "0");
    expect(column).toHaveAttribute("data-cuboid-bottom", "0");
    expect(Number(column.getAttribute("data-cuboid-body-center"))).toBe(Number(column.getAttribute("data-column-height")) / 2);
    expect(column).toHaveAttribute("data-cuboid-top", column.getAttribute("data-column-height"));
    const hoverLabel = screen.getByTestId("stats-3d-hover-label-standard:0:5");
    expect(hoverLabel).toHaveTextContent(/A · high E · Fret 5 ·/);
    expect(hoverLabel).toHaveAttribute("data-overlay", "pointer-neutral");
    expect(hoverLabel).toHaveAttribute("data-column-height", column.getAttribute("data-column-height"));
    expect(hoverLabel).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(column);

    expect(screen.getByRole("region", { name: "A · high E · Fret 5" })).toBeInTheDocument();
    expect(screen.getByTestId("stats-3d-selected-label")).toHaveTextContent(/A · high E · Fret 5/);
    expect(screen.getByTestId("stats-3d-selected-label")).toHaveTextContent(/Fluency/);
    expect(screen.getByTestId("stats-3d-selected-label")).toHaveTextContent(/Strong|Solid|Developing|Needs work|No score/);
    expect(screen.getByTestId("stats-3d-selected-label")).toHaveAttribute("data-string-position", highERail.getAttribute("data-string-position"));
    expect(column).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Angle" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Top" }));
    expect(view).toHaveAttribute("data-pitch", "18");
    expect(view).toHaveAttribute("data-yaw", "-4");
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(view).toHaveAttribute("data-pitch", "76");
    expect(view).toHaveAttribute("data-yaw", "-28");
    fireEvent.click(screen.getByRole("button", { name: "Angle" }));
    expect(view).toHaveAttribute("data-pitch", "58");
    expect(view).toHaveAttribute("data-yaw", "-18");
    expect(view).toHaveAttribute("data-zoom", "0.9");
    const viewport = screen.getByTestId("stats-3d-viewport");
    fireEvent.wheel(viewport, { deltaY: -120 });
    expect(view).toHaveAttribute("data-zoom", "1");
    fireEvent.wheel(viewport, { deltaY: 120 });
    expect(view).toHaveAttribute("data-zoom", "0.9");
    fireEvent.wheel(screen.getByRole("button", { name: "Zoom in" }), { deltaY: -120 });
    expect(view).toHaveAttribute("data-zoom", "0.9");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(view).toHaveAttribute("data-zoom", "1");
    for (let index = 0; index < 10; index += 1) {
      fireEvent.wheel(viewport, { deltaY: -120 });
    }
    expect(view).toHaveAttribute("data-zoom", "1.25");
    for (let index = 0; index < 10; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    }
    expect(view).toHaveAttribute("data-zoom", "0.7");

    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 170, clientY: 80 });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 170, clientY: 80 });

    expect(view).not.toHaveAttribute("data-yaw", "-18");
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(view).toHaveAttribute("data-pitch", "58");
    expect(view).toHaveAttribute("data-yaw", "-18");
    expect(view).toHaveAttribute("data-zoom", "0.9");
  });

  it("falls back to the 2D Stats map when 3D transforms are unsupported", async () => {
    vi.stubGlobal("CSS", { supports: vi.fn().mockReturnValue(false) });
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(await screen.findByRole("heading", { name: "Your Fretboard" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3D Explore" }));

    expect(screen.getByText("3D Explore is unavailable here, so the 2D map is shown.")).toBeInTheDocument();
    expect(screen.queryByTestId("stats-3d-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("stats-cell-standard:0:5")).toBeInTheDocument();
  });

  it("blocks Focus Practice when no sufficiently tested weak cells match", async () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));

    expect(await screen.findByRole("heading", { name: "Your Fretboard" })).toBeInTheDocument();
    expect(screen.getByText("No sufficiently tested weak cells match these filters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Practice weakest" })).toBeDisabled();
  });

  it("starts Focus Practice from weak sufficiently tested Stats cells", async () => {
    await seedWeakFocusCell();
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));

    expect(await screen.findByText("1 eligible cell found. Using all of them.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Practice weakest" }));

    expect(getActiveNotePromptLabel("A")).toBeInTheDocument();
    expect(screen.getByText(/Focus Practice · 1 cells/)).toBeInTheDocument();
  });

  it("shows focused Results actions after a Focus Practice run", async () => {
    let nextAnimationFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    await seedWeakFocusCell();
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(await screen.findByText("1 eligible cell found. Using all of them.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Practice weakest" }));

    act(() => {
      nextAnimationFrame?.(performance.now() + 61_000);
    });

    expect(screen.getByText("run complete")).toBeInTheDocument();
    expect(screen.getByText("1 pool cell practiced")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Practice Again" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to Stats" }));

    expect(await screen.findByRole("heading", { name: "Your Fretboard" })).toBeInTheDocument();
  });

  it("allows multiple strings but keeps at least one selected", () => {
    render(<FretboardDropGame />);

    fireEvent.click(getStringButton("B"));

    expect(screen.getByRole("button", { name: "high E" })).toHaveAttribute("aria-pressed", "true");
    expect(getStringButton("B")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "high E" }));
    fireEvent.click(getStringButton("B"));

    expect(getStringButton("B")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "high E" })).toHaveAttribute("aria-pressed", "false");
  });

  it("updates the displayed best for the selected strings", () => {
    writeBestDropScore(7, [0]);
    writeBestDropScore(3, [0, 1]);

    render(<FretboardDropGame />);

    expect(screen.getByText("high E · all notes best 7")).toBeInTheDocument();

    fireEvent.click(getStringButton("B"));

    expect(screen.getByText("high E + B · all notes best 3")).toBeInTheDocument();
  });

  it("toggles multiple practice notes while keeping one selected", () => {
    render(<FretboardDropGame />);

    togglePracticeNote("F");
    togglePracticeNote("G");
    togglePracticeNote("A");
    togglePracticeNote("B");

    expect(getPracticeNoteButton("C")).toHaveAttribute("aria-pressed", "true");
    expect(getPracticeNoteButton("D")).toHaveAttribute("aria-pressed", "true");
    expect(getPracticeNoteButton("E")).toHaveAttribute("aria-pressed", "true");
    expect(getPracticeNoteButton("F")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "All practice notes" })).toHaveAttribute("aria-pressed", "false");

    togglePracticeNote("D");
    togglePracticeNote("E");
    togglePracticeNote("C");

    expect(getPracticeNoteButton("C")).toHaveAttribute("aria-pressed", "true");
    expect(getPracticeNoteButton("D")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("high E · C only best 0")).toBeInTheDocument();
  });

  it("toggles Quick Peek notes for selected strings only", () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Quick Peek Notes" }));

    expect(screen.getByRole("button", { name: "Hide Notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Run" })).toBeInTheDocument();
    expect(screen.getByText("Current run: all notes")).toBeInTheDocument();
    expect(within(screen.getByTestId("quick-peek-row-0")).getAllByText("E").length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("quick-peek-row-1")).queryByText("B")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide Notes" }));

    expect(screen.getByRole("button", { name: "Quick Peek Notes" })).toBeInTheDocument();
    expect(within(screen.getByTestId("quick-peek-row-0")).queryByText("E")).not.toBeInTheDocument();
  });

  it("shows natural notes only in Quick Peek", () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Quick Peek Notes" }));

    const highERow = within(screen.getByTestId("quick-peek-row-0"));
    expect(highERow.getAllByText("E").length).toBeGreaterThan(0);
    expect(highERow.getByText("F")).toBeInTheDocument();
    expect(highERow.queryByText("F#")).not.toBeInTheDocument();
    expect(highERow.queryByText("G#")).not.toBeInTheDocument();
    expect(screen.getByLabelText("high E fret 2 inactive note")).toBeInTheDocument();
  });

  it("shows only the focused note in Quick Peek", () => {
    render(<FretboardDropGame />);

    for (const note of ["C", "D", "E", "F", "G", "B"]) togglePracticeNote(note);
    fireEvent.click(screen.getByRole("button", { name: "Quick Peek Notes" }));

    const highERow = within(screen.getByTestId("quick-peek-row-0"));
    expect(screen.getByText("Current run: A only")).toBeInTheDocument();
    expect(screen.getByText("high E · A only best 0")).toBeInTheDocument();
    expect(highERow.getByText("A")).toBeInTheDocument();
    expect(highERow.queryByText("E")).not.toBeInTheDocument();
    expect(highERow.queryByText("F")).not.toBeInTheDocument();
    expect(screen.getByLabelText("high E fret 0 inactive note")).toBeInTheDocument();
  });

  it("starts note-focused runs with the focused note", () => {
    render(<FretboardDropGame />);

    for (const note of ["C", "D", "E", "F", "G", "B"]) togglePracticeNote(note);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(getActiveNotePromptLabel("A")).toBeInTheDocument();
    expect(screen.getAllByText("Focus: high E · A only").length).toBeGreaterThan(0);
  });

  it("starts multi-note runs with only the selected note set", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    render(<FretboardDropGame />);

    for (const note of ["E", "F", "G", "A", "B"]) togglePracticeNote(note);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(getActiveNotePromptLabel(/[CD]/)).toBeInTheDocument();
    expect(screen.getAllByText("Focus: high E · C,D").length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });

  it("updates visible Quick Peek notes when selected strings change", () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Quick Peek Notes" }));

    expect(within(screen.getByTestId("quick-peek-row-1")).queryByText("B")).not.toBeInTheDocument();

    fireEvent.click(getStringButton("B"));

    expect(within(screen.getByTestId("quick-peek-row-1")).getAllByText("B").length).toBeGreaterThan(0);
  });

  it("starts normally from Quick Peek and hides notes during gameplay", () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Quick Peek Notes" }));
    expect(within(screen.getByTestId("quick-peek-row-0")).getAllByText("E").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(screen.queryByTestId("quick-peek-row-0")).not.toBeInTheDocument();
    expect(screen.getAllByText("Focus: high E · all notes").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Quick Peek Notes" })).not.toBeInTheDocument();
  });

  it("shows only focus text instead of exact fret guidance in one-string mode", () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(screen.getAllByText("Focus: high E · all notes").length).toBeGreaterThan(0);
    expect(screen.queryByText(/high E · Fret/)).not.toBeInTheDocument();
    expect(screen.queryByText("high E · Open")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "String 1, fret 12" })).not.toBeInTheDocument();
  });

  it("keeps wrong clicks from costing a life", () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: /Survival/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));
    expect(screen.getByLabelText("3 lives")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "String 2, open string" }));

    expect(screen.getByLabelText("3 lives")).toBeInTheDocument();
    expect(screen.queryByTestId("miss-reveal")).not.toBeInTheDocument();
  });

  it("counts wrong-string clicks without resetting the active run", () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: /Survival/ }));
    for (const note of ["C", "D", "E", "F", "G", "B"]) togglePracticeNote(note);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));
    fireEvent.click(screen.getByRole("button", { name: "String 1, fret 5" }));
    fireEvent.click(screen.getByRole("button", { name: "String 1, fret 5" }));

    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(getActiveNotePromptLabel("A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "String 2, open string" }));

    expect(screen.getByLabelText("3 lives")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(getActiveNotePromptLabel("A")).toBeInTheDocument();
    expect(screen.getByText("Almost")).toBeInTheDocument();
    expect(screen.queryByTestId("miss-reveal")).not.toBeInTheDocument();
  });

  it("counts a wrong fret on the active string without costing a life", () => {
    render(<FretboardDropGame />);

    fireEvent.click(screen.getByRole("button", { name: /Survival/ }));
    for (const note of ["C", "D", "E", "F", "G", "B"]) togglePracticeNote(note);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));
    fireEvent.click(screen.getByRole("button", { name: "String 1, fret 5" }));
    fireEvent.click(screen.getByRole("button", { name: "String 1, open string" }));

    expect(screen.getByLabelText("3 lives")).toBeInTheDocument();
    expect(screen.getByText("Almost")).toBeInTheDocument();
    expect(getActiveNotePromptLabel("A")).toBeInTheDocument();
    expect(screen.queryByTestId("miss-reveal")).not.toBeInTheDocument();
  });

  it("keeps scoring on correct fret clicks after the pick advances and fades the resolved pick", () => {
    let nextAnimationFrame: FrameRequestCallback | null = null;
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    render(<FretboardDropGame />);

    selectAOnly();
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));
    const firstTargetId = getHorizontalDeadlinePickTravel().dataset.targetId;
    now.mockReturnValue(3_000);
    act(() => {
      nextAnimationFrame?.(3_000);
    });
    expect(Number(getHorizontalDeadlinePick().dataset.progress)).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "String 1, fret 5" }));

    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(getHorizontalDeadlinePick("resolved-correct")).toBeInTheDocument();
    expect(getHorizontalDeadlinePickTravel().dataset.targetId).not.toBe(firstTargetId);
    expect(getHorizontalDeadlinePickTravel().style.getPropertyValue("--pick-contact-percent")).toBe("12%");
  });

  it("persists correct target-cell evidence on target resolution", async () => {
    render(<FretboardDropGame />);

    selectAOnly();
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));
    fireEvent.click(screen.getByRole("button", { name: "String 1, fret 5" }));
    await waitFor(() => {
      expect(readCellProgressRecord(createFretboardCellId(0, 5))).toMatchObject({
        resolvedTargets: 1,
        correctHits: 1,
        misses: 0,
        hitProgressCount: 1,
      });
    });
  });

  it("persists miss evidence after a target is missed", async () => {
    vi.useFakeTimers();
    let nextAnimationFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    render(<FretboardDropGame />);
    selectAOnly();
    selectPracticeTempo();
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    act(() => {
      nextAnimationFrame?.(performance.now() + 7_000);
    });
    await flushCellProgress();

    expect(readCellProgressRecord(createFretboardCellId(0, 5))).toMatchObject({
      resolvedTargets: 1,
      correctHits: 0,
      misses: 1,
      consecutiveCorrect: 0,
    });
  });

  it("persists wrong frets on the actual clicked cell", async () => {
    render(<FretboardDropGame />);

    selectAOnly();
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(window.localStorage.getItem(DROP_CELL_PROGRESS_STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "String 2, open string" }));
    await waitFor(() => {
      expect(readCellProgressRecord(createFretboardCellId(1, 0))).toMatchObject({
        resolvedTargets: 0,
        otherWrongTaps: 1,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "String 1, fret 4" }));
    fireEvent.click(screen.getByRole("button", { name: "String 1, fret 2" }));
    await waitFor(() => {
      expect(readCellProgressRecord(createFretboardCellId(0, 5))).toBeUndefined();
    });
    expect(readCellProgressRecord(createFretboardCellId(0, 4))).toMatchObject({ adjacentWrongTaps: 1 });
    expect(readCellProgressRecord(createFretboardCellId(0, 2))).toMatchObject({ otherWrongTaps: 1 });
  });

  it("shows tier-up feedback once when a streak reaches the first pacing tier", () => {
    vi.useFakeTimers();
    render(<FretboardDropGame />);

    for (const note of ["C", "D", "E", "F", "G", "B"]) togglePracticeNote(note);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));
    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "String 1, fret 5" }));
    }

    expect(screen.getByText("Let's speed up!")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.queryByText("Let's speed up!")).not.toBeInTheDocument();
  });

  it("costs one life and briefly reveals the correct fret when a target is missed", () => {
    vi.useFakeTimers();
    let nextAnimationFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    render(<FretboardDropGame />);
    selectPracticeTempo();
    fireEvent.click(screen.getByRole("button", { name: /Survival/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    act(() => {
      nextAnimationFrame?.(performance.now() + 7_000);
    });

    expect(screen.getByLabelText("2 lives")).toBeInTheDocument();
    const reveal = screen.getByTestId("miss-reveal");
    expect(reveal).toBeInTheDocument();
    expect(reveal.textContent).toMatch(/^[A-G]$/);
    expect(screen.getByTestId("horizontal-deadline-impact")).toBeInTheDocument();
    expect(screen.getByTestId("horizontal-play-gate")).toHaveAttribute("data-state", "miss");
    expect(screen.queryByLabelText(/Note prompt .+ \(active\)/)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(520);
    });

    expect(screen.queryByTestId("miss-reveal")).not.toBeInTheDocument();
    expect(getActiveNotePromptLabel()).toBeInTheDocument();
  });

  it("shows the final miss reveal before completing the run", () => {
    vi.useFakeTimers();
    let nextAnimationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrames.push(callback);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    render(<FretboardDropGame />);
    selectPracticeTempo();
    fireEvent.click(screen.getByRole("button", { name: /Survival/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    for (const expectedLives of ["2 lives", "1 lives"]) {
      act(() => {
        const frames = nextAnimationFrames;
        nextAnimationFrames = [];
        frames.forEach((frame) => frame(performance.now() + 7_000));
      });

      expect(screen.getByLabelText(expectedLives)).toBeInTheDocument();
      expect(screen.getByTestId("miss-reveal")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(520);
      });

      expect(screen.queryByTestId("miss-reveal")).not.toBeInTheDocument();
      expect(getActiveNotePromptLabel()).toBeInTheDocument();
    }

    act(() => {
      const frames = nextAnimationFrames;
      nextAnimationFrames = [];
      frames.forEach((frame) => frame(performance.now() + 7_000));
    });

    expect(screen.getByLabelText("0 lives")).toBeInTheDocument();
    expect(screen.getByTestId("miss-reveal")).toBeInTheDocument();
    expect(screen.queryByText("run complete")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(520);
    });

    expect(screen.queryByTestId("miss-reveal")).not.toBeInTheDocument();
    expect(screen.getByText("survival complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play Again" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play Again" }));
    expect(screen.getByLabelText("3 lives")).toBeInTheDocument();
  });

  it("shows clearer results labels and keeps Play Again available", () => {
    let nextAnimationFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    window.localStorage.setItem("guitarrise:fretboard-drop:best-score:v1", "8");

    render(<FretboardDropGame />);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    act(() => {
      nextAnimationFrame?.(performance.now() + 61_000);
    });

    expect(screen.getByRole("button", { name: "Play Again" })).toBeInTheDocument();
    expect(screen.getByText("Fluency Score / 1000")).toBeInTheDocument();
    expect(screen.getByText("Notes found")).toBeInTheDocument();
    expect(screen.getByText("Best Streak")).toBeInTheDocument();
    expect(screen.getByText("Run it back while it's fresh.")).toBeInTheDocument();
    expect(screen.getByText("Play again to start your trend.")).toBeInTheDocument();
  });

  it("shows the current completed run in the same-context Last 5 trend", () => {
    let nextAnimationFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    appendCompletedRunToHistory(
      "mode:standard-60s|format:timed-trial|speed:practice-tempo|strings:0|notes:all|pool:naturals|frets:0-11|tuning:standard-e-b-g-d-a-e|fluency:v1|targets:v1",
      {
        completedAt: 1,
        fluencyScore: 640,
        fluencyScoreLabel: "Solid run",
        notesFound: 12,
        accuracy: 90,
      },
    );

    render(<FretboardDropGame />);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    act(() => {
      nextAnimationFrame?.(performance.now() + 61_000);
    });

    expect(screen.getByText("Last 5 here")).toBeInTheDocument();
    expect(screen.getByText("-640")).toBeInTheDocument();
    expect(screen.getByRole("img", {
      name: "Last 2 Fluency Scores in this practice context: 640, 0. Change minus 640.",
    })).toBeInTheDocument();
  });

  it("defaults to Timed Trial and restores a persisted Survival choice", () => {
    const firstRender = render(<FretboardDropGame />);
    expect(screen.getByRole("button", { name: /Timed Trial/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Survival/ }));
    expect(window.localStorage.getItem(DROP_RUN_FORMAT_STORAGE_KEY)).toBe("survival");
    firstRender.unmount();

    render(<FretboardDropGame />);
    expect(screen.getByRole("button", { name: /Survival/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("3 misses")).toBeInTheDocument();
  });

  it("shows only the governing HUD metric for each run format", () => {
    const timed = render(<FretboardDropGame />);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));
    expect(screen.getByLabelText(/seconds remaining/)).toBeInTheDocument();
    expect(screen.queryByLabelText("3 lives")).not.toBeInTheDocument();
    timed.unmount();

    render(<FretboardDropGame />);
    fireEvent.click(screen.getByRole("button", { name: /Survival/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));
    expect(screen.getByLabelText("3 lives")).toBeInTheDocument();
    expect(screen.getByLabelText("Survival time 0:00")).toBeInTheDocument();
    expect(screen.queryByLabelText(/seconds remaining/)).not.toBeInTheDocument();
  });

  it("keeps Timed Trial running after three misses but ends it at sixty seconds", () => {
    let state = startHorizontalReducerGame({ runFormat: "timed-trial" });
    for (let index = 0; index < 3; index += 1) {
      const target = state.fallingTargets[0]!;
      const expiredAt = target.startedAt + target.durationMs;
      state = dropGameReducer(state, { type: "tick", now: expiredAt });
      const reveal = state.missReveal!;
      state = dropGameReducer(state, { type: "finish-miss-reveal", id: reveal.id, now: expiredAt + 520 });
    }
    expect(state.status).toBe("playing");
    expect(state.lives).toBe(3);
    state = dropGameReducer(state, { type: "tick", now: state.runStartedAt + 60_000 });
    expect(state.status).toBe("complete");
  });

  it("lets Survival continue past sixty seconds and ends after its third missed reveal", () => {
    let state = startHorizontalReducerGame({ runFormat: "survival" });
    state = dropGameReducer(state, { type: "tick", now: state.runStartedAt + 61_000 });
    expect(state.status).toBe("playing");
    const firstReveal = state.missReveal!;
    state = dropGameReducer(state, { type: "finish-miss-reveal", id: firstReveal.id, now: state.now + 520 });

    for (let index = 0; index < 2; index += 1) {
      const target = state.fallingTargets[0]!;
      const expiredAt = Math.max(state.now, target.startedAt + target.durationMs);
      state = dropGameReducer(state, { type: "tick", now: expiredAt });
      const reveal = state.missReveal!;
      state = dropGameReducer(state, { type: "finish-miss-reveal", id: reveal.id, now: expiredAt + 520 });
    }
    expect(state.status).toBe("complete");
    expect(state.lives).toBe(0);
  });

  it("does not remove a Survival life for a wrong fret tap", () => {
    let state = startHorizontalReducerGame({ runFormat: "survival" });
    const target = state.fallingTargets[0]!;
    state = dropGameReducer(state, {
      type: "fret-click",
      now: target.startedAt + 200,
      stringIndex: target.stringIndex,
      fret: target.fret === 0 ? 1 : 0,
      note: target.note,
    });
    expect(state.lives).toBe(3);
  });

  it("records a wrong-string tap without removing a Survival life or moving the active target", () => {
    let state = startHorizontalReducerGame({ runFormat: "survival" });
    const target = state.fallingTargets[0]!;
    const wrongString = target.stringIndex === 0 ? 1 : 0;
    const tapAt = target.startedAt + 200;

    state = dropGameReducer(state, {
      type: "fret-click",
      now: tapAt,
      stringIndex: wrongString,
      fret: target.fret,
      note: target.note,
    });

    expect(state.lives).toBe(3);
    expect(state.wrong).toBe(1);
    expect(state.combo).toBe(0);
    expect(state.fallingTargets).toEqual([target]);
    expect(getTargetProgress(state.fallingTargets[0]!, tapAt)).toBeCloseTo(200 / target.durationMs);
  });
});
