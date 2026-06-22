import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FretboardDropGame } from "../FretboardDropGame";
import { GuidedDevStepLauncher } from "./GuidedDevStepLauncher";
import * as guidedDev from "./guidedDev";
import { GUIDED_PROGRESS_STORAGE_KEY } from "./guidedStorage";
import { GuidedLearningPath } from "./GuidedLearningPath";
import { getGuidedStepById } from "./guidedSteps";
import { createGuidedTargetSequence } from "./guidedTargetGeneration";

vi.mock("./guidedDev", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./guidedDev")>();
  return {
    ...actual,
    isGuidedDevToolsEnabled: vi.fn(actual.isGuidedDevToolsEnabled),
  };
});

describe("GuidedDevStepLauncher", () => {
  it("renders all step options from GUIDED_STEPS", () => {
    render(<GuidedDevStepLauncher onStartTestRun={() => {}} />);

    expect(screen.getByText("Development testing")).toBeInTheDocument();
    expect(screen.getByText("Test runs do not change saved progress.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Level 1 · Learn A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Level 6B · Mix all natural notes" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(13);
  });

  it("launches the selected step", () => {
    const onStartTestRun = vi.fn();
    render(<GuidedDevStepLauncher onStartTestRun={onStartTestRun} />);

    fireEvent.change(screen.getByTestId("guided-dev-step-select"), {
      target: { value: "ef-assisted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start test run" }));

    expect(onStartTestRun).toHaveBeenCalledWith("ef-assisted");
  });
});

describe("GuidedLearningPath dev test mode", () => {
  it("shows the launcher in development and hides it in production-mode behavior", () => {
    window.localStorage.setItem("fretboard-drop:guided:preferred-mode:v1", "guided");
    window.localStorage.setItem("fretboard-drop:guided:orientation-seen:v1", "true");
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify({
      currentStepId: "a",
      completedStepIds: [],
      attemptsByStep: {},
      bestFluencyByStep: {},
      fluencyExplanationSeen: false,
    }));

    vi.mocked(guidedDev.isGuidedDevToolsEnabled).mockReturnValue(true);
    const { unmount } = render(<GuidedLearningPath onSwitchToFreePlay={() => {}} />);
    expect(screen.getByTestId("guided-dev-step-launcher")).toBeInTheDocument();
    unmount();

    vi.mocked(guidedDev.isGuidedDevToolsEnabled).mockReturnValue(false);
    render(<GuidedLearningPath onSwitchToFreePlay={() => {}} />);
    expect(screen.queryByTestId("guided-dev-step-launcher")).not.toBeInTheDocument();
  });

  it("starts the selected step with real target generation and ghost mapping without writing progress", () => {
    vi.useFakeTimers();
    const initialProgress = {
      currentStepId: "a",
      completedStepIds: [],
      attemptsByStep: {},
      bestFluencyByStep: {},
      fluencyExplanationSeen: false,
    };
    window.localStorage.setItem("fretboard-drop:guided:orientation-seen:v1", "true");
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify(initialProgress));
    vi.mocked(guidedDev.isGuidedDevToolsEnabled).mockReturnValue(true);

    render(<GuidedLearningPath onSwitchToFreePlay={() => {}} />);

    fireEvent.change(screen.getByTestId("guided-dev-step-select"), {
      target: { value: "bc-assisted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start test run" }));

    expect(screen.getByRole("heading", { name: "Learn B + C with help" })).toBeInTheDocument();

    const sequence = createGuidedTargetSequence(getGuidedStepById("bc-assisted"), 1 + 2 * 17);
    expect(sequence.every((target) => target.note === "B" || target.note === "C")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByText("1 of 8")).toBeInTheDocument();
    expect(screen.getByTestId("guided-anchor-cell")).toHaveTextContent("A");
    expect(JSON.parse(window.localStorage.getItem(GUIDED_PROGRESS_STORAGE_KEY) ?? "{}")).toEqual(initialProgress);

    vi.useRealTimers();
  });

  it("restores the normal Guided path after exiting test mode", () => {
    window.localStorage.setItem("fretboard-drop:guided:orientation-seen:v1", "true");
    window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify({
      currentStepId: "a",
      completedStepIds: [],
      attemptsByStep: {},
      bestFluencyByStep: {},
      fluencyExplanationSeen: false,
    }));
    vi.mocked(guidedDev.isGuidedDevToolsEnabled).mockReturnValue(true);

    render(<GuidedLearningPath onSwitchToFreePlay={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Start test run" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("heading", { name: "Learn A" })).toBeInTheDocument();
    expect(screen.getByTestId("guided-dev-step-launcher")).toBeInTheDocument();
  });

  it("does not affect Free Play", () => {
    window.localStorage.setItem("fretboard-drop:guided:preferred-mode:v1", "free-play");
    vi.mocked(guidedDev.isGuidedDevToolsEnabled).mockReturnValue(true);

    render(<FretboardDropGame />);

    expect(screen.queryByTestId("guided-dev-step-launcher")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Run" })).toBeInTheDocument();
  });
});
