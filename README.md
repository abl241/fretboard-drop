# Fretboard Drop

Fretboard Drop is a standalone React/Vite frontend app for fast guitar fretboard recall practice.

This is a frontend-only MVP:

- Progress is local only, using `localStorage` for personal best score.
- There is no backend, auth, database, leaderboard, billing, microphone input, or audio detection.
- The app opens directly into Fretboard Drop and does not depend on the GuitarRise Learn Fretboard page.
- This repo is the standalone Fretboard Drop app.

## Product principles

- Make boring fretboard memorization feel like a simple, addictive arcade game.
- Prioritize first-minute delight, visual clarity, quick replay, and “one more run.”
- Follow Jobs principles: tasteful polish, emotional clarity, focus, and fewer things done better.
- Follow Tufte principles: high signal, low noise, clear hierarchy, and useful visual information without decorative clutter.
- Follow Krug principles: obvious next action, fast start, minimal instructions, and do not make the player think.
- Follow Eyal principles ethically: quick trigger, simple action, satisfying variable reward, and local investment through personal improvement.
- Judge changes by whether the first minute feels magical and whether the player wants another run.

## Technical principles

- Minimize tech debt by keeping changes small, scoped, and easy to reason about.
- Keep game state, timing, scoring, target generation, progress persistence, and rendering logic cleanly separated where possible.
- Prefer the simplest reliable frontend-only solution before adding new architecture.
- Do not add backend, auth, database, global leaderboard, billing, microphone input, audio detection, or cross-app dependencies until the core loop is proven.

## Mobile/native escape hatch

Use the current React/Vite app to prove the Fretboard Drop game loop first, but keep future native options open.

- Keep game rules, scoring, target generation, timing calculations, practice context, weak-spot logic, and analytics event definitions in pure TypeScript helpers that do not depend on DOM, CSS, browser events, or React component structure.
- Treat the current React/Vite UI as a replaceable rendering layer.
- Avoid putting core game rules directly inside JSX or CSS animations.
- Isolate future platform-specific behavior, such as haptics, audio detection, analytics SDKs, native storage, or Capacitor/React Native bridges, behind small adapter modules.
- If accurate real-time audio detection becomes central to the product, evaluate a native audio spike before committing to a long-term mobile architecture.

## Roadmap and tweaks

Future polish notes, roadmap decisions, design guardrails, and later mode ideas such as Survival Mode are tracked in [TWEAKS_AND_ROADMAP.md](./TWEAKS_AND_ROADMAP.md).

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm ios:open`
