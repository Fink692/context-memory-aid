# Contributing to Context

Thank you for helping improve Context. Privacy, user control, and reliable offline behavior are product requirements, not optional enhancements.

## Development setup

1. Install the Node.js version recorded in `.nvmrc`.
2. Run `npm ci` from the repository root.
3. Run `npm run verify` before making changes.
4. Start the Expo app with `npm run dev:mobile`.

Native iOS work requires Xcode 26.4 or newer. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the complete environment and build instructions.

## Repository structure

- `apps/mobile`: Expo and React Native application
- `apps/desktop-macos`: native macOS wrapper for the production web export
- `packages/shared`: platform-independent contracts and business logic
- `tools`: optional local services and their tests
- `docs`: architecture, deployment, and release guidance

Keep platform-independent behavior in `packages/shared` when practical. Keep native modules narrow, explicit, and paired with a TypeScript boundary.

## Privacy requirements

Changes must preserve these boundaries:

- Relationship data must not be sent to a hosted service.
- Camera and microphone access must require a deliberate, visible user action.
- Generated, imported, or received records must be reviewed before they are saved.
- Shared contact cards must not contain memories, notes, events, photos, or internal identifiers.
- Public-source requests must use a URL the user confirmed and must respect network safety and access restrictions.
- Destructive actions must be explicit and confirmed.

Update [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md), and the release checklist when a change affects permissions, storage, retention, networking, or third-party code.

## Quality checks

Run the standard checks from the repository root:

```bash
npm ci
npm audit --audit-level=high
npm run verify
cd apps/mobile
npx expo-doctor
npx expo install --check
npm run export:web -- --clear
npm run export:ios -- --clear
```

Native changes should also pass a clean generated-project check:

```bash
cd apps/mobile
CI=1 npx expo prebuild --platform ios --clean --no-install
```

Add or update tests for behavior changes. Test invalid, duplicated, unavailable, denied-permission, and cancellation paths when they apply.

## Pull requests

Keep pull requests focused and explain:

- What changed and why
- Which privacy or platform boundaries are affected
- What users will notice
- Which checks were run
- What still requires physical-device or release testing

Do not commit environment files, signing credentials, exported relationship data, model artifacts, generated build products, or user-specific Xcode state.
