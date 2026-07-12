import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Linking, StyleSheet, Switch, View, type AlertButton } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { createLocalConversationTopics, type Memory, type SocialLink } from "@context/shared";
import {
  AppSymbol,
  AppText,
  Avatar,
  BarButton,
  Button,
  EmptyState,
  ErrorBanner,
  IconButton,
  ListRow,
  ListSection,
  Screen,
  SuccessBanner,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { activeEventForContact } from "@/lib/contact-event-context";
import { displayDate, relativeDate } from "@/lib/date";
import { deleteFaceTemplate } from "@/lib/face-templates";
import { createModelConversationTopics } from "@/lib/local-model";
import { deletePrivateProfilePhoto } from "@/lib/profile-photo";
import { removeWatchContact } from "@/lib/update-watcher";
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

export default function ContactScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; recognized?: string | string[] }>();
  const contactId = singleParam(params.id);
  const wasMatched = singleParam(params.recognized) === "1";
  const router = useRouter();
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const events = useAppStore((state) => state.events);
  const event = useAppStore((state) => activeEventForContact(state.events, state.currentEventId, contactId));
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const setConversationTopics = useAppStore((state) => state.setConversationTopics);
  const setRecognitionEnabled = useAppStore((state) => state.setRecognitionEnabled);
  const deleteMemory = useAppStore((state) => state.deleteMemory);
  const deleteContact = useAppStore((state) => state.deleteContact);
  const [error, setError] = useState<string>();
  const [topicNotice, setTopicNotice] = useState<string>();
  const [topicBusy, setTopicBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const topicRequest = useRef(0);
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

  if (!contact) {
    return (
      <>
        <Stack.Screen options={{ title: "Person" }} />
        <Screen>
          <EmptyState
            action={<Button onPress={() => router.replace("/people")}>Open People</Button>}
            body="This person may have been removed from this device."
            symbol={symbols.person}
            title="Person unavailable"
          />
        </Screen>
      </>
    );
  }

  const editPerson = () => router.push({ pathname: "/contact/edit/[id]", params: { id: contact.id } });
  const addMemory = () => router.push({ pathname: "/memory/[contactId]", params: { contactId: contact.id } });

  const refreshTopics = async () => {
    if (!localToolsEnabled) {
      setError("Turn on on-device assistance in Settings to refresh conversation starters.");
      return;
    }
    const request = ++topicRequest.current;
    setTopicBusy(true);
    setError(undefined);
    setTopicNotice(undefined);
    try {
      const result = await createModelConversationTopics(contact, event);
      if (request !== topicRequest.current) return;
      setConversationTopics(contact.id, result.topics);
      setTopicNotice("Conversation starters refreshed on this device.");
    } catch {
      if (request !== topicRequest.current) return;
      setConversationTopics(contact.id, createLocalConversationTopics(contact, event));
      setError("The local model was unavailable. Private on-device rules refreshed the suggestions instead.");
    } finally {
      if (request === topicRequest.current) setTopicBusy(false);
    }
  };

  const removePerson = async () => {
    setDeleteBusy(true);
    setError(undefined);
    try {
      const cleanupResults = await Promise.allSettled([
        deleteFaceTemplate(contact.id),
        removeWatchContact(contact.id),
        deletePrivateProfilePhoto(contact.photoUri),
      ]);
      if (cleanupResults.some((result) => result.status === "rejected")) {
        throw new Error("Context could not remove all private data linked to this person. Nothing was deleted; try again.");
      }
      deleteContact(contact.id);
      router.replace("/people");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Context could not remove this relationship record. Nothing was changed.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmPersonDelete = () => {
    if (deleteBusy) return;
    Alert.alert(
      `Delete ${contact.displayName}?`,
      "This permanently removes this person, every saved memory, and any secure quick-match data from this device.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Person", style: "destructive", onPress: () => { void removePerson(); } },
      ],
    );
  };

  const confirmMemoryDelete = (memory: Memory) => {
    Alert.alert(
      "Delete this memory?",
      "This removes the selected memory from this device. The person’s remaining profile and memories stay intact.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Memory", style: "destructive", onPress: () => deleteMemory(contact.id, memory.id) },
      ],
    );
  };

  const presentMemoryActions = (memory: Memory) => {
    const buttons: AlertButton[] = [];
    if (memory.sourceUrl) {
      buttons.push({ text: "Open Source", onPress: () => { void Linking.openURL(memory.sourceUrl!); } });
    }
    buttons.push({ text: "Delete Memory", style: "destructive", onPress: () => confirmMemoryDelete(memory) });
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert(displayDate(memory.occurredAt), memory.summary, buttons);
  };

  const openContactLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setError("This contact link could not be opened on this iPhone.");
    }
  };

  const aboutRows = [
    { title: "Role", detail: contact.role },
    { title: "Company", detail: contact.company },
    { title: "Where You Know Them From", detail: contact.metAt },
    { title: "Who They Are to You", detail: contact.relationshipContext },
    { title: "Last Spoke", detail: contact.lastSpokeAt ? `${relativeDate(contact.lastSpokeAt)} · ${displayDate(contact.lastSpokeAt)}` : undefined },
    { title: "Last Discussed", detail: contact.lastDiscussed },
    { title: "Recent Update", detail: contact.recentUpdate },
  ].filter((row): row is { title: string; detail: string } => Boolean(row.detail));

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.identity}>
        <Avatar name={contact.displayName} photoUri={contact.photoUri} size={88} />
        <AppText accessibilityRole="header" emphasis="bold" role="title1" style={styles.centerText}>{contact.displayName}</AppText>
        <AppText role="body" style={styles.centerText} tone="secondary">
          {[contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship"}
        </AppText>
        {wasMatched ? (
          <View style={styles.matchedLine}>
            <AppSymbol name={symbols.checkCircle} size={17} tone="success" />
            <AppText role="footnote" tone="success">Matched by a badge in {event?.name ?? "the active event"}</AppText>
          </View>
        ) : null}
      </View>

      <Button onPress={addMemory} symbol={symbols.note}>Add Memory</Button>

      <ErrorBanner message={error} />
      <SuccessBanner message={topicNotice} />

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

      <ListSection
        footer={localToolsEnabled ? "Suggestions use only this person’s saved context." : "Turn on on-device assistance in Settings to refresh suggestions."}
        title="Ask About"
      >
        <ListRow
          accessoryNode={(
            <IconButton
              accessibilityLabel="Refresh conversation starters"
              loading={topicBusy}
              onPress={() => { void refreshTopics(); }}
              symbol={symbols.sparkles}
            />
          )}
          last={!uniqueTopics.length}
          subtitle={uniqueTopics.length ? "Create a new set from saved context" : "Create starters from saved context"}
          title="Refresh Suggestions"
        />
        {uniqueTopics.map((topic, index) => (
          <ListRow key={topic} last={index === uniqueTopics.length - 1} symbol={symbols.sparkles} title={topic} />
        ))}
      </ListSection>

      <ListSection title="Events">
        {memberships.length ? memberships.map((membership, index) => (
          <ListRow
            accessory="disclosure"
            {...(membership.id === event?.id ? { detail: "Active" } : {})}
            key={membership.id}
            last={index === memberships.length - 1}
            onPress={() => router.push({ pathname: "/event/[id]/attendees", params: { id: membership.id } })}
            subtitle={`${displayDate(membership.startsAt)} · ${membership.locationLabel ?? "No location"}`}
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

      {sortedTimeline.length ? (
        <AppText emphasis="semibold" role="footnote" style={styles.timelineTitle} tone="secondary">TIMELINE</AppText>
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
      <ListSection title="More">
        <ListRow
          accessory="disclosure"
          onPress={() => router.push({ pathname: "/contact/badge/[id]", params: { id: contact.id } })}
          symbol={symbols.scan}
          title="Context Badge"
        />
        <ListRow
          accessory="disclosure"
          onPress={() => router.push({ pathname: "/updates", params: { contactId: contact.id } })}
          symbol={symbols.updates}
          title="Public Updates"
        />
        <ListRow
          accessoryNode={(
            <Switch
              accessibilityLabel={`Allow quick badge matching for ${contact.displayName}`}
              onValueChange={(value) => setRecognitionEnabled(contact.id, value)}
              trackColor={{ false: colors.fillStrong, true: colors.primary }}
              value={contact.recognitionEnabled}
            />
          )}
          subtitle="Limited to people included in the active event"
          symbol={symbols.scan}
          title="Quick Matching"
        />
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
          headerRight: () => <BarButton onPress={editPerson}>Edit</BarButton>,
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
                      onPress={() => presentMemoryActions(memory)}
                      symbol={symbols.ellipsis}
                      tone="secondary"
                    />
                  )}
                  last={last}
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
  identity: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  centerText: { width: "100%", textAlign: "center" },
  matchedLine: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  timelineTitle: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.2 },
  timelineRow: { overflow: "hidden", backgroundColor: colors.surface },
  timelineRowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous" },
  timelineRowLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous" },
});
