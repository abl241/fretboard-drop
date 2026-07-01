import { getNoteAtFret, type Note } from "@/lib/fretboard";
import { createFretboardTargetKey, FRETBOARD_TARGET_TUNING_ID, type FretboardTargetKey } from "@/lib/fretboardTargets";
import type { DropStringIndex, DropTarget } from "./dropGameTypes";

export const DROP_CELL_PROGRESS_STORAGE_KEY = "fretboard-drop:cell-progress:v1";
export const DROP_CELL_PROGRESS_SCHEMA_VERSION = 1;
export const DROP_CELL_PROGRESS_TUNING_ID = FRETBOARD_TARGET_TUNING_ID;
export const DROP_CELL_PROGRESS_RECENT_RESOLUTION_LIMIT = 20;

export type FretboardCellId = FretboardTargetKey;
export type CellResolutionOutcome = "correct" | "miss";

export type CellResolutionSample = {
  occurredAt: string;
  outcome: CellResolutionOutcome;
  hitProgress?: number;
};

export type CellProgressRecord = {
  schemaVersion: 1;
  cellId: FretboardCellId;
  tuningId: "standard";
  stringIndex: number;
  fret: number;
  noteName: string;
  resolvedTargets: number;
  correctHits: number;
  misses: number;
  adjacentWrongTaps: number;
  otherWrongTaps: number;
  hitProgressSum: number;
  hitProgressCount: number;
  consecutiveCorrect: number;
  bestConsecutiveCorrect: number;
  firstPracticedAt: string;
  lastPracticedAt: string;
  practicedDateKeys: string[];
  recentResolutions: CellResolutionSample[];
};

export type CellProgressSnapshot = {
  schemaVersion: 1;
  exportedAt: string;
  tuningId: "standard";
  cells: Record<FretboardCellId, CellProgressRecord>;
};

export interface CellProgressRepository {
  listCells(): Promise<CellProgressRecord[]>;
  getCell(cellId: FretboardCellId): Promise<CellProgressRecord | null>;
  upsertCells(records: CellProgressRecord[]): Promise<void>;
  clear(): Promise<void>;
  exportSnapshot(): Promise<CellProgressSnapshot>;
  importSnapshot(snapshot: CellProgressSnapshot): Promise<void>;
}

export type CellProgressCellInput = {
  stringIndex: DropStringIndex;
  fret: number;
  noteName?: Note | string;
};

export function createFretboardCellId(stringIndex: number, fret: number): FretboardCellId {
  return createFretboardTargetKey(stringIndex, fret);
}

export function getLocalPracticeDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDate(occurredAt: Date | string): Date {
  return typeof occurredAt === "string" ? new Date(occurredAt) : occurredAt;
}

