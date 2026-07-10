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

The only workspace packages are:

- `apps/mobile` — Expo 57 / React Native app for iOS, Android, and web.
- `packages/shared` — Zod contracts, local drafting rules, sample records, CSV parsing, and matching primitives.

## Product capabilities

- Create and switch event-scoped attendee workspaces.
- Add people manually or import a validated CSV with duplicate protection.
- Search a pre-event relationship briefing ordered by who may need a refresher.
- Scan `context://contact/<contact-id>` QR badges inside the active event boundary.
- Review relationship context, conversation prompts, and a confirmed-memory timeline.
- Edit people, delete individual memories, or remove a person and matching data.
- Save typed notes directly or turn them into editable local drafts.
- Export and restore validated JSON backups on web and native platforms.
- Delete the complete local workspace and return to clean onboarding.

## Run free on this PC

Requirements: Node.js 22+.

```powershell
npm ci
npm --workspace @context/mobile run web
```

Open `http://localhost:8081`. No second server or `.env` file is needed.

The Expo development server serves the app from this computer. Relationship features continue to use only local app storage and bundled code.

## Verification

```powershell
npm run verify
cd apps/mobile
npx expo-doctor
cd ../..
npm --workspace @context/mobile run export:web
```

Coverage includes local draft generation, event boundaries, QR validation, CSV edge cases, workspace lifecycle, duplicate imports, memory derivation, local deletion, and backup contracts.

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
