import {
  ContactDraftRequestSchema,
  createLocalConversationTopics,
  createLocalMemoryDraft,
  LocalContactDraftResponseSchema,
  LocalMemoryDraftResponseSchema,
  LocalModelHealthSchema,
  LocalTopicSuggestionResponseSchema,
  MemoryExtractionRequestSchema,
  TopicSuggestionRequestSchema,
  toContactContext,
  type Contact,
  type ContactDraft,
  type Event,
  type LocalModelHealth,
  type MemoryDraft,
} from "@context/shared";
import { Platform } from "react-native";
import {
  buildContactDraftPrompt,
  buildConversationTopicsPrompt,
  buildMemoryDraftPrompt,
  parseContactDraftOutput,
  parseConversationTopicsOutput,
  parseMemoryDraftOutput,
} from "./local-model-contract";
import { generateOnDevice, getOnDeviceModelStatus } from "./native-local-model";

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
      throw new Error(typeof body?.error === "string" ? body.error : "Smart Assist returned an error.");
    }
    return schema.parse(body);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Smart Assist took too long to respond.");
    if (error instanceof TypeError) throw new Error("Smart Assist is unavailable right now.");
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

export async function getLocalModelHealth(): Promise<LocalModelHealth> {
  if (Platform.OS === "web") {
    return localRequest("/ai/health", LocalModelHealthSchema, undefined, 10_000);
  }
  if (Platform.OS !== "ios") {
    return LocalModelHealthSchema.parse({
      ok: true,
      provider: "rules",
      model: "Basic assistance",
      status: "ready",
      message: "Basic assistance is ready.",
    });
  }
  try {
    const status = await getOnDeviceModelStatus();
    const ready = status.installed;
    return LocalModelHealthSchema.parse({
      ok: ready,
      provider: "litert-lm",
      model: status.model,
      status: ready ? "ready" : "model-missing",
      message: status.message ?? (ready
        ? `${status.model} is ${status.loaded ? "ready" : "downloaded and ready to load"}.`
        : "Set up the on-device model in Settings → Smart Assist before using model-generated drafts."),
    });
  } catch (error) {
    return LocalModelHealthSchema.parse({
      ok: false,
      provider: "litert-lm",
      model: "Gemma 4 E2B IT",
      status: "runtime-unavailable",
      message: error instanceof Error ? error.message : "The Smart Assist model is unavailable.",
    });
  }
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
  if (Platform.OS === "ios") {
    const request = buildMemoryDraftPrompt(input.transcript, contact, event);
    const result = await generateOnDevice(request.systemPrompt, request.prompt);
    return {
      model: `${result.model} (${result.backend})`,
      draft: parseMemoryDraftOutput(result.text),
    };
  }
  if (Platform.OS !== "web") {
    return {
      model: "Smart Assist",
      draft: createLocalMemoryDraft(input.transcript),
    };
  }
  return localRequest("/ai/memory-draft", LocalMemoryDraftResponseSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createModelContactDraft(
  transcript: string,
): Promise<{ model: string; draft: ContactDraft }> {
  const input = ContactDraftRequestSchema.parse({ transcript });
  if (Platform.OS !== "ios") {
    throw new Error("Gemma detail filling requires the iPhone app and its downloaded Smart Assist model.");
  }
  const request = buildContactDraftPrompt(input.transcript);
  const result = await generateOnDevice(request.systemPrompt, request.prompt);
  return LocalContactDraftResponseSchema.parse({
    model: `${result.model} (${result.backend})`,
    draft: parseContactDraftOutput(result.text),
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
  if (Platform.OS === "ios") {
    const request = buildConversationTopicsPrompt(contact, event);
    const result = await generateOnDevice(request.systemPrompt, request.prompt);
    return {
      model: `${result.model} (${result.backend})`,
      topics: parseConversationTopicsOutput(result.text),
    };
  }
  if (Platform.OS !== "web") {
    return {
      model: "Smart Assist",
      topics: createLocalConversationTopics(contact, input.event),
    };
  }
  return localRequest("/ai/topics", LocalTopicSuggestionResponseSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
