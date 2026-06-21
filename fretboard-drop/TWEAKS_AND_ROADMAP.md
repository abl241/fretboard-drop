# Fretboard Drop — Tweaks and Roadmap Notes

## Purpose

This document tracks future polish items, roadmap ideas, and design decisions for the standalone Fretboard Drop app.

Fretboard Drop is separate from GuitarRise and the jazz/content app. It is a broad-market fretboard practice game. The goal is to make boring fretboard memorization feel like a simple, addictive arcade game.

The product test is simple:

- Does the first minute feel magical?
- Does the player want one more run?
- Does the app make fretboard recall faster without feeling like homework?

## Product / design guardrails

Use these principles when making decisions:

- Jobs: preserve focus, polish, emotional clarity, and first-minute delight.
- Tufte: maximize useful signal, reduce visual clutter, and preserve clear hierarchy.
- Krug: make the next action obvious, avoid confusing interactions, and do not make the player think.
- Eyal: use the habit loop ethically through fast trigger, simple action, satisfying reward, and local investment through improvement.
- Fretboard Drop principle: fun and fairness matter more than feature count.

## Scope Lock

All future work should stay inside:

`artifacts/fretboard-drop`

Do not edit:

- `artifacts/guitar-trainer`
- shared packages unless absolutely necessary and explicitly requested
- auth
- backend
- Transcribe
- Rhythm Lab
- Song Highway
- GuitarRise/Guitar Guru features
- billing/database/global leaderboard code

Keep the app frontend-only until the core loop is clearly proven.

---

# Current Completed Foundation

As of the current checkpoint, Fretboard Drop has:

- standalone app in `artifacts/fretboard-drop`
- separate Vercel deployment
- multi-string selection
- frets limited to 0–11
- pick life icons
- CSS/SVG guitar-pick/gem target
- target-string visual cues with unselected / selected-inactive / active-target string states
- local best scores by selected string/note context
- note-set practice contexts tracked separately for local bests
- post-run suggested actions
- Quick Peek Notes as a start-screen toggle
- Quick Peek showing only tested natural notes
- Quick Peek visual polish
- Note Focus with compact UI
- multi-select Note Focus for focused learning sets like `C+D` or `C+E+G`
- adaptive pacing replaced by clearer streak-based pacing tiers
- tier-up messages at combo 5, 10, and 15
- lightweight correct-hit feedback
- miss reveal feedback after misses
- final-life miss reveal before Results
- clearer Results / Play Again loop
- `Last 5 here` same-context Results trend strip using local-only Fluency Score history
- visible progress cues stay small and useful without becoming a dashboard
- versioned local per-cell progress evidence for physical string/fret locations
- async per-cell progress repository boundary so a later API/database adapter can replace localStorage without rewriting gameplay
- per-cell progress storage intentionally stores evidence only; scoring is derived separately and no Stats UI is included yet
- per-cell Fluency v1 and evidence-confidence classification as pure derivation logic
- unstudied cells remain distinct from weak cells through `not-enough-data`
- adjacent wrong taps carry half the penalty of distant wrong taps in per-cell scoring
- 2D `Your Fretboard` Stats page
- Stats views: Fluency, Recall speed, Accuracy, Attempts
- Stats page keeps insufficient evidence visually distinct from weakness
- Stats page cell details, metric-specific legends, simple note/string filters, and concise summary insights
- Focus Practice from weak, sufficiently tested cells on the Stats page
- Focus Practice excludes untested cells and keeps Build Coverage as a separate future path
- Focus Practice uses local per-cell evidence, selected note/string filters, and a capped weakest-cell pool
- optional polished 3D Explore view on the Stats page
- 3D Explore reuses the shared Stats view model; 2D Map remains the default precise-reading view
- 3D Explore uses isolated CSS 3D rendering with no scoring or persistence changes
- initial flat CSS 3D markers were replaced with real six-faced volumetric columns
- 3D Explore now has bounded zoom, clearer fret/string landmarks, pearl-style inlays, and corrected string-gauge orientation
- 3D Explore cuboids now anchor to the fretboard surface, hover labels use a stable overlay path, and Top/Angle/Profile presets are available
- 3D Explore now separates headstock, Open zone, nut, fretted board, and a replaceable dark woodgrain material layer
- 3D Explore replaced synthetic fretboard grain with a local lengthwise woodgrain texture
- 3D Explore added a local mother-of-pearl texture to the existing fret 3, 5, 7, and 9 inlays
- 3D Explore now supports mouse-wheel/trackpad zoom over the viewport using the same bounded zoom model as the buttons
- 3D Explore keeps the Open zone visually separate from the fretted woodgrain material
- 3D Explore pearl material visibility was improved, and the woodgrain was darkened slightly for readability
- woodgrain and pearl materials remain isolated and replaceable; realistic Three.js materials remain optional later
- the temporary 3+3 headstock and current CSS material are intentionally replaceable; realistic headstock/material rendering remains future work
- 3D renderer remains isolated to Stats; Build Coverage and cloud sync remain separate
- compact Practice Strings selector
- shorter clear string labels: `high E`, `B`, `G`, `D`, `A`, `low E`, `All`
- phone-landscape home screen fit pass
- phone-landscape gameplay/results fit pass
- smaller phone-landscape pick with aligned visual size and miss timing
- non-target-string taps/clicks ignored during gameplay for fairness
- target-string wrong fret still gives wrong feedback, resets combo, and does not cost a life
- bottom/tip-of-pick miss alignment as a key fairness rule
- vendor-neutral analytics scaffold with development console logging
- PostHog production analytics wired behind the vendor-neutral adapter; further analytics/schema expansion is on hold
- Fluency Score v1 as a versioned 0–1000 progress score
- Fluency Score labels: Getting started, Building recall, Solid run, Strong fluency, Excellent, Elite, Legendary!
- current-run hit timing history for Fluency Score only; pacing `recentHitProgresses` remains separate
- Fluency Score top end tuned so Legendary requires early/instant recall, not just a clean high-volume run
- optional note sound for clicked target-string frets, using Web Audio pitch reinforcement only

