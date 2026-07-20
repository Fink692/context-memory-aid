import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

import {
  addDeviceWatchSource,
  checkDeviceWatchSources,
  clearDeviceUpdateWatchData,
  dismissDeviceWatchUpdate,
  listDeviceWatchSources,
  listDeviceWatchUpdates,
  parseDevicePublicUrl,
  removeDeviceWatchContact,
} from "./device-update-watcher";

const sourceInput = {
  contactId: "contact-taylor",
  contactName: "Taylor Reed",
  label: "Taylor's public feed",
  url: "https://example.com/taylor/feed.xml",
  kind: "rss" as const,
};

beforeEach(async () => {
  storage.clear();
  await clearDeviceUpdateWatchData();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("on-device public URL boundary", () => {
  it("rejects credentials, private literals, local names, and blocked social pages", () => {
    for (const url of [
      "https://user:secret@example.com/feed.xml",
      "https://localhost/feed.xml",
      "https://127.0.0.1/feed.xml",
      "https://10.0.0.2/feed.xml",
      "https://203.0.113.8/feed.xml",
      "https://[::1]/feed.xml",
      "https://www.linkedin.com/in/taylor",
    ]) {
      expect(() => parseDevicePublicUrl(url), url).toThrow();
    }
    expect(parseDevicePublicUrl("https://8.8.8.8/feed.xml").href).toBe("https://8.8.8.8/feed.xml");
    expect(parseDevicePublicUrl("https://updates.example.com/feed.xml").href).toBe("https://updates.example.com/feed.xml");
  });
});

describe("on-device Update Watch lifecycle", () => {
  it("parses an RSS feed, deduplicates entries, and respects the due interval", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response(`
        <rss><channel><item>
          <title>Taylor launched a new project</title>
          <link>https://example.com/taylor/project</link>
          <description>A private-by-default memory tool.</description>
          <pubDate>Thu, 09 Jul 2026 12:00:00 GMT</pubDate>
        </item></channel></rss>
      `, { status: 200, headers: { "Content-Type": "application/rss+xml" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await addDeviceWatchSource(sourceInput);
    expect(await checkDeviceWatchSources(sourceInput.contactId, true)).toMatchObject({ checked: 1, discovered: 1, failed: 0 });
    const updates = await listDeviceWatchUpdates(sourceInput.contactId);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      sourceLabel: sourceInput.label,
      title: "Taylor launched a new project",
      url: "https://example.com/taylor/project",
    });

    expect(await checkDeviceWatchSources(sourceInput.contactId, true)).toMatchObject({ checked: 1, discovered: 0 });
    expect(await listDeviceWatchUpdates(sourceInput.contactId)).toHaveLength(1);
    expect(await checkDeviceWatchSources(sourceInput.contactId, false)).toMatchObject({ checked: 0, skipped: 1 });

    await dismissDeviceWatchUpdate(updates[0]!.id);
    await dismissDeviceWatchUpdate(updates[0]!.id);
    expect(await listDeviceWatchUpdates(sourceInput.contactId)).toEqual([]);
  });

  it("baselines a website before suggesting a later public change", async () => {
    let revision = 1;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response(`
        <html><head>
          <title>Taylor's profile</title>
          <meta name="description" content="Revision ${revision}">
          <link rel="canonical" href="https://example.com/taylor">
        </head></html>
      `, { status: 200, headers: { "Content-Type": "text/html" } });
    }));

    await addDeviceWatchSource({ ...sourceInput, kind: "website", url: "https://example.com/taylor" });
    expect(await checkDeviceWatchSources(sourceInput.contactId, true)).toMatchObject({ discovered: 0, failed: 0 });
    revision = 2;
    expect(await checkDeviceWatchSources(sourceInput.contactId, true)).toMatchObject({ discovered: 1, failed: 0 });
    expect(await listDeviceWatchUpdates(sourceInput.contactId)).toHaveLength(1);
  });

  it("honors robots rules and rejects redirects to private literals", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /taylor/", { status: 200, headers: { "Content-Type": "text/plain" } });
      }
      throw new Error("The blocked source should never be requested.");
    }));
    await addDeviceWatchSource(sourceInput);
    expect(await checkDeviceWatchSources(sourceInput.contactId, true)).toMatchObject({ failed: 1, discovered: 0 });
    expect((await listDeviceWatchSources(sourceInput.contactId))[0]?.lastError).toMatch(/robots policy/);

    await clearDeviceUpdateWatchData();
    await addDeviceWatchSource({ ...sourceInput, url: "https://example.com/public.xml" });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response("", { status: 302, headers: { Location: "https://127.0.0.1/private" } });
    }));
    expect(await checkDeviceWatchSources(sourceInput.contactId, true)).toMatchObject({ failed: 1, discovered: 0 });
    expect((await listDeviceWatchSources(sourceInput.contactId))[0]?.lastError).toMatch(/Private, local, and reserved/);
  });

  it("records response-bound errors and can delete all contact data without a companion", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response("too large", { status: 200, headers: { "Content-Length": String(2 * 1024 * 1024 + 1) } });
    }));
    await addDeviceWatchSource(sourceInput);
    expect(await checkDeviceWatchSources(sourceInput.contactId, true)).toMatchObject({ failed: 1 });
    expect((await listDeviceWatchSources(sourceInput.contactId))[0]?.lastError).toMatch(/2 MB safety limit/);

    await removeDeviceWatchContact(sourceInput.contactId);
    expect(await listDeviceWatchSources()).toEqual([]);
    expect(await listDeviceWatchUpdates()).toEqual([]);

    await addDeviceWatchSource(sourceInput);
    await clearDeviceUpdateWatchData();
    expect(await listDeviceWatchSources()).toEqual([]);
  });

  it("cancels and aborts a chunked response that crosses the 2 MB limit", async () => {
    let sourceCanceled = false;
    let sourceSignal: AbortSignal | undefined;
    const chunks = [
      new Uint8Array(1_048_576),
      new Uint8Array(1_048_576),
      new Uint8Array([1]),
    ];

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/robots.txt")) return new Response("", { status: 404 });
      sourceSignal = init?.signal ?? undefined;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          const next = chunks.shift();
          if (next) controller.enqueue(next);
          else controller.close();
        },
        cancel() {
          sourceCanceled = true;
        },
      }, { highWaterMark: 0 });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/rss+xml" },
      });
    }));

    await addDeviceWatchSource(sourceInput);
    expect(await checkDeviceWatchSources(sourceInput.contactId, true)).toMatchObject({ failed: 1, discovered: 0 });
    expect((await listDeviceWatchSources(sourceInput.contactId))[0]?.lastError).toMatch(/2 MB safety limit/);
    expect(sourceCanceled).toBe(true);
    expect(sourceSignal?.aborted).toBe(true);
  });
});
