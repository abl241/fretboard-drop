# Agent Instructions for Fretboard Drop

This document is the standing instruction guide for future Codex work on the standalone Fretboard Drop app.

## Project Scope

- Work only inside `artifacts/fretboard-drop` unless explicitly instructed otherwise.
- Do not modify GuitarRise, Transcribe, Rhythm Lab, SongCue, auth, backend, shared packages, or unrelated projects.
- Keep Fretboard Drop independent from the larger GuitarRise/Guitar Guru app.

## Product Vision

Fretboard Drop is a standalone arcade-style fretboard fluency game.

The goal is to make fretboard memorization addictive:

- Optimize for "one more run."
- Make the first minute feel magical.
- Preserve the feel of a simple, instantly understandable game loop.
- Favor fluency, recall, and replayability over feature count.

## Design Principles

Jobs:

- Focus
- Taste
- Simplicity
- Emotional clarity

Krug:

- Do not make the user think.
- Make the next action obvious.
- Make the start fast.

Tufte:

- High signal.
- Low clutter.
- Data over decoration.

Eyal:

- Trigger
- Action
- Variable reward
- Investment

## Technical Principles

Before major implementation, identify:

- the root problem;
- whether the change is a small patch, a simpler refactor, or a robust architecture move;
- the smallest reliable solution that solves the root problem.

Prefer:

- small, scoped changes;
- pure helpers for game rules, scoring, persistence, analytics payloads, and progress calculations;
- local rendering changes that do not disturb core game logic;
- clear boundaries that make later extraction or database/API replacement possible.

Avoid broad refactors unless they clearly reduce risk or unlock the requested work.

## Testing Rules

Run only:

- `pnpm --filter @workspace/fretboard-drop typecheck`
- `pnpm --filter @workspace/fretboard-drop test`
- `pnpm --filter @workspace/fretboard-drop build`

Do not run:

- Playwright;
- browser automation;
- screenshot testing.

## Persistence Rules

Prefer:

- localStorage first;
- versioned schemas;
- repository boundaries;
- JSON-safe, portable data shapes;
- future database portability without committing to backend work early.

Do not add backend, auth, database, sync, or global leaderboard behavior unless explicitly requested.

## Analytics Principles

- Collect evidence first.
- Avoid premature dashboards.
- Avoid unnecessary events.
- Keep analytics behind adapter boundaries.
- Do not collect sensitive personal data, audio, precise location, exact click coordinates, full target sequences, or per-target event streams unless explicitly approved.

## Mobile Principles

- Phone landscape must remain usable.
- Preserve a wide, tappable fretboard.
- Avoid clutter.
- Keep the active run readable.
- Preserve the primary Play Again flow.

## Prompt Response Format

Before coding, briefly state:

- root problem;
- likely files;
- minimal plan.

After coding, summarize:

- files changed;
- what changed;
- preserved behavior;
- validation results.
