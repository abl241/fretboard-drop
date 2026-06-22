import {
  getNextStepIdAfterAssistedSuccess,
  getNextStepIdAfterUnassistedSuccess,
} from "./guidedProgression";
import { GUIDED_STEPS, getGuidedStepById, getGuidedStepIndex } from "./guidedSteps";
import type { GuidedResultBand, GuidedStepDefinition, GuidedStepId } from "./guidedTypes";

export const GUIDED_LEVEL_COUNT = 6;

export type GuidedProgressSegmentStatus = "completed" | "current" | "upcoming";

export type GuidedProgressView = {
  locationLabel: string;
  levelLabel: string;
  partLabel: string | null;
  actionTitle: string;
  introExplanation: string;
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  overallProgressLabel: string;
  nextStepPreview: string | null;
  primaryActionLabel: string;
  resumeEyebrow: string;
  hintsActive: boolean;
  hintIntroLabel: string | null;
  hudHintLabel: string | null;
  isFinalRepeatable: boolean;
  segmentStatuses: readonly GuidedProgressSegmentStatus[];
};

export type GuidedResultsCopy = {
  heading: string;
  body: string;
  primaryAction: string;
  recognition: string | null;
  nextStepPreview: string | null;
  support?: string;
};

type GuidedRunResultShape = {
  assisted: boolean;
  assistedThresholdMet: boolean;
  isReady: boolean;
  veryPoor: boolean;
  band: GuidedResultBand;
};

export function buildGuidedProgressView(
  step: GuidedStepDefinition,
  completedStepIds: readonly GuidedStepId[],
  options?: { isReturning?: boolean },
): GuidedProgressView {
  const completedCount = completedStepIds.length;
  const totalCount = GUIDED_STEPS.length;
  const partLabel = getGuidedPartLabel(step);
  const levelLabel = `Level ${step.levelNumber} of ${GUIDED_LEVEL_COUNT}`;
  const nextStep = getIntroNextStep(step);

  return {
    locationLabel: partLabel ? `${levelLabel} · ${partLabel}` : levelLabel,
    levelLabel,
    partLabel,
    actionTitle: step.title,
    introExplanation: step.introCopy,
    completedCount,
    totalCount,
    progressPercent: Math.round((completedCount / totalCount) * 100),
    overallProgressLabel: `${completedCount} of ${totalCount} runs complete`,
    nextStepPreview: nextStep ? `Next: ${getGuidedNextActionLabel(nextStep)}` : null,
    primaryActionLabel: getGuidedPrimaryActionLabel(step),
    resumeEyebrow: options?.isReturning
      ? `Continue Level ${step.levelNumber}`
      : `STEP ${step.stepNumber} OF ${step.totalDisplayedSteps}`,
    hintsActive: step.isAssisted,
    hintIntroLabel: getHintIntroLabel(step),
    hudHintLabel: step.isAssisted ? "Hints on" : null,
    isFinalRepeatable: step.isFinalRepeatable,
    segmentStatuses: buildSegmentStatuses(step.id, completedStepIds),
  };
}

export function getGuidedPrimaryActionLabel(step: GuidedStepDefinition): string {
  switch (step.id) {
    case "a":
      return "Learn A";
    case "bc-assisted":
      return "Learn B + C with Help";
    case "bc-unassisted":
      return "Try B + C Without Hints";
    case "abc-mix":
      return "Mix A + B + C";
    case "d":
      return "Learn D";
    case "ef-assisted":
      return "Learn E + F with Help";
    case "ef-unassisted":
      return "Try E + F Without Hints";
    case "def-mix":
      return "Mix D + E + F";
    case "bcef-assisted":
      return "Connect Both Groups with Help";
    case "bcef-unassisted":
      return "Connect Both Groups";
    case "abcdef-mix":
      return "Mix A through F";
    case "g":
      return "Learn G";
    case "abcdefg-mix":
      return "Mix All Natural Notes";
    default:
      return step.title;
  }
}