---

# Immediate Next Priority

## 1. Verify deployed build and Fluency Score feel

Current checkpoint:

- Mobile-landscape QA passed.
- Analytics scaffold was implemented, tested, and pushed.
- Fluency Score v1 was added, tightened, and then tuned to include instant recall / hit timing.
- A clean run with 33 notes found, 100% accuracy, 0 misses, and 33 streak scored `925` and labeled `Excellent`, which is currently acceptable.
- Legendary should remain rare and should require clean performance plus very early hits.

Manual checks after deploy:

- home screen still fits on phone landscape
- gameplay still shows all 6 strings
- Results still fits on phone landscape
- Play Again remains dominant
- raw score still appears as Notes Found
- Fluency Score label appears cleanly under the score
- clean but average-speed runs score well but do not reach Legendary
- earlier hits score higher than late hits
- desktop still looks normal

Next likely build after verification:

- Keep analytics/schema expansion on hold until production event quality is verified.
- Prompt 5 for Fretboard Drop Stats should stay small and build on the current local-only stats layer.
- Continue small results/reward and learning-reinforcement polish only.
- Do not add backend/auth/global leaderboard yet.
- Sound should stay optional pitch reinforcement, not microphone detection, pitch detection, audio grading, or a new audio game mode.

---

# Core Gameplay / Visual Tweaks

## 2. Active Target String Clarity

Current state: improved and likely acceptable after three-state string visual tuning.

Keep this model:

### Unselected string

- dim/background
- visible but inactive
- no glow
- no row band
- no shimmer

### Selected inactive string

- faint eligibility cue
- thin cool static line
- low/moderate opacity
- very subtle accent glow
- no row band
- no pulse/shimmer

### Active target string

- obvious current-action cue
- soft horizontal row band behind the string
- slightly thicker/brighter energized line
- warm/cyan accent matching falling pick accent

