import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  WatchSourceInputSchema,
  WatchSourceSchema,
  WatchUpdateSchema,
  type WatchCheckReport,
  type WatchHealth,
  type WatchSource,
  type WatchSourceInput,
  type WatchUpdate,
} from "@context/shared";
import {
  fingerprint,
  isAllowedByRobots,
  parsePublicFeed,
  parsePublicWebsite,
  type ParsedPublicUpdate,
} from "./web-source-parser";

const STORAGE_KEY = "context-device-update-watch-v1";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;
const MONTHLY_INTERVAL_MS = 28 * 24 * 60 * 60 * 1_000;
const USER_AGENT = "ContextMemoryApp/1.0 (+local relationship memory aid)";
const BLOCKED_PLATFORM_HOSTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
];

interface DeviceWatchSource extends WatchSource {
  seenKeys: string[];
}

interface DeviceWatchUpdate extends WatchUpdate {
  key: string;
}

interface DeviceWatchStore {
  version: 1;
  sources: DeviceWatchSource[];
  updates: DeviceWatchUpdate[];
}

interface PublicResponse {
  body: string;
  contentType: string;
  status: number;
  url: URL;
}

let mutationTail: Promise<void> = Promise.resolve();

function emptyStore(): DeviceWatchStore {
  return { version: 1, sources: [], updates: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoredSource(value: unknown): DeviceWatchSource {
  if (!isRecord(value) || !Array.isArray(value.seenKeys)) {
    throw new Error("The on-device Update Watch store is invalid.");
  }
  const seenKeys = value.seenKeys;
  if (seenKeys.length > 100 || seenKeys.some((key) => typeof key !== "string" || !key || key.length > 80)) {
    throw new Error("The on-device Update Watch store is invalid.");
  }
  const { seenKeys: _seenKeys, ...publicValue } = value;
  const source = WatchSourceSchema.parse(publicValue);
  parseDevicePublicUrl(source.url);
  return { ...source, seenKeys: [...seenKeys] };
}

function parseStoredUpdate(value: unknown): DeviceWatchUpdate {
  if (!isRecord(value) || typeof value.key !== "string" || !value.key || value.key.length > 80) {
    throw new Error("The on-device Update Watch store is invalid.");
  }
  const { key, ...publicValue } = value;
  const update = WatchUpdateSchema.parse(publicValue);
  if (update.url) parseDevicePublicUrl(update.url);
  return { ...update, key };
}

async function readStore(): Promise<DeviceWatchStore> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.sources) || !Array.isArray(parsed.updates)) {
      throw new Error("invalid");
    }
    return {
      version: 1,
      sources: parsed.sources.map(parseStoredSource),
      updates: parsed.updates.map(parseStoredUpdate),
    };
  } catch {
    throw new Error("The on-device Update Watch store is invalid. Delete its local data and add the sources again.");
  }
}

async function writeStore(store: DeviceWatchStore): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

async function serialize<T>(action: () => Promise<T>): Promise<T> {
  const previous = mutationTail;
  let release: () => void = () => {};
  mutationTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await action();
  } finally {
    release();
  }
}

async function mutateStore<T>(action: (store: DeviceWatchStore) => Promise<T> | T): Promise<T> {
  return serialize(async () => {
    const store = await readStore();
    const result = await action(store);
    await writeStore(store);
    return result;
  });
}

async function readAfterMutations(): Promise<DeviceWatchStore> {
  return serialize(readStore);
}

function normalizedHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return true;
  }
  const a = octets[0]!;
  const b = octets[1]!;
  const c = octets[2]!;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 88 && c === 99)
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

function isBlockedLiteralHost(hostname: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return isPrivateIpv4(hostname);
  if (!hostname.includes(":")) return false;
  const normalized = hostname.toLowerCase();
  // IPv4-mapped addresses are rejected rather than trying to reproduce every
  // accepted textual representation used by native URL stacks.
  return normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("::ffff:")
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith("ff")
    || normalized.startsWith("2001:db8:");
}

function isBlockedPlatform(hostname: string): boolean {
  const withoutWww = hostname.replace(/^www\./, "");
  return BLOCKED_PLATFORM_HOSTS.some((blocked) => withoutWww === blocked || withoutWww.endsWith(`.${blocked}`));
}

