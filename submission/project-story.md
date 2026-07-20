# Context: A Private Relationship Memory

## Inspiration

I got the idea for Context from watching how my mom remembers the people she meets. After a conversation, she opens the Notes app and writes down the person's name, where they met, and the details she wants to remember.

It is a thoughtful habit, but it does not scale well. Her notes become cluttered, names are formatted differently, and useful details get buried between grocery lists and reminders. When she meets someone again, the information may still be on her phone, but finding it at the right moment is difficult.

I built Context to give those memories a dedicated home. It keeps the speed and simplicity of writing a note while organizing every detail around the person it belongs to.

## What it does

Context is a private, offline-first relationship memory for people you already know. It helps you save where you met someone, what you discussed, what matters to them, and what you may want to follow up on.

You can add people manually, import selected contacts, dictate notes, organize people around events, and keep a chronological memory timeline for each relationship. Context can also create editable smart drafts, suggest conversation starters, share selected public contact details through QR or vCard, and back up or restore the workspace.

The core experience works without an account, hosted database, paid API, or internet connection. Relationship data stays inside the app sandbox, and every imported or generated record is shown for review before it is saved.

## How I built it

I designed and built Context by myself as a TypeScript monorepo. The main app uses Expo, React Native, Expo Router, Zustand, and Zod across iOS, Android, and web. Shared packages contain the domain contracts, validation, backup format, contact-card logic, parsers, and deterministic assistance features.

For iOS, I added native Swift and Objective-C bridges for speech recognition, PDF text extraction, profile photo handling, the privacy shield, and optional on-device language model inference. The optional model uses Gemma through LiteRT-LM and keeps inference inside the app process. If the model is unavailable, deterministic TypeScript fallbacks keep the main workflows functional.

I also built a lightweight macOS wrapper with AppKit and WebKit, plus an optional loopback-only PC companion that can use Qwen3 through Ollama. Neither enhancement is required for the mobile app.

I treated verification as part of the product. The repository includes strict type checking, automated tests, Expo diagnostics, production exports, clean iOS prebuild validation, privacy-manifest checks, dependency auditing, and GitHub Actions for Linux and macOS.

## Challenges I faced

The hardest challenge was making privacy a real architectural property instead of a promise in the interface. Contact import, QR sharing, dictation, backups, AI drafts, and app locking all touch sensitive information in different ways. I had to define clear data boundaries for each feature and make review screens part of the workflow.

Another challenge was keeping the same product coherent across native mobile, web, and macOS while still using platform-specific capabilities. Camera scanning, system contacts, speech recognition, local authentication, file handling, and on-device inference each behave differently. I separated those native boundaries from the shared domain logic so that unsupported capabilities fail safely without breaking the rest of the app.

On-device AI added its own constraints. The model is large, memory is limited, downloads can fail, and generated output is not automatically trustworthy. I added explicit model management, hash verification, constrained prompts, schema validation, editable drafts, and deterministic fallbacks.

Finally, I had to resist turning Context into a social network or sales CRM. The product became clearer when I centered every decision on one question: does this help someone show up better for a relationship they already have?

## What I learned

I learned that organization is often more valuable than adding another capture tool. My mom already had a way to save information. The missing piece was structure, retrieval, and trust.

I also learned that privacy-first design improves the product itself. Review-before-save flows make imports more accurate. Local processing reduces setup. Clear permission explanations make native features easier to understand. Deterministic fallbacks make the app more resilient even when AI is present.

Most importantly, I learned how much detail it takes to turn a personal idea into a complete product. Building alone meant moving between product design, data modeling, native development, testing, security, documentation, and release engineering. That breadth was challenging, but it helped me make every part of Context support the same purpose.

## Built with

`Expo`, `React Native`, `TypeScript`, `React`, `Expo Router`, `Zustand`, `Zod`, `Swift`, `Objective-C`, `AppKit`, `WebKit`, `LiteRT-LM`, `Gemma`, `Ollama`, `Qwen3`, `Vitest`, `GitHub Actions`, `iOS`, `Android`, `Web`, `macOS`, `privacy`, `offline-first`, `on-device AI`, `QR codes`
