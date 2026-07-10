// Vercel's Node function tracer follows relative ESM imports reliably, while
// Metro needs the extensionless exports in index.ts. Keep this adapter narrow:
// the API needs domain contracts and one deterministic fallback, not CSV or
// camera matching modules whose Metro-friendly imports are extensionless.
export * from "./domain.js";

import type { MemoryDraft } from "./domain.js";

export function createRuleBasedMemoryDraft(transcript: string): MemoryDraft {
  const clean = transcript.trim().replace(/\s+/g, " ");
  const lower = clean.toLowerCase();
  const tags = [
    lower.includes("job") ? "career" : undefined,
    lower.includes("new york") ? "new-york" : undefined,
    lower.includes("hire") || lower.includes("engineer") ? "hiring" : undefined,
  ].filter((value): value is string => Boolean(value));

  return {
    summary: clean.length > 240 ? `${clean.slice(0, 237)}...` : clean,
    extractedFacts: [clean],
    suggestedTags: tags.length ? tags : ["conversation"],
    suggestedFollowUps:
      lower.includes("hire") || lower.includes("engineer")
        ? ["Ask what profiles they are hiring for", "Offer a relevant introduction"]
        : ["Follow up on this update"],
    confidence: 0.78,
  };
}
