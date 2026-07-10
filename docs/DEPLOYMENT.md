# Deployment runbook

## API on Vercel

The repository root is the Vercel project root. `vercel.json` packages the Hono adapter at `apps/api/api/index.ts` and routes every request to it.

Deploy deterministic demo mode:

```powershell
npm run deploy:api
```

Deploy with OpenAI enabled by setting these server-only Vercel environment variables and redeploying:

```text
OPENAI_API_KEY
AI_DEMO_MODE=false
OPENAI_TEXT_MODEL=gpt-5-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
ALLOWED_ORIGINS=https://your-web-preview.example
```

Never create an `EXPO_PUBLIC_OPENAI_API_KEY` variable. The mobile app receives only the public HTTPS API URL.

Production demo API: `https://context-memory-api.vercel.app`

Validate a deployment:

```powershell
Invoke-RestMethod https://context-memory-api.vercel.app/health
```

The response must be `{ "ok": true, "aiMode": "demo" }` or `{ "ok": true, "aiMode": "openai" }`.

## Expo preview build

The `preview` profile in `apps/mobile/eas.json` creates an internally distributed Android APK and an iOS ad hoc build. The `preview-simulator` profile creates an iOS Simulator build.

Prerequisites:

1. Sign in with `npx eas-cli login`.
2. Run `npx eas-cli init` once inside `apps/mobile` to attach the Expo project ID.
3. Create the EAS `preview` environment variable `EXPO_PUBLIC_API_URL` using the deployed HTTPS API URL.
4. For iOS hardware, register the device with `npx eas-cli device:create` before building.

Build commands:

```powershell
cd apps/mobile
npm run build:preview:android
npm run build:preview:ios
```

## Release gates

- `npm run verify`
- `npx expo-doctor` from `apps/mobile`
- `npm --workspace @context/mobile run export:web`
- Public `/health` responds over HTTPS.
- Preview app reaches `/health`, transcribes a note, and saves a confirmed draft.
- Unknown/demo target returns a no-match state.
- Delete person and Delete all data remove the expected local data.
