import { seededContacts, seededEvents, toContactContext } from "@context/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { ApiConfig } from "./config.js";

const config: ApiConfig = {
  port: 8787,
  textModel: "test",
  transcriptionModel: "test",
  aiMode: "rules",
  allowedOrigins: ["http://localhost:8081"],
};

describe("Context API", () => {
  const app = createApp(config);

  it("reports rules mode without exposing secrets", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, aiMode: "rules", version: "0.2.0" });
  });

  it("extracts a structured memory in rules mode", async () => {
    const response = await app.request("/ai/extract-memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transcript: "Alex accepted a new job in New York and is hiring AI engineers.",
        contact: toContactContext(seededContacts[1]!),
        event: {
          id: seededEvents[0]!.id,
          name: seededEvents[0]!.name,
          startsAt: seededEvents[0]!.startsAt,
        },
      }),
    });
    const body = await response.json() as { summary: string; suggestedTags: string[] };
    expect(response.status).toBe(200);
    expect(body.summary).toContain("New York");
    expect(body.suggestedTags).toContain("hiring");
  });

  it("never exposes a face-recognition endpoint", async () => {
    const response = await app.request("/ai/recognize", { method: "POST" });
    expect(response.status).toBe(404);
  });

  it("rejects malformed contact context", async () => {
    const response = await app.request("/ai/extract-memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "Hello", contact: {} }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects invalid JSON as a client error", async () => {
    const response = await app.request("/ai/extract-memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request body must be valid JSON." });
  });

  it("does not fake a voice transcription in rules mode", async () => {
    const response = await app.request("/ai/transcribe", { method: "POST" });
    expect(response.status).toBe(503);
  });

  it("rejects oversized JSON before parsing it", async () => {
    const response = await app.request("/ai/extract-memory", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "70000" },
      body: "{}",
    });
    expect(response.status).toBe(413);
  });

  it("enforces the actual JSON size when no length is declared", async () => {
    const response = await app.request("/ai/extract-memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "x".repeat(66_000) }),
    });
    expect(response.status).toBe(413);
  });

  it("does not grant CORS access to untrusted origins", async () => {
    const response = await app.request("/health", { headers: { origin: "https://untrusted.example" } });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("API configuration", () => {
  it("requires a key when OpenAI mode is selected", () => {
    expect(() => loadConfig({ AI_MODE: "openai" } as NodeJS.ProcessEnv)).toThrow(
      "OPENAI_API_KEY is required",
    );
  });

  it("defaults to honest rules mode without a key", () => {
    expect(loadConfig({} as NodeJS.ProcessEnv).aiMode).toBe("rules");
  });
});
