import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateCellFluency } from "./dropCellFluency";
import { createEmptyCellProgress, createFretboardCellId, recordCorrectResolution, recordMissResolution, recordWrongFretTap, type CellProgressRecord } from "./dropCellProgress";
import {
  DROP_STATS_3D_CANONICAL_ROTATION,
  DROP_STATS_3D_CANONICAL_ZOOM,
  DROP_STATS_3D_COLUMN_HEIGHT_PX,
  DROP_STATS_3D_INLAY_FRETS,
  DROP_STATS_3D_ROTATION_LIMITS,
  DROP_STATS_3D_STRING_THICKNESS_PX,
  DROP_STATS_3D_VIEW_PRESETS,
  DROP_STATS_3D_ZOOM_LIMITS,
  DROP_STATS_METRICS,
  buildFocusPracticePool,
  clampDropStats3DZoom,
  clampDropStats3DRotation,
  createDropStatsCellViewModel,
  createDropStatsFretboardViewModel,
  getDropStats3DStringThickness,
  getAccuracyDetailLabel,
  getDropStatsCellVisual,
  getDropStatsColumnHeight,
  getDropStatsFluencyPerformanceCategory,
  getDropStatsLegend,
  getRecallSpeedDetailLabel,
  toggleDropStatsNoteFilter,
  toggleDropStatsStringFilter,
} from "./dropFretboardStats";

function correctCell({
  stringIndex = 0,
  fret = 5,
  count = 3,
  hitProgress = 0.25,
}: {
  stringIndex?: 0 | 1 | 2 | 3 | 4 | 5;
  fret?: number;
  count?: number;
  hitProgress?: number;
} = {}): CellProgressRecord {
  let record = createEmptyCellProgress({ stringIndex, fret }, "2026-06-13T16:00:00.000Z");
  for (let index = 0; index < count; index += 1) {
    record = recordCorrectResolution(record, hitProgress, `2026-06-13T16:0${index}:00.000Z`);
  }
  return record;
}

function progressRecord(overrides: Partial<CellProgressRecord>): CellProgressRecord {
  const stringIndex = (overrides.stringIndex ?? 0) as 0 | 1 | 2 | 3 | 4 | 5;
  const fret = overrides.fret ?? 5;
  return {
    ...createEmptyCellProgress({ stringIndex, fret }, "2026-06-13T16:00:00.000Z"),
    ...overrides,
    cellId: createFretboardCellId(stringIndex, fret),
    stringIndex,
    fret,
  };
}

function weakCell(stringIndex: 0 | 1 | 2 | 3 | 4 | 5, fret: number, overrides: Partial<CellProgressRecord> = {}): CellProgressRecord {
  return progressRecord({
    stringIndex,
    fret,
    resolvedTargets: 3,
    correctHits: 0,
    misses: 3,
    recentResolutions: [
      { occurredAt: "2026-06-13T16:00:00.000Z", outcome: "miss" },
      { occurredAt: "2026-06-13T16:01:00.000Z", outcome: "miss" },
      { occurredAt: "2026-06-13T16:02:00.000Z", outcome: "miss" },
    ],
    ...overrides,
  });
}

function readIndexCss(): string {
  return readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
}

