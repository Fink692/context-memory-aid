import {
  MemoryExtractionRequestSchema,
  TopicSuggestionRequestSchema,
} from "../../../packages/shared/src/vercel.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { ApiConfig } from "./config.js";
import { MemoryAiService } from "./ai.js";

const allowedAudioTypes = new Set([
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);
const maxAudioBytes = 10 * 1024 * 1024;
const maxJsonBytes = 64 * 1024;

function actualJsonBytes(body: string): number {
  return new TextEncoder().encode(body).byteLength;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export function createApp(config: ApiConfig) {
  const app = new Hono();
  const ai = new MemoryAiService(config);
  const rateBuckets = new Map<string, RateBucket>();

  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: (origin) => (config.allowedOrigins.includes(origin) ? origin : ""),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 600,
    }),
  );

  app.use("/ai/*", async (c, next) => {
    const now = Date.now();
    const key = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const existing = rateBuckets.get(key);
    const bucket = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + 60_000 }
      : existing;
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > 30) {
      return c.json({ error: "Too many requests. Try again shortly." }, 429);
    }
    if (rateBuckets.size > 1_000) {
      for (const [bucketKey, candidate] of rateBuckets) {
        if (candidate.resetAt <= now) rateBuckets.delete(bucketKey);
      }
    }
    await next();
  });

  app.get("/health", (c) =>
    c.json({ ok: true, aiMode: config.aiMode, version: "0.2.0" }),
  );

  app.post("/ai/transcribe", async (c) => {
    if (config.aiMode !== "openai") {
      return c.json({ error: "Voice transcription requires OpenAI mode. Typed notes and rules-based drafts are still available." }, 503);
    }
    const body = await c.req.parseBody();
    const audio = body.audio;
    if (!(audio instanceof File)) {
      return c.json({ error: "An audio file is required." }, 400);
    }
    if (audio.size === 0 || audio.size > maxAudioBytes) {
      return c.json({ error: "Audio must be between 1 byte and 10 MB." }, 400);
    }
    if (audio.type && !allowedAudioTypes.has(audio.type)) {
      return c.json({ error: "Unsupported audio format." }, 415);
    }
    return c.json(await ai.transcribe(audio));
  });

  app.post("/ai/extract-memory", async (c) => {
    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > maxJsonBytes) return c.json({ error: "Memory request is too large." }, 413);
    const rawBody = await c.req.text();
    if (actualJsonBytes(rawBody) > maxJsonBytes) return c.json({ error: "Memory request is too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Request body must be valid JSON." }, 400);
    }
    const parsed = MemoryExtractionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid memory request." }, 400);
    }
    return c.json(await ai.extractMemory({
      transcript: parsed.data.transcript,
      contact: parsed.data.contact,
      ...(parsed.data.event ? { event: parsed.data.event } : {}),
    }));
  });

  app.post("/ai/suggest-topics", async (c) => {
    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > maxJsonBytes) return c.json({ error: "Topic request is too large." }, 413);
    const rawBody = await c.req.text();
    if (actualJsonBytes(rawBody) > maxJsonBytes) return c.json({ error: "Topic request is too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Request body must be valid JSON." }, 400);
    }
    const parsed = TopicSuggestionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid topic request." }, 400);
    }
    const topics = await ai.suggestTopics({
      contact: parsed.data.contact,
      ...(parsed.data.event ? { event: parsed.data.event } : {}),
    });
    return c.json({ topics });
  });

  app.onError((error, c) => {
    // Intentionally do not log request bodies or personal data.
    const message = error instanceof Error && error.message === "AI service is not configured."
      ? error.message
      : "The request could not be completed.";
    return c.json({ error: message }, 500);
  });

  app.notFound((c) => c.json({ error: "Not found." }, 404));
  return app;
}
