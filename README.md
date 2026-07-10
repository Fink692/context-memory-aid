# Context

Context is a private relationship-memory app for conferences and professional communities. It helps you prepare for people you already know, recover the context that matters, and save the next useful memory after a conversation.

It is deliberately not an internet identity search product. Every lookup is bounded by a selected event and a relationship record the user chose to save.

## Product capabilities

- Create and switch event-scoped attendee workspaces.
- Add people manually or import a validated CSV with duplicate protection.
- Search and browse a pre-event relationship briefing ordered by who may need a refresher.
- Scan deterministic `context://contact/<contact-id>` QR badges for event-bounded quick matching.
- Review relationship context, conversation prompts, and a confirmed-memory timeline.
- Edit people, delete individual memories, or remove a person and their local matching data.
- Save typed notes without AI or request an editable rules-based/OpenAI draft.
- Use voice transcription only when the API is explicitly running in OpenAI mode.
- Export and restore validated JSON backups on web and native platforms.
- Delete the complete local workspace and return to clean onboarding.

## Architecture

- `apps/mobile` — Expo 57 / React Native app for iOS, Android, and web.
- `apps/api` — Hono API that keeps OpenAI credentials off the client.
- `packages/shared` — Zod contracts, sample records, CSV parsing, and matching primitives.

The production HTTPS API is available at `https://context-memory-api.vercel.app`. Without configuration, it runs in honest deterministic **rules mode**: typed smart drafts work, but voice transcription does not pretend to be real. With an OpenAI key, the server can enable OpenAI transcription and structured draft generation.

## Run on this PC

Requirements: Node.js 22+.

```powershell
npm ci
npm --workspace @context/mobile run web
```

Open `http://localhost:8081`. The client defaults to the deployed HTTPS API, so a local API is optional.

To run the API locally:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
npm run dev:api
```

Then create `apps/mobile/.env`:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:8787
```

## OpenAI mode

Set server-only values in `apps/api/.env` or the Vercel project:

```dotenv
AI_MODE=openai
OPENAI_API_KEY=your_server_side_key
OPENAI_TEXT_MODEL=gpt-5-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

Never put an OpenAI key in `apps/mobile`, an `EXPO_PUBLIC_*` variable, or a client bundle.

## Verification

```powershell
npm run verify
cd apps/mobile
npx expo-doctor
cd ../..
npm --workspace @context/mobile run export:web
```

Coverage includes API validation and CORS, honest rules-mode behavior, event boundaries, CSV edge cases, workspace lifecycle, duplicate imports, memory derivation, local deletion, and the absence of a cloud recognition endpoint.

## Biometric status

The finished event experience uses manual lookup and QR badges. It does not claim to infer identity from camera pixels. Matching primitives and secure native template helpers exist for a future reviewed integration, but no UI creates a face template today.

Before enabling biometric matching, complete every licensing, consent, demographic-performance, preprocessing, threshold, deletion, and native-device gate in [`docs/FACE_MODEL_INTEGRATION.md`](docs/FACE_MODEL_INTEGRATION.md).

## Release and submission materials

- `submission/context-pitch.html` — five-slide pitch.
- `submission/context-teaser.mp4` — short caption-led teaser.
- `submission/screenshots/` — app and pitch frames.
- `submission/context-architecture.svg` — privacy/data-flow diagram.
- `submission/demo-script.md` — two-minute product walkthrough.
- `submission/submission-checklist.md` — release and hardware gates.
