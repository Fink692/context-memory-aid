# Security and privacy notes

Context processes personal relationship notes and is designed around explicit local data boundaries. It has no application backend or paid API integration.

## Data inventory

| Data | Location | Retention |
| --- | --- | --- |
| Contacts, events, preferences, confirmed memories | Device app storage | Until the user deletes, restores, or resets the workspace |
| Local draft input and suggestions | In app memory while editing | Input is saved only after confirmation; discarded drafts are not persisted |
| QR badge identifiers | Camera stream and in-memory comparison | Not stored by the scanner |
| Face embeddings | No current UI creates them; native secure-storage helper is gated | Until person/all-data deletion if a reviewed model is integrated |
| Camera frames | Camera preview only | Not captured or uploaded by the QR flow |
| JSON backups | User-selected file destination | Controlled by the user outside the app |

Android backup is disabled. Local smart tools are optional. Imported contacts have quick matching disabled by default. Manual notes work with no network connection.

## Network boundary

Core app features make no remote API requests. Local file import may read a browser-provided `blob:` URL through the platform fetch interface; that does not contact a remote server.

Development and distribution tools may access npm, Expo, or an app store to install dependencies or distribute a build. That tooling is separate from relationship-data processing at runtime.

## Explicitly unsupported

- Internet or stranger identification.
- Continuous/background camera scanning.
- Location tracking or proximity inference.
- Cloud face matching.
- Cloud note processing or speech transcription.
- Silent memory writes.
- Client-side service credentials.

## Implemented controls

- Event-scoped candidate filtering and opt-in per-person QR matching.
- QR-only camera flow with no still-photo capture.
- Strict Zod schemas and bounded import/backup sizes.
- Human confirmation before local drafts enter the timeline.
- Accessible confirmation dialogs for destructive actions.
- Validated backup restore and complete local deletion.
- SecureStore/Keychain template storage on supported native platforms only.

## Future release gates

- Add encrypted structured local storage if relationship notes require protection beyond the app sandbox.
- Run native iOS/Android security, permission, backup, and deletion tests on signed builds.
- Publish a formal privacy notice before external distribution.
- Keep biometric matching disabled until every gate in `docs/FACE_MODEL_INTEGRATION.md` passes.

## Dependency audit

`npm audit --omit=dev` currently reports moderate advisories in the Expo build/configuration toolchain. There are no high or critical findings. The automated force-fix would downgrade Expo across major SDK versions and is not safe to apply; recheck when Expo publishes compatible patched transitive dependencies.