function toIsoTimestamp(occurredAt: Date | string): string {
  const date = toDate(occurredAt);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function clampProgress(hitProgress: number): number {
  return Math.min(1, Math.max(0, hitProgress));
}

export function createEmptyCellProgress(
  cell: CellProgressCellInput,
  occurredAt: Date | string = new Date(),
): CellProgressRecord {
  const practicedAt = toIsoTimestamp(occurredAt);
  const stringIndex = cell.stringIndex;
  const fret = Math.max(0, Math.round(cell.fret));
  return {
    schemaVersion: DROP_CELL_PROGRESS_SCHEMA_VERSION,
    cellId: createFretboardCellId(stringIndex, fret),
    tuningId: DROP_CELL_PROGRESS_TUNING_ID,
    stringIndex,
    fret,
    noteName: cell.noteName ?? getNoteAtFret(stringIndex, fret),
    resolvedTargets: 0,
    correctHits: 0,
    misses: 0,
    adjacentWrongTaps: 0,
    otherWrongTaps: 0,
    hitProgressSum: 0,
    hitProgressCount: 0,
    consecutiveCorrect: 0,
    bestConsecutiveCorrect: 0,
    firstPracticedAt: practicedAt,
    lastPracticedAt: practicedAt,
    practicedDateKeys: [getLocalPracticeDateKey(toDate(practicedAt))],
    recentResolutions: [],
  };
}

function touchRecord(record: CellProgressRecord, occurredAt: Date | string): CellProgressRecord {
  const practicedAt = toIsoTimestamp(occurredAt);
  const dateKey = getLocalPracticeDateKey(toDate(practicedAt));
  return {
    ...record,
    firstPracticedAt: record.firstPracticedAt || practicedAt,
    lastPracticedAt: practicedAt,
    practicedDateKeys: record.practicedDateKeys.includes(dateKey)
      ? record.practicedDateKeys
      : [...record.practicedDateKeys, dateKey].sort(),
  };
}

export function appendBoundedRecentResolution(
  resolutions: readonly CellResolutionSample[],
  sample: CellResolutionSample,
): CellResolutionSample[] {
  return [...resolutions, sample].slice(-DROP_CELL_PROGRESS_RECENT_RESOLUTION_LIMIT);
}

export function recordCorrectResolution(
  record: CellProgressRecord,
  hitProgress: number,
  occurredAt: Date | string = new Date(),
): CellProgressRecord {
  const touched = touchRecord(record, occurredAt);
  const nextConsecutiveCorrect = touched.consecutiveCorrect + 1;
  const normalizedProgress = clampProgress(hitProgress);
  return {
    ...touched,
    resolvedTargets: touched.resolvedTargets + 1,
    correctHits: touched.correctHits + 1,
    hitProgressSum: touched.hitProgressSum + normalizedProgress,
    hitProgressCount: touched.hitProgressCount + 1,
    consecutiveCorrect: nextConsecutiveCorrect,
    bestConsecutiveCorrect: Math.max(touched.bestConsecutiveCorrect, nextConsecutiveCorrect),
    recentResolutions: appendBoundedRecentResolution(touched.recentResolutions, {
      occurredAt: toIsoTimestamp(occurredAt),
      outcome: "correct",
      hitProgress: normalizedProgress,
    }),
  };
}

export function recordMissResolution(
  record: CellProgressRecord,
  occurredAt: Date | string = new Date(),
): CellProgressRecord {
  const touched = touchRecord(record, occurredAt);
  return {
    ...touched,
    resolvedTargets: touched.resolvedTargets + 1,
    misses: touched.misses + 1,
    consecutiveCorrect: 0,
    recentResolutions: appendBoundedRecentResolution(touched.recentResolutions, {
      occurredAt: toIsoTimestamp(occurredAt),
      outcome: "miss",
    }),
  };
}

export function recordWrongFretTap(
  record: CellProgressRecord,
  clickedFret: number,
  occurredAt: Date | string = new Date(),
): CellProgressRecord {
  const touched = touchRecord(record, occurredAt);
  const fretDistance = Math.abs(Math.round(clickedFret) - touched.fret);
  return {
    ...touched,
    adjacentWrongTaps: touched.adjacentWrongTaps + (fretDistance === 1 ? 1 : 0),
    otherWrongTaps: touched.otherWrongTaps + (fretDistance === 1 ? 0 : 1),
    consecutiveCorrect: 0,
  };
}

function createEmptySnapshot(exportedAt: Date | string = new Date()): CellProgressSnapshot {
  return {
    schemaVersion: DROP_CELL_PROGRESS_SCHEMA_VERSION,
    exportedAt: toIsoTimestamp(exportedAt),
    tuningId: DROP_CELL_PROGRESS_TUNING_ID,
    cells: {},
  };
}

function isCellProgressRecord(value: unknown): value is CellProgressRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CellProgressRecord>;
  return record.schemaVersion === DROP_CELL_PROGRESS_SCHEMA_VERSION
    && record.tuningId === DROP_CELL_PROGRESS_TUNING_ID
    && typeof record.cellId === "string"
    && typeof record.stringIndex === "number"
    && typeof record.fret === "number"
    && typeof record.noteName === "string"
    && Array.isArray(record.practicedDateKeys)
    && Array.isArray(record.recentResolutions);
}

function safeInteger(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue)) : 0;
}

function sanitizeRecord(record: CellProgressRecord): CellProgressRecord {
  const cellId = createFretboardCellId(record.stringIndex, record.fret);
  return {
    ...record,
    schemaVersion: DROP_CELL_PROGRESS_SCHEMA_VERSION,
    cellId,
    tuningId: DROP_CELL_PROGRESS_TUNING_ID,
    resolvedTargets: safeInteger(record.resolvedTargets),
    correctHits: safeInteger(record.correctHits),
    misses: safeInteger(record.misses),
    adjacentWrongTaps: safeInteger(record.adjacentWrongTaps),
    otherWrongTaps: safeInteger(record.otherWrongTaps),
    hitProgressSum: Math.max(0, Number(record.hitProgressSum) || 0),
    hitProgressCount: safeInteger(record.hitProgressCount),
    consecutiveCorrect: safeInteger(record.consecutiveCorrect),
    bestConsecutiveCorrect: safeInteger(record.bestConsecutiveCorrect),
    practicedDateKeys: Array.from(new Set(record.practicedDateKeys)).sort(),
    recentResolutions: record.recentResolutions.slice(-DROP_CELL_PROGRESS_RECENT_RESOLUTION_LIMIT),
  };
}

