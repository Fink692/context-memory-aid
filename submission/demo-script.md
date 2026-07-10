# Context — two-minute product demo

## Setup

- Open the sample **OpenAI Memory Hack Night** event.
- Confirm the API health page reports `rules` or `openai`: `https://context-memory-api.vercel.app/health`.
- Use Jordan for the refresher and smart-draft flow.
- Keep smart tools on. Rules mode is enough for typed drafts; OpenAI mode additionally enables voice.

## Talk track

**0:00–0:15 — The moment**

“You know this person. You know you have spoken before. But the name, the promise, and the story arrive five seconds too late. Context gives you the relationship back when you need it.”

**0:15–0:35 — Establish the boundary**

Show the active event card and its three known people.

“This is not internet identity search. I select an event, and Context works only with people I deliberately saved inside that attendee boundary.”

**0:35–0:55 — Recover the relationship**

Open **Event assistant**, search Jordan, and tap the result. Optionally show the QR-badge tab.

“I can browse discreetly or scan a Context badge. Here is Jordan: where we met, when we last spoke, what changed, and two natural ways to continue the relationship.”

**0:55–1:25 — Close the memory loop**

Tap **Add a memory**, type:

> Jordan accepted a new role in New York and is hiring AI engineers for the developer tooling team.

Tap **Create smart draft**, edit the summary, and confirm it.

“The service structures the update, but it never writes silently. I review the facts, edit the summary, and explicitly confirm. Without smart tools, I can always save the note exactly as written.”

**1:25–1:42 — Prove control**

Delete the new memory, show the confirmation, then cancel or confirm. Open **Privacy & data** and show export, restore, and delete-all controls.

“Every memory can be removed. The whole workspace can be exported, restored, or erased from this device.”

**1:42–2:00 — End on the category**

“This is not another CRM. It is a memory prosthetic for relationships. The goal is not to know more people—it is to show up better for the people you already know.”

## Truthful judge Q&A

- **Does it identify faces today?** No. The finished workflow uses event search and QR badges. Biometric inference stays disabled until the licensed-model, consent, demographic-performance, and native-deletion gates pass.
- **What goes to OpenAI?** Only after a deliberate smart action: the note and the selected person’s saved context. Matching data and unrelated contacts never go to the memory API.
- **What works without OpenAI?** Events, search, QR matching, profiles, timelines, manual notes, backups, deletion, and deterministic rules-based drafts. Voice transcription is honestly unavailable in rules mode.
- **Why event-scoped?** It reduces accidental disclosure, cognitive overload, and the discomfort of ambient scanning while delivering the memory benefit.
