# Context

Context is a privacy-bounded relationship memory aid for conference networking. It helps a user recall people they already saved, presents a compact relationship refresher, and turns a dictated post-conversation update into an editable timeline memory.

This repository is a hackathon-ready monorepo:

- `apps/mobile`: Expo 57 / React Native application.
- `apps/api`: Hono server that keeps OpenAI credentials off the phone.
- `packages/shared`: Zod contracts, seeded demo data, CSV parsing, and matching rules.

## What works

- Explicit privacy onboarding and OpenAI data-sharing opt-in.
- Seeded fictional event and relationship profiles.
- Manual CSV attendee import with preview, validation, and recognition off by default.
- Event-scoped recognition candidate filtering.
- One-shot camera capture with immediate cache deletion.
- Deterministic QR fallback using `context://contact/<contact-id>`.
- Clearly labeled hackathon camera-match adapter with matched, no-match, and safe failure states.
- Relationship refresher card, timeline, conversation prompts, and per-contact recognition controls.
- Voice recording or typed note, server-side transcription, strict memory extraction, edit, and confirmation.
- Local JSON export, contact deletion, secure template deletion, and full local-data deletion.
- Server-side input limits, schema validation, secure headers, CORS allowlist, and basic rate limiting.

## Run locally

Requirements: Node.js 22+ and a phone/emulator supported by Expo SDK 57.

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/mobile/.env.example apps/mobile/.env
npm run dev:api
```

In a second terminal:

```powershell
npm run dev:mobile
```

The API defaults to deterministic demo mode, so an OpenAI key is not needed for the judged flow. The checked-in mobile environment example uses the deployed HTTPS demo API at `https://context-memory-api.vercel.app`. To use a local API from a physical phone instead, set `EXPO_PUBLIC_API_URL` to the computer's private LAN address, such as `http://192.168.1.20:8787`. Plain HTTP private-LAN URLs are accepted only in development.

To use OpenAI, set these values in `apps/api/.env`:

```dotenv
OPENAI_API_KEY=your_server_side_key
AI_DEMO_MODE=false
OPENAI_TEXT_MODEL=gpt-5-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

The API key must never be placed in `apps/mobile/.env` or any `EXPO_PUBLIC_*` variable.

Public demo API health: `https://context-memory-api.vercel.app/health`

## Two-minute demo

1. On first launch, explain the three privacy promises and explicitly enable OpenAI memory intelligence.
2. Open the seeded “OpenAI Memory Hack Night” event and tap **Start memory assist**.
3. Keep the visible demo target on Jordan, point the camera at the teammate, and tap **Capture and check locally**.
4. Show Jordan's “Met,” “Last spoke,” “Last discussed,” recent update, and suggested conversation topics.
5. Tap **Add memory**, dictate: “Jordan accepted a new job in New York and is looking for AI engineers,” then review and confirm the structured draft.
6. Return to memory assist, choose **Unknown**, and show the safe no-match state.
7. Optional deterministic fallback: display a QR code containing `context://contact/jordan-patel`.

Sample import data is available at `demo/demo-attendees.csv`.

## Face-matcher status

The product and data boundaries are implemented, but this repository intentionally does not bundle an unreviewed biometric model or imply that face detection is identity recognition. The camera screen's fallback is visibly labeled “Demo adapter.”

The matching core already supports candidate filtering, cosine similarity, thresholds, ambiguity margins, and secure per-contact template storage. To claim real face recognition, complete the reviewed model integration described in `docs/FACE_MODEL_INTEGRATION.md` and pass all acceptance checks there.

## Verification

```powershell
npm run verify
npm --workspace @context/mobile run export:web
```

The test suites cover event boundaries, no-match and ambiguous results, CSV validation, API input validation, structured demo extraction, and confirmation that no cloud recognition endpoint exists.

## Submission package

- `submission/context-pitch.html` — five-slide, keyboard/touch-navigable judge deck.
- `submission/context-teaser.mp4` — verified 74.8-second caption-led teaser.
- `submission/screenshots/` — rendered pitch frames and 430×932 mobile UI captures.
- `submission/context-architecture.svg` — standalone privacy/data-flow diagram.
- `submission/demo-script.md` — two-minute stage talk track, fallback, and truthful Q&A.
- `submission/submission-checklist.md` — completion state and credential/hardware gates.
