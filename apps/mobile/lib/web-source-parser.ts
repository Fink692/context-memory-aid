export interface ParsedPublicUpdate {
  key: string;
  title: string;
  summary?: string;
  url?: string;
  publishedAt?: string;
}

export function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hexadecimal: string) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)));
}

export function plainText(value: string, max = 1_000): string {
  return decodeEntities(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// A stable non-cryptographic identifier is sufficient here: it only deduplicates
// public-page revisions already reviewed on this device.
export function fingerprint(...parts: Array<string | undefined>): string {
  const input = parts.filter(Boolean).join("\n");
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function tagValue(block: string, names: string[]): string {
  for (const name of names) {
    const expression = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
    const match = expression.exec(block);
    if (match?.[1]) return match[1];
  }
  return "";
}

function attributeValue(block: string, tag: string, attribute: string): string {
  const expression = new RegExp(`<${tag}\\b[^>]*\\b${attribute}=["']([^"']+)["'][^>]*>`, "i");
  return expression.exec(block)?.[1] ?? "";
}

function safePublicLink(value: string, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(plainText(value, 2_048), baseUrl);
    return url.protocol === "https:" ? url.href.slice(0, 2_048) : undefined;
  } catch {
    return undefined;
  }
}

function isoDate(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(plainText(value, 120));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function parsePublicFeed(xml: string, baseUrl: string): ParsedPublicUpdate[] {
  const rssBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1] ?? "");
  const atomBlocks = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((match) => match[1] ?? "");
  const blocks = rssBlocks.length ? rssBlocks : atomBlocks;
  if (!blocks.length) throw new Error("No RSS or Atom entries were found at this URL.");

  return blocks.slice(0, 25).flatMap((block): ParsedPublicUpdate[] => {
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

function metaContent(html: string, names: string[]): string {
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

export function parsePublicWebsite(html: string, baseUrl: string): ParsedPublicUpdate {
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

interface RobotsGroup {
  agents: string[];
  rules: Array<{ type: "allow" | "disallow"; path: string }>;
}

function robotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
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

function ruleMatches(pathname: string, rulePath: string): boolean {
  if (!rulePath) return false;
  const withoutEnd = rulePath.endsWith("$") ? rulePath.slice(0, -1) : rulePath;
  const escaped = withoutEnd
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${rulePath.endsWith("$") ? "$" : ""}`).test(pathname);
}

export function isAllowedByRobots(text: string, pathname: string, userAgent = "ContextMemoryApp"): boolean {
  const groups = robotsGroups(text);
  const normalizedAgent = userAgent.toLowerCase();
  const specific = groups.filter((group) => group.agents.some((agent) => agent !== "*" && normalizedAgent.includes(agent)));
  const selected = specific.length ? specific : groups.filter((group) => group.agents.includes("*"));
  const matching = selected.flatMap((group) => group.rules).filter((rule) => ruleMatches(pathname, rule.path));
  if (!matching.length) return true;
  matching.sort((left, right) => right.path.length - left.path.length || (left.type === "allow" ? -1 : 1));
  return matching[0]?.type === "allow";
}
