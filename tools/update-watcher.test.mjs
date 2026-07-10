import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  isAllowedByRobots,
  isMonthlyCheckDue,
  isPrivateAddress,
  parseFeed,
  parseWebsite,
} from "./update-watcher-core.mjs";

test("parses bounded RSS and Atom suggestions", () => {
  const rss = parseFeed(`
    <rss><channel><item>
      <title>Promoted to Engineering Manager</title>
      <link>https://example.com/update</link>
      <description><![CDATA[Leading the developer tools team.]]></description>
      <pubDate>Wed, 01 Jul 2026 12:00:00 GMT</pubDate>
    </item></channel></rss>
  `, "https://example.com/feed.xml");
  assert.equal(rss[0].title, "Promoted to Engineering Manager");
  assert.equal(rss[0].summary, "Leading the developer tools team.");
  assert.equal(rss[0].publishedAt, "2026-07-01T12:00:00.000Z");

  const atom = parseFeed(`
    <feed><entry><title>Ran a marathon</title><id>run-1</id>
      <link href="https://example.com/run"/><updated>2026-06-05T09:00:00Z</updated>
    </entry></feed>
  `, "https://example.com/atom.xml");
  assert.equal(atom[0].url, "https://example.com/run");
});

test("uses public website metadata as a change fingerprint", () => {
  const page = parseWebsite(`
    <html><head><title>Fallback</title>
      <meta property="og:title" content="Alex joined Northstar">
      <meta name="description" content="Alex will lead applied AI.">
      <link rel="canonical" href="https://example.com/alex">
    </head></html>
  `, "https://example.com/team/alex");
  assert.equal(page.title, "Alex joined Northstar");
  assert.equal(page.summary, "Alex will lead applied AI.");
  assert.equal(page.url, "https://example.com/alex");
});

test("honors the most specific robots rule", () => {
  const robots = `
    User-agent: *
    Disallow: /people/
    Allow: /people/public/
  `;
  assert.equal(isAllowedByRobots(robots, "/people/private/alex"), false);
  assert.equal(isAllowedByRobots(robots, "/people/public/alex"), true);
});

test("rejects private and reserved network targets", () => {
  for (const address of ["127.0.0.1", "10.0.0.2", "169.254.2.4", "192.168.1.1", "203.0.113.5", "::1", "fd00::1", "2001:db8::1"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2001:4860:4860::8888"), false);
});

test("checks a source at most once per 28-day monthly interval", () => {
  const now = new Date("2026-07-10T12:00:00.000Z");
  assert.equal(isMonthlyCheckDue(undefined, now), true);
  assert.equal(isMonthlyCheckDue("2026-06-13T12:00:00.000Z", now), false);
  assert.equal(isMonthlyCheckDue("2026-06-12T12:00:00.000Z", now), true);
});

test("serves only the local API and rejects insecure source URLs", async () => {
  const directory = path.join(os.tmpdir(), `context-watch-test-${randomUUID()}`);
  const dataFile = path.join(directory, "watch.json");
  const watcherPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "update-watcher.mjs");
  const port = 18_000 + (process.pid % 1_000);
  const child = spawn(process.execPath, [watcherPath, "serve"], {
    env: { ...process.env, CONTEXT_WATCH_DATA_FILE: dataFile, CONTEXT_WATCH_PORT: String(port) },
    stdio: "ignore",
  });
  try {
    let health;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.deepEqual(health, { ok: true, service: "context-update-watch", monthlyIntervalDays: 28 });

    const response = await fetch(`http://127.0.0.1:${port}/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:8081" },
      body: JSON.stringify({ contactId: "alex", contactName: "Alex", label: "Unsafe", url: "http://localhost/profile", kind: "website" }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /HTTPS/);

    const blockedResponse = await fetch(`http://127.0.0.1:${port}/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:8081" },
      body: JSON.stringify({ contactId: "alex", contactName: "Alex", label: "LinkedIn", url: "https://www.linkedin.com/in/alex", kind: "website" }),
    });
    assert.equal(blockedResponse.status, 400);
    assert.match((await blockedResponse.json()).error, /does not permit/);

    const clearResponse = await fetch(`http://127.0.0.1:${port}/data`, {
      method: "DELETE",
      headers: { Origin: "http://localhost:8081" },
    });
    assert.equal(clearResponse.status, 200);
    assert.deepEqual(await clearResponse.json(), { ok: true });
  } finally {
    child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
