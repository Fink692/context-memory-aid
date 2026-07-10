# Local build and distribution runbook

Context has no hosted backend deployment. Relationship data stays local, and optional AI assistance runs through Ollama on the same PC.

## PC web build

```powershell
npm ci
ollama pull qwen3:4b
npm run dev:watcher
```

In a second terminal:

```powershell
npm --workspace @context/mobile run web
```

Open `http://localhost:8081`.

The PC service is optional for manual app use and required for local-model assistance and **Update Watch**. It binds to PC loopback, calls Ollama only on `127.0.0.1:11434`, and makes the current implementation a PC-web companion rather than an iPhone-to-PC service.

Register the free monthly check:

```powershell
npm run install:update-task
```

Verify it with `schtasks.exe /Query /TN "Context Monthly Update Watch" /V /FO LIST`. Run a due check manually with `npm run check:updates`; use the in-app **Check now** button to override the 28-day interval.

Create a production web bundle:

```powershell
npm --workspace @context/mobile run export:web
```

The output is written to `apps/mobile/dist`. It can be served by any static file server; no server functions or secrets are required.

## Native preview builds

Expo development builds can run over the local network. EAS profiles remain available as an optional distribution path, but the app itself requires no runtime service account or environment variable.

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

Apple may require its own developer membership for installation/distribution on physical iPhones. That is an Apple platform requirement, not a Context API cost. PC web use is free.

## Release gates

- `npm run verify`
- `cd apps/mobile; npx expo-doctor`
- `npm --workspace @context/mobile run export:web`
- Run core relationship features with the computer disconnected from the internet after initial dependency installation; Update Watch should report source network errors without affecting local memories.
- Local draft and conversation-prompt generation work after disconnecting the PC from the internet, provided Ollama, `qwen3:4b`, and the loopback service are running.
- Manual typed note saves with local tools off.
- Event creation, switching, import, duplicate handling, and removal pass.
- Backup export/restore, person deletion, memory deletion, and delete-all pass.
- Camera permission and lifecycle cleanup pass on signed physical-device builds.
- Confirmed-source creation, robots/platform error display, monthly task registration, suggestion approval, and dismissal pass on PC web.
