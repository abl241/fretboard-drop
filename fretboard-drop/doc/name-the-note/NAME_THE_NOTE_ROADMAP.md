# Fretboard Drop: Name the Note Mode Roadmap

## Purpose

Build a new sibling mode for Fretboard Drop in which the app highlights one exact guitar position and the player identifies the note.

The mode should feel as polished, fast, and replayable as the current game while reusing as much proven logic as possible. The implementation should also preserve a clean path for a later fretboard visual upgrade without coupling gameplay logic to the current renderer.

## Current MVP Status

The playable MVP now includes shuffled-deck target selection, retryable wrong answers, compact answer-button countdown controls, a wireframe-aligned fretboard pass with proportional fret spacing, subtle neck taper, string gauge variation, Run Points, and a separate scoped 0-1000 Name the Note Fluency score. The full realistic fretboard renderer, weak-area practice, detailed attempt history, and advanced recommendations remain later work.

## Core product promise

**See one exact string-and-fret position, name the note quickly, and build a 0 to 1000 fluency score.**

The experience should be immediately understandable:

1. One exact position is highlighted.
2. The player selects a note.
3. The app gives immediate feedback.
4. The next target appears quickly.
5. The player tries to maximize score during a fixed-duration run.
6. The results screen points to the next best practice action.

## Guiding product and engineering principles

### Steve Jobs

- The first interaction should feel magical within seconds.
- The fretboard should feel alive, not like a spreadsheet.
- Use one coherent visual language across prompt, countdown, feedback, and results.
- Hide complexity behind a focused experience.
- Prefer one excellent interaction over many average features.
- Every visible element should support the central experience.

### Steve Krug

- The player should know what to do without reading instructions.
- The main action must be obvious.
- Detailed settings should be available without blocking Quick Play.
- Reuse labels, controls, and flow patterns from the existing game.
- Keep the number of choices low during active play.
- Make the next action on the results screen unmistakable.

### Edward Tufte

- Maximize useful information and minimize decoration.
- Encode time, target position, correctness, and progress directly into the playing surface where practical.
- Avoid redundant score systems and decorative dashboards.
- Show only statistics that help the player decide what to practice next.
- Keep the exact target location visually precise.
- Use color plus geometry or motion, not color alone.

### Rob Pike and Ken Thompson

- Keep the data model small and explicit.
- Prefer simple composition over a broad abstraction framework.
- Share logic where the two games are truly parallel.
- Keep rendering, game state, statistics, and persistence separate.
- Avoid speculative abstractions for future modes.
- Do not rewrite working code when a focused extraction will solve the problem.
- Build the simplest version that preserves future flexibility.

## Product relationship to the current game

### Current game

- Shows a note.
- Player identifies or selects the matching position.
- Uses filters, session timing, score, streaks, statistics, weak-area logic, and fluency.

### Name the Note

- Shows one exact position.
- Player selects the matching note name.
- Reuses the same target pool, filters, session lifecycle, score philosophy, statistics architecture, weak-area practice, and 0 to 1000 fluency scale.

### Shared systems

- Canonical fretboard position
- Note calculation
- String selection
- Fret-range selection
- Note filters
- Open-string inclusion
- Valid-target generation
- Session timer
- Question timer
- Score
- Streak or combo
- Results flow
- Personal bests
- Statistics persistence
- Weak-target selection
- Fluency calculation framework

### Mode-specific systems

- Prompt presentation
- Answer controls
- Answer evaluation
- Feedback copy
- Mode-specific statistics
- Timing calibration when selection mechanics differ

## Canonical target model

Both modes should use one stable target identity.

Recommended minimum shape:

```ts
type FretboardTarget = {
  targetKey: string;
  stringId: string;
  stringIndex: number;
  fret: number;
  note: NoteName;
};
```

Rules:

- `fret: 0` represents an open string in the data model.
- Open strings are visually outside the numbered fretboard.
- `targetKey` must remain stable across modes and sessions.
- Do not create separate incompatible target records for each game.
- Preserve existing stored identifiers when migration is required.

