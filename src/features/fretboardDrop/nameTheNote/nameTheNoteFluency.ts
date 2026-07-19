import type { Note } from "@/lib/fretboard";
import type { DropStringSelection } from "../dropGameTypes";
import {
  CURRENT_DROP_NOTE_POOL,
  createPracticeNoteKey,
  getStringSelectionKey,
  normalizePracticeNotes,
  normalizeStringSelection,
} from "../dropGameUtils";
import { getFluencyScoreLabel } from "../dropFluencyScore";

export const NAME_THE_NOTE_FLUENCY_VERSION = "v1";
export const NAME_THE_NOTE_FLUENCY_STORAGE_PREFIX = `fretboard-drop:name-the-note:fluency:${NAME_THE_NOTE_FLUENCY_VERSION}`;

export type NameTheNoteFluencyScope = {
  stringSelection: DropStringSelection;
  selectedNotes: readonly Note[];
  includeOpenStrings: boolean;
};

export type NameTheNoteFluencyEvidence = {
  correct: number;
  wrong: number;
  timeouts: number;
  bestStreak: number;
  correctResponseMsTotal: number;
  correctResponseCount: number;
  totalQuestionMs: number;
};

export type NameTheNoteStoredFluency = {
  version: typeof NAME_THE_NOTE_FLUENCY_VERSION;
  scopeKey: string;
  score: number;
  label: string;
  updatedAt: string;
  evidence: NameTheNoteFluencyEvidence;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getNameTheNoteFluencyScopeKey(scope: NameTheNoteFluencyScope): string {
  const stringKey = getStringSelectionKey(normalizeStringSelection(scope.stringSelection));
  const selectedNotes = normalizePracticeNotes(scope.selectedNotes);
  const noteKey = selectedNotes.length === CURRENT_DROP_NOTE_POOL.notes.length
    ? "all-naturals"
    : createPracticeNoteKey({ practiceType: "note-focus", selectedNotes });
  const openKey = scope.includeOpenStrings ? "open:on" : "open:off";
  return `strings:${stringKey}:notes:${noteKey}:${openKey}`;
}

export function getNameTheNoteFluencyStorageKey(scope: NameTheNoteFluencyScope): string {
  return `${NAME_THE_NOTE_FLUENCY_STORAGE_PREFIX}:${getNameTheNoteFluencyScopeKey(scope)}`;
}

export function calculateNameTheNoteAccuracy(evidence: Pick<NameTheNoteFluencyEvidence, "correct" | "wrong" | "timeouts">): number {
  const correct = Math.max(0, evidence.correct);
  const total = correct + Math.max(0, evidence.wrong) + Math.max(0, evidence.timeouts);
  return total > 0 ? (correct / total) * 100 : 0;
}

export function getAverageNameTheNoteResponseProgress(evidence: NameTheNoteFluencyEvidence): number | null {
  if (evidence.correctResponseCount <= 0 || evidence.totalQuestionMs <= 0) return null;
  const averageResponseMs = evidence.correctResponseMsTotal / evidence.correctResponseCount;
  return clamp(averageResponseMs / evidence.totalQuestionMs, 0, 1);
}

export function calculateNameTheNoteFluencyScore(evidence: NameTheNoteFluencyEvidence): number {
  const correct = Math.max(0, evidence.correct);
  if (correct === 0) return 0;

  const wrong = Math.max(0, evidence.wrong);
  const timeouts = Math.max(0, evidence.timeouts);
  const bestStreak = Math.max(0, evidence.bestStreak);
  const accuracy = calculateNameTheNoteAccuracy({ correct, wrong, timeouts }) / 100;
  const averageResponseProgress = getAverageNameTheNoteResponseProgress(evidence);

  const volumeScore = Math.sqrt(clamp(correct / 34, 0, 1)) * 380;
  const accuracyScore = Math.pow(accuracy, 2.8) * 290;
  const speedScore = averageResponseProgress === null
    ? 0
    : Math.pow(clamp((0.82 - averageResponseProgress) / 0.7, 0, 1), 1.45) * 200;
  const streakScore = Math.sqrt(clamp(bestStreak / 22, 0, 1)) * 130;

  let maxScore = 1000;
  if (correct < 3) maxScore = Math.min(maxScore, 180);
  else if (correct < 6) maxScore = Math.min(maxScore, 320);
  else if (correct < 10) maxScore = Math.min(maxScore, 520);
  else if (correct < 16) maxScore = Math.min(maxScore, 720);
  else if (correct < 24) maxScore = Math.min(maxScore, 880);
  else if (correct < 32) maxScore = Math.min(maxScore, 949);
  else if (correct < 36) maxScore = Math.min(maxScore, 979);

  if (accuracy < 0.6) maxScore = Math.min(maxScore, 260);
  else if (accuracy < 0.75) maxScore = Math.min(maxScore, 450);
  else if (accuracy < 0.85) maxScore = Math.min(maxScore, 650);
  else if (accuracy < 0.92) maxScore = Math.min(maxScore, 820);
  else if (accuracy < 0.97) maxScore = Math.min(maxScore, 930);

  if (wrong > 0) maxScore = Math.min(maxScore, 960 - Math.min(wrong, 10) * 24);
  if (timeouts > 0) maxScore = Math.min(maxScore, 900 - Math.min(timeouts, 5) * 80);

  if (averageResponseProgress === null) maxScore = Math.min(maxScore, 620);
  else if (averageResponseProgress > 0.65) maxScore = Math.min(maxScore, 760);
  else if (averageResponseProgress > 0.5) maxScore = Math.min(maxScore, 850);
  else if (averageResponseProgress > 0.35) maxScore = Math.min(maxScore, 930);
  else if (averageResponseProgress > 0.25) maxScore = Math.min(maxScore, 979);
  else if (averageResponseProgress > 0.12) maxScore = Math.min(maxScore, 990);

  return Math.round(clamp(volumeScore + accuracyScore + speedScore + streakScore, 0, maxScore));
}

export function getNameTheNoteFluencyLabel(score: number): string {
  return getFluencyScoreLabel(score).replace("!", "");
}

function parseStoredFluency(raw: string | null): NameTheNoteStoredFluency | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<NameTheNoteStoredFluency>;
    if (parsed.version !== NAME_THE_NOTE_FLUENCY_VERSION) return null;
    const score = Number(parsed.score);
    if (!Number.isFinite(score)) return null;
    return {
      version: NAME_THE_NOTE_FLUENCY_VERSION,
      scopeKey: String(parsed.scopeKey ?? ""),
      score: clamp(Math.round(score), 0, 1000),
      label: String(parsed.label ?? getNameTheNoteFluencyLabel(score)),
      updatedAt: String(parsed.updatedAt ?? ""),
      evidence: {
        correct: Math.max(0, Number(parsed.evidence?.correct ?? 0)),
        wrong: Math.max(0, Number(parsed.evidence?.wrong ?? 0)),
        timeouts: Math.max(0, Number(parsed.evidence?.timeouts ?? 0)),
        bestStreak: Math.max(0, Number(parsed.evidence?.bestStreak ?? 0)),
        correctResponseMsTotal: Math.max(0, Number(parsed.evidence?.correctResponseMsTotal ?? 0)),
        correctResponseCount: Math.max(0, Number(parsed.evidence?.correctResponseCount ?? 0)),
        totalQuestionMs: Math.max(0, Number(parsed.evidence?.totalQuestionMs ?? 0)),
      },
    };
  } catch {
    return null;
  }
}

export function readBestNameTheNoteFluency(scope: NameTheNoteFluencyScope): NameTheNoteStoredFluency | null {
  try {
    return parseStoredFluency(window.localStorage.getItem(getNameTheNoteFluencyStorageKey(scope)));
  } catch {
    return null;
  }
}

export function writeBestNameTheNoteFluency(scope: NameTheNoteFluencyScope, evidence: NameTheNoteFluencyEvidence): NameTheNoteStoredFluency {
  const scopeKey = getNameTheNoteFluencyScopeKey(scope);
  const score = calculateNameTheNoteFluencyScore(evidence);
  const record: NameTheNoteStoredFluency = {
    version: NAME_THE_NOTE_FLUENCY_VERSION,
    scopeKey,
    score,
    label: getNameTheNoteFluencyLabel(score),
    updatedAt: new Date().toISOString(),
    evidence,
  };

  try {
    const existing = readBestNameTheNoteFluency(scope);
    if (!existing || score > existing.score) {
      window.localStorage.setItem(getNameTheNoteFluencyStorageKey(scope), JSON.stringify(record));
      return record;
    }
    return existing;
  } catch {
    return record;
  }
}
