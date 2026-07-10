import {
  LocalMemoryDraftResponseSchema,
  LocalModelHealthSchema,
  LocalTopicSuggestionResponseSchema,
  MemoryExtractionRequestSchema,
  TopicSuggestionRequestSchema,
  toContactContext,
  type Contact,
  type Event,
  type LocalModelHealth,
  type MemoryDraft,
} from "@context/shared";

const LOCAL_SERVICE_BASE = "http://127.0.0.1:8789";

interface Parser<T> {
  parse(value: unknown): T;
}

async function localRequest<T>(route: string, schema: Parser<T>, init?: RequestInit, timeoutMs = 2 * 60_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${LOCAL_SERVICE_BASE}${route}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof body?.error === "string" ? body.error : "The local model service returned an error.");
    }
    return schema.parse(body);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("The local model timed out.");
    if (error instanceof TypeError) throw new Error("The local PC service is not running. Start it with npm run dev:watcher.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function compactContact(contact: Contact) {
  const context = toContactContext(contact);
  return { ...context, timeline: context.timeline.slice(0, 8) };
}

function compactEvent(event?: Event) {
  return event ? { id: event.id, name: event.name, startsAt: event.startsAt } : undefined;
}

export function getLocalModelHealth(): Promise<LocalModelHealth> {
  return localRequest("/ai/health", LocalModelHealthSchema, undefined, 10_000);
}

export async function createModelMemoryDraft(
  transcript: string,
  contact: Contact,
  event?: Event,
): Promise<{ model: string; draft: MemoryDraft }> {
  const input = MemoryExtractionRequestSchema.parse({
    transcript,
    contact: compactContact(contact),
    event: compactEvent(event),
  });
  return localRequest("/ai/memory-draft", LocalMemoryDraftResponseSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createModelConversationTopics(
  contact: Contact,
  event?: Event,
): Promise<{ model: string; topics: string[] }> {
  const input = TopicSuggestionRequestSchema.parse({
    contact: compactContact(contact),
    event: compactEvent(event),
  });
  return localRequest("/ai/topics", LocalTopicSuggestionResponseSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
