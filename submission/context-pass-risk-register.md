# Context Pass — risk register

| Risk | Why it matters | First-version mitigation | Honest boundary |
|---|---|---|---|
| Third-party privacy | Relationship notes can describe someone other than the passport owner | Share only deliberate, user-authored meeting fields; make private reflections unshareable | Future policy and consent models are still needed for richer third-party data |
| Incorrect or stale memory | A bad briefing can damage an important conversation | Preview exact values before approval; require review before write-back | User review reduces error but does not guarantee truth |
| Sensitive-trait inference | An assistant could infer health, politics, or other protected traits | No scraped profiles; no automatic inferred traits; sensitive notes excluded | A production system still needs field classification and abuse monitoring |
| Excessive scope | A convenient integration can become a hidden data dump | Recipient-, purpose-, field-, and time-bound pass | Production enforcement requires verified app identity and secure transport |
| Post-read copying | Revocation cannot erase a fact a recipient already copied | Short expiry, read receipt, future-access denial, deletion acknowledgements in a production design | Revocation stops later reads; it cannot promise retroactive forgetting |
| Silent write-back | Generated guesses could become durable personal memory | Every write-back is an editable draft requiring review | The demo does not implement a production inbox |
| Shoulder surfing | Meeting context may be visible on screen | Keep previews concise; use the existing native privacy shield and app lock on device | Web demo is presentation-oriented and does not simulate OS-level shielding |
| Recipient spoofing | A malicious app could claim to be Meeting Copilot | Production design requires verified app identity and signed requests | The prototype uses a deterministic named recipient, not production identity verification |