## Architecture boundaries

### 1. Fretboard theory

Responsible for:

- tuning
- note calculation
- canonical note naming
- fretboard-position identity
- string and fret metadata

Must not know about:

- React components
- CSS
- scoring
- animations
- countdown colors

### 2. Target generation

Responsible for:

- building all eligible targets
- applying string filters
- applying fret filters
- applying note filters
- including or excluding open strings
- selecting normal or weak targets

Must not know about:

- pixel coordinates
- UI layout
- answer buttons
- visual feedback

### 3. Game session engine

Responsible for:

- session start and end
- fixed run duration
- question lifecycle
- score
- streak or combo
- response timing
- answer outcomes
- advancing to the next question

Use explicit semantic states:

```ts
type QuestionOutcome = "idle" | "correct" | "incorrect" | "timeout";
```

### 4. Statistics and fluency

Responsible for:

- attempts
- correctness
- response time
- selected wrong answer
- timeout
- recency
- mode-specific performance
- weak-target ranking
- 0 to 1000 fluency

Do not store only a single combined score if the underlying evidence is needed for future recalculation.

### 5. Fretboard renderer

Responsible for:

- drawing the neck
- drawing strings and frets
- placing the exact target
- displaying the open-string zone
- showing countdown and feedback states

It should receive a small explicit view model rather than reading game logic directly.

Example:

```ts
type FretboardViewState = {
  target: FretboardTarget | null;
  countdownFraction: number;
  outcome: QuestionOutcome;
  revealedCorrectNote?: NoteName;
  interactionEnabled: boolean;
};
```

The renderer must not calculate score, pick targets, or mutate statistics.

## Technology-debt guardrails

1. Do not duplicate the current game and rename it.
2. Do not create a generalized plugin architecture.
3. Do not couple the game engine to CSS classes or DOM measurements.
4. Do not use pixel coordinates as target identity.
5. Do not place fluency logic inside UI components.
6. Do not maintain two independent copies of filter logic.
7. Do not rewrite the current game solely to make the new mode fit.
8. Do not implement future visual polish before the renderer boundary is stable.
9. Do not add backend, authentication, global leaderboard, microphone input, or multiplayer.
10. Preserve backward compatibility for existing stored statistics where practical.
11. Keep mode-specific statistics separate even when sharing the same target identity.
12. Add comments only where intent is not obvious from names and structure.
13. Prefer a small number of clear files over many one-function abstractions.
14. Run typecheck, tests, and build after each phase.
15. Stop each phase at a working, commit-ready state.

## User experience structure

### Entry screen

Primary choices:

- Quick Play
- Practice Weak Areas
- Custom Practice

Quick Play should reuse the most recent valid configuration or choose a sensible default.

Custom Practice can expose:

- strings
- fret range
- notes
- include open strings
- session duration
- difficulty or question time

### Active run

Header:

- score
- streak or combo
- best score
- fixed session time remaining

Do not show lives.

Main play area:

- one exact target position
- percentage-based visual countdown
- note buttons
- immediate feedback

### Results

Primary information:

- score
- personal best
- accuracy
- average response time
- longest streak
- fluency change
- weakest note or position

Primary next action should adapt to the session:

- Practice Missed Positions
- Practice Weak Areas
- Beat Your Best
- Increase Difficulty
- Add Another String

## Exact-target design

The target must identify one exact string-and-fret cell.

Required:

- compact marker centered on the string
- thin boundary or localized glow limited to the exact cell
- no large pick covering neighboring frets
- no full fret-column highlight as the sole target cue
- no full-string highlight as the target

The target marker must remain stable during the countdown.

## Open-string design

Open strings are represented as `fret: 0` in data but appear outside the fretted neck.

Visual requirements:

- a narrow OPEN zone immediately left of the nut
- six aligned open-string cells
- one cell per string
- clear separation from fret 1
- no implication that OPEN is another fret
- same exact-position marker language as fretted targets

The open-string zone should be structurally part of the renderer, not a detached legend.

