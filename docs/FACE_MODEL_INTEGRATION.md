# Biometric model integration gate

Context currently ships a complete manual-directory and QR-badge event assistant. It does **not** infer identity from camera pixels, and no screen enrolls a face template. This is deliberate: licensing, consent, model performance, native preprocessing, and deletion must be reviewed as one system.

## Required before implementation

- Choose a model whose license explicitly permits the intended mobile commercial use.
- Document demographic false-accept/false-reject performance and the evaluation dataset’s limits.
- Define an explicit enrollment and revocation flow for people the user already knows.
- Require an active event and per-contact eligibility before loading any template.
- Keep inference and embeddings on device; do not add a cloud recognition endpoint.
- Version every template by model and preprocessing pipeline.
- Reject below-threshold and ambiguous matches; never reveal the nearest identity as a fallback.
- Delete captures immediately and templates on person/all-data deletion.
- Provide a non-biometric manual and QR path at all times.

## Integration seam

- `packages/shared/src/matching.ts` implements candidate filtering, cosine similarity, thresholding, and ambiguity margins.
- `apps/mobile/lib/face-templates.ts` provides native SecureStore/Keychain persistence and intentionally rejects web enrollment.
- A reviewed adapter must produce normalized embeddings from enrollment and one-shot probe frames.
- The UI must distinguish “no match,” “ambiguous,” “permission denied,” “model unavailable,” and “person outside event.”

## Acceptance evidence

- Unit tests for dimensions, normalization, model-version mismatch, thresholds, and ambiguity.
- Native integration tests proving camera/audio cache cleanup on success, error, cancellation, and app backgrounding.
- Physical-device evaluation across lighting, skin tones, ages, glasses, camera quality, and presentation attacks.
- Measured false-accept/false-reject rates with a documented release threshold.
- Verified offline behavior and proof that no face payload reaches the network.
- Signed legal/privacy review for each launch jurisdiction.

Until every item passes, keep biometric matching disabled and use the finished event directory or QR badges.
