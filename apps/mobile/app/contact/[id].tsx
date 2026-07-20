import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Linking, StyleSheet, View, type AlertButton } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { createLocalConversationTopics, type Memory, type SocialLink } from "@context/shared";
import {
  AppText,
  Avatar,
  BarButton,
  Button,
  EmptyState,
  ErrorBanner,
  FormField,
  IconButton,
  ListRow,
  ListSection,
  Screen,
  SuccessBanner,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { activeEventForContact } from "@/lib/contact-event-context";
import { normalizeConversationStarters } from "@/lib/conversation-starters";
import { displayDate, displayEventSchedule, relativeDate } from "@/lib/date";
import { deleteFaceTemplate } from "@/lib/face-templates";
import { createModelConversationTopics } from "@/lib/local-model";
import { deletePrivateProfilePhoto } from "@/lib/profile-photo";
import { removeWatchContact } from "@/lib/legacy-update-watch-cleanup";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function socialProfileUrl(link: SocialLink): string | undefined {
  if (link.url?.startsWith("https://")) return link.url;
  const handle = link.handle?.trim().replace(/^@/, "");
  if (!handle) return undefined;
  const encoded = encodeURIComponent(handle);
  const platform = link.platform.toLocaleLowerCase();
  if (platform.includes("instagram")) return `https://www.instagram.com/${encoded}`;
  if (platform.includes("linkedin")) return `https://www.linkedin.com/in/${encoded}`;
  if (platform.includes("facebook")) return `https://www.facebook.com/${encoded}`;
  if (platform === "x" || platform.includes("twitter")) return `https://x.com/${encoded}`;
  if (platform.includes("tiktok")) return `https://www.tiktok.com/@${encoded}`;
  if (platform.includes("threads")) return `https://www.threads.net/@${encoded}`;
  return undefined;
}

interface ConversationStarterDraft {
  id: string;
  value: string;
}

function hydrateConversationStarterDrafts(
  topics: readonly string[],
  createId: () => string,
): ConversationStarterDraft[] {
  return topics.map((value) => ({ id: createId(), value }));
}

export default function ContactScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = singleParam(params.id);
  const router = useRouter();
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const events = useAppStore((state) => state.events);
  const event = useAppStore((state) => activeEventForContact(state.events, state.currentEventId, contactId));
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const setConversationTopics = useAppStore((state) => state.setConversationTopics);
  const deleteMemory = useAppStore((state) => state.deleteMemory);
  const deleteContact = useAppStore((state) => state.deleteContact);
  const [error, setError] = useState<string>();
  const [topicNotice, setTopicNotice] = useState<string>();
  const [topicBusy, setTopicBusy] = useState(false);
  const [topicSaveBusy, setTopicSaveBusy] = useState(false);
  const [pendingTopics, setPendingTopics] = useState<ConversationStarterDraft[]>();
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [memoryDeleteBusyId, setMemoryDeleteBusyId] = useState<string>();
  const topicRequest = useRef(0);
  const topicDraftSequence = useRef(0);
  const sortedTimeline = useMemo(
    () => [...(contact?.timeline ?? [])].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    [contact?.timeline],
  );
  const uniqueTopics = useMemo(
    () => [...new Set(contact?.conversationTopics ?? [])],
    [contact?.conversationTopics],
  );
  const memberships = useMemo(
    () => events
      .filter((item) => contactId && item.attendeeContactIds.includes(contactId))
      .sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
    [contactId, events],
  );

  useEffect(() => {
    topicRequest.current += 1;
    setTopicBusy(false);
    return () => { topicRequest.current += 1; };
  }, [contact, event, localToolsEnabled]);

  useEffect(() => {
    setPendingTopics(undefined);
  }, [contactId]);

  if (!contact) {
    return (
      <>
        <Stack.Screen options={{ title: "Person" }} />
        <Screen>
          <EmptyState
            action={<Button onPress={() => router.replace("/people")}>Open People</Button>}
            body="This person may no longer be available."
            symbol={symbols.person}
            title="Person unavailable"
          />
        </Screen>
      </>
    );
  }

  const editPerson = () => router.push({ pathname: "/contact/edit/[id]", params: { id: contact.id } });
  const sharePerson = () => router.push({ pathname: "/contact/share/[id]", params: { id: contact.id } });
  const addMemory = () => router.push({ pathname: "/memory/[contactId]", params: { contactId: contact.id } });
  const editMemory = (memory: Memory) => router.push({
    pathname: "/memory/[contactId]",
    params: { contactId: contact.id, memoryId: memory.id },
  });

  const refreshTopics = async () => {
    if (!localToolsEnabled) {
      router.push("/smart-assist");
      return;
    }
    const request = ++topicRequest.current;
    setTopicBusy(true);
    setError(undefined);
    setTopicNotice(undefined);
    try {
      const result = await createModelConversationTopics(contact, event);
      if (request !== topicRequest.current) return;
      setPendingTopics(hydrateConversationStarterDrafts(
        normalizeConversationStarters(result.topics),
        () => `conversation-starter-draft-${contact.id}-${++topicDraftSequence.current}`,
      ));
      setTopicNotice("New starters are ready to review.");
    } catch {
      if (request !== topicRequest.current) return;
      setPendingTopics(hydrateConversationStarterDrafts(
        normalizeConversationStarters(createLocalConversationTopics(contact, event)),
        () => `conversation-starter-draft-${contact.id}-${++topicDraftSequence.current}`,
      ));
      setError("Smart Assist was unavailable. Basic starters are ready to review instead.");
    } finally {
      if (request === topicRequest.current) setTopicBusy(false);
    }
  };

  const updatePendingTopic = (id: string, value: string) => {
    setPendingTopics((current) => current?.map((topic) => topic.id === id ? { ...topic, value } : topic));
  };

  const removePendingTopic = (id: string) => {
    setPendingTopics((current) => current?.filter((topic) => topic.id !== id));
  };

  const savePendingTopics = async () => {
    const topics = normalizeConversationStarters(pendingTopics?.map((topic) => topic.value) ?? []);
    if (!topics.length) {
      setError("Keep at least one conversation starter before saving.");
      return;
    }
    setTopicSaveBusy(true);
    setError(undefined);
    try {
      await setConversationTopics(contact.id, topics);
      setPendingTopics(undefined);
      setTopicNotice("Conversation starters saved.");
    } catch {
      setError("Context could not save these conversation starters. Your reviewed draft is still here; try again.");
    } finally {
      setTopicSaveBusy(false);
    }
  };

  const discardPendingTopics = () => {
    setPendingTopics(undefined);
    setError(undefined);
    setTopicNotice("Draft starters discarded.");
  };

  const removePerson = async () => {
    setDeleteBusy(true);
    setError(undefined);
    try {
      await deleteContact(contact.id);
      if (useAppStore.getState().contacts.some((item) => item.id === contact.id)) {
        throw new Error("Context could not delete this relationship record. Nothing was changed.");
      }

      const cleanupDeletedPerson = async (): Promise<string[]> => {
        const tasks = [
          { label: "quick-match data", run: () => deleteFaceTemplate(contact.id) },
          { label: "legacy supporting data", run: () => removeWatchContact(contact.id) },
          { label: "private profile photo", run: () => deletePrivateProfilePhoto(contact.photoUri) },
        ];
        const results = await Promise.allSettled(tasks.map((task) => task.run()));
        return tasks.flatMap((task, index) => results[index]?.status === "rejected" ? [task.label] : []);
      };

      const finishCleanup = async (): Promise<void> => {
        const residual = await cleanupDeletedPerson();
        if (!residual.length) {
          router.replace("/people");
          return;
        }
        Alert.alert(
          "Person Deleted; Cleanup Incomplete",
          `The relationship record and memories are deleted. Context could not yet remove: ${residual.join(", ")}. Retrying is safe.`,
          [
            { text: "Close", style: "cancel", onPress: () => router.replace("/people") },
            { text: "Retry Cleanup", onPress: () => { void finishCleanup(); } },
          ],
        );
      };

      await finishCleanup();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Context could not delete this relationship record. Nothing was changed.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmPersonDelete = () => {
    if (deleteBusy) return;
    Alert.alert(
      `Delete ${contact.displayName}?`,
      "This permanently removes this person, every saved memory, follow-up, and private supporting file.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Person", style: "destructive", onPress: () => { void removePerson(); } },
      ],
    );
  };

  const confirmMemoryDelete = (memory: Memory) => {
    Alert.alert(
      "Delete this memory?",
      "This permanently removes the selected memory and every follow-up linked to it, including completed history. The person’s remaining profile and memories stay intact.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Memory",
          style: "destructive",
          onPress: () => {
            setMemoryDeleteBusyId(memory.id);
            setError(undefined);
            void deleteMemory(contact.id, memory.id)
              .catch(() => setError("Context could not delete this memory. Nothing was changed; try again."))
              .finally(() => setMemoryDeleteBusyId(undefined));
          },
        },
      ],
    );
  };

  const presentMemoryActions = (memory: Memory) => {
    const buttons: AlertButton[] = [];
    if (memory.sourceUrl) {
      buttons.push({ text: "Open Source", onPress: () => { void openContactLink(memory.sourceUrl!); } });
    }
    buttons.push({ text: "Edit Memory", onPress: () => editMemory(memory) });
    buttons.push({ text: "Delete Memory", style: "destructive", onPress: () => confirmMemoryDelete(memory) });
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert(displayDate(memory.occurredAt), memory.summary, buttons);
  };

  const openContactLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setError("This contact link could not be opened.");
    }
  };

  const recentContextRows = [
    { title: "Recent Update", detail: contact.recentUpdate },
    { title: "Last Discussed", detail: contact.lastDiscussed },
  ].filter((row): row is { title: string; detail: string } => Boolean(row.detail));

  const aboutRows = [
    { title: "Role", detail: contact.role },
    { title: "Company", detail: contact.company },
    { title: "Where You Know Them From", detail: contact.metAt },
    { title: "Who They Are to You", detail: contact.relationshipContext },
    { title: "Last Spoke", detail: contact.lastSpokeAt ? `${relativeDate(contact.lastSpokeAt)} · ${displayDate(contact.lastSpokeAt)}` : undefined },
  ].filter((row): row is { title: string; detail: string } => Boolean(row.detail));

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.identity}>
        <Avatar name={contact.displayName} photoUri={contact.photoUri} size={88} />
        <AppText accessibilityRole="header" emphasis="bold" role="title1" style={styles.centerText}>{contact.displayName}</AppText>
        <AppText role="body" style={styles.centerText} tone="secondary">
          {[contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship"}
        </AppText>
      </View>

      <Button onPress={addMemory} symbol={symbols.note}>Add Memory</Button>

      <ErrorBanner message={error} />
      <SuccessBanner message={topicNotice} />

      {recentContextRows.length ? (
        <ListSection title="Recent Context">
          {recentContextRows.map((row, index) => (
            <ListRow detail={row.detail} key={row.title} last={index === recentContextRows.length - 1} title={row.title} />
          ))}
        </ListSection>
      ) : null}

      <ListSection
        footer={localToolsEnabled ? "Starters use this person’s saved context." : "Set up Smart Assist in Settings to create new starters."}
        title="Conversation Starters"
      >
        <ListRow
          accessoryNode={(
            <IconButton
              accessibilityLabel={localToolsEnabled ? "Create new conversation starters" : "Set up Smart Assist"}
              loading={topicBusy}
              onPress={() => {
                if (localToolsEnabled) void refreshTopics();
                else router.push("/smart-assist");
              }}
              symbol={symbols.sparkles}
            />
          )}
          last={!uniqueTopics.length}
          subtitle={uniqueTopics.length ? "Create a fresh set from saved context" : "Create starters from saved context"}
          title="Create New Starters"
        />
        {uniqueTopics.map((topic, index) => (
          <ListRow key={topic} last={index === uniqueTopics.length - 1} symbol={symbols.sparkles} title={topic} />
        ))}
      </ListSection>

      {pendingTopics !== undefined ? (
        <ListSection
          footer="Nothing changes on this profile until you save."
          groupStyle={styles.pendingGroup}
          title="Review New Starters"
        >
          {pendingTopics.map((topic, index) => (
            <FormField
              autoCapitalize="sentences"
              containerStyle={styles.pendingField}
              key={topic.id}
              label={`Starter ${index + 1}`}
              maxLength={160}
              multiline
              onChangeText={(value) => updatePendingTopic(topic.id, value)}
              trailing={(
                <IconButton
                  accessibilityLabel={`Remove starter ${index + 1}`}
                  onPress={() => removePendingTopic(topic.id)}
                  symbol={symbols.trash}
                  tone="destructive"
                />
              )}
              value={topic.value}
            />
          ))}
          <View style={styles.pendingActions}>
            <Button
              disabled={!normalizeConversationStarters(pendingTopics.map((topic) => topic.value)).length}
              loading={topicSaveBusy}
              onPress={() => { void savePendingTopics(); }}
            >
              Save Suggestions
            </Button>
            <Button disabled={topicSaveBusy} onPress={discardPendingTopics} variant="quiet">Discard</Button>
          </View>
        </ListSection>
      ) : null}

      {sortedTimeline.length ? (
        <AppText accessibilityRole="header" emphasis="semibold" role="footnote" style={styles.timelineTitle} tone="secondary">TIMELINE</AppText>
      ) : (
        <ListSection footer="Only memories you deliberately save appear here." title="Timeline">
          <ListRow
            accessory="disclosure"
            last
            onPress={addMemory}
            subtitle="Capture the next useful detail after you speak"
            symbol={symbols.note}
            title="No Memories Yet"
          />
        </ListSection>
      )}
    </View>
  );

  const listFooter = (
    <View style={styles.listFooter}>
      <ListSection title="Contact">
        {contact.email ? (
          <ListRow
            accessory="disclosure"
            last={!contact.phone}
            onPress={() => { void openContactLink(`mailto:${contact.email}`); }}
            subtitle={contact.email}
            symbol={symbols.email}
            title="Email"
          />
        ) : null}
        {contact.phone ? (
          <ListRow
            accessory="disclosure"
            last
            onPress={() => { void openContactLink(`tel:${contact.phone!.replace(/[^+\d]/g, "")}`); }}
            subtitle={contact.phone}
            symbol={symbols.phone}
            title="Call"
          />
        ) : null}
        {!contact.email && !contact.phone ? (
          <ListRow
            accessory="disclosure"
            last
            onPress={editPerson}
            subtitle="Add a phone number or email address"
            title="Add Contact Details"
          />
        ) : null}
      </ListSection>

      <ListSection title="About">
        {aboutRows.length ? aboutRows.map((row, index) => (
          <ListRow detail={row.detail} key={row.title} last={index === aboutRows.length - 1} title={row.title} />
        )) : (
          <ListRow
            accessory="disclosure"
            last
            onPress={editPerson}
            subtitle="Add details that will make the next conversation easier"
            title="Add Relationship Details"
          />
        )}
      </ListSection>

      {contact.socialLinks?.length ? (
        <ListSection footer="Context never visits these profiles unless you tap one." title="Social Profiles">
          {contact.socialLinks.map((link, index) => {
            const url = socialProfileUrl(link);
            return (
              <ListRow
                accessory={url ? "disclosure" : "none"}
                key={`${link.platform}-${link.url ?? link.handle ?? index}`}
                last={index === contact.socialLinks!.length - 1}
                {...(url ? { onPress: () => { void openContactLink(url); } } : {})}
                {...(link.handle || link.url ? { subtitle: link.handle ? `@${link.handle.replace(/^@/, "")}` : link.url! } : {})}
                symbol={symbols.link}
                title={link.platform}
              />
            );
          })}
        </ListSection>
      ) : null}

      <ListSection title="Events">
        {memberships.length ? memberships.map((membership, index) => (
          <ListRow
            accessory="disclosure"
            {...(membership.id === event?.id ? { detail: "Active" } : {})}
            key={membership.id}
            last={index === memberships.length - 1}
            onPress={() => router.push({ pathname: "/event/[id]/attendees", params: { id: membership.id } })}
            subtitle={`${displayEventSchedule(membership)} · ${membership.locationLabel ?? "No location"}`}
            title={membership.name}
          />
        )) : (
          <ListRow
            accessory="disclosure"
            last
            onPress={() => router.push("/events")}
            subtitle="This person is saved in People and can be added to any event"
            title="Not Added to an Event"
          />
        )}
      </ListSection>

      <ListSection title="More">
        <ListRow
          {...(deleteBusy ? { accessoryNode: <ActivityIndicator color={colors.danger} /> } : {})}
          destructive
          last
          onPress={confirmPersonDelete}
          symbol={symbols.trash}
          title={deleteBusy ? "Deleting Person…" : "Delete Person"}
        />
      </ListSection>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton
                accessibilityLabel={`Share ${contact.displayName}`}
                onPress={sharePerson}
                symbol={symbols.share}
              />
              <BarButton onPress={editPerson}>Edit</BarButton>
            </View>
          ),
        }}
      />
      <Screen contentContainerStyle={styles.screen} scroll={false}>
        <FlatList
          contentContainerStyle={styles.listContent}
          data={sortedTimeline}
          keyExtractor={(memory) => memory.id}
          ListFooterComponent={listFooter}
          ListHeaderComponent={listHeader}
          renderItem={({ item: memory, index }) => {
            const supporting = [
              displayDate(memory.occurredAt),
              memory.sourceLabel ? `Source: ${memory.sourceLabel}` : undefined,
              memory.nextSteps.length ? `Next: ${memory.nextSteps.join(" · ")}` : undefined,
              memory.tags.length ? [...new Set(memory.tags)].join(" · ") : undefined,
            ].filter(Boolean).join("\n");
            const first = index === 0;
            const last = index === sortedTimeline.length - 1;
            return (
              <View style={[styles.timelineRow, first && styles.timelineRowFirst, last && styles.timelineRowLast]}>
                <ListRow
                  accessibilityLabel={`${memory.summary}. ${supporting}`}
                  accessoryNode={(
                    <IconButton
                      accessibilityLabel={`More actions for memory from ${displayDate(memory.occurredAt)}`}
                      loading={memoryDeleteBusyId === memory.id}
                      onPress={() => presentMemoryActions(memory)}
                      symbol={symbols.ellipsis}
                      tone="secondary"
                    />
                  )}
                  last={last}
                  onPress={() => editMemory(memory)}
                  subtitle={supporting}
                  title={memory.summary}
                />
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: spacing.lg },
  list: { flex: 1, width: "100%" },
  listContent: { flexGrow: 1, paddingBottom: spacing.xxxl },
  listHeader: { gap: spacing.xl },
  listFooter: { marginTop: spacing.xl },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  identity: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  centerText: { width: "100%", textAlign: "center" },
  pendingGroup: { padding: spacing.lg, gap: spacing.md },
  pendingField: { paddingBottom: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  pendingActions: { gap: spacing.sm },
  timelineTitle: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.2 },
  timelineRow: { overflow: "hidden", backgroundColor: colors.surface },
  timelineRowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous" },
  timelineRowLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous" },
});
