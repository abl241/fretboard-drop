import { useEffect, useMemo, useReducer, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, RotateCcw, Timer, Trophy, Zap } from "lucide-react";
import type { Note } from "@/lib/fretboard";
import { DOT_FRETS } from "@/lib/fretboard";
import { buildEligibleFretboardTargets, type FretboardTarget } from "@/lib/fretboardTargets";
import type { DropStringIndex, DropStringSelection } from "../dropGameTypes";
import {
  ALL_DROP_STRING_INDEXES,
  CURRENT_DROP_NOTE_POOL,
  DEFAULT_DROP_STRING_SELECTION,
  DROP_MAX_FRET,
  DROP_MIN_FRET,
  DROP_RUN_DURATION_MS,
  DROP_STRING_FOCUS_OPTIONS,
  getStringFocusLabel,
  getStringSelectionLabel,
  normalizePracticeNotes,
  normalizeStringSelection,
} from "../dropGameUtils";
import {
  calculateNameTheNoteAccuracy,
  calculateNameTheNoteFluencyScore,
  getNameTheNoteFluencyLabel,
  readBestNameTheNoteFluency,
  writeBestNameTheNoteFluency,
  type NameTheNoteFluencyEvidence,
} from "./nameTheNoteFluency";

export const NAME_THE_NOTE_BEST_SCORE_KEY = "fretboard-drop:name-the-note:best-score:v1";
export const NAME_THE_NOTE_RUN_DURATION_MS = DROP_RUN_DURATION_MS;
export const NAME_THE_NOTE_QUESTION_DURATION_MS = 4_000;
const NAME_THE_NOTE_ADVANCE_CORRECT_MS = 450;
const NAME_THE_NOTE_ADVANCE_REVEAL_MS = 1_600;
const NAME_THE_NOTE_ANSWER_NOTES = ["A", "B", "C", "D", "E", "F", "G"] as const satisfies readonly Note[];
const NAME_THE_NOTE_STRING_GAUGES = [1, 1.25, 1.5, 2, 2.5, 3] as const;

export type QuestionOutcome = "idle" | "correct" | "timeout";

export type NameTheNoteSettings = {
  stringSelection: DropStringSelection;
  selectedNotes: readonly Note[];
  includeOpenStrings: boolean;
};

type NameTheNoteQuestion = {
  target: FretboardTarget;
  startedAt: number;
  totalQuestionMs: number;
  remainingQuestionMs: number;
  countdownFraction: number;
  outcome: QuestionOutcome;
  selectedNote: Note | null;
  wrongAnswers: readonly Note[];
  hadWrongAttempt: boolean;
  earnedPoints: number | null;
  advanceAt: number | null;
};

type NameTheNoteState = {
  status: "setup" | "playing" | "complete";
  now: number;
  runStartedAt: number;
  timeLeftMs: number;
  score: number;
  correct: number;
  incorrect: number;
  timeouts: number;
  streak: number;
  bestStreak: number;
  correctResponseMsTotal: number;
  correctResponseCount: number;
  targetPool: readonly FretboardTarget[];
  targetDeck: readonly FretboardTarget[];
  previousTargetKey: string | null;
  bestScoreAtStart: number;
  bestFluencyAtStart: number;
  settings: NameTheNoteSettings;
  activeQuestion: NameTheNoteQuestion | null;
};

type NameTheNoteAction =
  | { type: "start"; now: number; settings: NameTheNoteSettings; bestScore: number; bestFluency: number }
  | { type: "tick"; now: number }
  | { type: "answer"; now: number; note: Note }
  | { type: "reset"; now: number };

export function buildNameTheNoteTargetPool(settings: NameTheNoteSettings): FretboardTarget[] {
  return buildEligibleFretboardTargets({
    selectedStringIndexes: normalizeStringSelection(settings.stringSelection),
    minFret: DROP_MIN_FRET,
    maxFret: DROP_MAX_FRET,
    selectedNotes: normalizePracticeNotes(settings.selectedNotes),
    includeOpenStrings: settings.includeOpenStrings,
  });
}

export function readNameTheNoteBestScore(): number {
  try {
    const parsed = Number(window.localStorage.getItem(NAME_THE_NOTE_BEST_SCORE_KEY));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  } catch {
    return 0;
  }
}

export function writeNameTheNoteBestScore(score: number): void {
  try {
    window.localStorage.setItem(NAME_THE_NOTE_BEST_SCORE_KEY, String(Math.max(0, Math.round(score))));
  } catch {
    // Local best score is nice-to-have and must not block play.
  }
}

export function calculateNameTheNoteAnswerScore({
  remainingQuestionMs,
  totalQuestionMs,
  streak,
}: {
  remainingQuestionMs: number;
  totalQuestionMs: number;
  streak: number;
}): number {
  const countdownFraction = totalQuestionMs > 0 ? Math.max(0, Math.min(1, remainingQuestionMs / totalQuestionMs)) : 0;
  const speedBonus = Math.round(countdownFraction * 10);
  const streakBonus = Math.min(10, Math.max(0, streak - 1) * 2);
  return 10 + speedBonus + streakBonus;
}

function createInitialNameTheNoteState(now: number): NameTheNoteState {
  return {
    status: "setup",
    now,
    runStartedAt: now,
    timeLeftMs: NAME_THE_NOTE_RUN_DURATION_MS,
    score: 0,
    correct: 0,
    incorrect: 0,
    timeouts: 0,
    streak: 0,
    bestStreak: 0,
    correctResponseMsTotal: 0,
    correctResponseCount: 0,
    targetPool: [],
    targetDeck: [],
    previousTargetKey: null,
    bestScoreAtStart: 0,
    bestFluencyAtStart: 0,
    settings: DEFAULT_NAME_THE_NOTE_SETTINGS,
    activeQuestion: null,
  };
}

