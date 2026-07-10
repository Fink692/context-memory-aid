# Context — two-minute judge demo

## Setup before walking on stage

- Open the app on the seeded **OpenAI Memory Hack Night** event.
- Keep the production demo API health page open in a backup tab: `https://context-memory-api.vercel.app/health`.
- Confirm the visible demo target is **Jordan**.
- Have the teammate stand in good light and keep the **Unknown** target available for the safety proof.
- If camera permissions fail, scan a QR code containing `context://contact/jordan-patel`.

## Talk track

**0:00–0:15 — The moment**

“You know this face. You know you have spoken before. But the name, the promise, and the story arrive five seconds too late. Context gives you the relationship back at exactly the moment you need it.”

**0:15–0:35 — Establish the boundary**

Show the active event card.

“This is not internet face search. Context considers only people I saved, who are also on the attendee list for this event, and only after I deliberately open memory assist.”

**0:35–0:55 — The recognition moment**

Point the camera at the teammate and tap **Capture and check locally**.

“That capture is already gone. What remains is the context: Jordan Patel, where we met, when we last spoke, what we discussed, and two human conversation openings.”

**0:55–1:25 — Close the memory loop**

Tap **Add memory** and dictate:

> Jordan accepted a new job in New York and is looking for AI engineers.

Show the editable draft and confirm it.

“OpenAI transcribes and structures the update, but it does not write to my relationship history. I review the facts, edit the summary, and explicitly confirm.”

**1:25–1:42 — Prove the no-match path**

Return to memory assist, select **Unknown**, and capture again.

“If the person is not inside this event-scoped relationship set, Context says no match. It does not reveal the nearest identity and it never searches the internet.”

**1:42–2:00 — End on the category**

“This is not another CRM. It is a memory prosthetic for relationships. The goal is not to know more people—it is to show up better for the people you already know.”

## Truthful judge Q&A

- **Is the demo doing production face recognition?** No. The prototype visibly labels its deterministic camera/QR adapter. The on-device template store, event filter, threshold logic, and deletion lifecycle exist; a licensed and bias-evaluated embedding model remains behind documented release gates.
- **What goes to OpenAI?** The dictated note and the selected contact’s saved profile/timeline. Face images, embeddings, and unrelated contacts never go to the API.
- **What happens without internet?** Relationship data and candidate filtering remain local. The current AI transcription/extraction step requires connectivity; manual notes remain the future offline fallback.
- **Why event-scoped?** It sharply reduces candidate count, accidental matches, and the social discomfort of continuous ambient scanning.
