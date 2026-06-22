import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GUIDED_PROGRESS } from "./guidedStorage";
import { GuidedLessonRunner } from "./GuidedLessonRunner";
import { getGuidedStepById } from "./guidedSteps";
import { createGuidedTargetSequence } from "./guidedTargetGeneration";
import { getStringFocusLabel } from "../dropGameUtils";
import type { GuidedTarget } from "./guidedTypes";

describe("GuidedLessonRunner dev-test mode", () => {
  it("does not persist attempts, completion, or fluency after a dev test run", () => {
    vi.useFakeTimers();
    const onProgressChange = vi.fn();
    const step = getGuidedStepById("a");
    render(
      <GuidedLessonRunner
        step={step}
        progress={DEFAULT_GUIDED_PROGRESS}
        startMode="preview"
        runMode="dev-test"
        onProgressChange={onProgressChange}
        onAdvanceToStep={() => {}}
        onReturnToIntro={() => {}}
        onExitDevTest={() => {}}
        onSwitchToFreePlay={() => {}}
      />,
    );

    advanceThroughGuidedPreview();

    const sequence = createGuidedTargetSequence(step, 1 + step.stepNumber * 17);
    for (let index = 0; index < sequence.length; index += 1) {
      act(() => {
        fireEvent.click(screen.getByLabelText(getFretButtonLabel(getCurrentGuidedTargetCell())));
      });
      if (index < sequence.length - 1) {
        expect(screen.getByText(`${index + 2} of 8`)).toBeInTheDocument();
      }
    }

    expect(screen.getByText(/development test/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test this step again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose another step" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exit test mode" })).toBeInTheDocument();
    expect(onProgressChange).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

function advanceThroughGuidedPreview() {
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
}

function getCurrentGuidedTargetCell(): Pick<GuidedTarget, "stringIndex" | "fret"> {
  const target = screen.getByLabelText(/^Falling target /);
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

function getFretButtonLabel(target: Pick<GuidedTarget, "stringIndex" | "fret">): string {
  return `${getStringFocusLabel(target.stringIndex)}, ${target.fret === 0 ? "open string" : `fret ${target.fret}`}`;
}