Do not use:

- left-edge markers
- arrows
- string names inside the gem
- exact fret reveal while gem is falling
- vertical target lanes
- multiple falling gems yet

Architecture rule: keep using reusable string visual-state logic so the system can later support multiple visible falling gems.

Possible helper concept:

`getStringVisualState(stringIndex, selectedStrings, visibleTargets, currentTargetId)`

Current states:

- `unselected`
- `selected-inactive`
- `active-target`

Future states:

- `upcoming-target`
- `active-target`

## 3. Correct-Hit Feedback Polish

Current correct-hit burst works, but sparkles may still feel generic.

Possible later refinement:

- quick gold pop on clicked fret
- small `+1` float
- cleaner radial pulse
- maybe a pick-shaped flash
- avoid random sparkles that feel generic
- do not obscure the fretboard

## 4. Subtle Near-Line Urgency Glow

Not currently implemented. This is a later visual-feel experiment, not an immediate feature.

Goal:

- create a little more urgency as the falling pick approaches the hit line
- preserve predictable, fair, linear falling motion
- do not change target duration, pacing tiers, hit/miss timing, or mobile difficulty

Possible behavior:

- when the pick enters the final 15–20% above the hit line, slightly strengthen the hit-line glow and/or the pick shadow
- optionally warm the pick glow very slightly as it nears the line
- keep the effect subtle enough that the player feels pressure without visual noise

Do not use:

- flashing
- shaking
- alarms
- large color shifts
- sudden motion changes
- speed-up or slow-down easing
- anything that obscures the fretboard or falling note

Important fairness rule:

- miss must still occur only when the bottom/tip of the visible pick reaches or passes the hit line
- the glow should communicate proximity, not alter gameplay timing

Reject this tweak if it feels noisy, stressful, unfair, or reduces the clean Tetris-like predictability of the fall.

## 5. Miss Reveal Feedback

Current state: miss reveal is useful and should be preserved.

Rules:

- only after the miss is counted
- never while the gem is falling
- use gold/amber, not red
- keep it brief: about 0.5 seconds
- on final life, show reveal before Results
- miss timing should align to bottom/tip of the visible pick reaching or passing the hit line

Purpose: make misses into learning moments without feeling unfair.

## 6. Streak-Based Pacing Tiers

Current state: this was a major gameplay improvement.

Tier values added:

- combo `0–4`: normal pace
- combo `5–9`: `650ms` faster, message `Let’s speed up!`
- combo `10–14`: `1250ms` faster, message `Faster now!`
- combo `15+`: `2300ms` faster, message `Max pace!`

Minimum target duration:

- `2100ms`

Preserve:

- one or two lucky early hits should not create a large spike
- late-hit easing and miss recovery breather
- wrong clicks on the target string reset combo but do not cost a life
- non-target-string taps/clicks are ignored and do not reset combo
- misses reset combo, cost a life, show miss reveal, and apply miss recovery

Do not add Survival Mode yet just because pacing tiers feel good.

## 7. Fluency Score v1

Current state: implemented and pushed.

Purpose:

- Raw score is still useful as the arcade count and appears as Notes Found.
- Fluency Score is the main progress/motivation score on Results.
- The score should reward accuracy, volume, streak, cleanliness, and especially instant recall.

Architecture rules:

- Keep Fluency Score in a pure helper, not buried in React rendering.
- Keep the formula versioned with `DROP_FLUENCY_SCORE_VERSION`.
- Keep raw best storage unchanged.
- Keep Fluency best storage separate and versioned by practice context.
- If the formula changes after deployment, consider whether the version should bump to avoid comparing incompatible bests.

Current labels:

- `0–299`: Getting started
- `300–499`: Building recall
- `500–699`: Solid run
- `700–849`: Strong fluency
- `850–929`: Excellent
- `930–979`: Elite
- `980–1000`: Legendary!

Current philosophy:

