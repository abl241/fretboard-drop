# Prompt 2 Playable Core

## Files Changed

- `src/features/fretboardDrop/nameTheNote/NameTheNoteGame.tsx`
- `src/features/fretboardDrop/nameTheNote/NameTheNoteGame.test.tsx`
- `src/features/fretboardDrop/FretboardDropExperience.tsx`
- `src/features/fretboardDrop/FretboardDropExperience.test.tsx`
- `src/features/fretboardDrop/FretboardDropGame.tsx`
- `src/features/fretboardDrop/guided/GuidedModeChoice.tsx`
- `src/features/fretboardDrop/guided/guidedTypes.ts`
- `src/features/fretboardDrop/guided/guidedStorage.ts`
- `src/features/fretboardDrop/guided/guidedStorage.test.ts`
- `doc/name-the-note/PROMPT_2_PLAYABLE_CORE.md`

## Mode Entry

Name the Note is a sibling mode in `FretboardDropExperience`.

- First-visit mode choice now offers Guided Learning, Free Play, and Name the Note.
- Free Play still opens the existing Fretboard Drop setup.
- The existing Fretboard Drop start screen has an additive `Try Name the Note` link.
- Name the Note can return to Free Play with `Back to Free Play`.

## State And Reducer Structure

`NameTheNoteGame.tsx` owns a small isolated reducer with:

- `status`: `setup`, `playing`, or `complete`
- run counters: `score`, `correct`, `incorrect`, `timeouts`, `streak`, `bestStreak`
- response timing: `correctResponseMsTotal`, `correctResponseCount`
- `activeQuestion` with canonical `FretboardTarget`
- explicit `QuestionOutcome`: `idle`, `correct`, `incorrect`, `timeout`

The renderer receives semantic state: target, countdown fraction, outcome, revealed note, and interaction enabled.

## MVP Correction

Manual testing found that the original Prompt 2 target selection was deterministic: the run always restarted from seed `0` and advanced through a fixed arithmetic sequence. That selector has been replaced with a local shuffled-deck model:

- the eligible target pool is shuffled with Fisher-Yates at run start
- targets are drawn once each before the deck repeats
- an exhausted deck is reshuffled from the same eligible pool
- the first target of a reshuffled deck avoids matching the immediately previous target when more than one target is available
- the shuffle helper accepts injected RNG for stable tests, while production runs use fresh `Math.random` input

## Shared Logic

Name the Note uses `buildEligibleFretboardTargets` from `src/lib/fretboardTargets.ts` for all eligible target generation.

It reuses current Drop settings constants and normalizers for:

- selected strings
- natural-note practice selection
- fret range `0-11`
- open-string inclusion
- 60 second duration

## Scoring Rules

Correct answers earn:

- 10 base points
- 0 to 10 speed bonus points from `remainingQuestionMs / totalQuestionMs`
- up to 10 streak bonus points

Incorrect answers and timeouts award no points and reset streak.

Wrong answers are retryable during the same question. A wrong note press increments `incorrect`, resets the active streak, marks that letter unavailable, and leaves the same target active while the timer continues. The correct note is not revealed until the player answers correctly or the question times out. If the player later answers correctly after one or more wrong attempts, they can still earn base and speed points, but that target does not increment the streak.

Result accuracy uses the MVP denominator `correct / (correct + incorrect attempts + timeouts)`, so `incorrect` represents total wrong button presses rather than failed targets.

## Question Timing

Runs last 60 seconds.

Each question uses:

- `totalQuestionMs = 4000`
- `remainingQuestionMs = totalQuestionMs - elapsed`
- `countdownFraction = remainingQuestionMs / totalQuestionMs`

Correct answers advance after 450ms. Timeouts reveal the correct note and advance after 700ms. Wrong answers do not advance the question and do not reset the question timer.

## Prompt 2A Countdown Correction, Superseded

The conventional horizontal per-question progress bar remains removed. The later ambient fretboard color countdown was also removed for the MVP correction.