export function parseDevicePublicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a complete public HTTPS URL.");
  }
  const hostname = normalizedHostname(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Only public HTTPS URLs without embedded credentials are supported.");
  }
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isBlockedLiteralHost(hostname)) {
    throw new Error("Private, local, and reserved network addresses are not allowed.");
  }
  if (isBlockedPlatform(hostname)) {
    throw new Error("This social network does not permit this watcher. Use an official RSS feed, personal site, newsroom, or blog instead.");
  }
  return url;
}

function exceedsUtf8Limit(value: string, limit: number): boolean {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (bytes > limit) return true;
  }
  return false;
}

async function publicGet(input: URL): Promise<PublicResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let url = parseDevicePublicUrl(input.href);
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetch(url.href, {
        cache: "no-store",
        headers: {
          Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.2",
          "User-Agent": USER_AGENT,
        },
        redirect: "manual",
        signal: controller.signal,
      });
      const responseUrl = response.url ? parseDevicePublicUrl(response.url) : url;
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirectCount === MAX_REDIRECTS) throw new Error("The source redirected too many times.");
        const location = response.headers.get("location");
        if (!location) throw new Error("The source returned an invalid redirect.");
        url = parseDevicePublicUrl(new URL(location, responseUrl).href);
        continue;
      }

      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        throw new Error("The source response exceeded the 2 MB safety limit.");
      }
      const body = await response.text();
      if (exceedsUtf8Limit(body, MAX_BODY_BYTES)) {
        throw new Error("The source response exceeded the 2 MB safety limit.");
      }
      return {
        body,
        contentType: response.headers.get("content-type")?.toLowerCase() ?? "",
        status: response.status,
        url: responseUrl,
      };
    }
    throw new Error("The source redirected too many times.");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The source timed out after 15 seconds.");
    }
    if (error instanceof TypeError) {
      throw new Error("The public source could not be reached from this device.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertRobotsPermission(url: URL): Promise<void> {
  const response = await publicGet(new URL("/robots.txt", url.origin));
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

async function fetchSource(source: DeviceWatchSource): Promise<ParsedPublicUpdate[]> {
  const url = parseDevicePublicUrl(source.url);
  await assertRobotsPermission(url);
  const response = await publicGet(url);
  if (response.status === 401 || response.status === 403) {
    throw new Error("This source requires access the watcher will not bypass.");
  }
  if (response.status >= 400) throw new Error(`The source returned HTTP ${response.status}.`);
  if (source.kind === "rss") {
    if (response.contentType && !/(xml|rss|atom|text\/plain|octet-stream)/.test(response.contentType)) {
      throw new Error("This URL did not return an RSS or Atom document.");
    }
    return parsePublicFeed(response.body, response.url.href).map(sanitizeEntryUrl);
  }
  if (response.contentType && !/(text\/html|application\/xhtml|text\/plain)/.test(response.contentType)) {
    throw new Error("This URL did not return a public web page.");
  }
  return [sanitizeEntryUrl(parsePublicWebsite(response.body, response.url.href))];
}

function sanitizeEntryUrl(entry: ParsedPublicUpdate): ParsedPublicUpdate {
  if (!entry.url) return entry;
  try {
    return { ...entry, url: parseDevicePublicUrl(entry.url).href };
  } catch {
    const { url: _url, ...safeEntry } = entry;
    return safeEntry;
  }
}

function cleanError(error: unknown): string {
  return (error instanceof Error ? error.message : "The source could not be checked.")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

function isCheckDue(lastCheckedAt?: string): boolean {
  if (!lastCheckedAt) return true;
  const timestamp = new Date(lastCheckedAt).getTime();
  return Number.isNaN(timestamp) || Date.now() - timestamp >= MONTHLY_INTERVAL_MS;
}

function publicSource(source: DeviceWatchSource): WatchSource {
  const { seenKeys: _seenKeys, ...value } = source;
  return value;
}

function publicUpdate(update: DeviceWatchUpdate): WatchUpdate {
  const { key: _key, ...value } = update;
  return value;
}

export async function deviceWatcherHealth(): Promise<WatchHealth> {
  return { ok: true, service: "context-update-watch", monthlyIntervalDays: 28 };
}

export async function listDeviceWatchSources(contactId?: string): Promise<WatchSource[]> {
  const store = await readAfterMutations();
  return store.sources.filter((source) => !contactId || source.contactId === contactId).map(publicSource);
}

export async function addDeviceWatchSource(input: WatchSourceInput): Promise<WatchSource> {
  const validation = WatchSourceInputSchema.safeParse({ ...input, url: input.url.trim() });
  if (!validation.success) {
    throw new Error(validation.error.issues[0]?.message ?? "Enter a valid public source.");
  }
  const parsed = validation.data;
  const url = parseDevicePublicUrl(parsed.url);
  return mutateStore((store) => {
    if (store.sources.length >= 100) throw new Error("Update Watch supports up to 100 confirmed sources.");
    if (store.sources.some((source) => source.contactId === parsed.contactId && source.url === url.href)) {
      throw new Error("This source is already watched for that person.");
    }
    const createdAt = new Date().toISOString();
    const source: DeviceWatchSource = {
      ...parsed,
      id: `source-${fingerprint(parsed.contactId, url.href, createdAt, Math.random().toString())}`,
      url: url.href,
      enabled: true,
      createdAt,
      seenKeys: [],
    };
    store.sources.push(source);
    return publicSource(source);
  });
}

export async function removeDeviceWatchSource(sourceId: string): Promise<{ ok: true }> {
  return mutateStore((store) => {
    const before = store.sources.length;
    store.sources = store.sources.filter((source) => source.id !== sourceId);
    store.updates = store.updates.filter((update) => update.sourceId !== sourceId);
    if (store.sources.length === before) throw new Error("Source not found.");
    return { ok: true };
  });
}

export async function removeDeviceWatchContact(contactId: string): Promise<{ ok: true }> {
  return mutateStore((store) => {
    store.sources = store.sources.filter((source) => source.contactId !== contactId);
    store.updates = store.updates.filter((update) => update.contactId !== contactId);
    return { ok: true };
  });
}

export async function clearDeviceUpdateWatchData(): Promise<{ ok: true }> {
  return serialize(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return { ok: true };
  });
}

export async function listDeviceWatchUpdates(contactId?: string): Promise<WatchUpdate[]> {
  const store = await readAfterMutations();
  return store.updates.filter((update) => !contactId || update.contactId === contactId).map(publicUpdate);
}

export async function checkDeviceWatchSources(contactId?: string, force = false): Promise<WatchCheckReport> {
  return mutateStore(async (store) => {
    const report: WatchCheckReport = { checked: 0, discovered: 0, failed: 0, skipped: 0 };
    for (const source of store.sources) {
      if (!source.enabled || (contactId && source.contactId !== contactId)) continue;
      if (!force && !isCheckDue(source.lastCheckedAt)) {
        report.skipped += 1;
        continue;
      }
      const checkedAt = new Date().toISOString();
      try {
        const entries = await fetchSource(source);
        const previous = new Set(source.seenKeys);
        const pending = new Set(store.updates.filter((update) => update.sourceId === source.id).map((update) => update.key));
        const additions = previous.size === 0 && source.kind === "website"
          ? []
          : entries.filter((entry) => !previous.has(entry.key) && !pending.has(entry.key)).slice(0, 3);
        additions.forEach((entry) => {
          store.updates.unshift({
            id: `update-${fingerprint(source.id, entry.key)}`,
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
        });
        source.seenKeys = [...new Set([...entries.map((entry) => entry.key), ...previous])].slice(0, 100);
        source.lastCheckedAt = checkedAt;
        delete source.lastError;
        report.checked += 1;
        report.discovered += additions.length;
      } catch (error) {
        source.lastCheckedAt = checkedAt;
        source.lastError = cleanError(error);
        report.checked += 1;
        report.failed += 1;
      }
    }
    store.updates = store.updates.slice(0, 200);
    return report;
  });
}

export async function dismissDeviceWatchUpdate(updateId: string): Promise<{ ok: true }> {
  return mutateStore((store) => {
    // Idempotent dismissal makes approval retries safe after interruptions.
    store.updates = store.updates.filter((update) => update.id !== updateId);
    return { ok: true };
  });
}
