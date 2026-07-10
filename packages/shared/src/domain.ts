import { z } from "zod";

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const MemorySchema = z.object({
  id: boundedText(80),
  contactId: boundedText(80),
  summary: boundedText(500),
  tags: z.array(boundedText(40)).max(8).default([]),
  nextSteps: z.array(boundedText(160)).max(5).default([]),
  source: z.enum(["voice", "text", "import", "seed", "public-update"]),
  occurredAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const MemoryDraftSchema = z.object({
  summary: boundedText(500),
  extractedFacts: z.array(boundedText(240)).max(8).default([]),
  suggestedTags: z.array(boundedText(40)).max(8).default([]),
  suggestedFollowUps: z.array(boundedText(160)).max(5).default([]),
  confidence: z.number().min(0).max(1),
});

export const ContactSchema = z.object({
  id: boundedText(80),
  displayName: boundedText(100),
  company: optionalText(120),
  role: optionalText(120),
  metAt: optionalText(160),
  lastSpokeAt: z.iso.datetime().optional(),
  lastDiscussed: optionalText(240),
  recentUpdate: optionalText(240),
  conversationTopics: z.array(boundedText(160)).max(8).default([]),
  recognitionEnabled: z.boolean().default(false),
  timeline: z.array(MemorySchema).max(500).default([]),
});

export const EventSchema = z.object({
  id: boundedText(80),
  name: boundedText(160),
  startsAt: z.iso.datetime(),
  locationLabel: optionalText(160),
  attendeeContactIds: z.array(boundedText(80)).max(5000),
});

export const ContactContextSchema = ContactSchema.omit({
  recognitionEnabled: true,
});

export const MemoryExtractionRequestSchema = z.object({
  transcript: boundedText(4_000),
  contact: ContactContextSchema,
  event: EventSchema.pick({ id: true, name: true, startsAt: true }).optional(),
});

export const TopicSuggestionRequestSchema = z.object({
  contact: ContactContextSchema,
  event: EventSchema.pick({ id: true, name: true, startsAt: true }).optional(),
});

export const TopicSuggestionSchema = z.object({
  topics: z.array(boundedText(160)).min(1).max(4),
});

export const ImportContactSchema = z.object({
  displayName: boundedText(100),
  company: optionalText(120),
  role: optionalText(120),
  metAt: optionalText(160),
  lastSpokeAt: z.iso.datetime().optional(),
  notes: optionalText(1_000),
});

export const ExportBundleSchema = z.object({
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  contacts: z.array(ContactSchema),
  events: z.array(EventSchema),
});

export type Memory = z.infer<typeof MemorySchema>;
export type MemoryDraft = z.infer<typeof MemoryDraftSchema>;
export type Contact = z.infer<typeof ContactSchema>;
export type ContactContext = z.infer<typeof ContactContextSchema>;
export type Event = z.infer<typeof EventSchema>;
export type ImportContact = z.infer<typeof ImportContactSchema>;
export type ExportBundle = z.infer<typeof ExportBundleSchema>;

export function toContactContext(contact: Contact): ContactContext {
  const { recognitionEnabled: _recognitionEnabled, ...context } = contact;
  return context;
}
