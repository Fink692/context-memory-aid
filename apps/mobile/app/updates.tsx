import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { WatchSource, WatchSourceKind, WatchUpdate } from "@context/shared";
import { Body, Button, Card, EmptyState, ErrorBanner, Eyebrow, Pill, Screen, SectionHeader, SuccessBanner, Title } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { displayDate } from "@/lib/date";
import {
  addWatchSource,
  checkWatchSources,
  dismissWatchUpdate,
  listWatchSources,
  listWatchUpdates,
  removeWatchSource,
  watcherHealth,
} from "@/lib/update-watcher";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function messageFrom(error: unknown): string {
  if (error instanceof Error && /fetch|network request failed/i.test(error.message)) {
    return "The free local watcher is not running. On this PC, open a terminal in the project and run: npm run dev:watcher";
  }
  return error instanceof Error ? error.message : "Update Watch could not complete that action.";
}

export default function UpdatesScreen() {
  const params = useLocalSearchParams<{ contactId?: string | string[] }>();
  const contacts = useAppStore((state) => state.contacts);
  const addMemory = useAppStore((state) => state.addMemory);
  const setUpdateWatchUsed = useAppStore((state) => state.setUpdateWatchUsed);
  const initialContactId = singleParam(params.contactId);
  const [contactId, setContactId] = useState(
    contacts.some((contact) => contact.id === initialContactId) ? initialContactId! : contacts[0]?.id ?? "",
  );
  const [sources, setSources] = useState<WatchSource[]>([]);
  const [updates, setUpdates] = useState<WatchUpdate[]>([]);
  const [serviceReady, setServiceReady] = useState(false);
  const [label, setLabel] = useState("Public updates");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<WatchSourceKind>("rss");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const contact = contacts.find((item) => item.id === contactId);

  const load = useCallback(async () => {
    if (!contactId) return;
    try {
      await watcherHealth();
      const [nextSources, nextUpdates] = await Promise.all([
        listWatchSources(contactId),
        listWatchUpdates(contactId),
      ]);
      setSources(nextSources);
      setUpdates(nextUpdates);
      if (nextSources.length || nextUpdates.length) setUpdateWatchUsed(true);
      setServiceReady(true);
      setError(undefined);
    } catch (loadError) {
      setServiceReady(false);
      setSources([]);
      setUpdates([]);
      setError(messageFrom(loadError));
    }
  }, [contactId]);

  useEffect(() => { void load(); }, [load]);

  const searchQuery = useMemo(() => {
    if (!contact) return "";
    return `\"${contact.displayName}\" ${contact.company ?? ""} public profile news`;
  }, [contact]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await action();
    } catch (actionError) {
      setError(messageFrom(actionError));
    } finally {
      setBusy(false);
    }
  };

  const saveSource = () => run(async () => {
    if (!contact) throw new Error("Choose a saved person first.");
    if (!confirmed) throw new Error("Confirm that this URL belongs to the saved person before watching it.");
    await addWatchSource({ contactId: contact.id, contactName: contact.displayName, label, url, kind });
    setUpdateWatchUsed(true);
    setUrl("");
    setConfirmed(false);
    setSuccess("Source saved locally. Its first check will create suggestions for feed entries; website checks begin with a baseline.");
    await load();
  });

  const checkNow = () => run(async () => {
    const report = await checkWatchSources(contactId);
    await load();
    setSuccess(`Checked ${report.checked} source${report.checked === 1 ? "" : "s"}. Found ${report.discovered} suggestion${report.discovered === 1 ? "" : "s"}; ${report.failed} need attention.`);
  });

  const saveUpdate = (update: WatchUpdate) => run(async () => {
    const summary = update.summary && update.summary !== update.title
      ? `${update.title}: ${update.summary}`.slice(0, 500)
      : update.title.slice(0, 500);
    const now = new Date().toISOString();
    addMemory({
      id: `public-update-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      contactId: update.contactId,
      summary,
      tags: ["public-update", update.sourceLabel.toLowerCase().slice(0, 40)],
      nextSteps: [],
      source: "public-update",
      occurredAt: update.publishedAt ?? update.discoveredAt,
      createdAt: now,
    });
    await dismissWatchUpdate(update.id);
    await load();
    setSuccess("Update approved and added to the relationship timeline.");
  });

  if (!contacts.length) {
    return (
      <Screen>
        <EmptyState body="Add a person before confirming public sources for them." title="No saved people yet" />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Eyebrow>Free · local · approval required</Eyebrow>
        <Title compact>Update Watch</Title>
        <Body muted>Find a public source, confirm the identity yourself, and let this PC check it monthly. Nothing becomes a memory until you approve it.</Body>
      </View>

      <View style={styles.contactRow}>
        {contacts.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => setContactId(item.id)}
            style={[styles.contactChoice, item.id === contactId && styles.contactChoiceActive]}
          >
            <Text style={[styles.contactChoiceText, item.id === contactId && styles.contactChoiceTextActive]}>{item.displayName}</Text>
          </Pressable>
        ))}
      </View>

      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <Card style={styles.findCard}>
        <View style={styles.cardTopline}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>1. Find the right public page</Text>
            <Text style={styles.cardHint}>Search is opened only when you tap. Context never guesses which person is correct.</Text>
          </View>
          <Pill tone="safe">You confirm</Pill>
        </View>
        <Text selectable style={styles.searchQuery}>{searchQuery}</Text>
        <Button
          onPress={() => { void Linking.openURL(`https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}`); }}
          variant="secondary"
        >
          Search the public web
        </Button>
        <Text style={styles.boundary}>Best sources: an official RSS/Atom feed, personal site, company newsroom, public blog, GitHub activity feed, or a network-provided public feed. Direct LinkedIn, X, Instagram, Facebook, and TikTok page watching is unsupported; Context will not bypass their access controls.</Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>2. Confirm a source</Text>
        <View style={styles.kindRow}>
          {(["rss", "website"] as const).map((value) => (
            <Pressable key={value} onPress={() => setKind(value)} style={[styles.kindChoice, kind === value && styles.kindChoiceActive]}>
              <Text style={[styles.kindText, kind === value && styles.kindTextActive]}>{value === "rss" ? "RSS / Atom" : "Public website"}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          accessibilityLabel="Source label"
          maxLength={120}
          onChangeText={setLabel}
          placeholder="Source label"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
          value={label}
        />
        <TextInput
          accessibilityLabel="Public HTTPS source URL"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          maxLength={2048}
          onChangeText={setUrl}
          placeholder="https://example.com/feed.xml"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
          value={url}
        />
        <View style={styles.confirmRow}>
          <View style={styles.flex}>
            <Text style={styles.confirmTitle}>I confirmed this belongs to {contact?.displayName}</Text>
            <Text style={styles.cardHint}>This prevents wrong-person updates from entering your relationship memory.</Text>
          </View>
          <Switch
            accessibilityLabel="Confirm source identity"
            onValueChange={setConfirmed}
            value={confirmed}
            thumbColor={confirmed ? colors.success : colors.surface}
            trackColor={{ false: colors.border, true: "#A7F3D0" }}
          />
        </View>
        <Button disabled={!serviceReady || !url.trim() || !confirmed} loading={busy} onPress={saveSource}>Save confirmed source</Button>
      </Card>

      <SectionHeader
        action={<Button disabled={!serviceReady || !sources.length} loading={busy} onPress={checkNow} style={styles.smallButton} variant="secondary">Check now</Button>}
        subtitle="The Windows task also checks due sources once a month"
        title={`Watched sources · ${sources.length}`}
      />
      {sources.map((source) => (
        <Card key={source.id}>
          <View style={styles.cardTopline}>
            <View style={styles.flex}>
              <Text style={styles.sourceTitle}>{source.label}</Text>
              <Text numberOfLines={2} selectable style={styles.sourceUrl}>{source.url}</Text>
            </View>
            <Pill>{source.kind === "rss" ? "RSS" : "Website"}</Pill>
          </View>
          <Text style={styles.cardHint}>{source.lastCheckedAt ? `Last checked ${displayDate(source.lastCheckedAt)}` : "Not checked yet"}</Text>
          {source.lastError ? <Text accessibilityRole="alert" style={styles.sourceError}>{source.lastError}</Text> : null}
          <Button loading={busy} onPress={() => run(async () => { await removeWatchSource(source.id); await load(); setSuccess("Source removed from this PC."); })} variant="danger">Remove source</Button>
        </Card>
      ))}
      {!sources.length ? <EmptyState body="Add one confirmed RSS feed or public page above. Website sources establish a baseline first; feeds can suggest their newest entries immediately." title="No sources watched for this person" /> : null}

      <SectionHeader subtitle="Review every item before it enters memory" title={`Suggestions · ${updates.length}`} />
      {updates.map((update) => (
        <Card key={update.id} style={styles.updateCard}>
          <View style={styles.cardTopline}>
            <Pill tone="warning">Needs review</Pill>
            <Text style={styles.updateDate}>{displayDate(update.publishedAt ?? update.discoveredAt)}</Text>
          </View>
          <Text style={styles.updateTitle}>{update.title}</Text>
          {update.summary ? <Text style={styles.updateSummary}>{update.summary}</Text> : null}
          <Text style={styles.cardHint}>From {update.sourceLabel}</Text>
          <View style={styles.actionRow}>
            <Button loading={busy} onPress={() => saveUpdate(update)} style={styles.flexButton}>Approve as memory</Button>
            <Button loading={busy} onPress={() => run(async () => { await dismissWatchUpdate(update.id); await load(); })} style={styles.flexButton} variant="quiet">Dismiss</Button>
          </View>
        </Card>
      ))}
      {sources.length && !updates.length ? <EmptyState body="Checks have not found anything waiting for your approval." title="No pending suggestions" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  contactRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  contactChoice: { minHeight: 42, justifyContent: "center", borderRadius: radius.pill, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  contactChoiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  contactChoiceText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  contactChoiceTextActive: { color: colors.white },
  findCard: { backgroundColor: colors.primarySoft, borderColor: "#D9D6FE" },
  cardTopline: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  cardTitle: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: "800" },
  cardHint: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  searchQuery: { color: colors.primaryDark, fontSize: 14, lineHeight: 20, fontWeight: "700", backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.sm },
  boundary: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
  kindRow: { flexDirection: "row", gap: spacing.sm },
  kindChoice: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surfaceAlt },
  kindChoiceActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  kindText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  kindTextActive: { color: colors.white },
  input: { minHeight: 50, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 15 },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  confirmTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  smallButton: { minHeight: 42, paddingHorizontal: spacing.md },
  sourceTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  sourceUrl: { color: colors.primary, fontSize: 12, lineHeight: 18, marginTop: 2 },
  sourceError: { color: colors.danger, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  updateCard: { borderColor: "#EFCB84" },
  updateDate: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  updateTitle: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: "800" },
  updateSummary: { color: colors.inkMuted, fontSize: 14, lineHeight: 21 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  flexButton: { flex: 1, minWidth: 170 },
});
