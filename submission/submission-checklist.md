# Release and submission checklist

## Complete

- [x] Polished responsive Expo app with empty, loading, success, error, and destructive-confirmation states
- [x] Event creation, switching, attendee search, CSV import, and duplicate protection
- [x] Event-bounded QR badge scanner with manual directory fallback
- [x] Editable people, conversation prompts, timelines, and per-memory deletion
- [x] Manual notes that work without AI
- [x] Honest rules-based smart drafts and OpenAI-ready transcription/drafting
- [x] JSON backup export/restore and full local deletion
- [x] Public HTTPS API with validation, CORS, rate limits, size bounds, and no recognition endpoint
- [x] Automated tests, Expo Doctor, web export, security notes, architecture diagram, pitch, and script
- [x] Branded app icon and splash configuration
- [x] Private GitHub repository and tagged baseline release

## Account or hardware gates

- [ ] Add a real OpenAI API key to Vercel and set `AI_MODE=openai` if voice is required
- [ ] Log in to Expo/EAS and link the mobile project
- [ ] Build/install signed Android and iOS previews
- [ ] Verify camera, microphone, cache cleanup, secure storage, and lifecycle on physical devices
- [ ] Record a live-device walkthrough if the submission platform requires hardware footage
- [ ] Keep biometric inference disabled until every model-integration gate passes

## Submission copy

**One-liner:** Context is a private relationship-memory app that helps you prepare for people you already know, recall what matters, and deliberately capture the next memory.

**Category:** Mobile AI · Personal productivity · Human-centered memory

**Built with:** Expo, React Native, Hono, OpenAI Audio/Responses APIs, Zustand, Zod, Vercel

**Privacy promise:** Saved contacts only, active event only, deliberate QR camera use, no cloud face matching, and no memory enters the timeline without a human action.