## Question timing

Question windows may range from about 2 to 6 seconds.

All visual countdown states must use:

```ts
countdownFraction = remainingQuestionMs / totalQuestionMs;
```

Never derive visual state from fixed numbers of seconds.

Suggested visual bands:

- 100% to 75%: cool cyan
- below 75% to 50%: green
- below 50% to 25%: yellow
- below 25% to 10%: orange
- 10% or less: red

The transition should be continuous rather than five abrupt static states.

## Countdown visual principles

The user may be looking at note buttons, so the countdown must be visible in peripheral vision.

Use broad visual changes across the fretboard:

- ambient glow
- brightness
- warmth
- large-scale depletion
- restrained acceleration or contraction

Do not rely on:

- tiny rings
- small segmented borders
- numeric per-question countdown alone
- slow pulses that may not complete within a two-second question

The exact target cell stays bright and stable. The surrounding fretboard communicates urgency.

## Feedback states

### Correct

- target cell changes to green
- selected note button confirms green
- brief localized burst
- short string ripple or success wave
- score increment appears
- speed category may show: Correct, Fluent, Instant
- advance quickly

### Incorrect guess

- selected wrong button flashes red
- correct answer button receives a brief green outline
- target cell changes to amber
- correct note is revealed
- combo or streak updates
- target becomes eligible for later repetition

### Timeout

- no answer button is treated as selected
- fretboard reaches the final red state
- surrounding neck dims
- target remains visible
- correct note is revealed
- combo or streak updates
- target becomes eligible for later repetition

The three states must be distinguishable without reading text.

## Score and 0 to 1000 fluency

### Session score

Session score drives replay and personal bests.

It may consider:

- correctness
- response speed
- streak
- difficulty
- selected scope

### Fluency

Fluency is a durable learning measure from 0 to 1000.

Requirements:

- separate Name the Note fluency
- shared formula philosophy with the current game
- progressively more difficult to improve near 1000
- accuracy limits maximum achievable fluency
- response speed matters more in the upper range
- enough attempts are required before high scores are credible
- recent performance weighs more than very old performance
- easy scope does not imply full-fretboard mastery

### Coverage

Track coverage separately from fluency.

Example:

- Fluency: 820
- Coverage: 32%

Coverage answers how much of the selected or total fretboard has enough evidence.

Do not merge coverage into the fluency number.

## Weak-area practice

Support ranking by:

- weak exact positions
- weak note names
- slow correct responses
- recent errors
- timeouts
- overdue review

Weak practice should respect the active filters.

Suggested run composition:

- 60% weakest eligible targets
- 25% developing targets
- 15% strong targets

Avoid repeating only the same worst locations.

## Phased implementation roadmap

## Phase 0: Audit and baseline

Goals:

- map current architecture
- locate shared and game-local logic
- identify current fluency formula
- document existing persisted data
- verify current tests and build

Deliverables:

- concise implementation map
- list of files likely to change
- identified migration risks
- baseline typecheck, tests, and build results

Exit criteria:

- no production behavior changed
- current game baseline documented

## Phase 1: Shared target and filter foundation

Goals:

- establish canonical target identity
- centralize eligible-target generation
- ensure open strings use fret 0
- preserve current game behavior

Deliverables:

- shared target model
- shared filter function
- tests for note, string, fret, and open-string filtering
- compatibility adapter if current game uses a different shape

Exit criteria:

- current game passes
- identical target sets are produced for equivalent settings
- no visual change required

## Phase 2: Name the Note playable core

Goals:

- add mode entry
- display exact target
- show note buttons
- run fixed-duration sessions
- evaluate answers
- show basic results

Deliverables:

- playable mode
- keyboard shortcuts where appropriate
- score and streak integration
- correct, incorrect, and timeout state plumbing
- open-string targeting

Exit criteria:

- full session can be completed
- no lives
- current game remains unchanged
- all targets obey selected filters

## Phase 3: Shared statistics and fluency

Goals:

