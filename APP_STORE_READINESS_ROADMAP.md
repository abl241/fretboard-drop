# Fretboard Drop — App Store Readiness Roadmap

This file tracks the minimum legal, support, website, and contact items needed before wrapping Fretboard Drop with Capacitor and submitting to TestFlight/App Store.

Keep this work small. Do not let App Store readiness clutter the core game loop. Gameplay should still feel like a polished arcade fretboard game, not a legal/settings dashboard.

## Product principle

The App Store readiness layer should support launch without weakening first-minute delight.

- Keep legal/support links out of gameplay.
- Keep the start screen focused on starting a run.
- Put required information one tap away in a quiet About/Settings screen.
- Do not add backend, auth, payments, ads, microphone input, or account systems for this task.

## In-app minimum

Add a small About/Settings screen reachable from a quiet gear icon or unobtrusive About link.

Minimum content:

```text
Fretboard Drop
Arcade fretboard practice for guitar.

Version 1.0

Privacy Policy
Support
Terms
Licenses
```

### Required behavior

- `Privacy Policy` opens the public privacy policy URL.
- `Support` opens the public support page or a support email link.
- `Terms` links to Apple standard EULA or a simple terms page if a custom page is created later.
- `Licenses` shows third-party asset/library credits only as needed.

### Design guardrails

- Do not put legal text on the gameplay screen.
- Do not put a long About Us section in the app.
- Do not add a heavy settings dashboard.
- Do not make Start Run less visually dominant.
- Keep the About/Settings screen plain, readable, and boring on purpose.

## Website/domain roadmap

Register a simple domain before App Store submission.

Preferred options:

```text
fretboarddrop.com
fretboarddrop.app
fretboarddropgame.com
```

Preferred contact email:

```text
support@fretboarddrop.com
```

Fallback if needed:

```text
contact@fretboarddrop.com
```

## Minimum public website pages

The website can be extremely small for v1.

### Landing/support page

Suggested URL:

```text
https://fretboarddrop.com
```

Minimum content:

```text
Fretboard Drop

A simple arcade-style fretboard practice game for guitarists.

Practice note recognition by tapping the correct note location before the falling target is missed.

Support:
support@fretboarddrop.com

Privacy Policy
Terms
```

### Privacy page

Suggested URL:

```text
https://fretboarddrop.com/privacy
```

Minimum content for current frontend-only/no-account version:

```text
Privacy Policy

Fretboard Drop does not collect personal information.

The app may store game settings, scores, and progress locally on your device. This information is not sent to us.

The app does not require an account.

The app does not use microphone, camera, contacts, location, or health data.

The app does not sell personal data.

For support, contact: support@fretboarddrop.com
```

Important: update this policy and App Store privacy labels if analytics, crash reporting, subscriptions, accounts, cloud sync, ads, push notifications, or any third-party SDKs are added.

### Support page

Suggested URL:

```text
https://fretboarddrop.com/support
```

Minimum content:

```text
Support

For help with Fretboard Drop, contact:

support@fretboarddrop.com

Please include your device model, iOS version, and a brief description of the issue.
```

### Terms page

For v1, use Apple standard EULA unless there is a specific reason to create custom terms.

If a simple custom terms page is later needed, keep it short and app-specific.

### Licenses page

Only add visible credits where required by third-party assets, fonts, icons, sounds, or libraries.

If all visual/audio assets are owned or properly licensed without required attribution, this can remain minimal.

## Placement in roadmap

This should happen after the game feels good enough to test on mobile, not before core gameplay polish.

Recommended order:

1. Finish core gameplay polish.
2. Finish Results / Play Again / one-more-run loop.
3. Finish mobile landscape layout polish.
4. Add or finalize the polished transparent pick/gem visual.
5. Add this minimal About/Settings screen and public links.
6. Register domain and create minimum website/privacy/support pages.
7. Wrap with Capacitor.
8. Test on real iPhone.
9. Use TestFlight.
10. Submit to App Store.

## Do not add yet

- backend
- auth
- database
- global leaderboard
- ads
- payments/IAP
- social sharing
- microphone/audio detection
- account creation
- long legal screens
- prominent About Us marketing copy inside the app