describe("Fretboard Drop Stats view model", () => {
  it("defaults to a physical 6 by 12 Fluency fretboard", () => {
    const viewModel = createDropStatsFretboardViewModel([]);

    expect(viewModel.metric).toBe("fluency");
    expect(viewModel.strings).toHaveLength(6);
    expect(viewModel.strings[0].stringLabel).toBe("high E");
    expect(viewModel.strings[0].cells).toHaveLength(12);
    expect(viewModel.strings[0].cells[0].cellId).toBe("standard:0:0");
    expect(viewModel.strings[5].cells[11].cellId).toBe("standard:5:11");
  });

  it("renders unstudied cells as neutral not-enough-data rather than weak", () => {
    const cell = createDropStatsCellViewModel([], 0, 5, "fluency");

    expect(cell.metricValue).toBeNull();
    expect(cell.metricLabel).toBe("Not enough data");
    expect(cell.strength).toBeNull();
    expect(cell.evidenceLevel).toBe("not-enough-data");
    expect(cell.isScored).toBe(false);
    expect(cell.accessibleLabel).toContain("Performance: No score");
    expect(cell.accessibleLabel).toContain("Evidence: Not enough data");
  });

  it("maps standard string and fret identity to the correct physical note", () => {
    const highEA = createDropStatsCellViewModel([], 0, 5, "attempts");
    const bStringC = createDropStatsCellViewModel([], 1, 1, "attempts");

    expect(highEA.cellId).toBe(createFretboardCellId(0, 5));
    expect(highEA.note).toBe("A");
    expect(highEA.stringLabel).toBe("high E");
    expect(bStringC.cellId).toBe(createFretboardCellId(1, 1));
    expect(bStringC.note).toBe("C");
    expect(bStringC.stringLabel).toBe("B");
  });

  it("uses the per-cell Fluency result for scored cells", () => {
    const record = correctCell({ count: 3, hitProgress: 0.22 });
    const cell = createDropStatsCellViewModel([record], 0, 5, "fluency");

    expect(cell.metricValue).toBe(calculateCellFluency(record).score);
    expect(cell.metricLabel).toBe(`${cell.metricValue} Fluency`);
    expect(cell.isScored).toBe(true);
  });

  it("uses correct-hit timing only for recall speed", () => {
    const noTiming = createEmptyCellProgress({ stringIndex: 0, fret: 5 }, "2026-06-13T16:00:00.000Z");
    const timed = correctCell({ count: 3, hitProgress: 0.18 });

    expect(createDropStatsCellViewModel([noTiming], 0, 5, "recall-speed").metricValue).toBeNull();
    expect(createDropStatsCellViewModel([timed], 0, 5, "recall-speed").metricValue).toBeGreaterThan(0);
  });

  it("uses binary correct hits over resolved targets for accuracy", () => {
    let record = correctCell({ count: 3, hitProgress: 0.3 });
    record = { ...record, resolvedTargets: 4, misses: 1 };
    const withWrongTaps = recordWrongFretTap(recordWrongFretTap(record, 4), 2);
    const cell = createDropStatsCellViewModel([withWrongTaps], 0, 5, "accuracy");

    expect(cell.metricValue).toBe(75);
    expect(cell.metricLabel).toBe("75% accuracy");
  });

  it("uses resolved targets only for attempts", () => {
    const unresolvedWrongOnly = recordWrongFretTap(createEmptyCellProgress({ stringIndex: 0, fret: 5 }), 2);
    const resolved = correctCell({ count: 5 });

    expect(createDropStatsCellViewModel([unresolvedWrongOnly], 0, 5, "attempts").metricValue).toBeNull();
    expect(createDropStatsCellViewModel([resolved], 0, 5, "attempts").metricValue).toBe(5);
  });

  it("provides metric-specific legend wording", () => {
    expect(getDropStatsLegend("fluency").entries.map((entry) => entry.label)).toEqual([
      "No score",
      "Needs work",
      "Developing",
      "Solid",
      "Strong",
    ]);
    expect(getDropStatsLegend("recall-speed").entries.map((entry) => entry.label)).toEqual(["No timing", "Slower", "Faster"]);
    expect(getDropStatsLegend("accuracy").entries.map((entry) => entry.label)).toEqual(["No results", "Lower", "Higher"]);
    expect(getDropStatsLegend("attempts").entries.map((entry) => entry.label)).toEqual(["Not asked", "Some exposure", "Well sampled"]);
    expect(getDropStatsLegend("attempts").accessibleLabel).not.toMatch(/strong/i);
  });

  it("maps Fluency scores to fixed performance categories at stable thresholds", () => {
    expect(getDropStatsFluencyPerformanceCategory(null).label).toBe("No score");
    expect(getDropStatsFluencyPerformanceCategory(0).label).toBe("Needs work");
    expect(getDropStatsFluencyPerformanceCategory(299).label).toBe("Needs work");
    expect(getDropStatsFluencyPerformanceCategory(300).label).toBe("Developing");
    expect(getDropStatsFluencyPerformanceCategory(499).label).toBe("Developing");
    expect(getDropStatsFluencyPerformanceCategory(500).label).toBe("Solid");
    expect(getDropStatsFluencyPerformanceCategory(699).label).toBe("Solid");
    expect(getDropStatsFluencyPerformanceCategory(700).label).toBe("Strong");
    expect(getDropStatsFluencyPerformanceCategory(1000).label).toBe("Strong");
  });

  it("keeps performance categories absolute under filters", () => {
    const record = correctCell({ stringIndex: 0, fret: 5, count: 8, hitProgress: 0.18 });
    const unfilteredCell = createDropStatsCellViewModel([record], 0, 5, "fluency");
    const filteredCell = createDropStatsCellViewModel([record], 0, 5, "fluency", {
      selectedNotes: ["A"],
      selectedStrings: [0],
    });
    const filteredOutCell = createDropStatsCellViewModel([record], 0, 5, "fluency", {
      selectedNotes: ["C"],
      selectedStrings: [1],
    });

    expect(filteredCell.fluency.score).toBe(unfilteredCell.fluency.score);
    expect(getDropStatsFluencyPerformanceCategory(filteredCell.fluency.score).label).toBe(
      getDropStatsFluencyPerformanceCategory(unfilteredCell.fluency.score).label,
    );
    expect(getDropStatsFluencyPerformanceCategory(filteredOutCell.fluency.score).label).toBe(
      getDropStatsFluencyPerformanceCategory(unfilteredCell.fluency.score).label,
    );
  });

  it("maps 3D Fluency column height and color from fixed absolute scores", () => {
    const unscored = createDropStatsCellViewModel([], 0, 5, "fluency");
    const weak = createDropStatsCellViewModel([weakCell(0, 5)], 0, 5, "fluency");
    const strong = createDropStatsCellViewModel([correctCell({ stringIndex: 0, fret: 5, count: 8, hitProgress: 0.18 })], 0, 5, "fluency");

    expect(getDropStatsColumnHeight("fluency", unscored)).toBe(DROP_STATS_3D_COLUMN_HEIGHT_PX.unscored);
    expect(getDropStatsColumnHeight("fluency", weak)).toBeGreaterThan(DROP_STATS_3D_COLUMN_HEIGHT_PX.unscored);
    expect(getDropStatsColumnHeight("fluency", strong)).toBeGreaterThan(getDropStatsColumnHeight("fluency", weak));
    expect(getDropStatsCellVisual("fluency", unscored).backgroundColor).toBe("#182131");
    expect(getDropStatsCellVisual("fluency", weak).backgroundColor).toBe("#A94442");
    expect(getDropStatsCellVisual("fluency", strong).backgroundColor).toBe("#43A879");
  });

  it("uses a clearly separated 3D Fluency height range for low, medium, and high scores", () => {
    const baseCell = createDropStatsCellViewModel([], 0, 5, "fluency");
    const scoredCell = (score: number) => ({
      ...baseCell,
      isScored: true,
      metricValue: score,
      strength: score / 1000,
      fluency: {
        ...baseCell.fluency,
        score,
      },
    });

    expect(getDropStatsColumnHeight("fluency", scoredCell(0))).toBe(10);
    expect(getDropStatsColumnHeight("fluency", scoredCell(500))).toBe(55);
    expect(getDropStatsColumnHeight("fluency", scoredCell(1000))).toBe(100);
  });

  it("keeps 3D column height stable under note and string filters", () => {
    const record = correctCell({ stringIndex: 0, fret: 5, count: 8, hitProgress: 0.18 });
    const unfilteredCell = createDropStatsCellViewModel([record], 0, 5, "fluency");
    const filteredOutCell = createDropStatsCellViewModel([record], 0, 5, "fluency", {
      selectedNotes: ["C"],
      selectedStrings: [1],
    });

    expect(filteredOutCell.isFilteredIn).toBe(false);
    expect(getDropStatsColumnHeight("fluency", filteredOutCell)).toBe(getDropStatsColumnHeight("fluency", unfilteredCell));
    expect(getDropStatsCellVisual("fluency", filteredOutCell).backgroundColor).toBe(getDropStatsCellVisual("fluency", unfilteredCell).backgroundColor);
  });

  it("keeps 3D metric-specific missing data neutral and low", () => {
    const untouched = createEmptyCellProgress({ stringIndex: 0, fret: 5 }, "2026-06-13T16:00:00.000Z");
    const recallCell = createDropStatsCellViewModel([untouched], 0, 5, "recall-speed");
    const accuracyCell = createDropStatsCellViewModel([], 0, 5, "accuracy");

    expect(recallCell.metricValue).toBeNull();
    expect(getDropStatsColumnHeight("recall-speed", recallCell)).toBe(DROP_STATS_3D_COLUMN_HEIGHT_PX.unscored);
    expect(getDropStatsCellVisual("recall-speed", recallCell).backgroundColor).toBe("#182131");
    expect(accuracyCell.metricValue).toBeNull();
    expect(getDropStatsColumnHeight("accuracy", accuracyCell)).toBe(DROP_STATS_3D_COLUMN_HEIGHT_PX.unscored);
    expect(getDropStatsCellVisual("accuracy", accuracyCell).categoryLabel).toBe("No results");
  });

  it("uses Attempts as exposure height rather than Fluency performance categories", () => {
    const attempted = createDropStatsCellViewModel([correctCell({ stringIndex: 0, fret: 5, count: 5 })], 0, 5, "attempts");

    expect(attempted.metricValue).toBe(5);
    expect(getDropStatsColumnHeight("attempts", attempted)).toBeGreaterThan(DROP_STATS_3D_COLUMN_HEIGHT_PX.scoredMin);
    expect(getDropStatsCellVisual("attempts", attempted).backgroundColor).toMatch(/^rgba\(103,232,249,/);
    expect(getDropStatsCellVisual("attempts", attempted).backgroundColor).not.toBe("#43A879");
  });

  it("clamps 3D Explore rotation to a readable non-inverted angle", () => {
    expect(clampDropStats3DRotation({ pitch: -120, yaw: -200 })).toEqual({ pitch: 12, yaw: -42 });
    expect(clampDropStats3DRotation({ pitch: 120, yaw: 200 })).toEqual({ pitch: 78, yaw: 34 });
    expect(clampDropStats3DRotation(DROP_STATS_3D_CANONICAL_ROTATION)).toEqual(DROP_STATS_3D_CANONICAL_ROTATION);
  });

  it("defines useful 3D view presets inside the broader safe pitch range", () => {
    expect(Object.keys(DROP_STATS_3D_VIEW_PRESETS)).toEqual(["top", "angle", "profile"]);
    expect(DROP_STATS_3D_VIEW_PRESETS.angle.rotation).toEqual(DROP_STATS_3D_CANONICAL_ROTATION);
    expect(DROP_STATS_3D_VIEW_PRESETS.top.rotation.pitch).toBeLessThan(DROP_STATS_3D_VIEW_PRESETS.angle.rotation.pitch);
    expect(DROP_STATS_3D_VIEW_PRESETS.profile.rotation.pitch).toBeGreaterThan(DROP_STATS_3D_VIEW_PRESETS.angle.rotation.pitch);
    for (const preset of Object.values(DROP_STATS_3D_VIEW_PRESETS)) {
      expect(preset.rotation.pitch).toBeGreaterThanOrEqual(DROP_STATS_3D_ROTATION_LIMITS.minPitch);
      expect(preset.rotation.pitch).toBeLessThanOrEqual(DROP_STATS_3D_ROTATION_LIMITS.maxPitch);
      expect(preset.rotation.yaw).toBeGreaterThanOrEqual(DROP_STATS_3D_ROTATION_LIMITS.minYaw);
      expect(preset.rotation.yaw).toBeLessThanOrEqual(DROP_STATS_3D_ROTATION_LIMITS.maxYaw);
    }
  });

  it("uses explicit 3D string gauges from high E through low E", () => {
    expect(DROP_STATS_3D_STRING_THICKNESS_PX).toEqual([1, 1.2, 1.5, 1.9, 2.4, 3]);
    for (let index = 1; index < DROP_STATS_3D_STRING_THICKNESS_PX.length; index += 1) {
      expect(DROP_STATS_3D_STRING_THICKNESS_PX[index]!).toBeGreaterThan(DROP_STATS_3D_STRING_THICKNESS_PX[index - 1]!);
    }
    expect(getDropStats3DStringThickness(0)).toBe(1);
    expect(getDropStats3DStringThickness(5)).toBe(3);
  });

  it("uses restrained 3D inlays only at frets 3, 5, 7, and 9", () => {
    expect(DROP_STATS_3D_INLAY_FRETS).toEqual([3, 5, 7, 9]);
  });

  it("keeps 3D woodgrain and pearl textures behind local material hooks", () => {
    const css = readIndexCss();
    const fretboardSurfaceBlock = css.match(/\.drop-stats-3d-fretboard-surface \{[\s\S]*?\n\}/)?.[0] ?? "";
    const openZoneBlock = css.match(/\.drop-stats-3d-open-zone \{[\s\S]*?\n\}/)?.[0] ?? "";
    const inlayBlock = css.match(/\.drop-stats-3d-fret-inlay \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(fretboardSurfaceBlock).toContain("--drop-stats-3d-wood-image");
    expect(fretboardSurfaceBlock).toContain("/assets/fretboard/fretboard-woodgrain-1024x256.webp");
    expect(openZoneBlock).toContain("--drop-stats-3d-open-zone-base");
    expect(openZoneBlock).not.toContain("fretboard-woodgrain-1024x256.webp");
    expect(openZoneBlock).not.toContain("--drop-stats-3d-wood-image");
    expect(inlayBlock).toContain("--drop-stats-3d-inlay-image");
    expect(inlayBlock).toContain("/assets/fretboard/mother-of-pearl-inlay.webp");
    expect(`${fretboardSurfaceBlock}\n${openZoneBlock}\n${inlayBlock}`).not.toMatch(/https?:\/\//);
  });

  it("clamps 3D Explore zoom to the readable view range", () => {
    expect(DROP_STATS_3D_CANONICAL_ZOOM).toBe(0.9);
    expect(clampDropStats3DZoom(-1)).toBe(DROP_STATS_3D_ZOOM_LIMITS.min);
    expect(clampDropStats3DZoom(99)).toBe(DROP_STATS_3D_ZOOM_LIMITS.max);
    expect(clampDropStats3DZoom(0.999)).toBe(1);
  });

  it("subdues cells outside note and string filters without removing fretboard orientation", () => {
    const viewModel = createDropStatsFretboardViewModel([], "fluency", {
      selectedNotes: ["A"],
      selectedStrings: [0],
    });
    const highEA = viewModel.strings[0].cells[5];
    const highEF = viewModel.strings[0].cells[1];
    const bStringA = viewModel.strings[1].cells[10];

    expect(highEA.note).toBe("A");
    expect(highEA.isFilteredIn).toBe(true);
    expect(highEF.isFilteredIn).toBe(false);
    expect(bStringA.note).toBe("A");
    expect(bStringA.isFilteredIn).toBe(false);
    expect(viewModel.strings).toHaveLength(6);
  });

  it("keeps filter toggles from creating zero-note or zero-string filters", () => {
    expect(toggleDropStatsNoteFilter(["A"], "A")).toEqual(["A"]);
    expect(toggleDropStatsNoteFilter(["C", "D", "E", "F", "G", "A", "B"], "G")).toEqual(["G"]);
    expect(toggleDropStatsStringFilter([0], 0)).toEqual([0]);
    expect(toggleDropStatsStringFilter([0, 1, 2, 3, 4, 5], 3)).toEqual([3]);
  });

  it("formats detail values without counting wrong taps as accuracy", () => {
    let record = correctCell({ count: 2, hitProgress: 0.24 });
    record = recordMissResolution(record);
    record = recordWrongFretTap(recordWrongFretTap(record, 4), 1);

    expect(getAccuracyDetailLabel(record)).toBe("67% (2/3)");
    expect(getRecallSpeedDetailLabel(record)).toBe("Very early (24% down)");
    expect(record.adjacentWrongTaps).toBe(1);
    expect(record.otherWrongTaps).toBe(1);
  });

  it("builds concise summaries from sufficiently tested cells only", () => {
    const strong = correctCell({ stringIndex: 0, fret: 5, count: 8, hitProgress: 0.18 });
    let weaker = correctCell({ stringIndex: 1, fret: 1, count: 3, hitProgress: 0.7 });
    weaker = recordMissResolution(recordMissResolution(weaker));
    const insufficient = correctCell({ stringIndex: 2, fret: 2, count: 1, hitProgress: 0.9 });
    const viewModel = createDropStatsFretboardViewModel([strong, weaker, insufficient]);
    const needsAttention = viewModel.summaries.find((summary) => summary.id === "needs-attention");
    const leastPracticed = viewModel.summaries.find((summary) => summary.id === "least-practiced");

    expect(viewModel.summaries).toHaveLength(3);
    expect(needsAttention?.value).toContain("B");
    expect(needsAttention?.value).not.toContain("G");
    expect(leastPracticed?.description).toContain("resolved attempt");
    expect(leastPracticed?.description).not.toMatch(/weak/i);
  });

  it("uses safe summary fallback copy when no cells have enough evidence", () => {
    const viewModel = createDropStatsFretboardViewModel([correctCell({ count: 1 })]);

    expect(viewModel.summaries.find((summary) => summary.id === "strongest")?.value).toBe("Not enough data yet");
    expect(viewModel.summaries.find((summary) => summary.id === "needs-attention")?.description).toBe("Keep playing to build a clearer map");
  });

  it("keeps every metric available after filters are applied", () => {
    for (const metric of DROP_STATS_METRICS) {
      expect(createDropStatsFretboardViewModel([], metric, { selectedNotes: ["C"], selectedStrings: [0] }).metric).toBe(metric);
    }
  });

  it("builds Focus Practice from Needs work and Developing cells by default", () => {
    const needsWork = weakCell(0, 1);
    let developing = correctCell({ stringIndex: 0, fret: 3, count: 3, hitProgress: 0.85 });
    developing = { ...developing, recentResolutions: [
      { occurredAt: "2026-06-13T16:00:00.000Z", outcome: "correct", hitProgress: 0.85 },
      { occurredAt: "2026-06-13T16:01:00.000Z", outcome: "correct", hitProgress: 0.85 },
      { occurredAt: "2026-06-13T16:02:00.000Z", outcome: "miss" },
    ], misses: 1, correctHits: 2 };
    const strong = correctCell({ stringIndex: 0, fret: 5, count: 8, hitProgress: 0.18 });
    const insufficient = progressRecord({ stringIndex: 0, fret: 8, resolvedTargets: 2, correctHits: 0, misses: 2 });

    const pool = buildFocusPracticePool({
      records: [strong, insufficient, developing, needsWork],
      selectedNotes: ["C", "D", "E", "F", "G", "A", "B"],
      selectedStrings: [0, 1, 2, 3, 4, 5],
      threshold: "developing",
      minResolvedAttempts: 3,
      poolSize: 10,
    });

    expect(pool.map((cell) => cell.cellId)).toEqual([needsWork.cellId, developing.cellId]);
  });

  it("honors Focus Practice threshold options", () => {
    const needsWork = weakCell(0, 1);
    const broaderThresholdCell = progressRecord({
      stringIndex: 0,
      fret: 5,
      resolvedTargets: 3,
      correctHits: 2,
      misses: 1,
      hitProgressSum: 1.7,
      hitProgressCount: 2,
      recentResolutions: [
        { occurredAt: "2026-06-13T16:00:00.000Z", outcome: "correct", hitProgress: 0.85 },
        { occurredAt: "2026-06-13T16:01:00.000Z", outcome: "miss" },
        { occurredAt: "2026-06-13T16:02:00.000Z", outcome: "correct", hitProgress: 0.85 },
      ],
    });

    expect(buildFocusPracticePool({
      records: [needsWork, broaderThresholdCell],
      selectedNotes: ["C", "D", "E", "F", "G", "A", "B"],
      selectedStrings: [0],
      threshold: "needs-work",
      minResolvedAttempts: 3,
      poolSize: 10,
    }).map((cell) => cell.cellId)).toEqual([needsWork.cellId]);

    expect(buildFocusPracticePool({
      records: [needsWork, broaderThresholdCell],
      selectedNotes: ["C", "D", "E", "F", "G", "A", "B"],
      selectedStrings: [0],
      threshold: "below-strong",
      minResolvedAttempts: 3,
      poolSize: 10,
    }).map((cell) => cell.cellId)).toContain(broaderThresholdCell.cellId);
  });

  it("honors Focus Practice attempts, note, string, and pool-size filters", () => {
    const highEF = weakCell(0, 1, { resolvedTargets: 3 });
    const highEA = weakCell(0, 5, { resolvedTargets: 10 });
    const bStringC = weakCell(1, 1, { resolvedTargets: 10 });

    const pool = buildFocusPracticePool({
      records: [highEF, highEA, bStringC],
      selectedNotes: ["A", "C"],
      selectedStrings: [0],
      threshold: "developing",
      minResolvedAttempts: 5,
      poolSize: 1,
    });

    expect(pool).toHaveLength(1);
    expect(pool[0].cellId).toBe(highEA.cellId);
  });

  it("uses all eligible Focus Practice cells when fewer than the requested pool size match", () => {
    const cells = [weakCell(0, 1), weakCell(0, 3)];
    const pool = buildFocusPracticePool({
      records: cells,
      selectedNotes: ["C", "D", "E", "F", "G", "A", "B"],
      selectedStrings: [0],
      threshold: "developing",
      minResolvedAttempts: 3,
      poolSize: 10,
    });

    expect(pool).toHaveLength(2);
  });

  it("breaks Focus Practice ties by canonical string and fret order without duplicates", () => {
    const duplicate = weakCell(0, 1, { misses: 4, resolvedTargets: 4 });
    const pool = buildFocusPracticePool({
      records: [weakCell(1, 1), weakCell(0, 3), duplicate, weakCell(0, 1)],
      selectedNotes: ["C", "D", "E", "F", "G", "A", "B"],
      selectedStrings: [0, 1],
      threshold: "developing",
      minResolvedAttempts: 3,
      poolSize: 10,
    });

    expect(pool.map((cell) => cell.cellId)).toEqual(["standard:0:1", "standard:0:3", "standard:1:1"]);
  });
});