function parseSnapshot(raw: string | null): CellProgressSnapshot {
  if (!raw) return createEmptySnapshot();
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed
      || typeof parsed !== "object"
      || parsed.schemaVersion !== DROP_CELL_PROGRESS_SCHEMA_VERSION
      || parsed.tuningId !== DROP_CELL_PROGRESS_TUNING_ID
      || !parsed.cells
      || typeof parsed.cells !== "object"
      || Array.isArray(parsed.cells)
    ) {
      return createEmptySnapshot();
    }

    const cells = Object.values(parsed.cells).reduce<Record<FretboardCellId, CellProgressRecord>>((nextCells, value) => {
      if (!isCellProgressRecord(value)) return nextCells;
      const record = sanitizeRecord(value);
      nextCells[record.cellId] = record;
      return nextCells;
    }, {});

    return {
      schemaVersion: DROP_CELL_PROGRESS_SCHEMA_VERSION,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
      tuningId: DROP_CELL_PROGRESS_TUNING_ID,
      cells,
    };
  } catch {
    return createEmptySnapshot();
  }
}

export class LocalStorageCellProgressRepository implements CellProgressRepository {
  constructor(private readonly storageKey = DROP_CELL_PROGRESS_STORAGE_KEY) {}

  private readSnapshot(): CellProgressSnapshot {
    try {
      return parseSnapshot(window.localStorage.getItem(this.storageKey));
    } catch {
      return createEmptySnapshot();
    }
  }

  private writeSnapshot(snapshot: CellProgressSnapshot): void {
    window.localStorage.setItem(this.storageKey, JSON.stringify({
      ...snapshot,
      schemaVersion: DROP_CELL_PROGRESS_SCHEMA_VERSION,
      exportedAt: toIsoTimestamp(snapshot.exportedAt),
      tuningId: DROP_CELL_PROGRESS_TUNING_ID,
    }));
  }

  async listCells(): Promise<CellProgressRecord[]> {
    return Object.values(this.readSnapshot().cells);
  }

  async getCell(cellId: FretboardCellId): Promise<CellProgressRecord | null> {
    return this.readSnapshot().cells[cellId] ?? null;
  }

  async upsertCells(records: CellProgressRecord[]): Promise<void> {
    const snapshot = this.readSnapshot();
    const cells = { ...snapshot.cells };
    for (const record of records) {
      const sanitized = sanitizeRecord(record);
      cells[sanitized.cellId] = sanitized;
    }
    this.writeSnapshot({
      schemaVersion: DROP_CELL_PROGRESS_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      tuningId: DROP_CELL_PROGRESS_TUNING_ID,
      cells,
    });
  }

  async clear(): Promise<void> {
    window.localStorage.removeItem(this.storageKey);
  }

  async exportSnapshot(): Promise<CellProgressSnapshot> {
    return this.readSnapshot();
  }

  async importSnapshot(snapshot: CellProgressSnapshot): Promise<void> {
    const parsed = parseSnapshot(JSON.stringify(snapshot));
    this.writeSnapshot({
      ...parsed,
      exportedAt: new Date().toISOString(),
    });
  }
}

const defaultCellProgressRepository = new LocalStorageCellProgressRepository();

async function updateCellProgress(
  repository: CellProgressRepository,
  cell: CellProgressCellInput,
  update: (record: CellProgressRecord) => CellProgressRecord,
): Promise<void> {
  const cellId = createFretboardCellId(cell.stringIndex, cell.fret);
  const existingRecord = await repository.getCell(cellId);
  const record = existingRecord ?? createEmptyCellProgress({
    stringIndex: cell.stringIndex,
    fret: cell.fret,
    noteName: cell.noteName,
  });
  await repository.upsertCells([update(record)]);
}

export async function recordCorrectTargetCellProgress(
  target: DropTarget,
  hitProgress: number,
  occurredAt: Date | string = new Date(),
  repository: CellProgressRepository = defaultCellProgressRepository,
): Promise<void> {
  await updateCellProgress(repository, {
    stringIndex: target.stringIndex,
    fret: target.fret,
    noteName: target.note,
  }, (record) => recordCorrectResolution(record, hitProgress, occurredAt));
}

export async function recordMissedTargetCellProgress(
  target: Pick<DropTarget, "note" | "stringIndex" | "fret">,
  occurredAt: Date | string = new Date(),
  repository: CellProgressRepository = defaultCellProgressRepository,
): Promise<void> {
  await updateCellProgress(repository, {
    stringIndex: target.stringIndex,
    fret: target.fret,
    noteName: target.note,
  }, (record) => recordMissResolution(record, occurredAt));
}

export async function recordWrongTargetCellProgress(
  target: DropTarget,
  clickedFret: number,
  occurredAt: Date | string = new Date(),
  repository: CellProgressRepository = defaultCellProgressRepository,
): Promise<void> {
  await updateCellProgress(repository, {
    stringIndex: target.stringIndex,
    fret: target.fret,
    noteName: target.note,
  }, (record) => recordWrongFretTap(record, clickedFret, occurredAt));
}

let cellProgressWriteQueue = Promise.resolve();

export function recordCellProgressSafely(work: () => Promise<void>): void {
  cellProgressWriteQueue = cellProgressWriteQueue.then(work, work).catch(() => undefined);
  void cellProgressWriteQueue;
}

export async function flushCellProgressWrites(): Promise<void> {
  await cellProgressWriteQueue;
}
