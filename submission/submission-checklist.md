# Hackathon submission checklist

## Ready

- [x] Mobile prototype and seeded event flow
- [x] Public HTTPS demo API
- [x] Structured memory extraction and no-recognition endpoint checks
- [x] Five-slide HTML pitch
- [x] Architecture/privacy diagram
- [x] Two-minute demo script and fallback path
- [x] Automated tests, Expo Doctor, and web bundle verification
- [x] Security and privacy notes

## Requires account or hardware access

- [ ] Add a real OpenAI API key to Vercel and set `AI_DEMO_MODE=false`
- [ ] Log in to Expo/EAS and link the mobile project
- [ ] Build/install the Android APK and iOS ad hoc preview
- [ ] Test camera, microphone, cache deletion, and app lifecycle on physical devices
- [ ] Record a live phone demo and optionally replace the generated caption-led teaser
- [ ] Add a Git remote and push the tagged release

## Submission copy

**One-liner:** Context is a private relationship memory aid that helps you recognize people you already know, recall what matters, and capture the next memory with OpenAI.

**Category:** Mobile AI · Personal productivity · Human-centered memory

**Built with:** Expo, React Native, Hono, OpenAI Audio/Responses APIs, Zustand, Zod, Vercel

**Privacy promise:** Saved contacts only, active event only, deliberate camera only, no cloud face matching, and every AI memory requires human confirmation.
