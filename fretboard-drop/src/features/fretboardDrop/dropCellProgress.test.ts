import { describe, expect, it } from "vitest";
import {
  DROP_CELL_PROGRESS_RECENT_RESOLUTION_LIMIT,
  DROP_CELL_PROGRESS_SCHEMA_VERSION,
  DROP_CELL_PROGRESS_STORAGE_KEY,
  DROP_CELL_PROGRESS_TUNING_ID,
  LocalStorageCellProgressRepository,
  appendBoundedRecentResolution,
  createEmptyCellProgress,
  createFretboardCellId,
  recordCorrectResolution,
  recordCorrectTargetCellProgress,
  recordMissResolution,
  recordMissedTargetCellProgress,
  recordWrongFretTap,
  recordWrongTargetCellProgress,
  type CellResolutionSample,
} from "./dropCellProgress";
import type { DropTarget } from "./dropGameTypes";

const practicedAt = new Date("2026-06-13T16:00:00.000Z");
const laterPractice = new Date("2026-06-14T16:00:00.000Z");

function makeTarget(overrides: Partial<DropTarget> = {}): DropTarget {
  return {
    id: 1,
    note: "A",
    stringIndex: 0,
    fret: 5,
    startedAt: 0,
    durationMs: 5_000,
    stageXPercent: 50,
    stageYPercent: 44,
    ...overrides,
  };
}