type NameTheNoteRng = () => number;

export function shuffleNameTheNoteTargets(
  targets: readonly FretboardTarget[],
  previousTargetKey: string | null = null,
  rng: NameTheNoteRng = Math.random,
): FretboardTarget[] {
  const shuffled = [...targets];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.max(0, Math.min(0.999_999_999, rng())) * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  if (shuffled.length > 1 && previousTargetKey && shuffled[0]?.targetKey === previousTargetKey) {
    const replacementIndex = shuffled.findIndex((target) => target.targetKey !== previousTargetKey);
    if (replacementIndex > 0) {
      [shuffled[0], shuffled[replacementIndex]] = [shuffled[replacementIndex], shuffled[0]];
    }
  }

  return shuffled;
}

export function drawNameTheNoteTarget({
  pool,
  deck,
  previousTargetKey = null,
  rng = Math.random,
}: {
  pool: readonly FretboardTarget[];
  deck: readonly FretboardTarget[];
  previousTargetKey?: string | null;
  rng?: NameTheNoteRng;
}): { target: FretboardTarget; remainingDeck: FretboardTarget[] } | null {
  if (pool.length === 0) return null;
  const activeDeck = deck.length > 0 ? [...deck] : shuffleNameTheNoteTargets(pool, previousTargetKey, rng);
  const [target, ...remainingDeck] = activeDeck;
  if (!target) return null;
  return { target, remainingDeck };
}

export function getNameTheNoteFretSpaceFractions(maxFret = DROP_MAX_FRET): number[] {
  const boundaries = Array.from({ length: maxFret + 1 }, (_, fret) => 1 - 2 ** (-fret / 12));
  const visibleLength = boundaries[maxFret] || 1;
  return Array.from({ length: maxFret }, (_, index) => (
    (boundaries[index + 1] - boundaries[index]) / visibleLength
  ));
}

function getNameTheNoteGridTemplateColumns(): string {
  const fretColumns = getNameTheNoteFretSpaceFractions().map((fraction) => `${fraction.toFixed(5)}fr`).join(" ");
  return `2.75rem 3.8rem ${fretColumns}`;
}

function getNameTheNoteStringGauge(stringIndex: DropStringIndex): number {
  return NAME_THE_NOTE_STRING_GAUGES[stringIndex] ?? 1;
}

function createQuestion(now: number, target: FretboardTarget): NameTheNoteQuestion {
  return {
    target,
    startedAt: now,
    totalQuestionMs: NAME_THE_NOTE_QUESTION_DURATION_MS,
    remainingQuestionMs: NAME_THE_NOTE_QUESTION_DURATION_MS,
    countdownFraction: 1,
    outcome: "idle",
    selectedNote: null,
    wrongAnswers: [],
    hadWrongAttempt: false,
    earnedPoints: null,
    advanceAt: null,
  };
}

function updateQuestionTime(question: NameTheNoteQuestion, now: number): NameTheNoteQuestion {
  const remainingQuestionMs = Math.max(0, question.totalQuestionMs - (now - question.startedAt));
  const countdownFraction = question.totalQuestionMs > 0 ? remainingQuestionMs / question.totalQuestionMs : 0;
  return {
    ...question,
    remainingQuestionMs,
    countdownFraction,
  };
}

function completeNameTheNoteRun(state: NameTheNoteState, now: number): NameTheNoteState {
  return {
    ...state,
    status: "complete",
    now,
    timeLeftMs: 0,
    streak: 0,
    activeQuestion: null,
  };
}

