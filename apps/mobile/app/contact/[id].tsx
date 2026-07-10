import { useMemo, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createLocalConversationTopics, type Memory } from "@context/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Avatar, Body, Button, Card, DetailRow, Divider, EmptyState, ErrorBanner, Pill, Screen, SectionHeader, SuccessBanner, Title } from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import { displayDate, relativeDate } from "@/lib/date";
import { deleteFaceTemplate } from "@/lib/face-templates";
import { createModelConversationTopics } from "@/lib/local-model";
import { removeWatchContact } from "@/lib/update-watcher";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ContactScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; recognized?: string | string[] }>();
  const contactId = singleParam(params.id);
  const wasMatched = singleParam(params.recognized) === "1";
  const router = useRouter();
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const event = useAppStore((state) => state.events.find((item) => item.id === state.currentEventId));
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const updateWatchUsed = useAppStore((state) => state.updateWatchUsed);
  const setConversationTopics = useAppStore((state) => state.setConversationTopics);
  const setRecognitionEnabled = useAppStore((state) => state.setRecognitionEnabled);
  const deleteMemory = useAppStore((state) => state.deleteMemory);
  const deleteContact = useAppStore((state) => state.deleteContact);
  const [error, setError] = useState<string>();
  const [topicNotice, setTopicNotice] = useState<string>();
  const [topicBusy, setTopicBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmPersonDelete, setConfirmPersonDelete] = useState(false);
  const [pendingMemory, setPendingMemory] = useState<Memory>();
  const sortedTimeline = useMemo(
    () => [...(contact?.timeline ?? [])].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    [contact?.timeline],
  );

  if (!contact) {
    return (
      <Screen>
        <EmptyState
          action={<Button onPress={() => router.replace("/home")}>Return to event</Button>}
          body="It may have been deleted on this device."
          title="This person is no longer available"
        />
      </Screen>
    );
  }

  const refreshTopics = async () => {
    if (!localToolsEnabled) {
      setError("Turn on local AI in Privacy & data to generate new prompts. Existing saved prompts remain available.");
      return;
    }
    setTopicBusy(true);
    setError(undefined);
    setTopicNotice(undefined);
    try {
      const result = await createModelConversationTopics(contact, event);
      setConversationTopics(contact.id, result.topics);
      setTopicNotice(`Prompts generated locally with ${result.model}. No cloud model was contacted.`);
    } catch (caught) {
      setConversationTopics(contact.id, createLocalConversationTopics(contact, event));
      setError(`${caught instanceof Error ? caught.message : "The local model is unavailable."} Non-AI local rules refreshed the prompts instead.`);
    } finally {
      setTopicBusy(false);
    }
  };

  const removePerson = async () => {
    setDeleteBusy(true);
    setError(undefined);
    try {
      await deleteFaceTemplate(contact.id);
      if (updateWatchUsed) await removeWatchContact(contact.id);
      deleteContact(contact.id);
      setConfirmPersonDelete(false);
      router.replace("/home");
    } catch {
      setError("The person record was kept because Context could not finish removing every local copy. If you used Update Watch, make sure npm run dev:watcher is running, then try again.");
      setConfirmPersonDelete(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <Screen contentContainerStyle={styles.screen}>
      {wasMatched ? (
        <View style={styles.recognizedBanner}>
          <Pill tone="safe">Matched by an event badge</Pill>
          <Text style={styles.recognizedText}>The badge was checked only against quick-match people in {event?.name ?? "the active event"}.</Text>
        </View>
      ) : null}

      <View style={styles.identity}>
        <Avatar name={contact.displayName} size={72} />
        <View style={styles.identityCopy}>
          <Title compact>{contact.displayName}</Title>
          <Text style={styles.role}>{[contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship"}</Text>
        </View>
        <Button
          accessibilityLabel={`Edit ${contact.displayName}`}
          onPress={() => router.push({ pathname: "/contact/edit/[id]", params: { id: contact.id } })}
          style={styles.editButton}
          variant="secondary"
        >
          Edit
        </Button>
      </View>

      <Card style={styles.profileCard}>
        <DetailRow label="Met" value={contact.metAt} />
        <DetailRow label="Last spoke" value={contact.lastSpokeAt ? `${relativeDate(contact.lastSpokeAt)} · ${displayDate(contact.lastSpokeAt)}` : undefined} />
        <DetailRow label="Company" value={contact.company} />
        <DetailRow label="Last discussed" value={contact.lastDiscussed} />
        <DetailRow label="Recent update" value={contact.recentUpdate} />
        {!contact.metAt && !contact.lastSpokeAt && !contact.company && !contact.lastDiscussed && !contact.recentUpdate
          ? <Body muted>Add a few details to make the next refresher more useful.</Body>
          : null}
      </Card>

      <Card style={styles.askCard}>
        <View style={styles.sectionRow}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>Ask about</Text>
            <Text style={styles.sectionHint}>Local-model prompts grounded only in this person’s saved context</Text>
          </View>
          <Button loading={topicBusy} onPress={() => { void refreshTopics(); }} style={styles.smallButton} variant="quiet">Use local model</Button>
        </View>
        {contact.conversationTopics.length ? contact.conversationTopics.map((topic) => (
          <View key={topic} style={styles.topicRow}>
            <Text style={styles.topicDot}>•</Text>
            <Text style={styles.topicText}>{topic}</Text>
          </View>
        )) : <Body muted>No prompts yet. Add a memory, edit the profile, or generate prompts with smart tools.</Body>}
      </Card>

      <ErrorBanner message={error} />
      <SuccessBanner message={topicNotice} />
      <Button onPress={() => router.push({ pathname: "/memory/[contactId]", params: { contactId: contact.id } })}>Add a memory</Button>
      <Button onPress={() => router.push({ pathname: "/updates", params: { contactId: contact.id } })} variant="secondary">Watch public updates</Button>

      <SectionHeader subtitle="Only notes you deliberately confirmed" title={`Timeline · ${sortedTimeline.length}`} />
      {sortedTimeline.length ? sortedTimeline.map((memory) => (
        <Card key={memory.id} style={styles.timelineCard}>
          <View style={styles.timelineTopline}>
            <Text style={styles.timelineDate}>{displayDate(memory.occurredAt)}</Text>
            <Button
              accessibilityLabel={`Delete memory from ${displayDate(memory.occurredAt)}`}
              onPress={() => setPendingMemory(memory)}
              style={styles.memoryAction}
              variant="quiet"
            >
              Delete
            </Button>
          </View>
          <Text style={styles.timelineSummary}>{memory.summary}</Text>
          {memory.nextSteps.length ? <Text style={styles.nextStep}>Next: {memory.nextSteps.join(" · ")}</Text> : null}
          {memory.tags.length ? (
            <View style={styles.tagRow}>{memory.tags.map((tag) => <Pill key={tag}>{tag}</Pill>)}</View>
          ) : null}
        </Card>
      )) : (
        <EmptyState
          action={<Button onPress={() => router.push({ pathname: "/memory/[contactId]", params: { contactId: contact.id } })} variant="secondary">Add the first memory</Button>}
          body="Capture the next useful update after you speak."
          title="No memories yet"
        />
      )}

      <Card style={styles.controlCard}>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>Quick badge matching</Text>
            <Text style={styles.sectionHint}>Works only when this person is also in the active event. It does not enable face recognition.</Text>
          </View>
          <Switch
            accessibilityLabel={`Quick badge matching for ${contact.displayName}`}
            onValueChange={(value) => setRecognitionEnabled(contact.id, value)}
            thumbColor={contact.recognitionEnabled ? colors.success : colors.surface}
            trackColor={{ false: colors.border, true: "#A7F3D0" }}
            value={contact.recognitionEnabled}
          />
        </View>
        <Divider />
        <Button onPress={() => setConfirmPersonDelete(true)} variant="danger">Delete person and all memories</Button>
      </Card>

      <ConfirmDialog
        body={`This permanently removes ${contact.displayName}, every saved memory, and any secure quick-match data from this device.`}
        busy={deleteBusy}
        confirmLabel="Delete person"
        destructive
        onCancel={() => setConfirmPersonDelete(false)}
        onConfirm={() => { void removePerson(); }}
        title={`Delete ${contact.displayName}?`}
        visible={confirmPersonDelete}
      />
      <ConfirmDialog
        body="This removes the selected timeline memory from this device. The person’s remaining profile and memories stay intact."
        confirmLabel="Delete memory"
        destructive
        onCancel={() => setPendingMemory(undefined)}
        onConfirm={() => {
          if (pendingMemory) deleteMemory(contact.id, pendingMemory.id);
          setPendingMemory(undefined);
        }}
        title="Delete this memory?"
        visible={Boolean(pendingMemory)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  recognizedBanner: { gap: spacing.xs },
  recognizedText: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
  identity: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md },
  identityCopy: { flex: 1, minWidth: 210, gap: spacing.xs },
  role: { color: colors.inkMuted, fontSize: 15, lineHeight: 21 },
  editButton: { minHeight: 42, paddingHorizontal: spacing.md },
  profileCard: {},
  askCard: { backgroundColor: colors.primarySoft, borderColor: "#D9D6FE" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  sectionHint: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  smallButton: { minHeight: 40, paddingHorizontal: spacing.sm },
  topicRow: { flexDirection: "row", gap: spacing.sm },
  topicDot: { color: colors.primary, fontSize: 18, fontWeight: "900" },
  topicText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  timelineCard: {},
  timelineTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  timelineDate: { color: colors.primary, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  timelineSummary: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  nextStep: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  memoryAction: { minHeight: 36, paddingHorizontal: spacing.sm },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  controlCard: { marginTop: spacing.md },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flex: { flex: 1 },
});
