# Security and privacy notes

Context processes personal relationship notes and is designed around explicit local data boundaries. It has no application backend or paid API integration.

## Data inventory

| Data | Location | Retention |
| --- | --- | --- |
| People and profile details, events, preferences, confirmed memories | Device app storage | Until the user deletes, restores, or resets the workspace |
| Selected system-contact fields and local source links | Contacts framework during an explicit import; device app storage after confirmation | Review only until import; copied name/company/role and available phone/email/social/profile-thumbnail details until deletion; device source links are excluded from JSON exports and Gemma prompts |
| User-selected profile photos | Private app storage after system photo-picker confirmation; selected Contacts thumbnails may remain local URI references | Until the photo, person, or workspace is removed; a Contacts thumbnail can also become unavailable if its underlying local asset changes |
| User-selected CSV/PDF/JSON files | Files provider and temporary app cache during explicit parsing | Controlled by the source provider and platform cache policy; parsed records follow the workspace retention policy |
| Smart-draft input and suggestions | Transient app/model memory on native; optional transient app/service/Ollama memory on PC web | Input becomes a saved memory only after confirmation; neither native inference nor the PC helper writes prompts or raw model output to its data file |
| Optional Gemma 4 E2B IT model and optimized cache | iOS app-managed storage, excluded from device backup | Until the user deletes the model or uninstalls the app; never included in JSON relationship backups |
| Random QR badge credentials | Device workspace plus camera stream during a scan | Until the person, badge, or workspace is replaced/deleted; not stored by the scanner |
| Face embeddings | No current UI creates them; native secure-storage helper is gated | Until person/all-data deletion if a reviewed model is integrated |
| Camera frames | Camera preview only | Not captured or uploaded by the QR flow |
| Dictation audio and live transcript | Transient iOS audio/Speech framework and active form state | Audio is never written or uploaded; cancelled text is discarded; confirmed text follows the person or memory retention policy |
| JSON backups | User-selected file destination | Controlled by the user outside the app |
| Confirmed public source URLs and pending update suggestions | Native app storage; optional `%LOCALAPPDATA%\ContextMemory\update-watch.json` for PC web | Until the source/suggestion, person, or workspace is removed |

Android backup is disabled. iOS/Finder/iCloud backups of relationship records follow the user's Apple settings, while the downloaded Gemma model and its generated cache are explicitly excluded from iOS backups. Exported JSON is unencrypted and excludes device-specific system-contact links. Native smart assistance is on-device and imported contacts have quick matching disabled by default. No native feature requires a PC service.

## Network boundary

