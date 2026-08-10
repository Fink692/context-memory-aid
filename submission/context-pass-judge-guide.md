# Context Pass — judge guide

## The 20-second pitch

Meeting copilots need context, but they should not need a person's inbox, contacts, and private notebook. Context Pass uses AI Passport to share only three approved facts for one meeting, with a named recipient, a stated purpose, a 30-minute expiry, an access receipt, and immediate revocation.

## Why AI Passport is essential

Context already owns the relationship memory. Meeting Copilot needs a temporary slice of it. AI Passport is the cross-tool permission layer that turns that transfer into an inspectable request instead of a broad account connection.

Remove AI Passport and the core product disappears: there is no portable grant, no field-level boundary, no recipient or purpose binding, and no common receipt or revocation surface.

## Rubric map

| Criterion | What the judge can see | What the implementation proves |
|---|---|---|
| Clear AI Passport use | Meeting Copilot requests three named fields for one thesis check-in | The grant is recipient-, purpose-, field-, and time-bound |
| User control | Exact values are previewed; the user approves, inspects a receipt, and revokes | Private notes are policy-blocked; revoked, expired, wrong-recipient, and out-of-scope reads fail |
| Privacy and risk | The interface shows what will not be shared and explains the post-read limit of revocation | The brief is generated only from approved fields; write-back requires review |

## The proof moment

After revocation, **Copilot Tries Again** makes a real policy decision and returns `Denied — pass revoked`. This is not a disconnected slideshow: the visible state is driven by the permission module used in the tests.

## Likely judge questions

### Why not grant the copilot access to Context directly?

Direct access creates a standing integration with a large private dataset. A pass gives the recipient only the minimum context for the current purpose and makes the boundary visible to the person.

### Does revocation erase data already read?

No. It prevents future reads. Context Pass states that limitation explicitly and combines revocation with short expiry and receipts rather than promising retroactive forgetting.

### What prevents a malicious app from claiming to be Meeting Copilot?

The prototype models recipient binding but does not claim production identity verification. A production pilot would require verified app identity, signed requests and grants, authenticated transport, and enforceable deletion semantics.

### Is this just a mockup?

It is a deterministic interactive prototype backed by a permission state machine. Tests cover unshareable private notes, recipient and scope checks, expiry, revocation, and approved-field-only briefing generation. It does not claim a live production AI Passport API integration.

### What existed before the ideathon?

The offline-first Context memory application existed already. The passport request, exact-field approval, scoped grant, receipt, revocation, denied retry, policy tests, and meeting-copilot narrative are new and disclosed as the ideathon work.

## Live demo order

1. Ask Meeting Copilot to prepare.
2. Review the request and exact fields.
3. Point out the structurally locked private reflection.
4. Approve the one-meeting pass and show the resulting brief.
5. Open the receipt, revoke access, and trigger the denied retry.

End on: **Useful context travels across tools. Control stays with the person.**
