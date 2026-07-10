import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createLocalModelClient } from "./local-model.mjs";

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function withFakeOllama(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fake Ollama did not bind to TCP.");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("uses loopback Ollama for structured memory drafts and topics", async () => {
  const requests = [];
  await withFakeOllama(async (request, response) => {
    if (request.url === "/api/tags") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ models: [{ name: "qwen3:4b" }] }));
      return;
    }
    const body = await readJson(request);
    requests.push(body);
    const output = body.prompt.includes("editable relationship-memory draft")
      ? {
          summary: "Alex accepted a new role in New York and is hiring AI engineers.",
          extractedFacts: ["Alex accepted a new role in New York.", "Alex is hiring AI engineers."],
          suggestedTags: ["career", "hiring"],
          suggestedFollowUps: ["Ask what profiles the new team needs"],
          confidence: 0.91,
        }
      : { topics: ["How is the new role going?", "What is the team building next?"] };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ response: JSON.stringify(output) }));
  }, async (baseUrl) => {
    const client = createLocalModelClient({ baseUrl, model: "qwen3:4b" });
    assert.deepEqual(await client.health(), {
      ok: true,
      provider: "ollama",
      model: "qwen3:4b",
      status: "ready",
      message: "qwen3:4b is ready on this PC.",
    });
    const context = {
      contact: { displayName: "Alex Morgan", company: "Northstar", conversationTopics: [], timeline: [] },
      event: { name: "Hack night", startsAt: "2026-07-10T00:00:00.000Z" },
    };
    const draft = await client.createMemoryDraft({
      transcript: "Alex accepted a new role in New York and is hiring AI engineers.",
      ...context,
    });
    assert.equal(draft.model, "qwen3:4b");
    assert.equal(draft.draft.confidence, 0.91);
    const topics = await client.createConversationTopics(context);
    assert.equal(topics.topics.length, 2);
  });

  assert.equal(requests.length, 2);
  assert.doesNotMatch(requests[0].prompt, /Northstar/);
  assert.match(requests[1].prompt, /Northstar/);
  for (const request of requests) {
    assert.equal(request.model, "qwen3:4b");
    assert.equal(request.stream, false);
    assert.equal(request.think, false);
    assert.equal(request.format.type, "object");
  }
});

test("rejects remote model endpoints", () => {
  assert.throws(
    () => createLocalModelClient({ baseUrl: "https://models.example.com", model: "qwen3:4b" }),
    /loopback-only/,
  );
});

test("rejects malformed local-model output", async () => {
  await withFakeOllama(async (request, response) => {
    await readJson(request);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ response: JSON.stringify({ summary: "Missing required fields" }) }));
  }, async (baseUrl) => {
    const client = createLocalModelClient({ baseUrl, model: "qwen3:4b" });
    await assert.rejects(
      client.createMemoryDraft({
        transcript: "A valid note",
        contact: { displayName: "Alex", conversationTopics: [], timeline: [] },
      }),
      /invalid confidence|must be a list/,
    );
  });
});
