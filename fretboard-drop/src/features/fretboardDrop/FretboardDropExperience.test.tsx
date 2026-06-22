import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FretboardDropExperience, IS_GUIDED_LEARNING_AVAILABLE, getInitialExperienceMode } from "./FretboardDropExperience";
import {
  GUIDED_ORIENTATION_SEEN_STORAGE_KEY,
  GUIDED_PREFERRED_MODE_STORAGE_KEY,
  GUIDED_PROGRESS_STORAGE_KEY,
} from "./guided/guidedStorage";
import { createGuidedTargetSequence } from "./guided/guidedTargetGeneration";
import { getGuidedStepById } from "./guided/guidedSteps";
import { getGuidedTargetTestAttributes } from "./guided/GuidedLessonRunner";
import { getStringFocusLabel } from "./dropGameUtils";
import type { GuidedTarget } from "./guided/guidedTypes";

describe("FretboardDropExperience", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enables Guided Learning for production mode resolution after playable lessons exist", () => {
    expect(IS_GUIDED_LEARNING_AVAILABLE).toBe(true);
    expect(getInitialExperienceMode(null)).toBeNull();
    expect(getInitialExperienceMode("guided")).toBe("guided");
    expect(getInitialExperienceMode("free-play")).toBe("free-play");
  });

  it("shows the first-visit mode choice", () => {
    render(<FretboardDropExperience />);

    expect(screen.getByRole("heading", { name: "Learn the Fretboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Learning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Up a Run" })).toBeInTheDocument();
  });

  it("choosing Guided Learning saves the preference and opens orientation", () => {
    render(<FretboardDropExperience />);

    fireEvent.click(screen.getByRole("button", { name: "Start Learning" }));

    expect(window.localStorage.getItem(GUIDED_PREFERRED_MODE_STORAGE_KEY)).toBe("guided");
    expect(screen.getByRole("heading", { name: "Know where the notes are—without stopping to think" })).toBeInTheDocument();
  });

  it("choosing Free Play saves the preference and opens the existing setup", () => {
    render(<FretboardDropExperience />);

    fireEvent.click(screen.getByRole("button", { name: "Set Up a Run" }));

    expect(window.localStorage.getItem(GUIDED_PREFERRED_MODE_STORAGE_KEY)).toBe("free-play");
    expect(screen.getByRole("button", { name: "Start Run" })).toBeInTheDocument();
  });

  it("shows orientation only until completed", () => {
    window.localStorage.setItem(GUIDED_PREFERRED_MODE_STORAGE_KEY, "guided");
    const { unmount } = render(<FretboardDropExperience />);

    fireEvent.click(screen.getByRole("button", { name: "Start with A" }));

    expect(window.localStorage.getItem(GUIDED_ORIENTATION_SEEN_STORAGE_KEY)).toBe("true");
    expect(screen.getByText("STEP 1 OF 13")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Learn A" })).toBeInTheDocument();
    expect(screen.getByText("0 of 13 runs complete")).toBeInTheDocument();

    unmount();
    render(<FretboardDropExperience />);

    expect(screen.getByText("Continue Level 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Learn A" })).toBeInTheDocument();
  });

  it("does not erase valid Guided progress when orientation state is missing", () => {
    window.localStorage.setItem(GUIDED_PREFERRED_MODE_STORAGE_KEY, "guided");
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify({
      currentStepId: "d",
      completedStepIds: ["a", "bc-assisted", "bc-unassisted", "abc-mix"],
      attemptsByStep: {},
      bestFluencyByStep: {},
      fluencyExplanationSeen: true,
    }));

    render(<FretboardDropExperience />);

    fireEvent.click(screen.getByRole("button", { name: "Start with A" }));

    expect(screen.getByRole("heading", { name: "Learn D" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(GUIDED_PROGRESS_STORAGE_KEY) ?? "{}")).toMatchObject({
      currentStepId: "d",
      completedStepIds: ["a", "bc-assisted", "bc-unassisted", "abc-mix"],
    });
  });

  it("switching modes does not erase Guided progress", () => {
    window.localStorage.setItem(GUIDED_PREFERRED_MODE_STORAGE_KEY, "guided");
    window.localStorage.setItem(GUIDED_ORIENTATION_SEEN_STORAGE_KEY, "true");
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify({
      currentStepId: "bc-assisted",
      completedStepIds: ["a"],
    }));

    render(<FretboardDropExperience />);

    expect(screen.getByRole("heading", { name: "Learn B + C with help" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Free Play" }));

    expect(window.localStorage.getItem(GUIDED_PREFERRED_MODE_STORAGE_KEY)).toBe("free-play");
    expect(JSON.parse(window.localStorage.getItem(GUIDED_PROGRESS_STORAGE_KEY) ?? "{}")).toMatchObject({
      currentStepId: "bc-assisted",
      completedStepIds: ["a"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Want help learning the fretboard? Try Guided Learning" }));
    expect(screen.getByRole("heading", { name: "Learn B + C with help" })).toBeInTheDocument();
  });

  it("plays the A preview, countdown, first-wrong retry, correction, and next-target flow", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(GUIDED_PREFERRED_MODE_STORAGE_KEY, "guided");
    window.localStorage.setItem(GUIDED_ORIENTATION_SEEN_STORAGE_KEY, "true");
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify({
      currentStepId: "a",
      completedStepIds: [],
      attemptsByStep: {},
      bestFluencyByStep: {},
      fluencyExplanationSeen: false,
    }));
    render(<FretboardDropExperience />);

    fireEvent.click(screen.getByRole("button", { name: "Learn A" }));

    expect(screen.getByRole("heading", { name: "Find A" })).toBeInTheDocument();
    advanceThroughGuidedPreview();

    expect(screen.getByText("1 of 8")).toBeInTheDocument();
    expect(screen.getByText("Level 1 of 6")).toBeInTheDocument();
    expect(screen.queryByText("Learn B + C with help")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    const firstTarget = getCurrentGuidedTargetCell("A");
    const originalDuration = getCurrentGuidedTargetDuration("A");
    act(() => {
      fireEvent.click(screen.getByLabelText(getFretButtonLabel({
        ...firstTarget,
        fret: getWrongFret(firstTarget),
      })));
    });

    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(getCurrentGuidedTargetDuration("A")).toBe(originalDuration + 1_800);

    act(() => {
      fireEvent.click(screen.getByLabelText(getFretButtonLabel({
        ...firstTarget,
        fret: getSecondWrongFret(firstTarget),
      })));
    });

    expect(screen.getByText("A is here")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    expect(screen.getByText("2 of 8")).toBeInTheDocument();
  });

  it("opens Results after the final guided target and advances Ready A to B + C assisted", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(GUIDED_PREFERRED_MODE_STORAGE_KEY, "guided");
    window.localStorage.setItem(GUIDED_ORIENTATION_SEEN_STORAGE_KEY, "true");
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify({
      currentStepId: "a",
      completedStepIds: [],
      attemptsByStep: {},
      bestFluencyByStep: {},
      fluencyExplanationSeen: false,
    }));
    render(<FretboardDropExperience />);

    fireEvent.click(screen.getByRole("button", { name: "Learn A" }));
    advanceThroughGuidedPreview();

    const sequence = createGuidedTargetSequence(getGuidedStepById("a"), 18);
    for (let index = 0; index < sequence.length; index += 1) {
      act(() => {
        fireEvent.click(screen.getByLabelText(getFretButtonLabel(getCurrentGuidedTargetCell(sequence[index].note))));
      });
    }

    expect(screen.getByRole("heading", { name: "A locked in" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Learn B + C with Help" }));

    expect(screen.getByRole("heading", { name: "Learn B + C with help" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(GUIDED_PROGRESS_STORAGE_KEY) ?? "{}").completedStepIds).toContain("a");
  });

  it("keeps exact target cell data out of production target attributes", () => {
    expect(getGuidedTargetTestAttributes({
      id: 1,
      note: "A",
      stringIndex: 0,
      fret: 5,
      durationMs: 5_000,
      startedAt: 0,
    }, "production")).toEqual({});
    expect(getGuidedTargetTestAttributes({
      id: 1,
      note: "A",
      stringIndex: 0,
      fret: 5,
      durationMs: 5_000,
      startedAt: 0,
    }, "test")).toEqual({ "data-target-cell": "0:5" });
  });

  it("shows ghost anchors during bc-assisted without falling A targets", () => {
    vi.useFakeTimers();
    window.localStorage.setItem(GUIDED_PREFERRED_MODE_STORAGE_KEY, "guided");
    window.localStorage.setItem(GUIDED_ORIENTATION_SEEN_STORAGE_KEY, "true");
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify({
      currentStepId: "bc-assisted",
      completedStepIds: ["a"],
      attemptsByStep: {},
      bestFluencyByStep: {},
      fluencyExplanationSeen: true,
    }));
    render(<FretboardDropExperience />);

    fireEvent.click(screen.getByRole("button", { name: "Learn B + C with Help" }));
    advanceThroughGuidedPreview();

    const firstTarget = getCurrentGuidedTargetCell("B");
    const anchor = screen.getByTestId("guided-anchor-cell");
    expect(anchor).toHaveTextContent("A");
    expect(anchor.closest("button")?.getAttribute("aria-label")).not.toBe(getFretButtonLabel(firstTarget));

    const sequence = createGuidedTargetSequence(getGuidedStepById("bc-assisted"), 35);
    expect(sequence.every((target) => target.note === "B" || target.note === "C")).toBe(true);
    expect(sequence.some((target) => target.note === "A")).toBe(false);
  });

  it("advances bc-assisted threshold success to bc-unassisted intro", () => {
    vi.useFakeTimers();
    window.localStorage.setItem(GUIDED_PREFERRED_MODE_STORAGE_KEY, "guided");
    window.localStorage.setItem(GUIDED_ORIENTATION_SEEN_STORAGE_KEY, "true");
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify({
      currentStepId: "bc-assisted",
      completedStepIds: ["a"],
      attemptsByStep: {},
      bestFluencyByStep: {},
      fluencyExplanationSeen: true,
    }));
    render(<FretboardDropExperience />);

    fireEvent.click(screen.getByRole("button", { name: "Learn B + C with Help" }));
    advanceThroughGuidedPreview();

    const assistedSequence = createGuidedTargetSequence(getGuidedStepById("bc-assisted"), 35);
    for (let index = 0; index < assistedSequence.length; index += 1) {
      act(() => {
        fireEvent.click(screen.getByLabelText(getFretButtonLabel(getCurrentGuidedTargetCell(assistedSequence[index].note))));
      });
    }

    expect(screen.getByRole("heading", { name: "Ready for the next run" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try B + C Without Hints" })).toBeInTheDocument();

    const storedProgress = JSON.parse(window.localStorage.getItem(GUIDED_PROGRESS_STORAGE_KEY) ?? "{}");
    expect(storedProgress.completedStepIds).toEqual(["a", "bc-assisted"]);
    expect(storedProgress.attemptsByStep["bc-assisted"][0]).toMatchObject({
      assisted: true,
      targetCount: 8,
    });

    fireEvent.click(screen.getByRole("button", { name: "Try B + C Without Hints" }));
    expect(screen.getByRole("heading", { name: "Find B + C" })).toBeInTheDocument();
  });
});

function advanceThroughGuidedPreview() {
  act(() => {
    vi.advanceTimersByTime(1_000);
  });
  expect(screen.getByTestId("guided-countdown")).toHaveTextContent("3");

  act(() => {
    vi.advanceTimersByTime(1_000);
  });
  expect(screen.getByTestId("guided-countdown")).toHaveTextContent("2");

  act(() => {
    vi.advanceTimersByTime(1_000);
  });
  expect(screen.getByTestId("guided-countdown")).toHaveTextContent("1");

  act(() => {
    vi.advanceTimersByTime(1_000);
  });
}

function getCurrentGuidedTargetCell(note: GuidedTarget["note"]): Pick<GuidedTarget, "stringIndex" | "fret"> {
  const target = screen.getByLabelText(`Falling target ${note}`);
  const cellKey = target.getAttribute("data-target-cell");
  if (!cellKey) {
    throw new Error("Missing current Guided target cell.");
  }
  const [stringIndex, fret] = cellKey.split(":").map(Number);
  return {
    stringIndex: stringIndex as GuidedTarget["stringIndex"],
    fret,
  };
}

function getCurrentGuidedTargetDuration(note: GuidedTarget["note"]): number {
  const target = screen.getByLabelText(`Falling target ${note}`);
  const duration = target.getAttribute("data-target-duration-ms");
  if (!duration) {
    throw new Error("Missing current Guided target duration.");
  }
  return Number(duration);
}

function getFretButtonLabel(target: Pick<GuidedTarget, "stringIndex" | "fret">): string {
  return `${getStringFocusLabel(target.stringIndex)}, ${target.fret === 0 ? "open string" : `fret ${target.fret}`}`;
}

function getWrongFret(target: Pick<GuidedTarget, "fret">): number {
  return target.fret === 0 ? 1 : 0;
}

function getSecondWrongFret(target: Pick<GuidedTarget, "fret">): number {
  return target.fret === 1 ? 2 : 1;
}
