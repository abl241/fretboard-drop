import { getFluencyScoreLabel, getNextFluencyScoreLabelTarget } from "./dropFluencyScore";

export type DropResultsMotivationInput = {
  fluencyScore: number;
  rawScore: number;
  rawBestScore: number;
  accuracy: number;
  misses: number;
  wrong: number;
  isNewFluencyBest: boolean;
  isNewRawBest: boolean;
  practiceLabel: string;
  averageHitProgress: number | null;
};

export type DropResultsMotivationType =
  | "new_best"
  | "next_fluency_label"
  | "close_raw_best"
  | "cleaner_run"
  | "hit_earlier"
  | "fallback";

export type DropResultsMotivation = {
  type: DropResultsMotivationType;
  textId: DropResultsMotivationType;
  text: string;
  distanceToNextFluencyLabel?: number;
  nextFluencyLabel?: string;
};

const FALLBACK_MESSAGE = "Run it back while it's fresh.";
const NEW_BEST_MESSAGE = "New best. Run it back while it's fresh.";
const CLOSE_TO_NEXT_LABEL_POINTS = 80;
const SLOW_HIT_PROGRESS = 0.45;

function formatPracticeLabel(label: string): string {
  return label === "All" ? "all strings" : label;
}

export function getResultsMotivationMessage(input: DropResultsMotivationInput): string {
  return getResultsMotivation(input).text;
}

export function getResultsMotivation(input: DropResultsMotivationInput): DropResultsMotivation {
  if (input.isNewFluencyBest || input.isNewRawBest) {
    return { type: "new_best", textId: "new_best", text: NEW_BEST_MESSAGE };
  }

  const nextLabel = getNextFluencyScoreLabelTarget(input.fluencyScore);
  if (nextLabel && nextLabel.pointsAway <= CLOSE_TO_NEXT_LABEL_POINTS) {
    return {
      type: "next_fluency_label",
      textId: "next_fluency_label",
      text: `You're ${nextLabel.pointsAway} points from ${nextLabel.label}.`,
      distanceToNextFluencyLabel: nextLabel.pointsAway,
      nextFluencyLabel: nextLabel.label,
    };
  }

  const rawBestGap = Math.round(input.rawBestScore) - Math.round(input.rawScore);
  if (rawBestGap >= 1 && rawBestGap <= 3) {
    const noteWord = rawBestGap === 1 ? "note" : "notes";
    return {
      type: "close_raw_best",
      textId: "close_raw_best",
      text: `You were ${rawBestGap} ${noteWord} from your ${formatPracticeLabel(input.practiceLabel)} best.`,
    };
  }

  if (input.misses > 0 || input.wrong >= 2) {
    return { type: "cleaner_run", textId: "cleaner_run", text: "One cleaner run could lift your Fluency." };
  }

  const fluencyLabel = getFluencyScoreLabel(input.fluencyScore);
  if (
    input.accuracy >= 90 &&
    fluencyLabel !== "Elite" &&
    fluencyLabel !== "Legendary!" &&
    input.averageHitProgress !== null &&
    input.averageHitProgress >= SLOW_HIT_PROGRESS
  ) {
    return { type: "hit_earlier", textId: "hit_earlier", text: "Hit earlier to raise Fluency." };
  }

  return { type: "fallback", textId: "fallback", text: FALLBACK_MESSAGE };
}