Question time is now communicated by a fill layer inside each A-G answer button. The fill starts full and drains vertically from `countdownFraction`, while the answer letter stays fixed above the fill and a small numeric question countdown remains visible. The fretboard itself stays visually stable during the countdown.

The target remains a stable exact-position cue inside one string-and-fret cell, with the separate OPEN zone preserved for fret `0` targets. The active run layout was enlarged to make the fretboard the dominant surface and align more closely with the wireframes, without adding the deferred realistic fretboard renderer.

## Visual And Fluency Pass

The active Name the Note surface was tightened after manual review:

- the fretboard now uses bounded wireframe-aligned proportions instead of filling the remaining viewport height
- visible fret spacing is derived from the equal-temperament relationship `1 - 2^(-n/12)`, normalized across frets 1-11, so fret 1 is wider than fret 11
- the neck has a restrained taper, narrower near the nut and full height toward higher frets
- string gauges increase from high E to low E while staying centered on the same logical rows
- fret wires, nut, dots, and outer frame were quieted so the exact target marker is the strongest neck element
- A-G answer controls are ordered `A B C D E F G`, centered below the fretboard, and bounded to reduce pointer travel
- answer-button countdown fill remains the per-question time cue, with the small numeric question timer preserved

The arcade total is now labeled **Run Points**. The point formula is unchanged: 10 base points, 0-10 speed bonus points, and up to 10 streak bonus points for each first-try correct answer.

Name the Note now also has a separate 0-1000 **Fluency** score in `src/features/fretboardDrop/nameTheNote/nameTheNoteFluency.ts`. Fluency is calculated from completed targets, wrong attempts, timeouts, first-try best streak, and average correct response progress. The calibration is intentionally harder near 1000: low volume caps the score, wrong attempts and timeouts impose ceilings, high scores require high accuracy and fast recall, and 980+ requires exceptional volume with near-perfect accuracy.

Fluency persistence is separate from original Fretboard Drop data and separate from Run Points. It stores a versioned JSON record containing the score, label, scope key, timestamp, and underlying evidence. The scope key includes selected strings, selected notes, and the include-open-strings setting.

## Open-String Treatment

Open strings remain `fret: 0` in the canonical target model.

The playable core renders an OPEN zone as a separate column before frets 1-11. Open targets are aligned to the string row, labeled `OPEN`, and do not share the fret 1 cell.

## Persistence

Name the Note persists a mode-specific best Run Points score:

- `fretboard-drop:name-the-note:best-score:v1`

Name the Note fluency uses a separate versioned prefix:

- `fretboard-drop:name-the-note:fluency:v1`

It does not write to existing Fretboard Drop best-score, run-history, analytics, fluency, or cell-progress keys.

## Tests Run

- Focused test run:
  - `./node_modules/.bin/vitest run --config vitest.config.ts src/features/fretboardDrop/nameTheNote/NameTheNoteGame.test.tsx src/features/fretboardDrop/FretboardDropExperience.test.tsx src/features/fretboardDrop/guided/guidedStorage.test.ts`
- Broader relevant test run:
  - `./node_modules/.bin/vitest run --config vitest.config.ts src/lib/fretboardTargets.test.ts src/features/fretboardDrop/dropGameUtils.test.ts src/features/fretboardDrop/dropCellProgress.test.ts src/features/fretboardDrop/FretboardDropGame.test.tsx src/features/fretboardDrop/nameTheNote/NameTheNoteGame.test.tsx src/features/fretboardDrop/FretboardDropExperience.test.tsx src/features/fretboardDrop/guided/guidedStorage.test.ts`
- Full test script:
  - `CI=true pnpm run test`
- Typecheck:
  - `CI=true pnpm run typecheck`
- Production build:
  - `CI=true pnpm run build`

## Deferred Prompt 3 Work

- attempt history and weak-area ranking
- weak-area practice entry
- advanced replay recommendations
- final score alignment with the existing fluency model
- PostHog analytics

## Known Limitations

This playable core is constrained to the current natural-note pool (`A-G`) because the answer controls are natural-note buttons only. The shared target model still supports accidentals for later prompts.