export function getGuidedNextActionLabel(step: GuidedStepDefinition): string {
  switch (step.id) {
    case "bc-assisted":
      return "Learn B + C with help";
    case "bc-unassisted":
      return "Find B + C without hints";
    case "abc-mix":
      return "Mix A + B + C";
    case "d":
      return "Learn D";
    case "ef-assisted":
      return "Learn E + F with help";
    case "ef-unassisted":
      return "Find E + F without hints";
    case "def-mix":
      return "Mix D + E + F";
    case "bcef-assisted":
      return "Connect both groups with help";
    case "bcef-unassisted":
      return "Connect both groups without hints";
    case "abcdef-mix":
      return "Mix A through F";
    case "g":
      return "Learn G";
    case "abcdefg-mix":
      return "Mix all natural notes";
    default:
      return step.title;
  }
}

export function getGuidedCompletionRecognition(stepId: GuidedStepId): string | null {
  const recognitionByStep: Partial<Record<GuidedStepId, string>> = {
    a: "A locked in",
    "bc-unassisted": "B and C without hints",
    "abc-mix": "First note group connected",
    d: "D locked in",
    "ef-unassisted": "E and F without hints",
    "def-mix": "Second note group connected",
    "bcef-unassisted": "Both anchor groups connected",
    "abcdef-mix": "A through F connected",
    g: "G locked in",
    "abcdefg-mix": "All natural notes unlocked",
  };
  return recognitionByStep[stepId] ?? null;
}

export function getGuidedResultsCopy(
  step: GuidedStepDefinition,
  result: GuidedRunResultShape,
  completedStepIds: readonly GuidedStepId[],
): GuidedResultsCopy {
  const progressView = buildGuidedProgressView(step, completedStepIds, { isReturning: true });
  const nextAfterSuccess = result.assisted && result.assistedThresholdMet
    ? getGuidedStepById(getNextStepIdAfterAssistedSuccess(step.id))
    : result.isReady && !step.isFinalRepeatable
      ? getGuidedStepById(getNextStepIdAfterUnassistedSuccess(step.id))
      : null;
  const nextStepPreview = nextAfterSuccess ? `Next: ${getGuidedNextActionLabel(nextAfterSuccess)}` : null;

  if (result.assisted) {
    if (!result.assistedThresholdMet) {
      return {
        heading: "Almost there",
        body: getAssistedRepeatCopy(step),
        primaryAction: getAssistedRetryAction(step),
        recognition: null,
        nextStepPreview: null,
      };
    }

    const nextStep = getGuidedStepById(getNextStepIdAfterAssistedSuccess(step.id));
    return {
      heading: "Ready for the next run",
      body: `You used the hints well. Try ${getAssistedTargetPhrase(step)} on your own next.`,
      primaryAction: getAssistedSuccessPrimaryAction(step),
      recognition: null,
      nextStepPreview: `Next: ${getGuidedNextActionLabel(nextStep)}`,
    };
  }

  if (result.isReady) {
    if (step.isFinalRepeatable) {
      return {
        heading: "All natural notes",
        body: "Keep the full fretboard map warm.",
        primaryAction: "Practice All Natural Notes Again",
        recognition: getGuidedCompletionRecognition(step.id),
        nextStepPreview: null,
      };
    }

    const recognition = getGuidedCompletionRecognition(step.id);
    const nextStep = getGuidedStepById(getNextStepIdAfterUnassistedSuccess(step.id));
    return {
      heading: recognition ?? step.title,
      body: recognition ? "Nice work. The next run is unlocked." : step.completionCopy,
      primaryAction: getGuidedPrimaryActionLabel(nextStep),
      recognition,
      nextStepPreview: `Next: ${getGuidedNextActionLabel(nextStep)}`,
      support: nextStep.id === "g" ? "G is coming next." : undefined,
    };
  }

  if (result.band === "almost-ready") {
    return {
      heading: "Almost there",
      body: getRepeatCopy(step),
      primaryAction: "Try Again",
      recognition: null,
      nextStepPreview: null,
    };
  }

  return {
    heading: "Keep going",
    body: getRepeatCopy(step),
    primaryAction: "Practice Again",
    recognition: null,
    nextStepPreview: null,
  };
}