function nameTheNoteReducer(state: NameTheNoteState, action: NameTheNoteAction): NameTheNoteState {
  switch (action.type) {
    case "start": {
      const targetPool = buildNameTheNoteTargetPool(action.settings);
      const draw = drawNameTheNoteTarget({ pool: targetPool, deck: [] });
      const activeQuestion = draw ? createQuestion(action.now, draw.target) : null;
      return {
        ...createInitialNameTheNoteState(action.now),
        status: "playing",
        bestScoreAtStart: action.bestScore,
        bestFluencyAtStart: action.bestFluency,
        settings: action.settings,
        targetPool,
        targetDeck: draw?.remainingDeck ?? [],
        previousTargetKey: draw?.target.targetKey ?? null,
        activeQuestion,
      };
    }

    case "reset":
      return createInitialNameTheNoteState(action.now);

    case "tick": {
      if (state.status !== "playing") return state;

      const timeLeftMs = Math.max(0, NAME_THE_NOTE_RUN_DURATION_MS - (action.now - state.runStartedAt));
      if (timeLeftMs <= 0) {
        return completeNameTheNoteRun(state, action.now);
      }

      const timedQuestion = state.activeQuestion ? updateQuestionTime(state.activeQuestion, action.now) : null;
      if (!timedQuestion) {
        return completeNameTheNoteRun({ ...state, timeLeftMs }, action.now);
      }

      if (timedQuestion.outcome === "idle" && timedQuestion.remainingQuestionMs <= 0) {
        return {
          ...state,
          now: action.now,
          timeLeftMs,
          timeouts: state.timeouts + 1,
          streak: 0,
          activeQuestion: {
            ...timedQuestion,
            outcome: "timeout",
            selectedNote: null,
            advanceAt: action.now + NAME_THE_NOTE_ADVANCE_REVEAL_MS,
          },
        };
      }

      if (timedQuestion.outcome !== "idle" && timedQuestion.advanceAt !== null && action.now >= timedQuestion.advanceAt) {
        const draw = drawNameTheNoteTarget({
          pool: state.targetPool,
          deck: state.targetDeck,
          previousTargetKey: state.previousTargetKey,
        });
        if (!draw) {
          return completeNameTheNoteRun({ ...state, timeLeftMs }, action.now);
        }
        return {
          ...state,
          now: action.now,
          timeLeftMs,
          activeQuestion: createQuestion(action.now, draw.target),
          targetDeck: draw.remainingDeck,
          previousTargetKey: draw.target.targetKey,
        };
      }

      return {
        ...state,
        now: action.now,
        timeLeftMs,
        activeQuestion: timedQuestion,
      };
    }

    case "answer": {
      if (state.status !== "playing" || !state.activeQuestion || state.activeQuestion.outcome !== "idle") return state;

      const timedQuestion = updateQuestionTime(state.activeQuestion, action.now);
      const isCorrect = action.note === timedQuestion.target.note;
      if (!isCorrect) {
        if (timedQuestion.wrongAnswers.includes(action.note)) {
          return {
            ...state,
            now: action.now,
            activeQuestion: timedQuestion,
          };
        }

        return {
          ...state,
          now: action.now,
          incorrect: state.incorrect + 1,
          streak: 0,
          activeQuestion: {
            ...timedQuestion,
            wrongAnswers: [...timedQuestion.wrongAnswers, action.note],
            hadWrongAttempt: true,
          },
        };
      }

      const nextStreak = timedQuestion.hadWrongAttempt ? 0 : state.streak + 1;
      const earned = calculateNameTheNoteAnswerScore({
        remainingQuestionMs: timedQuestion.remainingQuestionMs,
        totalQuestionMs: timedQuestion.totalQuestionMs,
        streak: nextStreak,
      });
      return {
        ...state,
        now: action.now,
        score: state.score + earned,
        correct: state.correct + 1,
        streak: nextStreak,
        bestStreak: Math.max(state.bestStreak, nextStreak),
        correctResponseMsTotal: state.correctResponseMsTotal + Math.max(0, action.now - timedQuestion.startedAt),
        correctResponseCount: state.correctResponseCount + 1,
        activeQuestion: {
          ...timedQuestion,
            outcome: "correct",
            selectedNote: action.note,
            earnedPoints: earned,
            advanceAt: action.now + NAME_THE_NOTE_ADVANCE_CORRECT_MS,
        },
      };
    }
  }
}

export const DEFAULT_NAME_THE_NOTE_SETTINGS = {
  stringSelection: DEFAULT_DROP_STRING_SELECTION,
  selectedNotes: CURRENT_DROP_NOTE_POOL.notes,
  includeOpenStrings: true,
} as const satisfies NameTheNoteSettings;

type NameTheNoteResult = {
  runPoints: number;
  correct: number;
  incorrect: number;
  timeouts: number;
  accuracy: number;
  averageCorrectResponseMs: number | null;
  bestStreak: number;
  isNewBest: boolean;
  fluencyScore: number;
  fluencyLabel: string;
  fluencyDelta: number;
  isNewBestFluency: boolean;
  fluencyEvidence: NameTheNoteFluencyEvidence;
};

function getNameTheNoteResult(state: NameTheNoteState): NameTheNoteResult {
  const fluencyEvidence: NameTheNoteFluencyEvidence = {
    correct: state.correct,
    wrong: state.incorrect,
    timeouts: state.timeouts,
    bestStreak: state.bestStreak,
    correctResponseMsTotal: state.correctResponseMsTotal,
    correctResponseCount: state.correctResponseCount,
    totalQuestionMs: NAME_THE_NOTE_QUESTION_DURATION_MS,
  };
  const fluencyScore = calculateNameTheNoteFluencyScore(fluencyEvidence);
  return {
    runPoints: state.score,
    correct: state.correct,
    incorrect: state.incorrect,
    timeouts: state.timeouts,
    accuracy: Math.round(calculateNameTheNoteAccuracy(fluencyEvidence)),
    averageCorrectResponseMs: state.correctResponseCount > 0
      ? Math.round(state.correctResponseMsTotal / state.correctResponseCount)
      : null,
    bestStreak: state.bestStreak,
    isNewBest: state.score > state.bestScoreAtStart,
    fluencyScore,
    fluencyLabel: getNameTheNoteFluencyLabel(fluencyScore),
    fluencyDelta: fluencyScore - state.bestFluencyAtStart,
    isNewBestFluency: fluencyScore > state.bestFluencyAtStart,
    fluencyEvidence,
  };
}

