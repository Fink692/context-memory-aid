import type { Contact, Event, MemoryDraft } from "./domain";

const eventId = "openai-hackathon-2026";

export const seededContacts: Contact[] = [
  {
    id: "jordan-patel",
    displayName: "Jordan Patel",
    company: "Stripe",
    role: "Engineering Manager",
    metAt: "OpenAI Hackathon 2025",
    lastSpokeAt: "2025-11-09T18:00:00.000Z",
    lastDiscussed: "Developer tooling",
    recentUpdate: "Promoted to Engineering Manager",
    conversationTopics: ["Their new team", "The marathon they ran last month"],
    recognitionEnabled: true,
    timeline: [
      {
        id: "memory-jordan-1",
        contactId: "jordan-patel",
        summary: "Jordan was building internal developer tooling and training for a marathon.",
        tags: ["developer-tools", "running"],
        nextSteps: ["Share the CLI observability article"],
        source: "seed",
        occurredAt: "2025-11-09T18:00:00.000Z",
        createdAt: "2025-11-09T18:05:00.000Z",
      },
    ],
  },
  {
    id: "alex-morgan",
    displayName: "Alex Morgan",
    company: "Northstar AI",
    role: "Founding Engineer",
    metAt: "Applied AI Meetup",
    lastSpokeAt: "2025-02-12T19:30:00.000Z",
    lastDiscussed: "Evaluation pipelines",
    recentUpdate: "Moving to New York for a new role",
    conversationTopics: ["The new role in New York", "Hiring AI engineers"],
    recognitionEnabled: true,
    timeline: [],
  },
  {
    id: "maya-chen",
    displayName: "Maya Chen",
    company: "Cohere",
    role: "Product Designer",
    metAt: "Designing with AI 2025",
    lastSpokeAt: "2026-04-21T16:00:00.000Z",
    lastDiscussed: "Human-centered agent interfaces",
    recentUpdate: "Published a talk on calm AI interfaces",
    conversationTopics: ["Her calm-interface talk", "Agent consent patterns"],
    recognitionEnabled: true,
    timeline: [],
  },
  {
    id: "sam-rivera",
    displayName: "Sam Rivera",
    company: "Fiction Labs",
    role: "Researcher",
    metAt: "Private dinner",
    lastDiscussed: "Multimodal retrieval",
    conversationTopics: ["Recent multimodal work"],
    recognitionEnabled: true,
    timeline: [],
  },
];

export const seededEvents: Event[] = [
  {
    id: eventId,
    name: "OpenAI Memory Hack Night",
    startsAt: "2026-07-09T23:00:00.000Z",
    locationLabel: "Demo networking floor",
    attendeeContactIds: ["jordan-patel", "alex-morgan", "maya-chen"],
  },
];

export function createDemoMemoryDraft(transcript: string): MemoryDraft {
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
