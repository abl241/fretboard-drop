# Prompt 1 Architecture Audit

## Current Architecture Map

- Mode entry and routing: `src/features/fretboardDrop/FretboardDropExperience.tsx` chooses Guided Learning or Free Play. Free Play renders `FretboardDropGame`.
- Main game session: `src/features/fretboardDrop/FretboardDropGame.tsx` owns run lifecycle, reducer state, score, combo, lives, timers, target resolution, audio, analytics, results, and fretboard rendering.
- Drop target generation: `src/features/fretboardDrop/dropGameUtils.ts` creates timed `DropTarget` objects and now uses the shared target pool for semantic string/fret/note identity.
- Fretboard theory: `src/lib/fretboard.ts` owns standard tuning, chromatic note names, and `getNoteAtFret`.
- Fretboard rendering: `FretboardDropGame.tsx` renders the current clickable fretboard. It receives semantic target context and does not own target generation.
- Guided Learning: `src/features/fretboardDrop/guided/` has a separate guided target sequence for lesson-specific pedagogy. It remains unchanged in this prompt.

## Canonical Target Model

- Location: `src/lib/fretboardTargets.ts`
- Shape: `FretboardTarget` with `targetKey`, `stringId`, `stringIndex`, `fret`, and `note`.
- Stable key format: `standard:{stringIndex}:{fret}`.
- Stable string ID format: `standard:{stringIndex}`.
- Open strings are represented as `fret: 0`.

## Shared Eligible-Target Generation

- Location: `src/lib/fretboardTargets.ts`
- Function: `buildEligibleFretboardTargets`.
- Pipeline: all standard-tuning positions, selected-string filter, fret-range filter, selected-note filter, open-string inclusion rule.
- The function is pure and does not include UI, scoring, timing, or random selection.

## Current Game Integration

- `DropTarget` now carries canonical `targetKey` and `stringId` in addition to its existing gameplay fields.
- Normal Fretboard Drop generation still selects a playable note first, applies the previous no-repeat note behavior, then chooses a matching position. This preserves the current target distribution and random-call shape.
- Focus Practice still selects from the weak-cell pool first, then attaches canonical identity for the selected cell.
- Timing, scoring, lives, combo, adaptive pacing, miss handling, results, settings, analytics, and visuals were not redesigned.

## Stats, Fluency, And Weak Areas

- Attempt record shape and persistence: `src/features/fretboardDrop/dropCellProgress.ts`
- Current persisted key: `fretboard-drop:cell-progress:v1`
- Current cell ID format: `standard:{stringIndex}:{fret}`, now delegated to the canonical target-key helper for compatibility.
- Run best storage: `guitarrise:fretboard-drop:best-score:v1` and scoped suffixes in `dropGameUtils.ts`.
- Run history storage: `src/features/fretboardDrop/dropRunHistory.ts`
- Per-run fluency formula: `src/features/fretboardDrop/dropFluencyScore.ts`
- Per-cell fluency formula: `src/features/fretboardDrop/dropCellFluency.ts`
- Weak Focus Practice selection: `buildFocusPracticePool` in `src/features/fretboardDrop/dropFretboardStats.ts`

## Persistence Compatibility Notes

- Existing cell progress IDs are preserved because the canonical `targetKey` intentionally matches the existing `standard:string:fret` format.
- No saved-data migration is required for this prompt.
- No Name the Note persistence was added.

## Files Changed

- `src/lib/fretboardTargets.ts`
- `src/lib/fretboardTargets.test.ts`
- `src/features/fretboardDrop/dropGameTypes.ts`
- `src/features/fretboardDrop/dropGameUtils.ts`
- `src/features/fretboardDrop/dropGameUtils.test.ts`
- `src/features/fretboardDrop/dropCellProgress.ts`
- `src/features/fretboardDrop/dropCellProgress.test.ts`
- `src/features/fretboardDrop/FretboardDropGame.test.tsx`
- `doc/name-the-note/PROMPT_1_ARCHITECTURE_AUDIT.md`

## Deferred Work

- Build the playable Name the Note mode.
- Add mode entry UI for Name the Note.
- Add exact-position target visuals and the OPEN zone renderer.
- Add Name the Note answer buttons, question lifecycle, scoring, results, and persistence.
- Design mode-specific Name the Note attempts, fluency, and weak-area ranking.
- Decide whether Guided Learning should later adopt canonical target identity or remain lesson-local.

## Risks

- Guided Learning still has its own lesson-specific `GuidedTarget` shape. That is intentional for this prompt, but future shared statistics work should decide whether to add a compatibility adapter.
- The current Drop game still has UI-specific stage coordinates on `DropTarget`; canonical identity is additive and does not remove those presentation fields.