- 1000 should be aspirational and rare.
- Legendary should require clean performance plus near-immediate/early hits.
- A clean high-volume run with average/slower hit timing should score well but should usually remain Excellent, not Legendary.
- Elite should require high volume, clean accuracy, and reasonably early hits.
- Misses and wrong target-string clicks should meaningfully suppress the top end.
- Mobile is not made harder; hit timing only affects post-run scoring.

Current calibration examples:

- `33 notes found / 100% accuracy / 0 misses / 33 streak` scored `925`, label `Excellent`.
- `34 notes / 100% accuracy / 0 misses / 34 streak / late average hitProgress .56` calibrated around `925`.
- Same 34-note clean run with early average hitProgress `.18` can reach `1000`.
- `29 notes / 94% accuracy / 1 miss / streak 20` stays below `900`.
- `13 notes / 68% accuracy / 3 misses / 3 wrong / streak 5` calibrates around `495`.

Future tuning guidance:

- Use real player runs before further major tuning.
- If too many users reach Elite/Legendary, make the hit-timing gate stricter.
- If almost nobody reaches Elite, soften the top-end gate slightly but keep Legendary rare.
- Consider showing more explanatory feedback later, such as “faster hits raise Fluency,” but do not clutter Results yet.

## 8. Results Screen Minor Polish

Results screen is acceptable after Fluency Score and phone-landscape fit work. Possible later tweaks:

- preserve Fluency Score as the main result
- preserve Notes Found as raw score
- preserve selected string/note best labels
- keep narrative label short and motivational
- keep Play Again dominant
- avoid crowding the results screen
- phone landscape must keep Play Again visible/reachable

---

# Start Screen / Setup Polish

## 9. Practice Notes Control

Current compact Note Focus dropdown is better than the large button grid.

Later refinements:

- make dropdown/pill slightly quieter and less form-like
- consider placing Practice Notes closer to selected-string summary
- keep Start Run dominant
- avoid making home screen feel like settings dashboard

## 10. Start Screen Copy

Possible tighter copy:

“Peek at the notes, then play from memory.”

Current copy is acceptable, but can be tightened later.

## 11. Practice Strings Selector

Current direction:

- keep separate string selector buttons for now
- do not use only `e` and `E`; too subtle/confusing for beginners
- do not move string selection onto the fretboard yet because it may confuse setup clicks with gameplay clicks
- current compact labels are preferred: `high E`, `B`, `G`, `D`, `A`, `low E`, `All`

Later exploration:

- direct fretboard-based string selection could be tested later only if setup mode is visually obvious and instructions are very clear

## 12. Fretboard Preview Size

The fretboard preview is useful but can become too tall, especially on mobile.

During mobile pass:

- reduce or hide preview on phone landscape if it prevents Start Run from being visible
- keep Start Run easy to reach
- Quick Peek markers must stay readable
- avoid vertical scrolling during normal start flow if possible

---

# Quick Peek Notes

Current state:

- Quick Peek is a start-screen toggle
- notes appear on selected strings only
- notes match current tested note pool
- natural notes only for now
- notes hide when run starts
- no in-run help button

Later refinements:

- ensure Quick Peek works well on mobile
- keep note markers readable but not cluttered
- do not show notes that cannot appear in the run
- do not add in-run Help/Peek for now

Do not add:

- in-run Help button
- pause-and-peek during gameplay
- countdown auto-start behavior

---

# Note Focus

Current state:

- All natural notes by default
- single natural note focus supported: C, D, E, F, G, A, B
- Quick Peek reflects Note Focus
- local best keys distinguish all-notes vs note-focused practice
- practice type separation exists

Important architecture rule:

String Focus and Note Focus train different recall pathways and should remain separately identifiable for future tracking.

String Focus asks:

“Given this string or selected string set, can the user find the target note?”

Note Focus asks:

“Given this note, can the user find it across selected strings?”

Future-proofing:

- keep note focus internally note-set oriented
- avoid hardcoding only a single-note model
- future multi-note selection should be possible without rewriting local best keys
- future example: A + C + E

