import { describe, expect, it, vi } from "vitest";
import { getNoteAtFret } from "@/lib/fretboard";
import {
  ALL_DROP_STRING_INDEXES,
  CURRENT_DROP_NOTE_POOL,
  DEFAULT_DROP_PRACTICE_CONTEXT,
  DROP_COMPACT_LANDSCAPE_TARGET_HEIGHT_PX,
  DROP_HIT_LINE_TOP_PERCENT,
  DROP_MAX_FRET,
  DROP_TARGET_MAX_DURATION_MS,
  DROP_TARGET_HEIGHT_PX,
  DROP_TARGET_MIN_DURATION_MS,
  DROP_SPEED_MODE_CONFIGS,
  DROP_SPEED_MODE_STORAGE_KEY,
  DROP_RUN_FORMAT_STORAGE_KEY,
  NATURAL_DROP_NOTES,
  calculateAccuracy,
  createPracticeNoteKey,
  formatPracticeNoteLabel,
  getCorrectFeedback,
  getDropDurationMs,
  getMissFeedback,
  getPacingTierSpeedUpMs,
  getPacingTierUpMessage,
  getPostRunSuggestion,
  getPracticeLabel,
  getDropSpeedModeConfig,
  getStringAccent,
  getStringFocusLabel,
  getStringSelectionKey,
  getStringSelectionLabel,
  getStringVisualState,
  getActiveFallingTarget,
  getPlayableFallingTarget,
  getPromptTimeRemaining,
  getTargetTopStyle,
  getWrongFeedback,
  pickPromptStagePosition,
  sortFallingTargetsByProgress,
  spawnStreamTarget,
  shouldSpawnStreamTarget,
  DROP_TARGET_STREAM_SPAWN_INTERVAL_MS,
  DROP_TARGET_STREAM_MAX_ON_SCREEN,
  isNoteInCurrentPool,
  isMatchingFret,
  makeDropTarget,
  makeFocusDropTarget,
  normalizePracticeContext,
  readBestDropScore,
  readDropSpeedMode,
  readDropRunFormat,
  writeDropRunFormat,
  writeBestDropScore,
  writeDropSpeedMode,
} from "./dropGameUtils";

