import {
  MemoryDraftSchema,
  TopicSuggestionSchema,
  toContactContext,
  type Contact,
  type Event,
  type MemoryDraft,
} from "@context/shared";
import { Platform } from "react-native";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "https://context-memory-api.vercel.app").replace(/\/$/, "");
const requestTimeoutMs = 15_000;

export interface ApiHealth {
  ok: true;
  aiMode: "openai" | "rules";
  version?: string;
}

function validateApiUrl(): void {
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(apiUrl);
  const isPrivateLan = /^http:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i.test(apiUrl);
  if (!apiUrl.startsWith("https://") && !isLocal && !(__DEV__ && isPrivateLan)) {
    throw new Error("Context requires HTTPS for non-local API connections.");
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? "The request failed.";
  } catch {
    return "The request failed.";
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  validateApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(`${apiUrl}${path}`, { ...init, signal: controller.signal });
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") {
      throw new Error("Context could not reach the memory service in time. Check your connection and try again.");
    }
    throw new Error("Context could not reach the memory service. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function getApiHealth(): Promise<ApiHealth> {
  const response = await request("/health");
  if (!response.ok) throw new Error(await readError(response));
  const raw = await response.json() as { ok?: boolean; aiMode?: string; version?: string };
  if (raw.ok !== true || !["openai", "rules", "demo"].includes(raw.aiMode ?? "")) {
    throw new Error("The memory service returned an unexpected health response.");
  }
  return {
    ok: true,
    aiMode: raw.aiMode === "openai" ? "openai" : "rules",
    ...(raw.version ? { version: raw.version } : {}),
  };
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const response = await request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function transcribeAudio(uri: string): Promise<{ transcript: string; provider: "openai" }> {
  validateApiUrl();
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("audio", blob, "memory.webm");
  } else {
    form.append("audio", {
      uri,
      name: uri.endsWith(".wav") ? "memory.wav" : "memory.m4a",
      type: uri.endsWith(".wav") ? "audio/wav" : "audio/m4a",
    } as unknown as Blob);
  }
  const response = await request("/ai/transcribe", { method: "POST", body: form });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ transcript: string; provider: "openai" }>;
}

function eventContext(event?: Event) {
  return event ? { id: event.id, name: event.name, startsAt: event.startsAt } : undefined;
}

export async function extractMemory(
  transcript: string,
  contact: Contact,
  event?: Event,
): Promise<MemoryDraft> {
  const raw = await postJson("/ai/extract-memory", {
    transcript,
    contact: toContactContext(contact),
    ...(event ? { event: eventContext(event) } : {}),
  });
  return MemoryDraftSchema.parse(raw);
}

export async function suggestTopics(contact: Contact, event?: Event): Promise<string[]> {
  const raw = await postJson("/ai/suggest-topics", {
    contact: toContactContext(contact),
    ...(event ? { event: eventContext(event) } : {}),
  });
  return TopicSuggestionSchema.parse(raw).topics;
}
