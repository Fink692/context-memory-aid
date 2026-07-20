# Release and submission checklist

## Complete

- [x] Polished responsive Expo app with empty, loading, success, error, and destructive-confirmation states
- [x] Event creation, switching, attendee search, CSV import, and duplicate protection
- [x] Event-bounded QR badge scanner with manual directory fallback
- [x] Editable people, conversation prompts, timelines, and per-memory deletion
- [x] Manual notes and reviewable Smart Assist drafts
- [x] No backend, paid API, API key, cloud note processing, or usage fee
- [x] JSON backup export/restore and full workspace deletion
- [x] Automated tests, Expo Doctor, web export, security notes, architecture diagram, pitch, and script
- [x] Branded app icon and splash configuration
- [x] Private GitHub repository and tagged release history
- [x] Update Watch with user-confirmed public sources, monthly checks, and approval-only memory writes

## Account or hardware gates

- [ ] Log in to Expo/EAS only if a signed native preview is needed
- [ ] Build/install signed Android and iOS previews
- [ ] Verify camera, secure storage, and lifecycle on physical devices
- [ ] Record a live-device walkthrough if the submission platform requires hardware footage
- [ ] Keep biometric inference disabled until every model-integration gate passes

## Submission copy

**One-liner:** Context is a private relationship-memory app that helps you prepare for people you already know, recall what matters, and deliberately capture the next memory.

**Category:** Mobile productivity · Human-centered memory · Privacy-minded software

**Built with:** Expo, React Native, Zustand, Zod, Ollama, Qwen3, and deterministic non-AI fallbacks

**Privacy promise:** Saved contacts only, active event only, deliberate QR camera use, no cloud processing of relationship data, and no memory enters the timeline without a human action. Optional public checks use only URLs the user confirms.

**Runtime cost:** $0 — no hosted backend or paid API.