Do not add multi-note UI yet.

---

# Learning-Efficiency Roadmap

## 13. Local Weak Spot Engine

Potential major differentiator.

Track locally by:

- practice type
- selected strings
- selected notes/note set
- string
- fret
- note

Track:

- attempts
- correct
- misses
- wrong clicks
- hit timing
- recent trend

Important: keep `string-focus` and `note-focus` stats separate.

## 14. Wrong-Click Interpretation

Wrong clicks should be tracked but treated as noisy signals, especially on iPhone.

Updated rule:

- taps/clicks on non-target strings during gameplay should be ignored, not counted wrong
- wrong-click stats should primarily mean wrong fret/cell on the active target string

Track separately:

- wrong fret distance on target string
- near miss vs far miss
- repeated pattern vs isolated tap
- ignored non-target-string taps, if useful later, as a separate optional signal

Interpretation:

- miss = strongest weak-spot signal
- late correct = strong fluency signal
- far wrong fret on target string = likely knowledge error
- near-fret wrong click = possible misclick/motor error
- ignored non-target-string tap = possible touch imprecision, not knowledge error
- fast correct = mastery signal

Do not over-penalize one-off wrong taps.

## 15. Weak-Spot-Aware Target Generation

After tracking exists, gently bias targets toward harder notes.

Examples:

- recently missed notes appear slightly more often
- slow notes appear more often
- easy/fast notes appear less often
- repeated errors resurface later

Keep it subtle. It should feel smart, not punitive.

## 16. Weak Spot Run

Optional later CTA:

“Practice Weak Spots”

This should be secondary to the main 60-second run.

---

# Practice Expansion Roadmap

## 17. Multi-Note Selection Later

Current Note Focus is single-select.

Later:

- allow selected note sets, such as A + C + E
- best-score keys should already support note sets
- Quick Peek and target generation should use same selected-note-set helper

Do not add until UI can support it without clutter.

## 18. Note Pool Selector Later

Current app is natural notes only.

Possible later options:

- Natural notes
- Sharps/flats
- All notes

Rule: Quick Peek must always match the tested note pool.

## 19. Fret Range Options Later

Current range is 0–11.

Possible later options:

- 0–5
- 5–11
- 0–11

Keep compact. Do not turn start screen into a settings panel.

---

# Mobile / App Store Roadmap

## 20. Mobile/Touch-First Pass

Important before App Store launch.

Current product decision:

- Gameplay should be landscape-first on phones.
- Portrait gives a nice Tetris-like vertical fall, but the fretboard becomes too cramped and risks unfair wrong taps.
- Landscape preserves the wide guitar/fretboard feel and better tap accuracy.
- Preserve enough vertical falling runway in landscape by compressing HUD/fretboard vertical space, not by making mobile timing faster.
- Mobile should not be harder than desktop simply because the screen is smaller.

Test:

- iPhone Safari
- iPad
- landscape mode
- tap target size
- no accidental zoom
- no awkward scrolling
- HUD readability
- fretboard readability
- all 6 strings visible during gameplay
- bottom/tip-of-pick miss alignment
- Play Again visibility
- wrong-click/noisy-touch handling

Phone-landscape layout principle:

- compact HUD at top
- falling gem stage gets as much vertical runway as possible
- hit line just above fretboard
- fretboard is a wide bottom strip with horizontally accurate fret cells
- string rows can be vertically compressed more than fret columns because non-target-string taps are ignored and active string cue should be clear

## 21. App-Like Web / PWA Polish

Before native wrapper:

- app icon
- manifest
- theme color
- splash/launch feel
- home-screen install behavior if useful
- simple privacy story

## 22. Lightweight Analytics

Current state:

- Vendor-neutral analytics scaffold exists.
- Development console logging works.
- Production is currently no-op unless a future provider is explicitly wired.
- Fluency Score and Fluency label can be included in run-completed analytics payloads.

Core events:

