# Local build and distribution runbook

Context has no backend deployment. The app bundles its drafting rules and stores relationship data locally.

## PC web build

```powershell
npm ci
npm --workspace @context/mobile run web
```

Open `http://localhost:8081`.

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
- Run the web app with the computer disconnected from the internet after initial dependency installation.
- Local draft and conversation-prompt generation work offline.
- Manual typed note saves with local tools off.
- Event creation, switching, import, duplicate handling, and removal pass.
- Backup export/restore, person deletion, memory deletion, and delete-all pass.
- Camera permission and lifecycle cleanup pass on signed physical-device builds.
