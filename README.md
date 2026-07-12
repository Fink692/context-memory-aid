# Context

Context is a private, offline-first relationship-memory app for everyday life. It helps you remember people from work, school, your neighborhood, local shops, travel, community groups, and events, recover useful context, and save what matters after a conversation.

It is deliberately not an internet identity-search product. Every lookup starts from a relationship record the user chose to save; events are an optional way to organize people, not a requirement.

## Native-first architecture

The iOS and Android app has no hosted backend, paid API, API key, subscription, or usage meter.

- Contacts, events, preferences, and confirmed memories stay in the platform app sandbox.
- iPhone Contacts import is optional and review-first. For the people the user chooses, it can copy names, companies, job titles, and available phone numbers, email addresses, social profiles, and profile thumbnails. It never copies Contacts notes, birthdays, or postal addresses, and it never modifies the system address book.
- On iOS, person field filling, people-list PDF extraction, smart memory drafts, and conversation prompts can optionally use Gemma 4 E2B IT through LiteRT-LM 0.14.0. Model inference stays on the iPhone; deterministic TypeScript assistance remains available for supported tasks when the model is disabled, absent, or unable to run. The user reviews every generated or extracted record before it is saved.
- Event search and Context QR badge creation and matching run on the device.
- The camera is opened only for deliberate QR scanning. Frames are not captured, stored, or uploaded.
- On iPhone, a single person-description dictation can be turned by local Gemma into editable profile fields; memory notes also support deliberate on-device dictation. The microphone runs only while the visible Dictate control is active, and audio is never saved or uploaded.
- An optional Face ID or device-authentication lock protects access to the app. Context receives only the operating system's success or failure result, never biometric data.
- Native Update Watch runs only in the foreground. It checks a public HTTPS source the user confirmed and keeps results in a review queue; it does not silently run in the background.
- JSON backup export and restore are controlled by the user.

The optional PC web experience can add `qwen3:4b` assistance through a loopback-only Ollama runtime and scheduled Update Watch checks. That enhancement is not required by the native app and is never contacted by an iPhone.

The workspace packages are:

- `apps/mobile` — Expo 57 / React Native app for iOS, Android, and web.
- `packages/shared` — Zod contracts, deterministic assistance, sample records, CSV parsing, and matching primitives.

## Product capabilities

- Maintain one private People directory with optional phone, email, social links, profile photos, relationship context, and event-scoped attendee lists.
- Add anyone you meet without creating an event, or optionally organize saved people into work, school, community, travel, and event lists.
- Add people manually, describe one person by voice for reviewable local-Gemma field filling, choose people from iPhone Contacts, or import a validated CSV or people-list PDF with duplicate protection.
- Search an everyday relationship refresher or a pre-event briefing ordered by who may need context.
- Create and scan scoped Context QR badges without sending identifiers to a server.
- Review relationship context, conversation prompts, and a confirmed-memory timeline.
- Confirm a known person's public RSS/page URL, check it while the app is open, and approve suggestions before saving them as memories.
- Edit people, delete individual memories, or remove a person and matching data.
- Speak or type notes, then save them directly or turn them into editable on-device drafts.
- Export and restore validated JSON backups.
- Delete the complete local workspace and return to clean onboarding.

## Run the iOS app

Requirements:

- Node.js 22.13 or newer.
- macOS with Xcode 26.4 or newer selected through `xcode-select`.
- An iOS 16.4-or-newer simulator or device.
- An Apple Account for a Personal Team physical-device build; paid Apple Developer Program membership for TestFlight or App Store distribution.

```bash
npm ci
npm run verify
cd apps/mobile
npx expo-doctor
npx expo install --check
npm run ios:native
```

