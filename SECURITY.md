# Security and privacy notes

Context is a hackathon prototype that processes relationship notes and may eventually process biometric templates. It is not a legal-compliance certification or a production biometric system.

## Data boundaries

| Data | Location | Retention |
| --- | --- | --- |
| Contacts, events, confirmed memories | Device app storage | Until the user deletes or resets it |
| Face embeddings | Platform SecureStore/Keychain | Until the contact or all data is deleted |
| Camera captures | Device cache only | Deleted immediately after the match attempt |
| Audio recordings | Device cache only | Deleted immediately after transcription attempt |
| Raw transcript | In-memory UI and API request | Not persisted by the app |
| Selected contact context | OpenAI proxy request when explicitly enabled | Not persisted by this API; OpenAI account data controls still apply |
| Other contacts and face data | Never sent to the AI API | Not applicable |

Android backup is disabled. Optional AI sharing is off by default. Imported contacts have recognition disabled by default.

## Explicitly unsupported

- Stranger identification or internet identity search.
- Continuous/background camera scanning.
- Location tracking or proximity inference.
- Cloud face matching.
- Silent AI memory writes.
- Client-side OpenAI credentials.

## Production checklist

- Replace the demo matcher only with a licensed, bias-evaluated, on-device model.
- Obtain appropriate permission before enrolling real people.
- Add authenticated API sessions and production-grade distributed rate limiting.
- Deploy API endpoints behind HTTPS and narrow `ALLOWED_ORIGINS`.
- Review OpenAI project data controls and retention settings for the target jurisdiction.
- Add encrypted structured local storage if profile notes require protection beyond the platform app sandbox.
- Run native iOS/Android security testing, dependency scanning, and deletion verification on release builds.
- Add a formal privacy notice and data-processing inventory before external distribution.

## Dependency audit

At implementation time, `npm audit --omit=dev` reports moderate advisories in the Expo build/configuration toolchain through the transitive `xcode -> uuid` dependency. There are no high or critical findings. The automated suggested fix downgrades Expo across major SDK versions and is not safe to apply. Recheck after Expo publishes compatible patched transitive dependencies.
