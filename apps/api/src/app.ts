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
    await next();
  });

  app.get("/health", (c) =>
    c.json({ ok: true, aiMode: config.demoMode ? "demo" : "openai" }),
  );

  app.post("/ai/transcribe", async (c) => {
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
    const parsed = MemoryExtractionRequestSchema.safeParse(await c.req.json());
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
    const parsed = TopicSuggestionRequestSchema.safeParse(await c.req.json());
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