describe("drop cell progress", () => {
  it("creates deterministic physical cell ids", () => {
    expect(createFretboardCellId(0, 5)).toBe("standard:0:5");
    expect(createFretboardCellId(0, 5)).toBe(createFretboardCellId(0, 5));
    expect(createFretboardCellId(1, 5)).not.toBe(createFretboardCellId(0, 5));
  });

  it("records correct resolutions with timing and streak evidence", () => {
    const record = createEmptyCellProgress({ stringIndex: 0, fret: 5, noteName: "A" }, practicedAt);
    const updated = recordCorrectResolution(record, 0.27, laterPractice);

    expect(updated.resolvedTargets).toBe(1);
    expect(updated.correctHits).toBe(1);
    expect(updated.misses).toBe(0);
    expect(updated.hitProgressSum).toBe(0.27);
    expect(updated.hitProgressCount).toBe(1);
    expect(updated.consecutiveCorrect).toBe(1);
    expect(updated.bestConsecutiveCorrect).toBe(1);
    expect(updated.firstPracticedAt).toBe(practicedAt.toISOString());
    expect(updated.lastPracticedAt).toBe(laterPractice.toISOString());
    expect(updated.practicedDateKeys).toEqual(["2026-06-13", "2026-06-14"]);
    expect(updated.recentResolutions).toEqual([{
      occurredAt: laterPractice.toISOString(),
      outcome: "correct",
      hitProgress: 0.27,
    }]);
  });

  it("records misses as resolved targets and resets consecutive correct", () => {
    const record = recordCorrectResolution(
      createEmptyCellProgress({ stringIndex: 0, fret: 5, noteName: "A" }, practicedAt),
      0.2,
      practicedAt,
    );
    const updated = recordMissResolution(record, laterPractice);

    expect(updated.resolvedTargets).toBe(2);
    expect(updated.correctHits).toBe(1);
    expect(updated.misses).toBe(1);
    expect(updated.consecutiveCorrect).toBe(0);
    expect(updated.bestConsecutiveCorrect).toBe(1);
    expect(updated.recentResolutions.at(-1)).toEqual({
      occurredAt: laterPractice.toISOString(),
      outcome: "miss",
    });
  });

  it("classifies wrong frets without resolving the target", () => {
    const record = createEmptyCellProgress({ stringIndex: 0, fret: 5, noteName: "A" }, practicedAt);
    const adjacent = recordWrongFretTap(record, 4, practicedAt);
    const distant = recordWrongFretTap(adjacent, 1, laterPractice);

    expect(distant.resolvedTargets).toBe(0);
    expect(distant.correctHits).toBe(0);
    expect(distant.misses).toBe(0);
    expect(distant.adjacentWrongTaps).toBe(1);
    expect(distant.otherWrongTaps).toBe(1);
    expect(distant.consecutiveCorrect).toBe(0);
    expect(distant.recentResolutions).toEqual([]);
    expect(distant.lastPracticedAt).toBe(laterPractice.toISOString());
  });

  it("keeps only the most recent 20 resolutions", () => {
    const samples = Array.from({ length: DROP_CELL_PROGRESS_RECENT_RESOLUTION_LIMIT + 1 }, (_, index) => ({
      occurredAt: new Date(2026, 5, 13, 12, index).toISOString(),
      outcome: "correct" as const,
      hitProgress: 0.1,
    }));
    const bounded = samples.reduce<CellResolutionSample[]>(
      (next, sample) => appendBoundedRecentResolution(next, sample),
      [],
    );

    expect(bounded).toHaveLength(DROP_CELL_PROGRESS_RECENT_RESOLUTION_LIMIT);
    expect(bounded[0].occurredAt).toBe(samples[1].occurredAt);
    expect(bounded.at(-1)?.occurredAt).toBe(samples.at(-1)?.occurredAt);
  });

  it("returns empty progress for missing or malformed storage", async () => {
    const repository = new LocalStorageCellProgressRepository();

    expect(await repository.listCells()).toEqual([]);

    window.localStorage.setItem(DROP_CELL_PROGRESS_STORAGE_KEY, "{not json");

    expect(await repository.listCells()).toEqual([]);
    expect(await repository.exportSnapshot()).toMatchObject({
      schemaVersion: DROP_CELL_PROGRESS_SCHEMA_VERSION,
      tuningId: DROP_CELL_PROGRESS_TUNING_ID,
      cells: {},
    });
  });

  it("round-trips records, preserves other cells, exports, imports, and clears", async () => {
    const repository = new LocalStorageCellProgressRepository();
    const highE = recordCorrectResolution(createEmptyCellProgress({ stringIndex: 0, fret: 5, noteName: "A" }, practicedAt), 0.4, practicedAt);
    const bString = recordMissResolution(createEmptyCellProgress({ stringIndex: 1, fret: 1, noteName: "C" }, practicedAt), laterPractice);

    await repository.upsertCells([highE]);
    await repository.upsertCells([bString]);

    expect(await repository.getCell(createFretboardCellId(0, 5))).toMatchObject({ correctHits: 1 });
    expect(await repository.getCell(createFretboardCellId(1, 1))).toMatchObject({ misses: 1 });
    expect(await repository.listCells()).toHaveLength(2);

    const snapshot = await repository.exportSnapshot();
    await repository.clear();
    expect(await repository.listCells()).toEqual([]);

    await repository.importSnapshot(snapshot);
    expect(await repository.listCells()).toHaveLength(2);
    expect(window.localStorage.getItem(DROP_CELL_PROGRESS_STORAGE_KEY)).toContain("standard:0:5");
  });

  it("attributes service updates to the target cell instead of the clicked wrong cell", async () => {
    const repository = new LocalStorageCellProgressRepository();
    const target = makeTarget();

    await recordWrongTargetCellProgress(target, 4, practicedAt, repository);
    await recordWrongTargetCellProgress(target, 2, laterPractice, repository);

    expect(await repository.getCell(createFretboardCellId(0, 5))).toMatchObject({
      adjacentWrongTaps: 1,
      otherWrongTaps: 1,
      resolvedTargets: 0,
    });
    expect(await repository.getCell(createFretboardCellId(0, 4))).toBeNull();
    expect(await repository.getCell(createFretboardCellId(0, 2))).toBeNull();
  });

  it("records service correct and miss outcomes for the target cell", async () => {
    const repository = new LocalStorageCellProgressRepository();
    const target = makeTarget();

    await recordCorrectTargetCellProgress(target, 0.35, practicedAt, repository);
    await recordMissedTargetCellProgress(target, laterPractice, repository);

    expect(await repository.getCell(createFretboardCellId(0, 5))).toMatchObject({
      resolvedTargets: 2,
      correctHits: 1,
      misses: 1,
      hitProgressSum: 0.35,
      hitProgressCount: 1,
      consecutiveCorrect: 0,
      bestConsecutiveCorrect: 1,
    });
  });
});
