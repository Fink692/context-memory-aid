# Reviewed on-device face model integration

The app ships without a biometric model. This is deliberate: model licensing, demographic performance, native preprocessing, and consent UX must be reviewed together. Do not rename the current “Demo adapter” or present it as real face recognition.

## Required implementation contract

1. Bundle a commercially usable face-detection and face-embedding model inside the native application. No model or weight may be fetched at runtime.
2. Process enrollment and probe images entirely on-device. Never add a server image or embedding endpoint.
3. Normalize every embedding to a versioned vector and store it with `saveFaceTemplate()` in platform SecureStore.
4. At match time, call `filterEventCandidates()` first, load templates only for those candidate IDs, and evaluate them with `evaluateFaceMatch()`.
5. Delete the captured image in a `finally` block regardless of match, error, or cancellation.
6. Return only `matched`, `ambiguous`, or `no_match`. Never expose the nearest identity below threshold.
7. Make model version changes invalidate or explicitly migrate old templates.

## Acceptance gates

- Matching works with airplane mode enabled.
- Network inspection confirms that images and embeddings never leave the device.
- A saved contact outside the active event cannot match.
- A saved contact with recognition disabled cannot match.
- Unknown faces return `no_match`; close scores return `ambiguous`.
- Delete person and Delete all data remove all associated SecureStore entries.
- The app never activates the camera outside the visible memory-assist screen.
- Evaluate false accepts/false rejects across lighting, skin tones, ages, glasses, and camera quality before any non-fictional demo.
- Document model source, license, version, input normalization, threshold calibration, and test dataset limitations.

Until every gate passes, use the visible demo selector or QR badge fallback.