- extend attempt recording
- reuse current 0 to 1000 fluency formula
- store response time and outcome
- preserve mode separation

Deliverables:

- mode-specific attempts
- backward-compatible stored data handling
- Name the Note fluency
- weak-position and weak-note summaries
- tests for score boundaries and migration

Exit criteria:

- existing game fluency does not change unintentionally
- Name the Note produces credible scores
- high fluency is difficult to obtain

## Phase 4: Weak-area runs and retrieval practice

Goals:

- generate weak-area sessions
- repeat misses after intervening questions
- preserve active filters
- avoid monotonous repetition

Deliverables:

- Practice Weak Areas action
- weighted target selection
- missed-this-run review
- delayed repetition behavior

Exit criteria:

- weak runs contain valid targets only
- target mix includes weak, developing, and strong items
- repeated targets are spaced rather than immediate

## Phase 5: Countdown and feedback polish

Goals:

- implement percentage-based fretboard countdown
- create visually distinct feedback outcomes
- preserve exact-target clarity
- support two- to six-second windows

Deliverables:

- ambient countdown based on fraction remaining
- exact target marker
- open-string visual target
- correct, incorrect, and timeout animation states
- reduced-motion fallback

Exit criteria:

- countdown works at any fret, including edges
- countdown is noticeable peripherally
- target remains unambiguous
- no gameplay logic is embedded in animation code

## Phase 6: Results and one-more-run loop

Goals:

- improve replay motivation
- surface useful learning insights
- make the next action obvious

Deliverables:

- adaptive next-action button
- personal best by comparable scope
- fluency change
- weakest area
- Play Again
- Practice Weak Areas
- Increase Difficulty

Exit criteria:

- one dominant next action
- no cluttered statistics dashboard
- session scope is clearly identified


## Phase 7: PostHog analytics and product tracking

Goals:

- measure whether the mode creates a one-more-run loop
- track learning and engagement without over-instrumenting the game
- preserve analytics-provider portability
- keep analytics failures isolated from gameplay

Architecture:

- create one small analytics wrapper, for example `src/lib/analytics.ts`
- app code should call app-level tracking functions rather than importing PostHog directly
- keep event names and property schemas documented in one place
- analytics calls must be non-blocking and must never affect scoring, timing, rendering, or persistence
- disable or clearly separate development events
- do not place analytics logic inside score, fluency, or weak-target calculations
- preserve an easy migration path to another provider

Core events:

```text
name_note_opened
name_note_session_started
name_note_session_completed
name_note_session_abandoned
name_note_play_again_clicked
name_note_weak_practice_started
name_note_settings_changed
```

Recommended session properties:

```text
session_duration_seconds
selected_strings_count
selected_fret_min
selected_fret_max
selected_notes_count
include_open_strings
difficulty
question_time_ms
practice_type
```

Recommended completion properties:

```text
score
accuracy
average_response_ms
fastest_response_ms
longest_streak
questions_seen
questions_correct
questions_incorrect
questions_timed_out
fluency_before
fluency_after
fluency_change
personal_best
```

Privacy and event-volume guardrails:

- default to aggregated session events
- do not send one PostHog event for every question unless later analysis proves it is necessary
- keep detailed per-target attempts in the app's own statistics system
- if per-question analytics are later enabled, sample them and use coarse properties only
- do not send unnecessary raw identifiers or full game-state snapshots
- configure session replay conservatively and mask inputs
- use session replay only to answer specific UX questions
- do not enable feature flags until there is a real experiment to run

Primary product metrics:

- session-start rate after opening the mode
- session-completion rate
- play-again rate
- percentage of completed sessions followed by another run
- weak-practice adoption
- average score improvement
- average response-time improvement
- fluency gain per session
- next-day return rate

Recommended first dashboard:

1. Mode opened
2. Session started
3. Session completed
4. Session abandoned
5. Play Again clicked
6. Weak Practice started
7. Average score
8. Average accuracy
9. Average response time
10. Fluency change
11. Next-day return

Exit criteria:

