import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DROP_BEST_SCORE_KEY } from "../dropGameUtils";
import {
  NAME_THE_NOTE_BEST_SCORE_KEY,
  NAME_THE_NOTE_RUN_DURATION_MS,
  NameTheNoteGame,
  buildNameTheNoteTargetPool,
  drawNameTheNoteTarget,
  getNameTheNoteFretSpaceFractions,
  shuffleNameTheNoteTargets,
} from "./NameTheNoteGame";
import { getNameTheNoteFluencyStorageKey } from "./nameTheNoteFluency";

describe("NameTheNoteGame", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("builds eligible targets from selected settings", () => {
    const targets = buildNameTheNoteTargetPool({
      stringSelection: [0],
      selectedNotes: ["A"],
      includeOpenStrings: true,
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      targetKey: "standard:0:5",
      stringId: "standard:0",
      stringIndex: 0,
      fret: 5,
      note: "A",
    });
  });

  it("keeps open-string targets as fret 0 and allows excluding them", () => {
    const withOpen = buildNameTheNoteTargetPool({
      stringSelection: [0],
      selectedNotes: ["E"],
      includeOpenStrings: true,
    });
    const withoutOpen = buildNameTheNoteTargetPool({
      stringSelection: [0],
      selectedNotes: ["E"],
      includeOpenStrings: false,
    });

    expect(withOpen.map((target) => target.targetKey)).toEqual(["standard:0:0"]);
    expect(withoutOpen).toEqual([]);
  });

  it("draws each eligible target from a shuffled deck before repeating", () => {
    const pool = buildNameTheNoteTargetPool({
      stringSelection: [0],
      selectedNotes: ["C", "D", "E", "F", "G", "A", "B"],
      includeOpenStrings: true,
    });
    let deck: typeof pool = [];
    let previousTargetKey: string | null = null;
    const drawnTargetKeys: string[] = [];
    const rng = createCycleRng([0.12, 0.72, 0.34, 0.91, 0.48, 0.04]);

    for (let index = 0; index < pool.length; index += 1) {
      const draw = drawNameTheNoteTarget({ pool, deck, previousTargetKey, rng });
      expect(draw).not.toBeNull();
      drawnTargetKeys.push(draw!.target.targetKey);
      deck = draw!.remainingDeck;
      previousTargetKey = draw!.target.targetKey;
    }

    const oldArithmeticKeys = pool.map((_, seed) => pool[Math.abs(seed * 7 + 3) % pool.length].targetKey);
    expect(new Set(drawnTargetKeys)).toHaveProperty("size", pool.length);
    expect(drawnTargetKeys).not.toEqual(oldArithmeticKeys);
  });

  it("reshuffles deterministically and avoids an immediate duplicate when possible", () => {
    const pool = buildNameTheNoteTargetPool({
      stringSelection: [0],
      selectedNotes: ["A", "B"],
      includeOpenStrings: true,
    });

    const firstOrder = shuffleNameTheNoteTargets(pool, null, createCycleRng([0.9]));
    const repeatedOrder = shuffleNameTheNoteTargets(pool, null, createCycleRng([0.9]));
    const reshuffledAfterPrevious = shuffleNameTheNoteTargets(pool, pool[0].targetKey, createCycleRng([0.9]));

    expect(firstOrder.map((target) => target.targetKey)).toEqual(repeatedOrder.map((target) => target.targetKey));
    expect(firstOrder[0].targetKey).toBe(pool[0].targetKey);
    expect(reshuffledAfterPrevious[0].targetKey).not.toBe(pool[0].targetKey);
  });

  it("uses new RNG input for new production shuffles instead of resetting to one fixed order", () => {
    const pool = buildNameTheNoteTargetPool({
      stringSelection: [0],
      selectedNotes: ["C", "D", "E", "F", "G", "A", "B"],
      includeOpenStrings: true,
    });

    const lowOrder = shuffleNameTheNoteTargets(pool, null, createCycleRng([0.05, 0.15, 0.25, 0.35, 0.45, 0.55]));
    const highOrder = shuffleNameTheNoteTargets(pool, null, createCycleRng([0.95, 0.85, 0.75, 0.65, 0.55, 0.45]));

    expect(lowOrder.map((target) => target.targetKey)).not.toEqual(highOrder.map((target) => target.targetKey));
  });

  it("renders one exact fretted target cell", () => {
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    const targetCell = screen.getByTestId("name-note-target-cell");
    expect(targetCell).toHaveAttribute("data-target-key", "standard:0:5");
    expect(within(targetCell).getByLabelText("Target marker standard:0:5")).toBeInTheDocument();
  });

  it("renders compact centered answer controls in A through G order", () => {
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(screen.getByTestId("name-note-answer-grid")).toHaveAttribute("data-layout", "bounded-centered");
    expect(screen.getAllByRole("button", { name: /^Answer / }).map((button) => button.textContent)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
    ]);
  });

  it("uses progressive fret spacing, an unclipped six-row neck, and increasing string gauges", () => {
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    const fretFractions = getNameTheNoteFretSpaceFractions();
    expect(fretFractions[0]).toBeGreaterThan(fretFractions[10]);
    expect(fretFractions.every((width, index) => index === 0 || width < fretFractions[index - 1])).toBe(true);
    expect(Number(screen.getByTestId("name-note-fret-header-1").getAttribute("data-fret-width"))).toBeGreaterThan(
      Number(screen.getByTestId("name-note-fret-header-11").getAttribute("data-fret-width")),
    );
    expect(screen.getByTestId("name-note-fretboard")).toHaveAttribute("data-layout", "responsive-six-row-grid");
    expect(screen.getByTestId("name-note-neck")).toHaveAttribute("data-neck-taper", "none");
    expect(screen.getAllByTestId(/name-note-string-row-/)).toHaveLength(6);
    expect(Number(screen.getByTestId("name-note-string-row-0").getAttribute("data-string-gauge"))).toBeLessThan(
      Number(screen.getByTestId("name-note-string-row-5").getAttribute("data-string-gauge")),
    );
  });

  it("uses a top-aligned responsive gameplay stack", () => {
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(screen.getByTestId("name-note-run-screen")).toHaveAttribute("data-layout", "top-aligned-responsive-stack");
  });

  it("does not render a conventional per-question progress bar", () => {
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("name-note-question-progress")).not.toBeInTheDocument();
  });

  it("moves the countdown from answer fills to the target ring", () => {
    vi.useFakeTimers();
    const advanceClock = mockPerformanceClock();
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    const targetRing = screen.getByTestId("name-note-target-ring");
    expect(screen.queryByTestId("answer-fill-A")).not.toBeInTheDocument();
    expect(targetRing).toHaveAttribute("data-countdown-fraction", "1.00");
    expect(screen.getByTestId("name-note-question-countdown")).toHaveTextContent("4s");

    act(() => {
      advanceClock(2_200);
    });

    expect(targetRing).toHaveAttribute("data-countdown-fraction", "0.45");
    expect(screen.getByTestId("name-note-question-countdown")).toHaveTextContent("2s");
  });

  it("renders an open-string target outside the numbered fretted area", () => {
    render(<NameTheNoteGame />);
    selectOnlyNote("E");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    const targetCell = screen.getByTestId("name-note-target-cell");
    expect(targetCell).toHaveAttribute("data-target-key", "standard:0:0");
    expect(within(targetCell).getByText("OPEN")).toBeInTheDocument();
  });

  it("awards score and continues streak on a correct answer", () => {
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));
    fireEvent.click(screen.getByRole("button", { name: "Answer A" }));

    expect(screen.getAllByText("Correct").length).toBeGreaterThan(0);
    expect(screen.getByTestId("name-note-target-marker")).toHaveAttribute("data-outcome", "correct");
    expect(screen.getByTestId("name-note-earned-points")).toHaveTextContent("+20");
    expect(screen.getByRole("button", { name: "Answer A" })).toHaveAttribute("data-feedback", "correct");
    expect(getRunStat("Run Points")).toHaveTextContent("20");
    expect(getRunStat("Streak")).toHaveTextContent("1");
  });

  it("keeps keyboard answer controls active", () => {
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    fireEvent.keyDown(window, { key: "a" });

    expect(screen.getByTestId("name-note-target-marker")).toHaveAttribute("data-outcome", "correct");
    expect(screen.getByTestId("name-note-earned-points")).toHaveTextContent("+20");
  });

  it("lets the player retry after wrong answers without revealing or resetting the question timer", () => {
    vi.useFakeTimers();
    const advanceClock = mockPerformanceClock();
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    const initialTargetKey = screen.getByTestId("name-note-target-cell").getAttribute("data-target-key");
    act(() => {
      advanceClock(1_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Answer B" }));

    expect(screen.queryByText("It was A")).not.toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.getByTestId("name-note-target-cell")).toHaveAttribute("data-target-key", initialTargetKey);
    expect(getRunStat("Streak")).toHaveTextContent("0");
    expect(getRunStat("Run Points")).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "Answer B" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Answer B" })).toHaveClass("border-red-100");
    expect(screen.getByRole("button", { name: "Answer C" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Answer C" }));
    expect(screen.queryByText("It was A")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Answer C" })).toBeDisabled();

    act(() => {
      advanceClock(1_000);
    });

    expect(screen.getByTestId("name-note-question-countdown")).toHaveTextContent("2s");
    expect(screen.getByTestId("name-note-target-cell")).toHaveAttribute("data-target-key", initialTargetKey);
    fireEvent.click(screen.getByRole("button", { name: "Answer A" }));

    expect(screen.getAllByText("Correct").length).toBeGreaterThan(0);
    expect(getRunStat("Run Points")).toHaveTextContent("15");
    expect(getRunStat("Streak")).toHaveTextContent("0");

    act(() => {
      advanceClock(500);
    });

    expect(screen.getByRole("button", { name: "Answer B" })).not.toBeDisabled();
  });

  it("records timeout without selecting an answer", () => {
    vi.useFakeTimers();
    const advanceClock = mockPerformanceClock();
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    act(() => {
      advanceClock(4_050);
    });

    const targetKey = screen.getByTestId("name-note-target-cell").getAttribute("data-target-key");
    expect(screen.getByText("Time's up · A")).toBeInTheDocument();
    expect(screen.getByTestId("name-note-question-countdown")).toHaveTextContent("TIME");
    expect(screen.getByTestId("name-note-target-marker")).toHaveAttribute("data-outcome", "timeout");
    expect(screen.getByTestId("name-note-target-marker")).toHaveTextContent("A");
    expect(screen.getByRole("button", { name: "Answer A" })).toHaveClass("border-emerald-100");
    expect(screen.getByRole("button", { name: "Answer B" })).toBeDisabled();

    act(() => {
      advanceClock(1_500);
    });

    expect(screen.getByText("Time's up · A")).toBeInTheDocument();
    expect(screen.getByTestId("name-note-target-cell")).toHaveAttribute("data-target-key", targetKey);

    act(() => {
      advanceClock(150);
    });

    expect(screen.queryByText("Time's up · A")).not.toBeInTheDocument();
  });

  it("ends at session expiration and shows the results summary", () => {
    vi.useFakeTimers();
    const advanceClock = mockPerformanceClock();
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    act(() => {
      advanceClock(NAME_THE_NOTE_RUN_DURATION_MS + 100);
    });

    expect(screen.getByText("run complete")).toBeInTheDocument();
    expect(screen.getByText("Run Points")).toBeInTheDocument();
    expect(screen.getByText("Fluency")).toBeInTheDocument();
    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(screen.getByText("Wrong Attempts")).toBeInTheDocument();
    expect(screen.getByText("Timeouts")).toBeInTheDocument();
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getByText("Avg Correct")).toBeInTheDocument();
    expect(screen.getByText("Best Streak")).toBeInTheDocument();
  });

  it("Play Again restarts with the same settings", () => {
    vi.useFakeTimers();
    const advanceClock = mockPerformanceClock();
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    act(() => {
      advanceClock(NAME_THE_NOTE_RUN_DURATION_MS + 100);
    });
    fireEvent.click(screen.getByRole("button", { name: "Play Again" }));

    expect(screen.getByTestId("name-note-target-cell")).toHaveAttribute("data-target-key", "standard:0:5");
    expect(getRunStat("Run Points")).toHaveTextContent("0");
  });

  it("persists best Run Points and scoped Name the Note fluency without touching Drop keys", () => {
    vi.useFakeTimers();
    const advanceClock = mockPerformanceClock();
    window.localStorage.setItem(DROP_BEST_SCORE_KEY, "99");
    render(<NameTheNoteGame />);
    selectOnlyNote("A");
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));
    fireEvent.click(screen.getByRole("button", { name: "Answer A" }));

    act(() => {
      advanceClock(NAME_THE_NOTE_RUN_DURATION_MS + 100);
    });

    expect(Number(window.localStorage.getItem(NAME_THE_NOTE_BEST_SCORE_KEY))).toBeGreaterThan(0);
    expect(window.localStorage.getItem(getNameTheNoteFluencyStorageKey({
      stringSelection: [0],
      selectedNotes: ["A"],
      includeOpenStrings: true,
    }))).toContain("\"score\"");
    expect(window.localStorage.getItem(DROP_BEST_SCORE_KEY)).toBe("99");
  });
});

function selectOnlyNote(noteToKeep: string) {
  for (const note of ["C", "D", "E", "F", "G", "A", "B"]) {
    if (note !== noteToKeep) {
      fireEvent.click(screen.getByRole("button", { name: `Name the Note practice note ${note}` }));
    }
  }
}

function mockPerformanceClock() {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  return (ms: number) => {
    now += ms;
    vi.advanceTimersByTime(ms);
  };
}

function createCycleRng(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

function getRunStat(label: string): HTMLElement {
  const labelNode = screen.getByText(label);
  const stat = labelNode.parentElement;
  expect(stat).not.toBeNull();
  return stat as HTMLElement;
}
