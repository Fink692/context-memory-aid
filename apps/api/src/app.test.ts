import { seededContacts, seededEvents, toContactContext } from "@context/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { ApiConfig } from "./config.js";

const config: ApiConfig = {
  port: 8787,
  textModel: "test",
  transcriptionModel: "test",
  demoMode: true,
  allowedOrigins: ["http://localhost:8081"],
};

describe("Context API", () => {
  const app = createApp(config);

  it("reports demo mode without exposing secrets", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, aiMode: "demo" });
  });

  it("extracts a structured memory in demo mode", async () => {
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
});
