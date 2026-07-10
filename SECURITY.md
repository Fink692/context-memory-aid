# Security and privacy notes

Context processes personal relationship notes and is designed around explicit, narrow data boundaries. This document describes the implemented behavior; it is not a legal-compliance certification.

## Data inventory

| Data | Location | Retention |
| --- | --- | --- |
| Contacts, events, preferences, confirmed memories | Device app storage | Until the user deletes, restores, or resets the workspace |
| QR badge identifiers | Camera stream and in-memory comparison | Not stored by the scanner |
| Face embeddings | No current UI creates them; native secure-storage helper is gated | Until person/all-data deletion if a reviewed model is integrated |
| Camera frames | Camera preview only | Not captured or uploaded by the QR flow |
| Audio recordings | Device cache | Deleted immediately after the transcription attempt |
| Raw note/transcript | In-memory UI and API request | Not persisted by the app or API |
| Selected contact context | API request after explicit smart-draft action | Not persisted by this API; provider controls still apply in OpenAI mode |
| Other contacts and matching data | Never sent to the memory API | Not applicable |

Android backup is disabled. Smart tools are optional. Imported contacts have quick matching disabled by default. Manual notes remain functional without the API.

## Explicitly unsupported

- Stranger identification or internet identity search.
- Continuous/background camera scanning.
- Location tracking or proximity inference.
- Cloud face matching.
- Silent memory writes.
- Fake voice transcription in rules mode.
- Client-side OpenAI credentials.
- Web storage of biometric templates.

## Implemented controls

- Event-scoped candidate filtering and opt-in per-person quick matching.
- QR-only camera flow with no still-photo capture.
- Strict Zod schemas and bounded request sizes.
- Server-side secure headers, CORS allowlist, and per-address rate limiting.
- API timeouts and user-visible failures at the action surface.
- Human confirmation before structured drafts enter the timeline.
- Accessible confirmation dialogs for destructive actions.
- Validated backup restore and complete local deletion.
- SecureStore/Keychain template storage on supported native platforms only.

## Release gates

- Add authenticated API sessions and distributed rate limiting before a multi-user public launch.
- Review OpenAI project data controls and retention settings for the target jurisdiction.
- Add encrypted structured local storage if relationship notes require protection beyond the app sandbox.
- Run native iOS/Android security, permission, backup, and deletion tests on signed builds.
- Publish a formal privacy notice and data-processing inventory before external distribution.
- Keep biometric matching disabled until every gate in `docs/FACE_MODEL_INTEGRATION.md` passes.

## Dependency audit

`npm audit --omit=dev` currently reports moderate advisories in the Expo build/configuration toolchain through the transitive `xcode -> uuid` dependency. There are no high or critical findings. The automated force-fix would downgrade Expo across major SDK versions and is not safe to apply; recheck when Expo publishes compatible patched transitive dependencies.