- gameplay works normally with analytics disabled
- analytics failures do not surface to the player
- events use stable documented names
- no direct PostHog imports are scattered through gameplay components
- development and production data are distinguishable
- dashboard answers whether players voluntarily choose another run

## Phase 8: Realistic fretboard renderer, deferred


Goals:

- improve visual realism without touching gameplay logic

Potential improvements:

- layered wood texture
- metallic fret wires
- string thickness variation
- refined nut
- fret marker depth
- lighting and shadows
- responsive proportions
- polished open-string zone

Guardrails:

- no static image replacement
- preserve semantic cells and target geometry
- preserve click and marker alignment
- renderer consumes the same view state
- no scoring or target logic changes

Exit criteria:

- visual upgrade is replaceable and isolated
- all gameplay tests remain unchanged
- exact target positions remain aligned at every viewport size

## Phase 9: Calibration and balancing

Goals:

- tune timing, score, and fluency from actual play
- confirm the game creates a one-more-run response

Measure:

- replay rate
- average number of consecutive runs
- score improvement
- response-time improvement
- weak-area completion
- next-day return
- distribution of fluency scores
- time required to reach 800, 900, 950, and 1000

Do not overfit before real use.

## Recommended prompt sequence

1. Architecture audit and shared target generation
2. Playable Name the Note core
3. Statistics and 0 to 1000 fluency reuse
4. Weak-area practice
5. Countdown and feedback visual system
6. Results and replay loop
7. PostHog analytics and product tracking
8. Realistic fretboard visual refactor
9. Calibration and balancing

Practical planning:

- 6 prompts for the complete core mode
- 7 prompts for the core mode plus measurement
- 9 prompts including the deferred fretboard visual upgrade and balancing pass

Each prompt should:

- be narrow
- list protected behaviors
- name likely files only
- forbid unrelated rewrites
- require relevant checks
- end with TASK COMPLETE or TASK INCOMPLETE
- produce a commit-ready state

## Testing strategy

### Unit tests

- note calculation
- target key stability
- filter combinations
- open-string handling
- answer evaluation
- timeout behavior
- countdown fraction
- weak-target weighting
- stats migration
- fluency boundaries

### Integration tests

- start and complete session
- current game unchanged
- Name the Note respects settings
- results persist
- weak-area run uses eligible targets
- mode scores remain separate

### Manual browser testing

The user will manually test:

- target clarity
- open-string clarity
- keyboard and click input
- countdown visibility
- edge frets
- two-second and six-second timing
- correct, incorrect, and timeout feedback
- replay flow
- responsive layout

Do not use Playwright, browser automation, live preview, or screenshot testing unless requested later.

## Deferred ideas

Do not add until the core loop proves engaging:

- realistic fretboard overhaul
- mixed-direction challenge
- daily challenge
- advanced mastery heat map
- audio recognition
- microphone grading
- global leaderboard
- social features
- backend progress synchronization
- extensive badge or reward systems
- enharmonic-preference complexity
- advanced curriculum layers

## Success criteria

The mode succeeds when:

1. A new player understands the task within five seconds.
2. The exact target position is never ambiguous.
3. The timer is noticeable while the player looks at answer buttons.
4. The user can complete repeated runs without setup friction.
5. Scores and fluency feel credible.
6. The final 100 fluency points remain difficult.
7. Weak-area practice feels targeted but not repetitive.
8. The current game remains stable.
9. The renderer can be visually replaced later without changing game logic.
10. The user voluntarily chooses one more run.

## Included wireframes

- `wireframe_name_the_note_full_flow.png`
- `wireframe_open_zone_and_countdown_states.png`
- `wireframe_countdown_and_feedback_concept.png`

These wireframes are visual references, not literal implementation specifications. The coding agent should preserve the product intent while using the current app's component system and existing architecture.

The most recent full-flow wireframe should be treated as the primary reference for:
- open-string zone
- exact-position marker
- score-based 60-second run
- percentage-based countdown states
- correct, incorrect, and timeout feedback
