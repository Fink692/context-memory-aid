import type { Contact, FaceMatchResult } from "@context/shared";

export const DEMO_UNKNOWN_ID = "__unknown__";

export interface DemoMatchInput {
  candidates: Contact[];
  selectedContactId: string | null;
}

export async function runClearlyLabeledDemoMatch({
  candidates,
  selectedContactId,
}: DemoMatchInput): Promise<FaceMatchResult> {
  await new Promise((resolve) => setTimeout(resolve, 650));
  if (!selectedContactId || selectedContactId === DEMO_UNKNOWN_ID) {
    return { status: "no_match", reason: "Demo target is not an enrolled attendee." };
  }
  const match = candidates.find((contact) => contact.id === selectedContactId);
  if (!match) {
    return { status: "no_match", reason: "Target is outside the current event boundary." };
  }
  return {
    status: "matched",
    contactId: match.id,
    confidence: 0.93,
    reason: "Matched by the clearly labeled hackathon demo adapter.",
  };
}

export function contactIdFromQr(value: string, candidates: Contact[]): string | null {
  const prefix = "context://contact/";
  if (!value.startsWith(prefix)) return null;
  const contactId = decodeURIComponent(value.slice(prefix.length));
  return candidates.some((contact) => contact.id === contactId) ? contactId : null;
}