Core relationship, event, badge, dictation, and native smart-assistance processing makes no developer-operated remote API request. On iOS, users may deliberately download the optional Gemma 4 E2B IT artifact from Hugging Face over Wi-Fi. That 2,588,147,712-byte file is the only app-managed AI-model network boundary: Context sends no contacts, memories, events, prompts, or generated text with the request. The app requires about 4.6 GB of available space, verifies SHA-256 `181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c`, and accepts the artifact only after the size and digest match. The [model card](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm), pinned [LiteRT-LM 0.14.0 runtime](https://github.com/google-ai-edge/LiteRT-LM/tree/v0.14.0), and license notices are recorded in `THIRD_PARTY_NOTICES.md`. Apple may separately fetch a system-managed speech-language asset after the user taps Dictate; no audio, transcript, or relationship record is attached by Context.

Native inference runs in the app process. Prompt construction sends bounded task-specific context, treats saved text and selected document text as untrusted input, requires structured output, rejects malformed output, and never participates in QR identity matching or operating-system biometric decisions. Deterministic on-device rules remain available when the model is disabled, missing, unloaded, or fails. System Contacts import requests a selected person's name, company, job title, and available phone, email, social-profile, and profile-thumbnail fields after a user action, reviews every copy, requests no write capability on Android, never requests Contacts notes, birthdays, or postal addresses, and makes no network request. Native PDF people-list extraction reads only a user-selected local file, passes bounded selectable text to on-device Gemma, and requires review before saving. Local web file import may read a browser-provided `blob:` URL through the platform fetch interface; that does not contact a remote server.

Native Update Watch is an optional, foreground-only network feature. It requests only user-confirmed public HTTPS URLs and each site's `robots.txt`; the destination sees ordinary request metadata such as the user's IP address, requested URL, and time. It blocks credentials, literal private/reserved targets, disallowed social platforms, unsafe redirects, oversized responses, and robots-policy violations. Public search opens Bing only after the user taps, so the entered name/company query is then sent to Bing under the browser's privacy terms.

Update Watch sends no memories, event data, camera data, cookies, credentials, or authentication headers to public sources. Results stay in a local suggestion queue and do not enter the relationship timeline without approval. Approved memories retain the confirmed public-source provenance.

The optional PC web enhancement calls a Context helper on `127.0.0.1:8789`; bounded model input goes only to Ollama on `127.0.0.1:11434`. Both endpoints are loopback-only, use no service credentials, and are never contacted by the native iOS app. The optional PC watcher applies DNS/private-address checks in addition to the native literal-address checks.

Development and distribution tools may access npm, Expo, or an app store to install dependencies or distribute a build. That tooling is separate from relationship-data processing at runtime.

## Explicitly unsupported

- Internet or stranger identification.
- Continuous/background camera scanning.
- Location tracking or proximity inference.
- Cloud face matching.
- Cloud note processing or speech transcription.
- Silent memory writes.
- Client-side service credentials.
- Scraping login-gated pages, bypassing CAPTCHAs/robots rules, or evading social-network access controls.
- Automatic identity resolution; the user must confirm that each source belongs to the saved person.

## Implemented controls

- Event-scoped candidate filtering and opt-in per-person QR matching.
- High-entropy QR credentials that can be rotated without changing a person's relationship record.
- QR-only camera flow with no still-photo capture.
- User-initiated on-device dictation with no audio files, no background capture, and no server-recognition fallback.
- Optional operating-system app lock; the app receives only an authentication result, never biometric data.
- Strict Zod schemas and bounded import/backup sizes.
- Referential-integrity checks for restored contact, memory, badge, event, and attendee identifiers.
- Human confirmation before local drafts enter the timeline.
- Optional Gemma 4 E2B IT inference through a version-pinned LiteRT-LM runtime, with bounded task context, strict structured-output validation, and deterministic fallback.
- User-confirmed Wi-Fi model download with exact file-size and SHA-256 verification, backup exclusion, and independent model deletion.
- Accessible confirmation dialogs for destructive actions.
- Validated backup restore and complete local deletion.
- SecureStore/Keychain template storage on supported native platforms only.
- Native foreground watcher plus an optional loopback-only PC watcher API with local-origin CORS checks and bounded JSON bodies.
- Optional loopback-only Ollama enforcement, structured JSON schemas, bounded relationship context, prompt-injection instructions, and malformed-output rejection on PC web.
- HTTPS-only source validation, private/reserved-address rejection, redirect revalidation, 15-second timeouts, 2 MB response limits, and robots-policy enforcement.
- Separate public-update provenance that never changes the “Last spoke” field.

## Future release gates

- Add encrypted structured local storage if relationship notes require protection beyond the app sandbox.
- Run native iOS/Android security, permission, backup, and deletion tests on signed builds.
- Verify on a physical iPhone that the downloaded model works in airplane mode, unloads safely under lifecycle pressure, cannot alter identity or biometric decisions, and falls back deterministically after deletion or runtime failure.
- Verify dictation permissions, language-asset setup, airplane-mode transcription, interruption cleanup, App Lock interaction, and absence of audio files or transcript network traffic on a physical iPhone.
- Publish `PRIVACY.md` at a stable HTTPS URL and add the release URL to the in-app screen and App Store Connect.
- Keep biometric matching disabled until every gate in `docs/FACE_MODEL_INTEGRATION.md` passes.

## Dependency audit

`npm audit --omit=dev` currently reports moderate advisories in the Expo build/configuration toolchain. There are no high or critical findings. The automated force-fix would downgrade Expo across major SDK versions and is not safe to apply; recheck when Expo publishes compatible patched transitive dependencies.