export function NameTheNoteGame({
  onBackToFreePlay,
  onSwitchToGuided,
}: {
  onBackToFreePlay?: () => void;
  onSwitchToGuided?: () => void;
}) {
  const [settings, setSettings] = useState<NameTheNoteSettings>(DEFAULT_NAME_THE_NOTE_SETTINGS);
  const [bestScore, setBestScore] = useState(readNameTheNoteBestScore);
  const [state, dispatch] = useReducer(nameTheNoteReducer, undefined, () => createInitialNameTheNoteState(performance.now()));
  const eligibleTargets = useMemo(() => buildNameTheNoteTargetPool(settings), [settings]);
  const result = state.status === "complete" ? getNameTheNoteResult(state) : null;

  useEffect(() => {
    if (state.status !== "playing") return undefined;

    const timer = window.setInterval(() => {
      dispatch({ type: "tick", now: performance.now() });
    }, 50);
    return () => window.clearInterval(timer);
  }, [state.status]);

  useEffect(() => {
    if (state.status !== "complete") return;
    const latestBest = readNameTheNoteBestScore();
    if (state.score > latestBest) {
      writeNameTheNoteBestScore(state.score);
      setBestScore(state.score);
    } else {
      setBestScore(latestBest);
    }
    if (result?.isNewBestFluency) {
      writeBestNameTheNoteFluency(state.settings, result.fluencyEvidence);
    }
  }, [result, state.score, state.settings, state.status]);

  useEffect(() => {
    if (state.status !== "playing") return undefined;

    function onKeyDown(event: KeyboardEvent) {
      const note = event.key.toUpperCase() as Note;
      if (!(NAME_THE_NOTE_ANSWER_NOTES as readonly Note[]).includes(note)) return;
      dispatch({ type: "answer", now: performance.now(), note });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.status]);

  function startRun() {
    if (eligibleTargets.length === 0) return;
    const now = performance.now();
    const latestBest = readNameTheNoteBestScore();
    const latestFluency = readBestNameTheNoteFluency(settings)?.score ?? 0;
    setBestScore(latestBest);
    dispatch({ type: "start", now, settings, bestScore: latestBest, bestFluency: latestFluency });
  }

  function playAgain() {
    startRun();
  }

  function resetToSetup() {
    dispatch({ type: "reset", now: performance.now() });
  }

  return (
    <div className="name-note-shell bg-[#080a0f] text-slate-50">
      <div className="name-note-surface bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(245,158,11,0.14),transparent_40%)]">
        <div
          className={`name-note-content mx-auto flex w-full flex-1 flex-col ${
            state.status === "playing"
              ? "max-w-[min(100vw,100rem)] px-2 sm:px-3"
              : "max-w-7xl px-3 py-3 sm:px-5 sm:py-4"
          }`}
        >
          {state.status === "setup" ? (
            <NameTheNoteStartScreen
              bestScore={bestScore}
              settings={settings}
              eligibleTargetCount={eligibleTargets.length}
              onSettingsChange={setSettings}
              onStart={startRun}
              onBackToFreePlay={onBackToFreePlay}
              onSwitchToGuided={onSwitchToGuided}
            />
          ) : state.status === "complete" && result ? (
            <NameTheNoteResults
              result={result}
              bestScore={bestScore}
              onPlayAgain={playAgain}
              onBack={onBackToFreePlay ?? resetToSetup}
            />
          ) : (
            <NameTheNoteRunScreen
              state={state}
              bestScore={Math.max(bestScore, state.score)}
              onAnswer={(note) => dispatch({ type: "answer", now: performance.now(), note })}
              onBack={resetToSetup}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function NameTheNoteStartScreen({
  bestScore,
  settings,
  eligibleTargetCount,
  onSettingsChange,
  onStart,
  onBackToFreePlay,
  onSwitchToGuided,
}: {
  bestScore: number;
  settings: NameTheNoteSettings;
  eligibleTargetCount: number;
  onSettingsChange: (settings: NameTheNoteSettings) => void;
  onStart: () => void;
  onBackToFreePlay?: () => void;
  onSwitchToGuided?: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <div className="w-full max-w-3xl text-center">
        <p className="text-xs font-black uppercase tracking-[0.42em] text-cyan-200/75">60 second position run</p>
        <h1 className="mt-4 text-5xl font-black tracking-tight text-white sm:text-7xl">Name the Note</h1>
        <p className="mx-auto mt-4 max-w-lg text-lg font-semibold leading-relaxed text-slate-200">
          Find the note name for one exact string and fret position.
        </p>
        <NameTheNoteStringSelector settings={settings} onChange={onSettingsChange} />
        <NameTheNoteNoteSelector settings={settings} onChange={onSettingsChange} />
        <div className="mx-auto mt-5 flex max-w-2xl flex-wrap items-center justify-center gap-2 text-sm font-semibold text-slate-300">
          <button
            type="button"
            onClick={() => onSettingsChange({ ...settings, includeOpenStrings: !settings.includeOpenStrings })}
            aria-pressed={settings.includeOpenStrings}
            className={`min-h-10 rounded-md border px-4 text-sm font-black transition ${
              settings.includeOpenStrings
                ? "border-cyan-100 bg-cyan-200 text-slate-950"
                : "border-slate-700/80 bg-slate-950/60 text-slate-300 hover:border-cyan-200/70 hover:text-cyan-100"
            }`}
          >
            Open Strings {settings.includeOpenStrings ? "On" : "Off"}
          </button>
          <span className="rounded-full border border-slate-700/80 px-4 py-2">frets 0-11</span>
          <span className="rounded-full border border-slate-700/80 px-4 py-2">{eligibleTargetCount} targets</span>
          <span className="rounded-full border border-slate-700/80 px-4 py-2">best {bestScore}</span>
        </div>
        {eligibleTargetCount === 0 ? (
          <p className="mt-4 text-sm font-bold text-red-200">Choose at least one note that appears in the selected strings and fret range.</p>
        ) : null}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onStart}
            disabled={eligibleTargetCount === 0}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-amber-300 px-10 text-lg font-black text-slate-950 shadow-[0_0_34px_rgba(252,211,77,0.38)] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Zap className="h-5 w-5" />
            Start Run
          </button>
          {onBackToFreePlay ? (
            <button
              type="button"
              onClick={onBackToFreePlay}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-cyan-200/30 px-5 text-sm font-black text-cyan-100 transition hover:border-cyan-100/70 hover:bg-cyan-200/10"
            >
              Back to Free Play
            </button>
          ) : null}
        </div>
        {onSwitchToGuided ? (
          <button
            type="button"
            onClick={onSwitchToGuided}
            className="mt-5 text-sm font-black text-cyan-100/74 underline decoration-cyan-100/24 underline-offset-4 transition hover:text-cyan-50 hover:decoration-cyan-100/70"
          >
            Want help learning the fretboard? Try Guided Learning
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NameTheNoteStringSelector({
  settings,
  onChange,
}: {
  settings: NameTheNoteSettings;
  onChange: (settings: NameTheNoteSettings) => void;
}) {
  const selected = normalizeStringSelection(settings.stringSelection);
  const allSelected = selected.length === ALL_DROP_STRING_INDEXES.length;

  function toggleString(stringIndex: DropStringIndex) {
    if (selected.includes(stringIndex)) {
      if (selected.length === 1) return;
      onChange({ ...settings, stringSelection: selected.filter((selectedString) => selectedString !== stringIndex) });
      return;
    }
    onChange({ ...settings, stringSelection: ALL_DROP_STRING_INDEXES.filter((selectedString) => selectedString === stringIndex || selected.includes(selectedString)) });
  }

  return (
    <div className="mx-auto mt-5 max-w-2xl">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/70">Practice Strings</p>
      <p className="mt-1.5 text-xs font-semibold text-slate-300">Selected: {getStringSelectionLabel(selected)}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        {DROP_STRING_FOCUS_OPTIONS.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => toggleString(option.value)}
              aria-pressed={isSelected}
              aria-label={`Name the Note string ${option.label}`}
              className={`min-h-8 min-w-14 rounded-md border px-2.5 text-xs font-black transition ${
                isSelected
                  ? "border-cyan-100 bg-cyan-200 text-slate-950 shadow-[0_0_22px_rgba(103,232,249,0.28)]"
                  : "border-slate-700/80 bg-slate-950/60 text-slate-200 hover:border-cyan-200/70 hover:text-cyan-100"
              }`}
            >
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange({ ...settings, stringSelection: ALL_DROP_STRING_INDEXES })}
          aria-pressed={allSelected}
          className={`min-h-8 min-w-14 rounded-md border px-2.5 text-xs font-black transition ${
            allSelected
              ? "border-cyan-100 bg-cyan-200 text-slate-950 shadow-[0_0_22px_rgba(103,232,249,0.28)]"
              : "border-slate-700/80 bg-slate-950/60 text-slate-200 hover:border-cyan-200/70 hover:text-cyan-100"
          }`}
        >
          All
        </button>
      </div>
    </div>
  );
}

function NameTheNoteNoteSelector({
  settings,
  onChange,
}: {
  settings: NameTheNoteSettings;
  onChange: (settings: NameTheNoteSettings) => void;
}) {
  const selectedNotes = normalizePracticeNotes(settings.selectedNotes);
  const allNotesSelected = selectedNotes.length === CURRENT_DROP_NOTE_POOL.notes.length;

  function commitNotes(nextNotes: readonly Note[]) {
    onChange({ ...settings, selectedNotes: normalizePracticeNotes(nextNotes) });
  }

  function toggleNote(note: Note) {
    if (selectedNotes.includes(note)) {
      if (selectedNotes.length === 1) return;
      commitNotes(selectedNotes.filter((selectedNote) => selectedNote !== note));
      return;
    }
    commitNotes([...selectedNotes, note]);
  }

  return (
    <div className="mx-auto mt-5 max-w-2xl text-sm">
      <p className="font-semibold text-slate-300">Practice notes:</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
        {CURRENT_DROP_NOTE_POOL.notes.map((note) => {
          const isSelected = selectedNotes.includes(note);
          return (
            <button
              key={note}
              type="button"
              onClick={() => toggleNote(note)}
              aria-pressed={isSelected}
              aria-label={`Name the Note practice note ${note}`}
              className={`min-h-9 min-w-10 rounded-md border px-3 text-sm font-black transition ${
                isSelected
                  ? "border-amber-100 bg-amber-200 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.2)]"
                  : "border-slate-700/80 bg-slate-950/60 text-slate-300 hover:border-amber-100/60 hover:text-amber-100"
              }`}
            >
              {note}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => commitNotes(CURRENT_DROP_NOTE_POOL.notes)}
          aria-pressed={allNotesSelected}
          aria-label="All Name the Note practice notes"
          className={`min-h-9 min-w-12 rounded-md border px-3 text-sm font-black transition ${
            allNotesSelected
              ? "border-amber-100 bg-amber-200 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.2)]"
              : "border-slate-700/80 bg-slate-950/60 text-slate-300 hover:border-amber-100/60 hover:text-amber-100"
          }`}
        >
          All
        </button>
      </div>
    </div>
  );
}

function NameTheNoteRunScreen({
  state,
  bestScore,
  onAnswer,
  onBack,
}: {
  state: NameTheNoteState;
  bestScore: number;
  onAnswer: (note: Note) => void;
  onBack: () => void;
}) {
  const question = state.activeQuestion;
  const seconds = Math.ceil(state.timeLeftMs / 1000);

  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-[88rem] flex-1 flex-col gap-2 py-2"
      data-testid="name-note-run-screen"
      data-layout="top-aligned-responsive-stack"
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-slate-700/55 bg-slate-950/78 p-2 shadow-md sm:grid-cols-[auto_repeat(2,minmax(7rem,auto))_1fr_auto]">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-700/70 text-slate-200 hover:border-amber-300/70 hover:text-amber-100"
          aria-label="Back to Name the Note setup"
          title="Back to setup"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <RunStat label="Run Points" value={state.score} strong />
        <RunStat label="Streak" value={state.streak} celebrate={question?.outcome === "correct" && state.streak > 0} />
        <div className="hidden items-center justify-start gap-2 px-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 sm:flex">
          <Trophy className="h-4 w-4 text-amber-200/70" />
          Best {bestScore}
        </div>
        <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
          <div className="flex h-10 min-w-24 items-center justify-center gap-2 rounded-md border border-cyan-200/20 bg-cyan-300/10 px-3 font-mono text-xl font-black text-cyan-50">
            <Timer className="h-5 w-5 text-cyan-200" />
            {seconds}
          </div>
        </div>
      </div>
      {question ? (
        <div className="flex min-h-0 flex-col items-center gap-2">
          <NameTheNoteFretboard
            target={question.target}
            outcome={question.outcome}
            countdownFraction={question.countdownFraction}
            earnedPoints={question.earnedPoints}
            revealedCorrectNote={question.outcome === "idle" ? undefined : question.target.note}
            interactionEnabled={question.outcome === "idle"}
          />
          <AnswerPanel question={question} onAnswer={onAnswer} />
        </div>
      ) : null}
    </div>
  );
}

function RunStat({
  label,
  value,
  icon,
  strong = false,
  celebrate = false,
  className = "flex",
}: {
  label: string;
  value: number;
  icon?: ReactNode;
  strong?: boolean;
  celebrate?: boolean;
  className?: string;
}) {
  return (
    <div className={`${className} h-10 min-w-24 items-center justify-between gap-3 rounded-md border border-slate-700/55 bg-slate-900/62 px-3`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <span className={`flex items-center gap-1 font-mono font-black text-white ${strong ? "text-2xl" : "text-xl"} ${celebrate ? "name-note-streak-value" : ""}`}>
        {icon}
        {value}
      </span>
    </div>
  );
}

type NameTheNoteFretboardViewState = {
  target: FretboardTarget;
  outcome: QuestionOutcome;
  countdownFraction: number;
  earnedPoints: number | null;
  revealedCorrectNote?: Note;
  interactionEnabled: boolean;
};

function clampCountdownFraction(countdownFraction: number): number {
  return Math.max(0, Math.min(1, countdownFraction));
}

function NameTheNoteFretboard({
  target,
  outcome,
  countdownFraction,
  earnedPoints,
  revealedCorrectNote,
  interactionEnabled,
}: NameTheNoteFretboardViewState) {
  const frets = Array.from({ length: DROP_MAX_FRET }, (_, index) => index + 1);
  const strings = Array.from({ length: 6 }, (_, index) => index as DropStringIndex);
  const markerTone = outcome === "correct" ? "border-emerald-100 bg-emerald-300/95" : outcome === "idle" ? "border-cyan-50 bg-cyan-200" : "border-red-100 bg-red-300/95";
  const fretGridTemplateColumns = getNameTheNoteGridTemplateColumns();
  const fretFractions = getNameTheNoteFretSpaceFractions();

  return (
    <div
      className="name-note-fretboard flex w-full flex-col rounded-md border border-cyan-200/14 bg-slate-950/28 p-2 shadow-[0_10px_28px_rgba(0,0,0,0.22)] sm:p-2.5"
      data-testid="name-note-fretboard"
      data-layout="responsive-six-row-grid"
    >
      <div className="grid text-center font-mono text-[10px] font-bold text-amber-100/58 sm:text-xs" style={{ gridTemplateColumns: fretGridTemplateColumns }}>
        <div />
        <div className="text-[9px] uppercase text-cyan-100/80 sm:text-[10px]">OPEN</div>
        {frets.map((fret) => (
          <div
            key={fret}
            data-testid={`name-note-fret-header-${fret}`}
            data-fret-width={fretFractions[fret - 1]?.toFixed(5)}
          >
            {fret}
          </div>
        ))}
      </div>
      <div className="grid h-4 items-center sm:h-5" style={{ gridTemplateColumns: fretGridTemplateColumns }}>
        <div />
        <div />
        {frets.map((fret) => (
          <div key={fret} className="flex justify-center">
            {DOT_FRETS.includes(fret) ? <span className="h-2 w-2 rounded-full bg-amber-100/65 shadow-[0_0_8px_rgba(254,243,199,0.28)]" /> : null}
          </div>
        ))}
      </div>
      <div
        className="mt-1 grid min-h-0 flex-1 grid-rows-6 rounded-sm border border-amber-100/16 bg-[linear-gradient(90deg,rgba(66,40,22,0.96),rgba(101,60,29,0.96)_54%,rgba(122,68,32,0.94))] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_-16px_30px_rgba(0,0,0,0.28)_inset]"
        data-testid="name-note-neck"
        data-neck-taper="none"
      >
        {strings.map((stringIndex) => (
          <div
            key={stringIndex}
            className="relative grid min-h-0 items-center"
            style={{ gridTemplateColumns: fretGridTemplateColumns }}
            data-testid={`name-note-string-row-${stringIndex}`}
            data-string-gauge={getNameTheNoteStringGauge(stringIndex)}
          >
            <div className={`relative z-10 pr-2 text-right text-sm font-black tabular-nums sm:text-base ${stringIndex === target.stringIndex ? "text-white" : "text-amber-100/34"}`}>
              {stringIndex + 1}
            </div>
            <TargetCell
              isTarget={target.stringIndex === stringIndex && target.fret === 0}
              isOpen
              markerTone={markerTone}
              outcome={outcome}
              countdownFraction={countdownFraction}
              earnedPoints={earnedPoints}
              target={target}
              stringIndex={stringIndex}
              revealedCorrectNote={revealedCorrectNote}
              interactionEnabled={interactionEnabled}
            />
            {frets.map((fret) => (
              <TargetCell
                key={fret}
                isTarget={target.stringIndex === stringIndex && target.fret === fret}
                isOpen={false}
                markerTone={markerTone}
                outcome={outcome}
                countdownFraction={countdownFraction}
                earnedPoints={earnedPoints}
                target={target}
                stringIndex={stringIndex}
                revealedCorrectNote={revealedCorrectNote}
                interactionEnabled={interactionEnabled}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TargetCell({
  isTarget,
  isOpen,
  markerTone,
  outcome,
  countdownFraction,
  earnedPoints,
  target,
  stringIndex,
  revealedCorrectNote,
  interactionEnabled,
}: {
  isTarget: boolean;
  isOpen: boolean;
  markerTone: string;
  outcome: QuestionOutcome;
  countdownFraction: number;
  earnedPoints: number | null;
  target: FretboardTarget;
  stringIndex: DropStringIndex;
  revealedCorrectNote?: Note;
  interactionEnabled: boolean;
}) {
  const stringGauge = getNameTheNoteStringGauge(stringIndex);
  const ringFraction = outcome === "idle" ? clampCountdownFraction(countdownFraction) : 0;
  const isUrgent = outcome === "idle" && ringFraction <= 0.25;
  const ringColor = isUrgent ? "rgba(251, 191, 36, 0.98)" : "rgba(103, 232, 249, 0.98)";
  const ringStyle = {
    background: `conic-gradient(${ringColor} ${ringFraction * 100}%, rgba(103, 232, 249, 0.12) 0)`,
  } satisfies CSSProperties;
  return (
    <div
      className={`relative z-10 flex h-full min-h-0 items-center justify-center ${isOpen ? "border-r-[6px] border-r-amber-100/90 bg-slate-950/20" : "border-l border-amber-100/34"}`}
      aria-label={isTarget ? `${getStringFocusLabel(target.stringIndex as DropStringIndex)} ${isOpen ? "open string" : `fret ${target.fret}`} target` : undefined}
      data-testid={isTarget ? "name-note-target-cell" : undefined}
      data-target-key={isTarget ? target.targetKey : undefined}
    >
      <span
        className="absolute left-0 right-0 top-1/2 block -translate-y-1/2 rounded-full bg-gradient-to-b from-zinc-100/88 via-zinc-400/70 to-zinc-900/55 shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
        style={{ height: `${stringGauge}px` }}
      />
      {isOpen ? <span className="absolute bottom-0 top-0 right-0 w-1.5 rounded-full bg-amber-100 shadow-[0_0_10px_rgba(254,243,199,0.34)]" /> : null}
      {isOpen && isTarget ? (
        <span className="absolute left-1 top-1 rounded bg-cyan-100 px-1 text-[8px] font-black text-slate-950">OPEN</span>
      ) : null}
      {isTarget ? (
        <span
          className={`name-note-target-ring absolute left-1/2 top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full p-[3px] ${isUrgent ? "name-note-target-ring--urgent" : ""}`}
          style={ringStyle}
          data-testid="name-note-target-ring"
          data-countdown-fraction={ringFraction.toFixed(2)}
          data-urgent={isUrgent ? "true" : "false"}
        >
          <span
            className={`name-note-target-marker relative flex h-full w-full items-center justify-center rounded-full border shadow-[0_0_18px_rgba(103,232,249,0.48)] ${markerTone} ${outcome === "correct" ? "name-note-target-marker--correct" : ""} ${outcome === "timeout" ? "name-note-target-marker--timeout" : ""}`}
            aria-label={`Target marker ${target.targetKey}${outcome === "timeout" && revealedCorrectNote ? `, correct note ${revealedCorrectNote}` : ""}`}
            data-testid="name-note-target-marker"
            data-interaction-enabled={interactionEnabled ? "true" : "false"}
            data-outcome={outcome}
          >
            {outcome === "timeout" && revealedCorrectNote ? (
              <span className="font-mono text-sm font-black text-slate-950">{revealedCorrectNote}</span>
            ) : (
              <span className="h-2 w-2 rounded-full bg-slate-950/82" aria-hidden="true" />
            )}
          </span>
          {outcome === "correct" && earnedPoints !== null ? (
            <span className="name-note-earned-points" data-testid="name-note-earned-points" aria-live="polite">+{earnedPoints}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function AnswerPanel({
  question,
  onAnswer,
}: {
  question: NameTheNoteQuestion;
  onAnswer: (note: Note) => void;
}) {
  const isResolved = question.outcome !== "idle";
  const feedback = question.outcome === "correct"
    ? "Correct"
    : question.outcome === "timeout"
      ? `Time's up · ${question.target.note}`
      : question.wrongAnswers.length > 0
        ? "Try again"
        : "Name this position";

  return (
    <div className="w-full max-w-[48rem] rounded-md border border-slate-700/50 bg-slate-950/72 p-2.5 text-center shadow-md">
      <div className="mx-auto flex max-w-[44rem] items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.16em] text-slate-400 sm:text-sm">
        <span>{feedback}</span>
        <span
          className="rounded border border-cyan-100/20 bg-cyan-200/10 px-2 py-1 font-mono text-cyan-100"
          aria-label={question.outcome === "timeout" ? `Correct note ${question.target.note}` : "Question time remaining"}
          data-testid="name-note-question-countdown"
          data-state={question.outcome === "timeout" ? "time" : "counting"}
        >
          {question.outcome === "timeout" ? "TIME" : `${Math.ceil(question.remainingQuestionMs / 1000)}s`}
        </span>
      </div>
      <div
        className="mx-auto mt-2 grid max-w-[44rem] grid-cols-7 gap-2"
        data-testid="name-note-answer-grid"
        data-layout="bounded-centered"
      >
        {NAME_THE_NOTE_ANSWER_NOTES.map((note) => {
          const isSelected = question.selectedNote === note;
          const isWrongAttempt = question.wrongAnswers.includes(note);
          const isCorrectNote = isResolved && question.target.note === note;
          const isDisabled = isResolved || isWrongAttempt;
          return (
            <button
              key={note}
              type="button"
              onClick={() => onAnswer(note)}
              disabled={isDisabled}
              aria-label={`Answer ${note}`}
              className={`name-note-answer relative h-12 min-w-0 rounded-md border px-2 font-mono text-2xl font-black transition sm:h-14 sm:text-[1.65rem] ${
                isWrongAttempt
                  ? "name-note-answer--wrong border-red-100 bg-red-950/80 text-red-50"
                  : isCorrectNote || isSelected
                    ? "border-emerald-100 bg-emerald-950/74 text-emerald-50"
                    : "border-cyan-100/24 bg-slate-900/86 text-cyan-50 hover:border-cyan-100/70 hover:bg-cyan-200/10 disabled:opacity-90"
              }`}
              data-feedback={isWrongAttempt ? "wrong" : isCorrectNote || isSelected ? "correct" : "idle"}
            >
              <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]">{note}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NameTheNoteResults({
  result,
  bestScore,
  onPlayAgain,
  onBack,
}: {
  result: NameTheNoteResult;
  bestScore: number;
  onPlayAgain: () => void;
  onBack: () => void;
}) {
  const displayBest = Math.max(bestScore, result.runPoints);
  const fluencyDeltaText = result.fluencyDelta > 0 ? `+${result.fluencyDelta}` : result.fluencyDelta < 0 ? String(result.fluencyDelta) : "0";

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <div className="w-full max-w-3xl text-center">
        <p className="text-xs font-black uppercase tracking-[0.42em] text-amber-100/72">run complete</p>
        <div className="mx-auto mt-5 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-amber-100/24 bg-amber-300/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-100/72">Run Points</p>
            <p className="mt-1 font-mono text-5xl font-black tracking-tight text-white drop-shadow-[0_0_28px_rgba(252,211,77,0.18)]">{result.runPoints}</p>
            <p className="mt-1 text-sm font-semibold text-slate-300">Best {displayBest}</p>
          </div>
          <div className="rounded-lg border border-cyan-100/24 bg-cyan-300/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/72">Fluency</p>
            <p className="mt-1 font-mono text-5xl font-black tracking-tight text-white">{result.fluencyScore} / 1000</p>
            <p className="mt-1 text-sm font-bold text-cyan-100">{result.fluencyLabel} <span className="text-slate-400">({fluencyDeltaText})</span></p>
          </div>
        </div>
        {result.isNewBest ? (
          <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-amber-100/55 bg-amber-300/18 px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-amber-100 shadow-[0_0_28px_rgba(252,211,77,0.18)]">
            <Trophy className="h-4 w-4" />
            New Run Points best
          </div>
        ) : null}
        {result.isNewBestFluency ? (
          <div className="mx-auto ml-2 mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-100/50 bg-cyan-300/14 px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-cyan-100 shadow-[0_0_24px_rgba(103,232,249,0.14)]">
            New Fluency best
          </div>
        ) : null}
        <div className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-3 text-left sm:grid-cols-4">
          <ResultStat label="Correct" value={result.correct} tone="gold" />
          <ResultStat label="Wrong Attempts" value={result.incorrect} />
          <ResultStat label="Timeouts" value={result.timeouts} />
          <ResultStat label="Accuracy" value={`${result.accuracy}%`} />
          <ResultStat label="Avg Correct" value={result.averageCorrectResponseMs === null ? "-" : `${(result.averageCorrectResponseMs / 1000).toFixed(1)}s`} />
          <ResultStat label="Best Streak" value={result.bestStreak} />
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onPlayAgain}
            className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg bg-amber-300 px-11 text-xl font-black text-slate-950 shadow-[0_0_42px_rgba(252,211,77,0.45)] transition hover:bg-amber-200"
          >
            <RotateCcw className="h-5 w-5" />
            Play Again
          </button>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-slate-700/80 px-6 text-base font-bold text-slate-300 hover:border-amber-200/55 hover:text-amber-100"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string | number;
  tone?: "gold" | "muted";
}) {
  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/70 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-black ${tone === "gold" ? "text-amber-100" : "text-white"}`}>{value}</p>
    </div>
  );
}
