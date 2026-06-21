export const DROP_RUN_HISTORY_STORAGE_KEY = "fretboard-drop:run-history:v1";
export const DROP_RUN_HISTORY_MAX_PER_CONTEXT = 10;
export const DROP_RUN_HISTORY_DISPLAY_COUNT = 5;

export type DropRunHistoryEntry = {
  completedAt: number;
  fluencyScore: number;
  fluencyScoreLabel: string;
  notesFound: number;
  accuracy: number;
  averageHitProgress?: number;
};

export type DropRunHistoryByContext = Record<string, DropRunHistoryEntry[]>;

export type DropRunTrend =
  | {
      kind: "placeholder";
      message: string;
    }
  | {
      kind: "trend";
      scores: readonly number[];
      delta: number;
      accessibleLabel: string;
    };

function clampScore(score: number): number {
  return Math.min(1000, Math.max(0, Math.round(score)));
}

function normalizeEntry(entry: DropRunHistoryEntry): DropRunHistoryEntry {
  const averageHitProgress = typeof entry.averageHitProgress === "number" && Number.isFinite(entry.averageHitProgress)
    ? entry.averageHitProgress
    : undefined;

  return {
    completedAt: Number.isFinite(entry.completedAt) ? entry.completedAt : Date.now(),
    fluencyScore: clampScore(entry.fluencyScore),
    fluencyScoreLabel: entry.fluencyScoreLabel,
    notesFound: Math.max(0, Math.round(entry.notesFound)),
    accuracy: Math.min(100, Math.max(0, Math.round(entry.accuracy))),
    ...(averageHitProgress === undefined ? {} : { averageHitProgress }),
  };
}

function parseHistory(raw: string | null): DropRunHistoryByContext {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.entries(parsed).reduce<DropRunHistoryByContext>((history, [contextKey, entries]) => {
      if (!Array.isArray(entries)) return history;
      history[contextKey] = entries
        .filter((entry): entry is DropRunHistoryEntry => Boolean(entry) && typeof entry === "object")
        .map(normalizeEntry)
        .slice(-DROP_RUN_HISTORY_MAX_PER_CONTEXT);
      return history;
    }, {});
  } catch {
    return {};
  }
}

function readHistory(): DropRunHistoryByContext {
  try {
    return parseHistory(window.localStorage.getItem(DROP_RUN_HISTORY_STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeHistory(history: DropRunHistoryByContext): void {
  try {
    window.localStorage.setItem(DROP_RUN_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Run history is a local-only progress cue.
  }
}

export function getRunHistoryForContext(practiceContextKey: string): readonly DropRunHistoryEntry[] {
  return readHistory()[practiceContextKey] ?? [];
}

export function appendCompletedRunToHistory(
  practiceContextKey: string,
  entry: DropRunHistoryEntry,
): readonly DropRunHistoryEntry[] {
  const history = readHistory();
  const nextEntries = [...(history[practiceContextKey] ?? []), normalizeEntry(entry)].slice(-DROP_RUN_HISTORY_MAX_PER_CONTEXT);
  writeHistory({
    ...history,
    [practiceContextKey]: nextEntries,
  });
  return nextEntries;
}

export function getTrendDelta(entries: readonly DropRunHistoryEntry[]): number {
  const displayed = entries.slice(-DROP_RUN_HISTORY_DISPLAY_COUNT);
  if (displayed.length < 2) return 0;
  return displayed[displayed.length - 1].fluencyScore - displayed[0].fluencyScore;
}

function formatDelta(delta: number): string {
  if (delta > 0) return `plus ${delta}`;
  if (delta < 0) return `minus ${Math.abs(delta)}`;
  return "zero";
}

export function getLastFiveTrend(entries: readonly DropRunHistoryEntry[]): DropRunTrend {
  const displayed = entries.slice(-DROP_RUN_HISTORY_DISPLAY_COUNT);
  if (displayed.length < 2) {
    return {
      kind: "placeholder",
      message: "Play again to start your trend.",
    };
  }

  const scores = displayed.map((entry) => entry.fluencyScore);
  const delta = getTrendDelta(displayed);

  return {
    kind: "trend",
    scores,
    delta,
    accessibleLabel: `Last ${scores.length} Fluency Scores in this practice context: ${scores.join(", ")}. Change ${formatDelta(delta)}.`,
  };
}