describe("Fretboard Drop utilities", () => {
  it("defaults run format safely and persists a valid selection", () => {
    expect(readDropRunFormat()).toBe("timed");
    window.localStorage.setItem(DROP_RUN_FORMAT_STORAGE_KEY, "invalid");
    expect(readDropRunFormat()).toBe("timed");
    writeDropRunFormat("survival");
    expect(readDropRunFormat()).toBe("survival");
    window.localStorage.clear();
  });

  it("keeps Survival best scores separate and treats legacy values as Timed Trial", () => {
    window.localStorage.setItem("guitarrise:fretboard-drop:best-score:v1", "11");
    expect(readBestDropScore([0], DEFAULT_DROP_PRACTICE_CONTEXT, undefined, "timed")).toBe(11);
    expect(readBestDropScore([0], DEFAULT_DROP_PRACTICE_CONTEXT, undefined, "survival")).toBe(0);
    writeBestDropScore(7, [0], DEFAULT_DROP_PRACTICE_CONTEXT, "practice-tempo", "survival");
    expect(readBestDropScore([0], DEFAULT_DROP_PRACTICE_CONTEXT, "practice-tempo", "survival")).toBe(7);
    expect(readBestDropScore([0], DEFAULT_DROP_PRACTICE_CONTEXT, "practice-tempo", "timed")).toBe(11);
    window.localStorage.clear();
  });

  it("uses the current note pool for generated targets", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const target = makeDropTarget(1, 0, 0);
    expect(CURRENT_DROP_NOTE_POOL.id).toBe("naturals");
    expect(NATURAL_DROP_NOTES).toContain(target.note);
    expect(isNoteInCurrentPool(target.note)).toBe(true);
    expect(getNoteAtFret(target.stringIndex, target.fret)).toBe(target.note);
    expect(target.targetKey).toBe(`standard:${target.stringIndex}:${target.fret}`);
    expect(target.stringId).toBe(`standard:${target.stringIndex}`);
    vi.restoreAllMocks();
  });

  it("keeps accidentals out of the current note pool", () => {
    expect(isNoteInCurrentPool("F#")).toBe(false);
    expect(isNoteInCurrentPool("C#")).toBe(false);
    expect(isNoteInCurrentPool("E")).toBe(true);
  });

  it("matches only the target string and fret", () => {
    const target = makeDropTarget(1, 0, 0);
    expect(isMatchingFret(target.stringIndex, target.fret, target)).toBe(true);
    expect(isMatchingFret((target.stringIndex + 1) % 6, target.fret, target)).toBe(false);
  });

  it("positions completed targets with their bottom edge on the hit line", () => {
    expect(DROP_COMPACT_LANDSCAPE_TARGET_HEIGHT_PX).toBe(66);
    expect(getTargetTopStyle(1)).toBe(`calc(${DROP_HIT_LINE_TOP_PERCENT}% - ${DROP_TARGET_HEIGHT_PX}px)`);
    expect(getTargetTopStyle(1, DROP_COMPACT_LANDSCAPE_TARGET_HEIGHT_PX)).toBe(
      `calc(${DROP_HIT_LINE_TOP_PERCENT}% - ${DROP_COMPACT_LANDSCAPE_TARGET_HEIGHT_PX}px)`,
    );
  });

  it("limits generated targets to selected practice strings", () => {
    for (const stringIndex of [0, 1, 2, 3, 4, 5] as const) {
      for (let index = 0; index < 20; index += 1) {
        const target = makeDropTarget(index, 0, 0, undefined, [stringIndex]);
        expect(target.stringIndex).toBe(stringIndex);
        expect(target.fret).toBeLessThanOrEqual(DROP_MAX_FRET);
      }
    }
    expect(getStringFocusLabel(0)).toBe("high E");
    expect(getStringSelectionLabel([0, 1])).toBe("high E + B");
  });

  it("generates only the focused note across selected strings", () => {
    for (let index = 0; index < 20; index += 1) {
      const target = makeDropTarget(index, 0, 0, undefined, [0, 1], { practiceType: "note-focus", selectedNotes: ["A"] });

      expect(target.note).toBe("A");
      expect([0, 1]).toContain(target.stringIndex);
      expect(getNoteAtFret(target.stringIndex, target.fret)).toBe("A");
    }
  });

  it("generates only the selected note set across selected strings", () => {
    for (let index = 0; index < 40; index += 1) {
      const target = makeDropTarget(index, 0, 0, undefined, [0], { practiceType: "note-focus", selectedNotes: ["C", "D"] });

      expect(["C", "D"]).toContain(target.note);
      expect(target.stringIndex).toBe(0);
      expect(getNoteAtFret(target.stringIndex, target.fret)).toBe(target.note);
    }
  });

  it("generates Focus Practice targets only from the selected physical-cell pool", () => {
    const pool = [
      { cellId: "standard:0:5" as const, note: "A" as const, stringIndex: 0 as const, fret: 5, fluencyScore: 220 },
      { cellId: "standard:1:1" as const, note: "C" as const, stringIndex: 1 as const, fret: 1, fluencyScore: 340 },
    ];

    for (let seed = 1; seed <= 6; seed += 1) {
      const target = makeFocusDropTarget(seed, 0, 0, pool);
      expect(pool.some((cell) => cell.stringIndex === target.stringIndex && cell.fret === target.fret && cell.note === target.note)).toBe(true);
      expect(target.targetKey).toBe(`standard:${target.stringIndex}:${target.fret}`);
    }
  });

  it("avoids immediate Focus Practice physical-cell repeats when the pool has alternatives", () => {
    const pool = [
      { cellId: "standard:0:5" as const, note: "A" as const, stringIndex: 0 as const, fret: 5, fluencyScore: 220 },
      { cellId: "standard:1:1" as const, note: "C" as const, stringIndex: 1 as const, fret: 1, fluencyScore: 340 },
    ];
    const previous = makeFocusDropTarget(1, 0, 0, pool);
    const next = makeFocusDropTarget(2, 0, 0, pool, `standard:${previous.stringIndex}:${previous.fret}`);

    expect(`standard:${next.stringIndex}:${next.fret}`).not.toBe(`standard:${previous.stringIndex}:${previous.fret}`);
  });

  it("allows multi-string and all-string target generation", () => {
    for (let index = 0; index < 20; index += 1) {
      expect([1, 3]).toContain(makeDropTarget(index, 0, 0, undefined, [1, 3]).stringIndex);
    }

    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    expect(makeDropTarget(1, 0, 0, undefined, ALL_DROP_STRING_INDEXES).stringIndex).toBeGreaterThan(0);
    expect(getStringSelectionLabel(ALL_DROP_STRING_INDEXES)).toBe("All");
    vi.restoreAllMocks();
  });

  it("uses frets 0-11 and excludes fret 12", () => {
    expect(DROP_MAX_FRET).toBe(11);
    for (let index = 0; index < 80; index += 1) {
      expect(makeDropTarget(index, 0, 0, undefined, ALL_DROP_STRING_INDEXES).fret).toBeLessThanOrEqual(11);
    }
  });

  it("assigns deterministic string accents", () => {
    const accents = ALL_DROP_STRING_INDEXES.map(getStringAccent);

    expect(accents.map((accent) => accent.value)).toEqual([...ALL_DROP_STRING_INDEXES]);
    expect(getStringAccent(0)).toEqual(getStringAccent(0));
    expect(new Set(accents.map((accent) => accent.color)).size).toBe(ALL_DROP_STRING_INDEXES.length);
  });

  it("derives string visual states from selected strings and visible targets", () => {
    expect(getStringVisualState(2, [0, 1], [])).toBe("unselected");
    expect(getStringVisualState(1, [0, 1], [])).toBe("selected-inactive");
    expect(getStringVisualState(1, [0, 1], [{ id: 12, stringIndex: 1, role: "active-target" }])).toBe("active-target");
  });

  it("creates stable selected-string best score keys", () => {
    expect(getStringSelectionKey([0])).toBe("0");
    expect(getStringSelectionKey([1, 0])).toBe("0-1");
    expect(getStringSelectionKey(ALL_DROP_STRING_INDEXES)).toBe("all");
    expect(getStringSelectionKey([])).toBe("0");
    expect(createPracticeNoteKey()).toBe("all-naturals");
    expect(createPracticeNoteKey({ practiceType: "note-focus", selectedNotes: ["A"] })).toBe("notes-A");
    expect(createPracticeNoteKey({ practiceType: "note-focus", selectedNotes: ["D", "C"] })).toBe("notes-C-D");
    expect(createPracticeNoteKey({ practiceType: "note-focus", selectedNotes: ["C", "D"] })).toBe("notes-C-D");
    expect(createPracticeNoteKey({ practiceType: "note-focus", selectedNotes: ["A", "E"] })).toBe("notes-E-A");
    expect(formatPracticeNoteLabel()).toBe("all notes");
    expect(formatPracticeNoteLabel({ practiceType: "note-focus", selectedNotes: ["A"] })).toBe("A only");
    expect(formatPracticeNoteLabel({ practiceType: "note-focus", selectedNotes: ["G", "C", "E"] })).toBe("C,E,G");
    expect(getPracticeLabel([0], DEFAULT_DROP_PRACTICE_CONTEXT)).toBe("high E · all notes");
    expect(getPracticeLabel(ALL_DROP_STRING_INDEXES, { practiceType: "note-focus", selectedNotes: ["G", "C", "E"] })).toBe("All · C,E,G");
    expect(getPracticeLabel([0, 1], { practiceType: "note-focus", selectedNotes: ["A"] })).toBe("high E + B · A only");
    expect(normalizePracticeContext({ practiceType: "note-focus", selectedNotes: [] })).toEqual(DEFAULT_DROP_PRACTICE_CONTEXT);
    expect(normalizePracticeContext({ practiceType: "note-focus", selectedNotes: [...NATURAL_DROP_NOTES] })).toEqual(DEFAULT_DROP_PRACTICE_CONTEXT);
  });

  it("stores best scores by selected string combination", () => {
    writeBestDropScore(12, [0]);
    writeBestDropScore(5, [0, 1]);

    expect(readBestDropScore([0])).toBe(12);
    expect(readBestDropScore([1, 0])).toBe(5);
    expect(readBestDropScore([2])).toBe(0);
  });

  it("stores note-focus best scores separately from all-natural practice", () => {
    writeBestDropScore(12, [0]);
    writeBestDropScore(4, [0], { practiceType: "note-focus", selectedNotes: ["A"] });
    writeBestDropScore(8, [0], { practiceType: "note-focus", selectedNotes: ["C", "D"] });
    writeBestDropScore(6, [0, 1], { practiceType: "note-focus", selectedNotes: ["A"] });

    expect(readBestDropScore([0])).toBe(12);
    expect(readBestDropScore([0], { practiceType: "note-focus", selectedNotes: ["A"] })).toBe(4);
    expect(readBestDropScore([0], { practiceType: "note-focus", selectedNotes: ["D", "C"] })).toBe(8);
    expect(readBestDropScore([0, 1], { practiceType: "note-focus", selectedNotes: ["A"] })).toBe(6);
    expect(readBestDropScore([0], { practiceType: "note-focus", selectedNotes: ["B"] })).toBe(0);
  });

  it("uses the old global best only as a high E fallback", () => {
    window.localStorage.setItem("guitarrise:fretboard-drop:best-score:v1", "9");

    expect(readBestDropScore([0])).toBe(9);
    expect(readBestDropScore([0, 1])).toBe(0);
  });

  it("suggests running back a new selected-string best", () => {
    expect(getPostRunSuggestion({
      score: 12,
      bestScore: 12,
      accuracy: 90,
      misses: 0,
      bestStreak: 8,
      isNewPersonalBest: true,
      selectionLabel: "high E + B",
    })).toBe("New high E + B best. Run it back while it's fresh.");
  });

  it("suggests replaying when close to the selected-string best", () => {
    expect(getPostRunSuggestion({
      score: 18,
      bestScore: 20,
      accuracy: 88,
      misses: 1,
      bestStreak: 6,
      isNewPersonalBest: false,
      selectionLabel: "All",
    })).toBe("You were 2 away from your All best.");
  });

  it("suggests one more run after tying the selected-string best", () => {
    expect(getPostRunSuggestion({
      score: 10,
      bestScore: 10,
      accuracy: 82,
      misses: 1,
      bestStreak: 5,
      isNewPersonalBest: false,
      selectionLabel: "high E",
    })).toBe("You matched your high E best. One more can beat it.");
  });

  it("suggests a cleaner run for low accuracy", () => {
    expect(getPostRunSuggestion({
      score: 4,
      bestScore: 20,
      accuracy: 52,
      misses: 1,
      bestStreak: 2,
      isNewPersonalBest: false,
      selectionLabel: "high E",
    })).toBe("Aim for a cleaner run on these strings.");
  });

  it("keeps target timing inside fair bounds", () => {
    expect(DROP_TARGET_MIN_DURATION_MS).toBe(2100);
    for (let score = 0; score <= 100; score += 10) {
      for (let seed = 0; seed < 20; seed += 1) {
        expect(getDropDurationMs(score, { combo: seed % 12, elapsedMs: 30_000, seed })).toBeGreaterThanOrEqual(DROP_TARGET_MIN_DURATION_MS);
        expect(getDropDurationMs(score, { combo: seed % 12, elapsedMs: 30_000, seed })).toBeLessThanOrEqual(DROP_TARGET_MAX_DURATION_MS);
        expect(getDropDurationMs(score, {
          combo: seed % 12,
          elapsedMs: 30_000,
          recentHitProgresses: [0.18, 0.22, 0.25, 0.3, 0.34],
          seed,
        })).toBeGreaterThanOrEqual(DROP_TARGET_MIN_DURATION_MS);
        expect(getDropDurationMs(score, {
          combo: seed % 12,
          elapsedMs: 30_000,
          recentHitProgresses: [0.84, 0.88, 0.9, 0.92, 0.95],
          seed,
        })).toBeLessThanOrEqual(DROP_TARGET_MAX_DURATION_MS);
      }
    }
  });

  it("centralizes the Fretboard Drop speed-mode timing windows", () => {
    expect(DROP_SPEED_MODE_CONFIGS.map((config) => [config.id, config.targetDurationMs])).toEqual([
      ["warm-up", 7000],
      ["practice-tempo", 4000],
      ["performance-tempo", 2500],
    ]);
    expect(getDropSpeedModeConfig("warm-up").label).toBe("Warm-Up");
    expect(getDropDurationMs(0, { elapsedMs: 20_000, seed: 4, speedMode: "warm-up" })).toBeGreaterThan(
      getDropDurationMs(0, { elapsedMs: 20_000, seed: 4, speedMode: "practice-tempo" }),
    );
    expect(getDropDurationMs(0, { elapsedMs: 20_000, seed: 4, speedMode: "practice-tempo" })).toBeGreaterThan(
      getDropDurationMs(0, { elapsedMs: 20_000, seed: 4, speedMode: "performance-tempo" }),
    );
  });

  it("persists speed mode and defaults returning legacy users to Practice Tempo", () => {
    window.localStorage.clear();
    expect(readDropSpeedMode()).toBe("warm-up");

    writeDropSpeedMode("performance-tempo");
    expect(window.localStorage.getItem(DROP_SPEED_MODE_STORAGE_KEY)).toBe("performance-tempo");
    expect(readDropSpeedMode()).toBe("performance-tempo");

    window.localStorage.clear();
    writeBestDropScore(9, [0]);
    expect(readDropSpeedMode()).toBe("practice-tempo");
  });

  it("stores best scores separately by speed mode while preserving legacy Practice Tempo fallback", () => {
    window.localStorage.clear();
    writeBestDropScore(12, [0]);

    expect(readBestDropScore([0], DEFAULT_DROP_PRACTICE_CONTEXT, "practice-tempo")).toBe(12);
    expect(readBestDropScore([0], DEFAULT_DROP_PRACTICE_CONTEXT, "warm-up")).toBe(0);

    writeBestDropScore(5, [0], DEFAULT_DROP_PRACTICE_CONTEXT, "warm-up");
    writeBestDropScore(8, [0], DEFAULT_DROP_PRACTICE_CONTEXT, "performance-tempo");

    expect(readBestDropScore([0], DEFAULT_DROP_PRACTICE_CONTEXT, "warm-up")).toBe(5);
    expect(readBestDropScore([0], DEFAULT_DROP_PRACTICE_CONTEXT, "performance-tempo")).toBe(8);
    expect(readBestDropScore([0], DEFAULT_DROP_PRACTICE_CONTEXT, "practice-tempo")).toBe(12);
  });

  it("uses clear combo-based pacing tiers", () => {
    const combo0Target = getDropDurationMs(20, { combo: 0, elapsedMs: 30_000, seed: 4 });
    const combo5Target = getDropDurationMs(20, { combo: 5, elapsedMs: 30_000, seed: 4 });
    const combo10Target = getDropDurationMs(20, { combo: 10, elapsedMs: 30_000, seed: 4 });
    const combo15Target = getDropDurationMs(20, { combo: 15, elapsedMs: 30_000, seed: 4 });

    expect(combo5Target).toBeLessThan(combo0Target);
    expect(combo10Target).toBeLessThan(combo5Target);
    expect(combo15Target).toBeLessThan(combo10Target);
    expect(getPacingTierSpeedUpMs(4)).toBe(0);
    expect(getPacingTierSpeedUpMs(5)).toBe(650);
    expect(getPacingTierSpeedUpMs(10)).toBe(1250);
    expect(getPacingTierSpeedUpMs(15)).toBe(2300);
  });

  it("reports tier-up messages only on threshold crossings", () => {
    expect(getPacingTierUpMessage(4)).toBeNull();
    expect(getPacingTierUpMessage(5)).toBe("Let's speed up!");
    expect(getPacingTierUpMessage(6)).toBeNull();
    expect(getPacingTierUpMessage(10)).toBe("Faster now!");
    expect(getPacingTierUpMessage(15)).toBe("Max pace!");
    expect(getPacingTierUpMessage(16)).toBeNull();
  });

  it("uses a gentle deterministic pacing ramp", () => {
    const openingTarget = getDropDurationMs(0, { elapsedMs: 0, seed: 4 });
    const settledTarget = getDropDurationMs(0, { elapsedMs: 20_000, seed: 4 });
    const rampedTarget = getDropDurationMs(18, { combo: 8, elapsedMs: 30_000, seed: 4 });
    const firstSeed = getDropDurationMs(6, { elapsedMs: 20_000, seed: 1 });
    const sameSeed = getDropDurationMs(6, { elapsedMs: 20_000, seed: 1 });
    const nextSeed = getDropDurationMs(6, { elapsedMs: 20_000, seed: 2 });

    expect(openingTarget).toBeGreaterThan(settledTarget);
    expect(rampedTarget).toBeLessThan(settledTarget);
    expect(firstSeed).toBe(sameSeed);
    expect(Math.abs(firstSeed - nextSeed)).toBeLessThanOrEqual(360);
  });

  it("gives the next target a small breather after a miss", () => {
    const normalTarget = getDropDurationMs(10, { elapsedMs: 20_000, seed: 7 });
    const recoveryTarget = getDropDurationMs(10, { afterMiss: true, elapsedMs: 20_000, seed: 7 });

    expect(recoveryTarget).toBeGreaterThan(normalTarget);
  });

  it("slightly increases challenge after consistently early correct hits", () => {
    const neutralTarget = getDropDurationMs(8, { elapsedMs: 24_000, seed: 4 });
    const earlyHitTarget = getDropDurationMs(8, {
      elapsedMs: 24_000,
      recentHitProgresses: [0.18, 0.22, 0.25, 0.28, 0.32],
      seed: 4,
    });

    expect(earlyHitTarget).toBeLessThan(neutralTarget);
    expect(neutralTarget - earlyHitTarget).toBeGreaterThanOrEqual(300);
    expect(neutralTarget - earlyHitTarget).toBeLessThanOrEqual(700);
  });

  it("does not spike speed after only one or two early hits", () => {
    const neutralTarget = getDropDurationMs(8, { elapsedMs: 24_000, seed: 4 });
    const oneEarlyHitTarget = getDropDurationMs(8, {
      elapsedMs: 24_000,
      recentHitProgresses: [0.18],
      seed: 4,
    });
    const twoEarlyHitsTarget = getDropDurationMs(8, {
      elapsedMs: 24_000,
      recentHitProgresses: [0.18, 0.22],
      seed: 4,
    });

    expect(oneEarlyHitTarget).toBe(neutralTarget);
    expect(twoEarlyHitsTarget).toBe(neutralTarget);
  });

  it("lets strong sustained play reach the lowered duration floor", () => {
    const fastTarget = getDropDurationMs(80, {
      combo: 18,
      elapsedMs: 50_000,
      recentHitProgresses: [0.15, 0.18, 0.2, 0.22, 0.24, 0.26],
      seed: 4,
    });

    expect(fastTarget).toBe(DROP_TARGET_MIN_DURATION_MS);
  });

  it("does not add speed-up after consistently late correct hits", () => {
    const neutralTarget = getDropDurationMs(8, { elapsedMs: 24_000, seed: 4 });
    const lateHitTarget = getDropDurationMs(8, {
      elapsedMs: 24_000,
      recentHitProgresses: [0.82, 0.86, 0.88, 0.91, 0.94],
      seed: 4,
    });

    expect(lateHitTarget).toBeGreaterThanOrEqual(neutralTarget);
  });

  it("keeps miss recovery meaningful with adaptive timing", () => {
    const earlyHitTarget = getDropDurationMs(12, {
      elapsedMs: 30_000,
      recentHitProgresses: [0.18, 0.22, 0.25, 0.28, 0.32],
      seed: 9,
    });
    const recoveryTarget = getDropDurationMs(12, {
      afterMiss: true,
      elapsedMs: 30_000,
      recentHitProgresses: [0.18, 0.22, 0.25, 0.28, 0.32],
      seed: 9,
    });

    expect(recoveryTarget).toBeGreaterThan(earlyHitTarget);
  });

  it("calculates run accuracy from correct, wrong, and missed attempts", () => {
    expect(calculateAccuracy(8, 1, 1)).toBe(80);
    expect(calculateAccuracy(0, 0, 0)).toBe(0);
  });

  it("maps prompt progress to a draining time bar", () => {
    expect(getPromptTimeRemaining(0)).toBe(1);
    expect(getPromptTimeRemaining(0.5)).toBe(0.5);
    expect(getPromptTimeRemaining(1)).toBe(0);
  });

  it("keeps legacy fall positioning helpers for future modes", () => {
    expect(getTargetTopStyle(0)).toBe("calc(5% - 0px)");
    expect(getTargetTopStyle(1)).toBe("calc(85% - 96px)");
  });

  it("varies feedback by event and combo tier", () => {
    expect(getCorrectFeedback(1)).toBe("Nice");
    expect(getCorrectFeedback(3)).toBe("Keep going");
    expect(getCorrectFeedback(6)).toBe("Smooth");
    expect(getCorrectFeedback(10)).toBe("On fire");
    expect(getWrongFeedback(2)).toBe("Try another fret");
    expect(getMissFeedback(1)).toBe("Next pick");
  });

  it("assigns prompt positions, picks the most urgent target as active, and streams on an interval", () => {
    const first = makeDropTarget(1, 0, 0, undefined, [0], DEFAULT_DROP_PRACTICE_CONTEXT);
    expect(first.stageXPercent).toBeGreaterThan(0);
    expect(first.stageYPercent).toBeGreaterThan(0);

    const spawned = spawnStreamTarget({
      fallingTargets: [first],
      targetSeed: 2,
      nextStreamSpawnAt: DROP_TARGET_STREAM_SPAWN_INTERVAL_MS,
      lastStreamNote: first.note,
      now: DROP_TARGET_STREAM_SPAWN_INTERVAL_MS,
      score: 0,
      combo: 0,
      elapsedMs: DROP_TARGET_STREAM_SPAWN_INTERVAL_MS,
      recentHitProgresses: [],
      stringSelection: [0],
      practiceContext: DEFAULT_DROP_PRACTICE_CONTEXT,
      runMode: "normal",
      focusPool: [],
    });

    expect(spawned).not.toBeNull();
    expect(spawned!.fallingTargets).toHaveLength(2);
    expect(spawned!.nextStreamSpawnAt).toBe(DROP_TARGET_STREAM_SPAWN_INTERVAL_MS * 2);
    expect(new Set(spawned!.fallingTargets.map((target) => `${target.stageXPercent}:${target.stageYPercent}`)).size).toBe(2);
    expect(getActiveFallingTarget(spawned!.fallingTargets, DROP_TARGET_STREAM_SPAWN_INTERVAL_MS)?.id).toBe(first.id);
    expect(getPlayableFallingTarget(spawned!.fallingTargets, DROP_TARGET_STREAM_SPAWN_INTERVAL_MS, true)).toBeNull();
    expect(shouldSpawnStreamTarget(1_000, DROP_TARGET_STREAM_SPAWN_INTERVAL_MS, 1)).toBe(false);
    expect(shouldSpawnStreamTarget(
      DROP_TARGET_STREAM_SPAWN_INTERVAL_MS,
      DROP_TARGET_STREAM_SPAWN_INTERVAL_MS,
      DROP_TARGET_STREAM_MAX_ON_SCREEN,
    )).toBe(false);
  });

  it("spreads prompt positions when one slot is already occupied", () => {
    const occupied = { stageXPercent: 20, stageYPercent: 20 };
    const next = pickPromptStagePosition(3, [occupied]);
    expect(next.stageXPercent !== occupied.stageXPercent || next.stageYPercent !== occupied.stageYPercent).toBe(true);
  });
});