function getIntroNextStep(step: GuidedStepDefinition): GuidedStepDefinition | null {
  if (step.isFinalRepeatable) return null;
  return GUIDED_STEPS[getGuidedStepIndex(step.id) + 1] ?? null;
}

function getPartsInLevel(levelNumber: number): number {
  return GUIDED_STEPS.filter((guidedStep) => guidedStep.levelNumber === levelNumber).length;
}

function getGuidedPartLabel(step: GuidedStepDefinition): string | null {
  const partCount = getPartsInLevel(step.levelNumber);
  if (partCount <= 1) return null;
  const letter = step.partLabel.match(/([A-Z])$/)?.[1];
  if (!letter) return null;
  return `Part ${letter} of ${String.fromCharCode(64 + partCount)}`;
}

function buildSegmentStatuses(
  currentStepId: GuidedStepId,
  completedStepIds: readonly GuidedStepId[],
): readonly GuidedProgressSegmentStatus[] {
  const completed = new Set(completedStepIds);
  return GUIDED_STEPS.map((guidedStep) => {
    if (completed.has(guidedStep.id)) return "completed";
    if (guidedStep.id === currentStepId) return "current";
    return "upcoming";
  });
}

function getHintIntroLabel(step: GuidedStepDefinition): string | null {
  if (!step.isAssisted) return null;
  if (step.id === "bc-assisted") return "Hint: faint A shown";
  if (step.id === "ef-assisted") return "Hint: faint D shown";
  if (step.id === "bcef-assisted") return "Hint: faint A and D shown";
  return null;
}

function getAssistedTargetPhrase(step: GuidedStepDefinition): string {
  if (step.id === "bc-assisted") return "B and C";
  if (step.id === "ef-assisted") return "E and F";
  if (step.id === "bcef-assisted") return "B, C, E, and F";
  return step.playTitle;
}

function getAssistedRepeatCopy(step: GuidedStepDefinition): string {
  if (step.id === "bc-assisted") return "Almost there. Repeat B + C with the A hint.";
  if (step.id === "ef-assisted") return "Almost there. Repeat E + F with the D hint.";
  if (step.id === "bcef-assisted") return "Almost there. Repeat with the A and D hints.";
  return "Almost there. Give this run one more try with hints.";
}

function getAssistedRetryAction(step: GuidedStepDefinition): string {
  if (step.id === "bc-assisted") return "Repeat B + C with Help";
  if (step.id === "ef-assisted") return "Repeat E + F with Help";
  if (step.id === "bcef-assisted") return "Repeat with Help";
  return "Try Again with Help";
}

function getAssistedSuccessPrimaryAction(step: GuidedStepDefinition): string {
  if (step.id === "bc-assisted") return "Try B + C Without Hints";
  if (step.id === "ef-assisted") return "Try E + F Without Hints";
  if (step.id === "bcef-assisted") return "Connect Both Groups";
  return getGuidedPrimaryActionLabel(getGuidedStepById(getNextStepIdAfterAssistedSuccess(step.id)));
}

function getRepeatCopy(step: GuidedStepDefinition): string {
  if (step.id === "bc-unassisted") return "Keep going. Try B + C without hints again.";
  if (step.id === "ef-unassisted") return "Keep going. Try E + F without hints again.";
  if (step.id === "bcef-unassisted") return "One more run to connect both groups.";
  if (step.id === "abcdefg-mix") return "Keep going. Mix all natural notes again.";
  return `Keep going. Try ${step.title} again.`;
}
