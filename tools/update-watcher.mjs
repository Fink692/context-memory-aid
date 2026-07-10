import { randomUUID } from "node:crypto";
import { promises as dns } from "node:dns";
import { promises as fs } from "node:fs";
import https from "node:https";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { isIP } from "node:net";
import {
  isAllowedByRobots,
  isMonthlyCheckDue,
  isPrivateAddress,
  parseFeed,
  parseWebsite,
} from "./update-watcher-core.mjs";
import { createLocalModelClient } from "./local-model.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.CONTEXT_WATCH_PORT ?? "8789");
const USER_AGENT = "ContextMemoryLocalWatcher/0.1 (+local relationship memory aid)";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const MONTHLY_INTERVAL_DAYS = 28;
const BLOCKED_PLATFORM_HOSTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
];

const defaultDataDirectory = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "ContextMemory")
  : path.join(os.homedir(), ".context-memory");
const DATA_FILE = process.env.CONTEXT_WATCH_DATA_FILE
  ? path.resolve(process.env.CONTEXT_WATCH_DATA_FILE)
  : path.join(defaultDataDirectory, "update-watch.json");
const LOCK_FILE = `${DATA_FILE}.lock`;
let mutationTail = Promise.resolve();

function emptyStore() {
  return { version: 1, sources: [], updates: [] };
}

function cleanError(error) {
  const message = error instanceof Error ? error.message : "The source could not be checked.";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    if (parsed?.version !== 1 || !Array.isArray(parsed.sources) || !Array.isArray(parsed.updates)) {
      throw new Error("The local Update Watch data file is invalid.");
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return emptyStore();
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const temporary = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, DATA_FILE);
}

async function acquireFileLock() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.open(LOCK_FILE, "wx", 0o600);
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
      return handle;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const stats = await fs.stat(LOCK_FILE).catch(() => undefined);
      if (attempt === 0 && stats && Date.now() - stats.mtimeMs > 30 * 60 * 1_000) {
        await fs.unlink(LOCK_FILE).catch(() => undefined);
        continue;
      }
      throw new Error("Update Watch data is busy with another check. Try again after it finishes.");
    }
  }
  throw new Error("Update Watch data lock could not be acquired.");
}

async function withMutation(action) {
  let releaseLocal;
  const previous = mutationTail;
  mutationTail = new Promise((resolve) => { releaseLocal = resolve; });
  await previous;
  let lock;
  try {
    lock = await acquireFileLock();
    return await action();
  } finally {
    if (lock) {
      await lock.close().catch(() => undefined);
      await fs.unlink(LOCK_FILE).catch(() => undefined);
    }
    releaseLocal();
  }
}

function platformIsBlocked(hostname) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return BLOCKED_PLATFORM_HOSTS.some((host) => normalized === host || normalized.endsWith(`.${host}`));
}

function parsePublicHttpsUrl(value, _kind) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a complete public HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Only public HTTPS URLs without embedded credentials are supported.");
  }
  if (platformIsBlocked(url.hostname)) {
    throw new Error("This social network does not permit this local page watcher. Use an official public RSS feed, personal site, newsroom, or blog instead.");
  }
  return url;
}

async function publicAddressFor(url) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Private, local, and reserved network addresses are not allowed.");
  }
  return addresses[0];
}

async function httpsGet(input, redirectsRemaining = 4) {
  const url = parsePublicHttpsUrl(input.href ?? input, "rss");
  const target = await publicAddressFor(url);
  const result = await new Promise((resolve, reject) => {
    let settled = false;
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = https.request({
      protocol: "https:",
      hostname: target.address,
      family: target.family,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      servername: url.hostname,
      rejectUnauthorized: true,
      headers: {
        Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.2",
        "Accept-Encoding": "identity",
        Connection: "close",
        Host: url.host,
        "User-Agent": USER_AGENT,
      },
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          request.destroy(new Error("The source response exceeded the 2 MB safety limit."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
          url,
        });
      });
      response.on("error", finishReject);
    });
    request.setTimeout(15_000, () => request.destroy(new Error("The source timed out after 15 seconds.")));
    request.on("error", finishReject);
    request.end();
  });

  if ([301, 302, 303, 307, 308].includes(result.status)) {
    if (redirectsRemaining <= 0) throw new Error("The source redirected too many times.");
    const location = Array.isArray(result.headers.location) ? result.headers.location[0] : result.headers.location;
    if (!location) throw new Error("The source returned an invalid redirect.");
    return httpsGet(new URL(location, result.url), redirectsRemaining - 1);
  }
  return result;
}

async function assertRobotsPermission(url) {
  const robotsUrl = new URL("/robots.txt", url.origin);
  const response = await httpsGet(robotsUrl);
  if (response.status === 404 || response.status === 410) return;
  if (response.status === 401 || response.status === 403) {
    throw new Error("The site does not allow this watcher to read its robots policy.");
  }
  if (response.status >= 500) throw new Error("The site robots policy is temporarily unavailable.");
  if (response.status >= 400) return;
  if (!isAllowedByRobots(response.body, `${url.pathname}${url.search}`)) {
    throw new Error("The site robots policy does not allow this page to be checked.");
  }
}