`expo run:ios` generates the native project from `app.json`; the repository uses Expo Continuous Native Generation rather than treating a generated `ios` directory as source configuration. A clean prebuild does not preserve a developer's signing team, so reselect the intended Team in Xcode before each signed device build. QR scanning and on-device dictation need a physical device for final permission and audio-route testing. The remaining native features work without a PC companion or environment file.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for simulator, signed-device, EAS, and App Store commands and [`docs/IOS_RELEASE_CHECKLIST.md`](docs/IOS_RELEASE_CHECKLIST.md) for release gates.

## Optional on-device Gemma 4

The iOS settings screen can download Google's [Gemma 4 E2B IT LiteRT-LM model](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm) over Wi-Fi. The artifact is 2,588,147,712 bytes (about 2.59 GB), and Context recommends about 4.6 GB of free space for the model and optimized runtime cache. It is verified before use with SHA-256 `181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c`.

Prompts and generated text stay inside the app process. The only app-managed AI-model network boundary is the deliberate model-file download; Context does not attach contacts, memories, events, or prompts to that request. Apple may separately prepare a system speech-language asset after the user taps Dictate, without Context attaching audio, transcripts, or relationship data. The downloaded Gemma artifact and its cache are excluded from iOS device backups and can be removed independently of relationship data. If the model is not ready, Context uses its deterministic on-device fallback instead.

The native integration vendors Google's unmodified [LiteRT-LM 0.14.0](https://github.com/google-ai-edge/LiteRT-LM/tree/v0.14.0) Swift wrapper as a small local package and pins the official iOS XCFramework release asset by SHA-256. This avoids cloning the upstream repository's large history during a clean Xcode build. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for model, runtime, and Apache-2.0 notices.

## Optional PC web enhancement

The web app can use the free local watcher and Ollama service on the same PC. This path is optional and does not change the native release boundary.

```powershell
npm ci
ollama pull qwen3:4b
npm run dev:watcher
```

In a second terminal:

```powershell
npm --workspace @context/mobile run web
```

Open `http://localhost:8081`. The service listens only on `127.0.0.1:8789`, sends bounded model input to Ollama on `127.0.0.1:11434`, and does not write AI prompts or output to the watcher data file.

An optional Windows catch-up task can check confirmed public sources monthly:

```powershell
npm run install:update-task
```

Update Watch does not bypass authentication, CAPTCHAs, robots policies, or platform restrictions. Direct LinkedIn, X, Instagram, Facebook, and TikTok page watching is unsupported. Official RSS/Atom feeds, personal sites, public blogs, company newsrooms, GitHub feeds, and permitted public pages work best.

## Verification

```bash
npm ci
npm run verify
cd apps/mobile
npx expo-doctor
npx expo install --check
npm run export:ios -- --clear
npm run export:web -- --clear
CI=1 npx expo prebuild --platform ios --clean --no-install
```

CI repeats the clean install and test suite on Linux and macOS. The macOS job also exports an iOS Hermes bundle, generates the unsigned native project, validates the privacy manifest, and asserts the exact camera, Contacts, Face ID, microphone, and speech-recognition purpose strings.

## Biometrics and recognition

Face ID is used only as an optional local app lock. Context receives an authentication result from iOS and does not receive or store a face image or Face ID template.

The event experience uses manual lookup and QR badges. It does not infer identity from camera pixels. Matching primitives and secure native template helpers remain gated for possible future research; no released UI enrolls a face. Before enabling biometric identity matching, complete every gate in [`docs/FACE_MODEL_INTEGRATION.md`](docs/FACE_MODEL_INTEGRATION.md).

## Privacy and release materials

- [`PRIVACY.md`](PRIVACY.md) — data handling, permissions, retention, and user choices.
- [`SECURITY.md`](SECURITY.md) — security boundaries and responsible reporting notes.
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) — third-party runtime and model notices.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — native build and distribution runbook.
- [`docs/IOS_RELEASE_CHECKLIST.md`](docs/IOS_RELEASE_CHECKLIST.md) — TestFlight and App Store release checklist.
- `submission/` — pitch, demo, architecture, screenshots, and submission materials.
