# Deployment runbook

## API on Vercel

The repository root is the Vercel project root. `vercel.json` packages the Hono adapter at `apps/api/api/index.ts` and routes requests to it.

Rules mode requires no secret and never fakes transcription:

```dotenv
AI_MODE=rules
ALLOWED_ORIGINS=http://localhost:8081,https://your-web-app.example
```

OpenAI mode requires server-only credentials:

```dotenv
AI_MODE=openai
OPENAI_API_KEY=your_server_side_key
OPENAI_TEXT_MODEL=gpt-5-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
ALLOWED_ORIGINS=http://localhost:8081,https://your-web-app.example
```

Deploy and validate:

```powershell
npm run deploy:api
Invoke-RestMethod https://context-memory-api.vercel.app/health
```

The response must report `aiMode` as `rules` or `openai`. Never create an `EXPO_PUBLIC_OPENAI_API_KEY` variable.

## Expo preview build

`apps/mobile/eas.json` contains internal-distribution profiles and points previews to the deployed HTTPS API.

```powershell
cd apps/mobile
npx eas-cli login
npx eas-cli init
npx eas-cli device:create
npm run build:preview:ios
```

Android:

```powershell
cd apps/mobile
npm run build:preview:android
```

Commit the Expo project ID added by `eas init` before building because `cli.requireCommit` is enabled.

## Release gates

- `npm run verify`
- `cd apps/mobile; npx expo-doctor`
- `npm --workspace @context/mobile run export:web`
- Public `/health` responds over HTTPS.
- Manual typed note saves with smart tools off.
- Rules-mode draft is editable and requires confirmation.
- OpenAI-mode transcription is tested only when a real key is configured.
- Event creation, switching, import, duplicate handling, and removal pass.
- Backup export/restore, person deletion, memory deletion, and delete-all pass.
- Camera and microphone permissions plus lifecycle cleanup pass on signed physical-device builds.
