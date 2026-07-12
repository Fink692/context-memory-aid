import type { Contact, Event } from "./domain";

export type MatchStatus = "matched" | "ambiguous" | "no_match";

export interface FaceCandidate {
  contactId: string;
  embedding: readonly number[];
}

export interface FaceMatchResult {
  status: MatchStatus;
  contactId?: string;
  confidence?: number;
  reason: string;
}

export function filterEventCandidates(contacts: Contact[], event: Event): Contact[] {
  const attendeeIds = new Set(event.attendeeContactIds);
  return contacts.filter(
    (contact) => contact.recognitionEnabled && Boolean(contact.badgeId) && attendeeIds.has(contact.id),
  );
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return -1;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }

  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function evaluateFaceMatch(
  probe: readonly number[],
  candidates: FaceCandidate[],
  options: { threshold?: number; ambiguityGap?: number } = {},
): FaceMatchResult {
  const threshold = options.threshold ?? 0.72;
  const ambiguityGap = options.ambiguityGap ?? 0.05;

  const ranked = candidates
    .map((candidate) => ({
      contactId: candidate.contactId,
      score: cosineSimilarity(probe, candidate.embedding),
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  const second = ranked[1];

  if (!best || best.score < threshold) {
    return {
      status: "no_match",
      reason: "No enrolled attendee passed the confidence threshold.",
    };
  }

  if (second && best.score - second.score < ambiguityGap) {
    return {
      status: "ambiguous",
      confidence: best.score,
      reason: "Two enrolled attendees are too similar to choose safely.",
    };
  }

  return {
    status: "matched",
    contactId: best.contactId,
    confidence: best.score,
    reason: "One enrolled attendee passed the threshold and ambiguity margin.",
  };
}
