# Security and privacy notes

Context processes personal relationship notes and is designed around explicit local data boundaries. It has no application backend or paid API integration.

## Data inventory

| Data | Location | Retention |
| --- | --- | --- |
| Contacts, events, preferences, confirmed memories | Device app storage | Until the user deletes, restores, or resets the workspace |
| Local-model draft input and suggestions | Transient app/service/Ollama memory on this PC while editing | The app persists input only after confirmation; the Context service does not write prompts or model output to its data file |
| QR badge identifiers | Camera stream and in-memory comparison | Not stored by the scanner |
| Face embeddings | No current UI creates them; native secure-storage helper is gated | Until person/all-data deletion if a reviewed model is integrated |
| Camera frames | Camera preview only | Not captured or uploaded by the QR flow |
| JSON backups | User-selected file destination | Controlled by the user outside the app |
| Confirmed public source URLs and pending update suggestions | `%LOCALAPPDATA%\ContextMemory\update-watch.json` on the PC | Until the source/suggestion is removed or the file is deleted |

Android backup is disabled. Local AI is optional. Imported contacts have quick matching disabled by default. Manual notes work without the PC service.

## Network boundary

Core app features make no remote API requests. Local AI calls the Context service on `127.0.0.1:8789`, which sends bounded prompt data only to Ollama on `127.0.0.1:11434`. Both endpoints are loopback-only. Local file import may read a browser-provided `blob:` URL through the platform fetch interface; that does not contact a remote server.

Update Watch is an optional, explicit network feature. The app talks only to a Node service bound to `127.0.0.1:8789`. That service requests only user-confirmed public HTTPS URLs and each site’s `robots.txt`; the destination site sees the normal request metadata (including the user’s IP address, requested URL, and the transparent Context watcher user-agent). Public search opens Bing only after the user taps the search button, so the entered name/company query is then sent to Bing under the browser’s own privacy terms.

Update Watch sends no memories, event data, camera data, cookies, credentials, or authentication headers to public sources. Results stay in a local suggestion queue and do not enter the relationship timeline without approval. Local-AI requests are separate, remain on PC loopback, use no service credentials, and are validated before the user can confirm them.

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
- QR-only camera flow with no still-photo capture.
- Strict Zod schemas and bounded import/backup sizes.
- Human confirmation before local drafts enter the timeline.
- Accessible confirmation dialogs for destructive actions.
- Validated backup restore and complete local deletion.
- SecureStore/Keychain template storage on supported native platforms only.
- Loopback-only watcher API with local-origin CORS checks and bounded JSON bodies.
- Loopback-only Ollama endpoint enforcement, structured JSON schemas, bounded relationship context, prompt-injection instructions, and malformed-output rejection.
- HTTPS-only source validation, DNS/private-address rejection, redirect revalidation, 15-second timeouts, 2 MB response limits, and robots-policy enforcement.
- Separate public-update provenance that never changes the “Last spoke” field.

## Future release gates

- Add encrypted structured local storage if relationship notes require protection beyond the app sandbox.
- Run native iOS/Android security, permission, backup, and deletion tests on signed builds.
- Publish a formal privacy notice before external distribution.
- Keep biometric matching disabled until every gate in `docs/FACE_MODEL_INTEGRATION.md` passes.

## Dependency audit

`npm audit --omit=dev` currently reports moderate advisories in the Expo build/configuration toolchain. There are no high or critical findings. The automated force-fix would downgrade Expo across major SDK versions and is not safe to apply; recheck when Expo publishes compatible patched transitive dependencies.
