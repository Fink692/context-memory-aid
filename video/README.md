# Context Pass video timeline

This folder contains the editable 28-second Remotion timeline for the submission video. It uses only locally captured Context Pass UI, generated system narration, and synthesized sound effects.

## Render

```bash
pnpm install
pnpm run render
```

The output is written to `../submission/context-pass-demo.mp4` as 1080p, 30 fps H.264 with AAC audio.

To regenerate narration and sound effects on macOS:

```bash
./scripts/generate-audio.sh
```

Read [the beat sheet](beat-sheet.md) for shot timing and [the source/license record](source-license-record.md) for asset provenance.

## Verified output

- Duration: 28.054 seconds
- Video: H.264 High, 1920 × 1080, 30 fps
- Audio: AAC LC, 48 kHz, stereo
- Mean / peak level: -19.9 dB / -4.8 dB
- No black-frame or freeze intervals detected
- Final 2.3 seconds intentionally leave room after narration for the closing statement

Representative frames, the first frame, and the final frame are stored in `../submission/video-qa/`.