- `app_opened`
- `run_started`
- `run_completed`
- `play_again_clicked`
- `quick_peek_used`
- `practice_strings_changed`
- `note_focus_changed`
- `missed_target`
- `wrong_click`
- `ignored_non_target_string_tap`
- `new_personal_best`

Key metrics:

- runs per session
- Play Again rate
- percent of users who play 3+ runs in one session
- average session length
- Day 1 return
- Day 7 return
- Quick Peek usage
- Note Focus usage
- miss rate
- wrong-click rate on target string
- ignored non-target-string tap rate
- new personal best rate
- Fluency Score distribution
- distribution of Fluency labels
- early-hit / instant-recall trend if tracked

Implementation rule:

Use a thin analytics wrapper/module. Do not scatter vendor calls through components. Keep analytics optional and easy to disable.

Avoid:

- account requirement
- personal data
- ads
- cross-app tracking
- contacts
- precise location
- microphone data

Likely next provider:

- PostHog may be used because of its free tier and product analytics depth.
- If used, keep configuration restrained: explicit events only, no identify calls, no session replay, no autocapture, no feature flags, no surveys, and no console capture.

## 23. Privacy Policy / App Store Privacy Labels

Keep privacy simple:

- no account required
- no ads
- no selling data
- local progress stored on device
- anonymous product analytics only if added

## 24. Capacitor iOS Proof of Concept

Likely native path:

- keep React/Vite app
- wrap with Capacitor
- build in Xcode
- TestFlight
- App Store submission

Do not rewrite in React Native unless the wrapper is inadequate.

Native/mobile escape hatch:

- Keep game rules, scoring, target generation, timing, practice context, weak-spot logic, Fluency Score, and analytics events in pure TypeScript helpers.
- Treat the React/Vite UI as a replaceable rendering layer.
- Isolate haptics, audio detection, analytics SDKs, native storage, and Capacitor/React Native bridges behind adapters.
- If accurate real-time audio detection becomes central, evaluate a native audio spike before committing to long-term architecture.

---

# Habit Loop Roadmap

## 25. Today’s Best

Local-only:

- today’s best
- runs today
- best streak today
- best Fluency today, if useful

No backend.

## 26. Daily Challenge

Simple daily trigger:

- “Today: B string”
- 60 seconds
- beat today’s best

No global leaderboard yet.

## 27. Survival Mode / Endless Run

Later optional mode. Do not build until the 60-second core loop, mobile/touch layout, Fluency Score, and App Store path are stable.

Concept:

- no 60-second timer
- player keeps going until lives run out, or possibly a stricter one-mistake variant later
- speed ramps more noticeably over time and/or after correct streaks
- score can include number correct, best streak, survival time, max speed reached, and Fluency Score
- local bests must be separate from the standard 60-second run

Design guardrails:

- keep the standard 60-second run as the main/default mode
- do not clutter the start screen with mode choices until the core loop is proven
- avoid creating a second scoring system that complicates results too early
- preserve miss reveal as a short teaching beat without making survival feel slow

---

# Far-Future / Exploratory

## 28. Multiple Visible Falling Gems

Only after single-target gameplay is excellent.

Future model:

- `targets[]`
- each target has note, stringIndex, fret, timing/progress, accent
- lowest/next target gets strongest cue
- upcoming targets get lighter cues
- avoid clutter

## 29. Intervals

Possible bridge before chord tones:

- find root
- find third
- find fifth

Useful later, not now.

## 30. Chord Tones / Arpeggio Drop

Very late exploratory idea.

Concept:

- app shows a chord, such as C major
- targets drop one at a time: C, E, G
- user finds each chord tone on selected strings

Important:

- this is arpeggio/chord-tone training, not true chord fingering
- do not require simultaneous multi-touch
- build only if single-note gameplay proves sticky and this still fits standalone Fretboard Drop

---

# Do Not Add Yet

- backend
- auth
- global leaderboard
- payments/IAP
- ads
- social sharing
- teacher mode
- complex curriculum
- true chord-shape trainer
- in-run Help/Peek button
- broad GuitarRise integration
