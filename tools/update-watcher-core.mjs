import { createHash } from "node:crypto";
import { isIP } from "node:net";

const DAY_MS = 24 * 60 * 60 * 1_000;

export function decodeEntities(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, value) => String.fromCodePoint(Number.parseInt(value, 16)));
}

export function plainText(value, max = 1_000) {
  return decodeEntities(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function fingerprint(...parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("\n")).digest("hex");
}

function tagValue(block, names) {
  for (const name of names) {
    const expression = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
    const match = expression.exec(block);
    if (match?.[1]) return match[1];
  }
  return "";
}

function attributeValue(block, tag, attribute) {
  const expression = new RegExp(`<${tag}\\b[^>]*\\b${attribute}=["']([^"']+)["'][^>]*>`, "i");
  return expression.exec(block)?.[1] ?? "";
}

function safePublicLink(value, baseUrl) {
  if (!value) return undefined;
  try {
    const url = new URL(plainText(value, 2_048), baseUrl);
    return url.protocol === "https:" ? url.href.slice(0, 2_048) : undefined;
  } catch {
    return undefined;
  }
}

function isoDate(value) {
  if (!value) return undefined;
  const date = new Date(plainText(value, 120));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function parseFeed(xml, baseUrl) {
  const rssBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const atomBlocks = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  const blocks = rssBlocks.length ? rssBlocks : atomBlocks;
  if (!blocks.length) throw new Error("No RSS or Atom entries were found at this URL.");

  return blocks.slice(0, 25).flatMap((block) => {
    const title = plainText(tagValue(block, ["title"]), 300);
    if (!title) return [];
    const rawLink = tagValue(block, ["link"]) || attributeValue(block, "link", "href");
    const url = safePublicLink(rawLink, baseUrl);
    const guid = plainText(tagValue(block, ["guid", "id"]), 500);
    const summary = plainText(tagValue(block, ["description", "summary", "content:encoded", "content"]), 1_000) || undefined;
    const publishedAt = isoDate(tagValue(block, ["pubDate", "published", "updated", "dc:date"]));
    return [{
      key: fingerprint(guid, url, title, publishedAt),
      title,
      ...(summary ? { summary } : {}),
      ...(url ? { url } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    }];
  });
}

function metaContent(html, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i"),
      new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const value = pattern.exec(html)?.[1];
      if (value) return value;
    }
  }
  return "";
}

export function parseWebsite(html, baseUrl) {
  const title = plainText(metaContent(html, ["og:title", "twitter:title"]) || tagValue(html, ["title"]), 300);
  const summary = plainText(metaContent(html, ["og:description", "description", "twitter:description"]), 1_000) || undefined;
  if (!title) throw new Error("This page did not expose a readable public title.");
  const canonical = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/i.exec(html)?.[1]
    ?? /<link\b(?=[^>]*\bhref=["']([^"']+)["'])[^>]*\brel=["']canonical["'][^>]*>/i.exec(html)?.[1]
    ?? "";
  const url = safePublicLink(canonical, baseUrl) ?? new URL(baseUrl).href;
  return {
    key: fingerprint(title, summary, url),
    title,
    ...(summary ? { summary } : {}),
    url,
  };
}

function robotsGroups(text) {
  const groups = [];
  let current;
  let hasRules = false;
  for (const originalLine of text.split(/\r?\n/)) {
    const line = originalLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!current || hasRules) {
        current = { agents: [], rules: [] };
        groups.push(current);
        hasRules = false;
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ type: field, path: value });
      hasRules = true;
    }
  }
  return groups;
}

function ruleMatches(pathname, rulePath) {
  if (!rulePath) return false;
  const withoutEnd = rulePath.endsWith("$") ? rulePath.slice(0, -1) : rulePath;
  const escaped = withoutEnd
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const expression = new RegExp(`^${escaped}${rulePath.endsWith("$") ? "$" : ""}`);
  return expression.test(pathname);
}

export function isAllowedByRobots(text, pathname, userAgent = "ContextMemoryLocalWatcher") {
  const groups = robotsGroups(text);
  const normalizedAgent = userAgent.toLowerCase();
  const specific = groups.filter((group) => group.agents.some((agent) => agent !== "*" && normalizedAgent.includes(agent)));
  const selected = specific.length ? specific : groups.filter((group) => group.agents.includes("*"));
  const matching = selected.flatMap((group) => group.rules).filter((rule) => ruleMatches(pathname, rule.path));
  if (!matching.length) return true;
  matching.sort((left, right) => right.path.length - left.path.length || (left.type === "allow" ? -1 : 1));
  return matching[0].type === "allow";
}

function privateIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = octets;
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

export function isPrivateAddress(address) {
  if (isIP(address) === 4) return privateIpv4(address);
  if (isIP(address) !== 6) return true;
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.[1];
  if (mapped) return privateIpv4(mapped);
  return normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith("ff")
    || normalized.startsWith("2001:db8:");
}

export function isMonthlyCheckDue(lastCheckedAt, now = new Date(), intervalDays = 28) {
  if (!lastCheckedAt) return true;
  const timestamp = new Date(lastCheckedAt).getTime();
  return Number.isNaN(timestamp) || now.getTime() - timestamp >= intervalDays * DAY_MS;
}
