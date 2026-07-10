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
    locationLabel: "Atrium networking floor",
    attendeeContactIds: ["jordan-patel", "alex-morgan", "maya-chen"],
  },
];

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createLocalMemoryDraft(note: string): MemoryDraft {
  const clean = note.trim().replace(/\s+/g, " ");
  const lower = clean.toLocaleLowerCase();
  const tagRules: Array<[RegExp, string]> = [
    [/\b(job|role|career|promot\w*|joined|accepted)\b/, "career"],
    [/\b(hir\w*|recruit\w*|engineers?|candidates?)\b/, "hiring"],
    [/\b(move|moving|relocat\w*|new york)\b/, "location"],
    [/\b(team|manager|lead|leadership)\b/, "team"],
    [/\b(project|launch|ship\w*|build\w*)\b/, "project"],
    [/\b(conference|hackathon|meetup)\b/, "event"],
    [/\b(marathon|running|race)\b/, "running"],
  ];
  const suggestedTags = tagRules
    .filter(([pattern]) => pattern.test(lower))
    .map(([, tag]) => tag)
    .slice(0, 8);

  const extractedFacts = clean
    .split(/(?<=[.!?])\s+/)
    .map((fact) => fact.trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 4);

  const followUps: string[] = [];
  if (/\b(hir\w*|recruit\w*|engineers?|candidates?)\b/.test(lower)) {
    followUps.push("Ask what profiles they are hiring for", "Offer a relevant introduction");
  }
  if (/\b(job|role|career|promot\w*|joined|accepted)\b/.test(lower)) {
    followUps.push("Ask about priorities in the new role");
  }
  if (/\b(move|moving|relocat\w*|new york)\b/.test(lower)) {
    followUps.push("Ask how the transition is going");
  }
  if (/\b(project|launch|ship\w*|build\w*)\b/.test(lower)) {
    followUps.push("Ask what success looks like for the project");
  }

  return {
    summary: clean.length > 240 ? `${clean.slice(0, 237)}...` : clean,
    extractedFacts: extractedFacts.length ? extractedFacts : [clean],
    suggestedTags: suggestedTags.length ? suggestedTags : ["conversation"],
    suggestedFollowUps: unique(followUps).slice(0, 5).length
      ? unique(followUps).slice(0, 5)
      : ["Follow up on this update"],
    confidence: 0.8,
  };
}

export function createLocalConversationTopics(
  contact: Contact,
  event?: Pick<Event, "id" | "name" | "startsAt">,
): string[] {
  const suggestions = [
    contact.recentUpdate ? `Follow up on: ${contact.recentUpdate}` : undefined,
    contact.lastDiscussed ? `Revisit: ${contact.lastDiscussed}` : undefined,
    contact.company ? `What is changing in their work at ${contact.company}?` : undefined,
    event ? `What brought them to ${event.name}?` : undefined,
    ...contact.conversationTopics,
    "What has changed since you last spoke?",
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.slice(0, 160));

  return unique(suggestions).slice(0, 4);
}
