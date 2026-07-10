# Context

Context is a private, offline-first relationship-memory app for conferences and professional communities. It helps you prepare for people you already know, recover useful context, and save the next memory after a conversation.

It is deliberately not an internet identity search product. Every lookup is bounded by a selected event and a relationship record the user chose to save.

## Zero-cost local architecture

The finished app has no hosted backend, paid API, API key, subscription, or usage meter.

- Contacts, events, preferences, and confirmed memories stay in device app storage.
- Typed smart drafts use deterministic TypeScript rules bundled with the app.
- Conversation prompts are derived from the selected local profile.
- Event search and Context QR badge matching run on the device.
- Camera frames are not captured, stored, or uploaded.
- Voice transcription is intentionally omitted so no cloud speech service is required.
- JSON backup export and restore are controlled by the user.
- Optional Update Watch runs as a loopback-only Node process on the user’s PC. It checks only public HTTPS URLs the user confirms, uses no paid API, and keeps every result in a review queue.

The only workspace packages are:

- `apps/mobile` — Expo 57 / React Native app for iOS, Android, and web.
- `packages/shared` — Zod contracts, local drafting rules, sample records, CSV parsing, and matching primitives.

## Product capabilities

- Create and switch event-scoped attendee workspaces.
- Add people manually or import a validated CSV with duplicate protection.
- Search a pre-event relationship briefing ordered by who may need a refresher.
- Scan `context://contact/<contact-id>` QR badges inside the active event boundary.
- Review relationship context, conversation prompts, and a confirmed-memory timeline.
- Search for a known person’s public presence, confirm the exact RSS/page URL, and review monthly public-update suggestions before saving any as memories.
- Edit people, delete individual memories, or remove a person and matching data.
- Save typed notes directly or turn them into editable local drafts.
- Export and restore validated JSON backups on web and native platforms.
- Delete the complete local workspace and return to clean onboarding.

## Run free on this PC

Requirements: Node.js 22+.

```powershell
npm ci
npm run dev:watcher
```

In a second terminal:

```powershell
npm --workspace @context/mobile run web
```

Open `http://localhost:8081`. No `.env`, API key, hosted backend, or paid account is needed. The app’s core relationship features still work if the optional watcher is not running.

The watcher listens only on `127.0.0.1:8789` and stores confirmed source URLs and pending suggestions in `%LOCALAPPDATA%\ContextMemory\update-watch.json`. It never receives camera data, notes, or the rest of the relationship timeline.

Install the catch-up monthly Windows task once:

```powershell
npm run install:update-task
```

It runs at 9:00 AM on the first of each month and starts after the next login if the PC was unavailable. A source is not fetched again until at least 28 days have passed unless the user taps **Check now**.

Update Watch does not bypass login walls, CAPTCHAs, robots policies, or platform restrictions. Direct LinkedIn, X/Twitter, Instagram, Facebook, and TikTok page watching is deliberately unsupported; official RSS/Atom feeds, personal sites, public blogs, company newsrooms, GitHub feeds, and permitted public pages work best. Public search is always user-triggered, and the user must confirm that a URL belongs to the saved person.

## Verification

```powershell
npm run verify
cd apps/mobile
npx expo-doctor
cd ../..
npm --workspace @context/mobile run export:web
```

Coverage includes local draft generation, event boundaries, QR validation, CSV edge cases, workspace lifecycle, duplicate imports, memory derivation, public-update provenance, feed/page parsing, robots rules, private-address rejection, the loopback API, local deletion, and backup contracts.

## Biometric status

The finished event experience uses manual lookup and QR badges. It does not infer identity from camera pixels. Matching primitives and secure native template helpers exist for a future reviewed integration, but no UI creates a face template today.

Before enabling biometric matching, complete every licensing, consent, demographic-performance, preprocessing, threshold, deletion, and native-device gate in [`docs/FACE_MODEL_INTEGRATION.md`](docs/FACE_MODEL_INTEGRATION.md).

## Release and submission materials

- `submission/context-pitch.html` — five-slide local-first pitch.
- `submission/context-teaser.mp4` — short caption-led teaser.
- `submission/screenshots/` — app and pitch frames.
- `submission/context-architecture.svg` — local privacy/data-flow diagram.
- `submission/demo-script.md` — two-minute product walkthrough.
- `submission/submission-checklist.md` — release and hardware gates.
