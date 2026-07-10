# Context — two-minute product demo

## Setup

- Open the sample **OpenAI Memory Hack Night** event.
- Use Jordan for the refresher and local-draft flow.
- Keep local smart tools on.
- Start `npm run dev:watcher` and preload one permitted demo RSS source if showing Update Watch live.
- Core memory features need no internet connection; Update Watch needs public internet but no API key, hosted backend, or paid account.

## Talk track

**0:00–0:15 — The moment**

“You know this person. You know you have spoken before. But the name, the promise, and the story arrive five seconds too late. Context gives you the relationship back when you need it.”

**0:15–0:35 — Establish the boundary**

Show the active event card and its three known people.

“This is not internet identity search. I select an event, and Context works only with people I deliberately saved inside that attendee boundary.”

**0:35–0:55 — Recover the relationship**

Open **Event assistant**, search Jordan, and tap the result. Optionally show the QR-badge tab.

“I can browse discreetly or scan a Context badge. Here is Jordan: where we met, when we last spoke, what changed, and two natural ways to continue the relationship.”

**0:55–1:15 — Show consent-based Update Watch**

Tap **Watch public updates**. Show that Jordan is already selected, the exact-person confirmation, a watched public feed, and one pending suggestion.

“Context can help me find a public page, but it never guesses identity. I confirm the exact source. A free process on my PC checks permitted public sources monthly, and every result waits here—separate from memory—until I approve it.”

Approve the suggestion and return to Jordan’s timeline. Point out that **Last spoke** did not change.

**1:15–1:38 — Close the memory loop**

Tap **Add a memory**, type:

> Jordan accepted a new role in New York and is hiring AI engineers for the developer tooling team.

Tap **Create local draft**, edit the summary, and confirm it.

“Bundled rules organize the update entirely on this device. There is no server call or usage fee. I review the details, edit the summary, and explicitly confirm. With local tools off, I can always save the note exactly as written.”

**1:38–1:50 — Prove control**

Delete the new memory, show the confirmation, then cancel or confirm. Open **Privacy & data** and show export, restore, and delete-all controls.

“Every memory can be removed. The whole workspace can be exported, restored, or erased from this device.”

**1:50–2:00 — End on the category**

“This is not another CRM. It is a memory prosthetic for relationships. The goal is not to know more people—it is to show up better for the people you already know.”

## Truthful judge Q&A

- **Does it identify faces today?** No. The finished workflow uses event search and QR badges. Biometric inference stays disabled until every reviewed integration gate passes.
- **What leaves the device?** No relationship data. Profiles, notes, prompts, drafts, event search, and QR matching stay local.
- **Does Update Watch scrape social networks?** It checks only public HTTPS sources I confirm, honors robots and access barriers, and never uses account cookies. If LinkedIn, X, Instagram, or another site prohibits automated access, Context reports it as unsupported; RSS, blogs, newsrooms, and permitted public pages work best.
- **What does a watched site see?** A normal public request from my PC: my IP address, the requested URL, and Context’s transparent watcher user-agent. It never receives my memories or event data.
- **What makes the draft smart?** Deterministic TypeScript rules extract short details, tags, and follow-up prompts. It is fast, explainable, offline, and free—not a claim of generative AI.
- **Why no voice transcription?** Reliable transcription would require a large bundled model or a cloud speech service. Context uses typed notes so the shipped app has no paid API or audio upload.
- **Why event-scoped?** It reduces accidental disclosure, cognitive overload, and the discomfort of ambient scanning while delivering the memory benefit.
