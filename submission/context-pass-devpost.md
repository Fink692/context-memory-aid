# Context Pass — Devpost submission draft

## Submission fields

- **Project name:** Context Pass
- **Tagline:** A revocable, one-meeting slice of your memory for AI copilots.
- **Track:** Work
- **Lane:** Build
- **Built with:** TypeScript, React Native, Expo, AI Passport concept, Zustand, Zod, Vitest
- **Demo format:** Interactive deterministic prototype

## Short summary

Meeting assistants are most useful when they understand the relationship—but giving them an inbox, contact book, and private notes is too much. Context Pass lets a student share only the memories needed for one conversation through AI Passport, with field-level approval, automatic expiry, and a receipt showing exactly what the assistant used.

## Inspiration

People already keep thoughtful notes before important conversations: where they met someone, what they discussed, what they promised, and what should happen next. Those memories are useful inside a private notebook, but a calendar or meeting copilot starts from zero.

Today the usual solution is an unacceptable tradeoff. The assistant stays unhelpfully cold, or the person grants broad access to email, contacts, and notes. Students navigating recurring conversations with supervisors, mentors, recruiters, and collaborators deserve a smaller boundary.

Context Pass asks a narrower question: what if an assistant could request the three useful facts for one meeting instead of browsing a person's whole life?

## What it does

The demo follows a thesis student preparing for a check-in with Professor Maya Chen.

1. Meeting Copilot asks AI Passport for relationship summary, open commitments, and meeting goals.
2. The student sees the value of every field before deciding. A private reflection is visibly locked and cannot enter the pass.
3. The approved pass is bound to Meeting Copilot, the thesis-check-in purpose, and a 30-minute duration.
4. The copilot creates a concise briefing from only the approved fields.
5. AI Passport records a receipt showing the recipient, purpose, fields read, expiry, and write-back policy.
6. The student revokes the pass. When the copilot retries, access is denied and no context leaves AI Passport.

The person remains the controller throughout. A generated meeting memory may return only as an editable draft that requires review.

## How AI Passport is used

AI Passport is the permission and portability layer between Context and the meeting copilot. It carries:

- **Context:** a user-confirmed relationship summary, open commitments, and meeting goals
- **Permission:** which named app may read which fields and for what purpose
- **Access:** a 30-minute grant that can be revoked before expiry
- **Proof:** a receipt showing what the app actually read and when

Without AI Passport, this is just another meeting-notes feature. With it, the same user-owned context can safely serve Calendar, a meeting assistant, or another work tool without copying an entire private workspace into each one.

## Privacy, risk, and user control

Privacy is a data-flow property in Context Pass, not a settings-page promise.

- The pass contains only explicitly selected fields.
- Private notes are marked unshareable in the policy layer, not merely deselected in the interface.
- The recipient, purpose, scope, duration, and write-back rule are visible before approval.
- Wrong-recipient, expired, revoked, and out-of-scope reads are denied.
- Every successful read creates a receipt.
- Write-back is review-required so an assistant cannot silently turn an inference into personal memory.

The main risks are data about other people, stale or incorrect memories, inferred sensitive traits, and the fact that revocation cannot make an app forget information it already read. The first version minimizes these risks by sharing user-authored facts rather than scraped profiles, excluding sensitive inference, showing field previews, expiring access quickly, and recording reads. Production integrations would also need recipient verification, enforcement contracts, secure transport, and clear deletion semantics.

## How it was built

Context Pass is a TypeScript and React Native / Expo prototype. A pure permission module issues recipient-bound meeting passes and makes deterministic access decisions. The interface exercises the same policy rather than advancing through disconnected mock screens.

Vitest coverage proves that private notes cannot enter a pass even if requested; only the named recipient can read approved fields; out-of-scope, expired, and revoked reads fail; and the generated briefing contains only approved fields.

The demo intentionally does not use a language model or claim a production Egoist API integration. Deterministic content keeps the privacy boundary inspectable and makes the proposed first version clear.

## Existing foundation and new work

The offline-first Context relationship-memory application predates this ideathon. It already provided local storage, review-first capture, intentional sharing, deletion, and optional device authentication.

New for the AI Passport Ideathon:

- the complete passport request and field-preview flow;
- recipient-, purpose-, scope-, and time-bound pass behavior;
- access receipts, manual revocation, and denied retries;
- the meeting-copilot use case and judge-facing narrative;
- permission-policy tests and responsive demo presentation.

This reuse is disclosed because the ideathon contribution is the AI Passport application and its new control model, not a claim that the entire foundation was built during the event.

## Challenges

The hardest design question was not how to share more context. It was how to prove that less context could still create a meaningfully better result.

Relationship memory also contains information about other people. Treating every note as the passport owner's unrestricted data would ignore that risk. The prototype therefore makes private notes structurally unshareable and limits the first version to deliberate, user-authored meeting context.

Finally, revocation is often overstated. It can stop future access, but it cannot guarantee that a recipient forgot a prior read. The receipt and short expiry make that boundary visible instead of promising impossible control.

## What we learned

The most valuable AI memory is not the largest profile. It is the smallest trustworthy slice that fits the current purpose.

AI Passport makes that slice portable without making consent invisible. A request can remain a question, access can be temporary, and a receipt can turn an abstract privacy promise into something a person can inspect.

## What's next

The first production pilot would connect Context, one calendar provider, and one meeting assistant. It would add verified app identity, signed pass manifests, encrypted transport, deletion acknowledgements, and usability testing with students who use memory or attention supports.

The long-term opportunity is broader than meeting preparation: the same pattern can support interview coaching, mentoring, academic advising, and workplace accommodations while preserving one user-owned control surface.