async function fetchSource(source) {
  const url = parsePublicHttpsUrl(source.url, source.kind);
  await assertRobotsPermission(url);
  const response = await httpsGet(url);
  if (response.status === 401 || response.status === 403) {
    throw new Error("This source requires access the watcher will not bypass.");
  }
  if (response.status >= 400) throw new Error(`The source returned HTTP ${response.status}.`);
  const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
  if (source.kind === "rss") {
    if (contentType && !/(xml|rss|atom|text\/plain|octet-stream)/.test(contentType)) {
      throw new Error("This URL did not return an RSS or Atom document.");
    }
    return parseFeed(response.body, response.url.href);
  }
  if (contentType && !/(text\/html|application\/xhtml|text\/plain)/.test(contentType)) {
    throw new Error("This URL did not return a public web page.");
  }
  return [parseWebsite(response.body, response.url.href)];
}

function boundedString(value, name, max) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${name} is required and must be ${max} characters or fewer.`);
  }
  return value.trim();
}

async function addSource(input) {
  const kind = input?.kind;
  if (kind !== "rss" && kind !== "website") throw new Error("Choose RSS/Atom or public website.");
  const url = parsePublicHttpsUrl(boundedString(input.url, "Source URL", 2_048), kind);
  await publicAddressFor(url);
  return withMutation(async () => {
    const store = await readStore();
    if (store.sources.length >= 100) throw new Error("Update Watch supports up to 100 confirmed sources.");
    if (store.sources.some((source) => source.contactId === input.contactId && source.url === url.href)) {
      throw new Error("This source is already watched for that person.");
    }
    const source = {
      id: randomUUID(),
      contactId: boundedString(input.contactId, "Contact", 80),
      contactName: boundedString(input.contactName, "Contact name", 100),
      label: boundedString(input.label, "Source label", 120),
      url: url.href,
      kind,
      enabled: true,
      createdAt: new Date().toISOString(),
      seenKeys: [],
    };
    store.sources.push(source);
    await writeStore(store);
    return source;
  });
}

async function checkSources({ contactId, force = false } = {}) {
  return withMutation(async () => {
    const store = await readStore();
    const report = { checked: 0, discovered: 0, failed: 0, skipped: 0 };
    for (const source of store.sources) {
      if (!source.enabled || (contactId && source.contactId !== contactId)) continue;
      if (!force && !isMonthlyCheckDue(source.lastCheckedAt)) {
        report.skipped += 1;
        continue;
      }
      const checkedAt = new Date().toISOString();
      try {
        const entries = await fetchSource(source);
        const previous = new Set(Array.isArray(source.seenKeys) ? source.seenKeys : []);
        const newEntries = previous.size === 0 && source.kind === "website"
          ? []
          : entries.filter((entry) => !previous.has(entry.key)).slice(0, 3);
        for (const entry of newEntries) {
          store.updates.unshift({
            id: randomUUID(),
            key: entry.key,
            contactId: source.contactId,
            sourceId: source.id,
            sourceLabel: source.label,
            title: entry.title,
            ...(entry.summary ? { summary: entry.summary } : {}),
            ...(entry.url ? { url: entry.url } : {}),
            ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
            discoveredAt: checkedAt,
          });
        }
        source.seenKeys = [...new Set([...entries.map((entry) => entry.key), ...previous])].slice(0, 100);
        source.lastCheckedAt = checkedAt;
        delete source.lastError;
        report.checked += 1;
        report.discovered += newEntries.length;
      } catch (error) {
        source.lastCheckedAt = checkedAt;
        source.lastError = cleanError(error);
        report.checked += 1;
        report.failed += 1;
      }
    }
    store.updates = store.updates.slice(0, 200);
    await writeStore(store);
    return report;
  });
}

function allowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:")
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  } catch {
    return false;
  }
}

function sendJson(response, status, value, origin) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    ...(origin && allowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new Error("The request exceeded the 64 KB safety limit.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("The request body must be valid JSON.");
  }
}

let checkInProgress = false;
const localModel = createLocalModelClient();

async function handleRequest(request, response) {
  const origin = request.headers.origin;
  if (!allowedOrigin(origin)) return sendJson(response, 403, { error: "Only local app origins may use Update Watch." });
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    });
    return response.end();
  }

  const requestUrl = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  try {
    if (request.method === "GET" && requestUrl.pathname === "/health") {
      return sendJson(response, 200, { ok: true, service: "context-update-watch", monthlyIntervalDays: 28 }, origin);
    }
    if (request.method === "GET" && requestUrl.pathname === "/ai/health") {
      return sendJson(response, 200, await localModel.health(), origin);
    }
    if (request.method === "POST" && requestUrl.pathname === "/ai/memory-draft") {
      return sendJson(response, 200, await localModel.createMemoryDraft(await readJson(request)), origin);
    }
    if (request.method === "POST" && requestUrl.pathname === "/ai/topics") {
      return sendJson(response, 200, await localModel.createConversationTopics(await readJson(request)), origin);
    }
    if (request.method === "GET" && requestUrl.pathname === "/sources") {
      const store = await readStore();
      const contactId = requestUrl.searchParams.get("contactId");
      const sources = store.sources
        .filter((source) => !contactId || source.contactId === contactId)
        .map(({ seenKeys: _seenKeys, ...source }) => source);
      return sendJson(response, 200, sources, origin);
    }
    if (request.method === "POST" && requestUrl.pathname === "/sources") {
      const source = await addSource(await readJson(request));
      const { seenKeys: _seenKeys, ...publicSource } = source;
      return sendJson(response, 201, publicSource, origin);
    }
    const sourceDelete = /^\/sources\/([^/]+)$/.exec(requestUrl.pathname);
    if (request.method === "DELETE" && sourceDelete) {
      const id = decodeURIComponent(sourceDelete[1]);
      const found = await withMutation(async () => {
        const store = await readStore();
        const before = store.sources.length;
        store.sources = store.sources.filter((source) => source.id !== id);
        store.updates = store.updates.filter((update) => update.sourceId !== id);
        if (store.sources.length === before) return false;
        await writeStore(store);
        return true;
      });
      if (!found) return sendJson(response, 404, { error: "Source not found." }, origin);
      return sendJson(response, 200, { ok: true }, origin);
    }
    const contactDelete = /^\/contacts\/([^/]+)$/.exec(requestUrl.pathname);
    if (request.method === "DELETE" && contactDelete) {
      const contactId = decodeURIComponent(contactDelete[1]);
      await withMutation(async () => {
        const store = await readStore();
        store.sources = store.sources.filter((source) => source.contactId !== contactId);
        store.updates = store.updates.filter((update) => update.contactId !== contactId);
        await writeStore(store);
      });
      return sendJson(response, 200, { ok: true }, origin);
    }
    if (request.method === "DELETE" && requestUrl.pathname === "/data") {
      await withMutation(() => writeStore(emptyStore()));
      return sendJson(response, 200, { ok: true }, origin);
    }
    if (request.method === "GET" && requestUrl.pathname === "/updates") {
      const store = await readStore();
      const contactId = requestUrl.searchParams.get("contactId");
      const updates = store.updates
        .filter((update) => !contactId || update.contactId === contactId)
        .map(({ key: _key, ...update }) => update);
      return sendJson(response, 200, updates, origin);
    }
    const updateDismiss = /^\/updates\/([^/]+)\/dismiss$/.exec(requestUrl.pathname);
    if (request.method === "POST" && updateDismiss) {
      const id = decodeURIComponent(updateDismiss[1]);
      const found = await withMutation(async () => {
        const store = await readStore();
        const before = store.updates.length;
        store.updates = store.updates.filter((update) => update.id !== id);
        if (store.updates.length === before) return false;
        await writeStore(store);
        return true;
      });
      if (!found) return sendJson(response, 404, { error: "Update not found." }, origin);
      return sendJson(response, 200, { ok: true }, origin);
    }
    if (request.method === "POST" && requestUrl.pathname === "/check") {
      if (checkInProgress) return sendJson(response, 409, { error: "A source check is already running." }, origin);
      const input = await readJson(request);
      const contactId = input.contactId ? boundedString(input.contactId, "Contact", 80) : undefined;
      checkInProgress = true;
      try {
        return sendJson(response, 200, await checkSources({ contactId, force: input.force === true }), origin);
      } finally {
        checkInProgress = false;
      }
    }
    return sendJson(response, 404, { error: "Not found." }, origin);
  } catch (error) {
    return sendJson(response, 400, { error: cleanError(error) }, origin);
  }
}

async function serve() {
  const server = http.createServer((request, response) => { void handleRequest(request, response); });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 64;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, resolve);
  });
  console.log(`Context Update Watch is ready at http://${HOST}:${PORT}`);
  console.log(`Local AI model: ${localModel.model} through loopback-only Ollama`);
  console.log(`Private watcher data: ${DATA_FILE}`);
}

async function checkThroughRunningService() {
  try {
    const health = await fetch(`http://${HOST}:${PORT}/health`);
    if (!health.ok) return undefined;
  } catch {
    return undefined;
  }
  const response = await fetch(`http://${HOST}:${PORT}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: false }),
  });
  if (response.status === 409) return { checked: 0, discovered: 0, failed: 0, skipped: 0, alreadyRunning: true };
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? "The running watcher could not complete the monthly check.");
  return body;
}

const command = process.argv[2] ?? "serve";
if (command === "serve") {
  await serve();
} else if (command === "check") {
  const report = await checkThroughRunningService() ?? await checkSources();
  console.log(report.alreadyRunning
    ? "Monthly check skipped because the running watcher is already checking sources."
    : `Monthly check complete: ${report.checked} checked, ${report.discovered} suggestions, ${report.failed} failed, ${report.skipped} not due.`);
  if (report.failed) process.exitCode = 1;
} else {
  console.error("Usage: node tools/update-watcher.mjs [serve|check]");
  process.exitCode = 2;
}
