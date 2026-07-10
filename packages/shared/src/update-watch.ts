import { z } from "zod";

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const httpsUrl = z.url().max(2_048).refine((value) => value.startsWith("https://"), {
  message: "Only public HTTPS sources are supported.",
});

export const WatchSourceKindSchema = z.enum(["rss", "website"]);

export const WatchSourceInputSchema = z.object({
  contactId: boundedText(80),
  contactName: boundedText(100),
  label: boundedText(120),
  url: httpsUrl,
  kind: WatchSourceKindSchema,
});

export const WatchSourceSchema = WatchSourceInputSchema.extend({
  id: boundedText(80),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  lastCheckedAt: z.iso.datetime().optional(),
  lastError: z.string().max(500).optional(),
});

export const WatchUpdateSchema = z.object({
  id: boundedText(80),
  contactId: boundedText(80),
  sourceId: boundedText(80),
  sourceLabel: boundedText(120),
  title: boundedText(300),
  summary: z.string().trim().max(1_000).optional(),
  url: httpsUrl.optional(),
  publishedAt: z.iso.datetime().optional(),
  discoveredAt: z.iso.datetime(),
});

export const WatchCheckReportSchema = z.object({
  checked: z.number().int().nonnegative(),
  discovered: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export const WatchHealthSchema = z.object({
  ok: z.literal(true),
  service: z.literal("context-update-watch"),
  monthlyIntervalDays: z.literal(28),
});

export const WatchSourceListSchema = z.array(WatchSourceSchema);
export const WatchUpdateListSchema = z.array(WatchUpdateSchema);
export const WatchOkSchema = z.object({ ok: z.literal(true) });

export type WatchSourceKind = z.infer<typeof WatchSourceKindSchema>;
export type WatchSourceInput = z.infer<typeof WatchSourceInputSchema>;
export type WatchSource = z.infer<typeof WatchSourceSchema>;
export type WatchUpdate = z.infer<typeof WatchUpdateSchema>;
export type WatchCheckReport = z.infer<typeof WatchCheckReportSchema>;
export type WatchHealth = z.infer<typeof WatchHealthSchema>;
