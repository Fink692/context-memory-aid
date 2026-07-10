import { useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Avatar, Body, Button, Card, DetailRow, Divider, ErrorBanner, Pill, Screen, Title } from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import { displayDate, relativeDate } from "@/lib/date";
import { suggestTopics } from "@/lib/api";
import { deleteFaceTemplate } from "@/lib/face-templates";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ContactScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; recognized?: string | string[] }>();
  const contactId = singleParam(params.id);
  const wasRecognized = singleParam(params.recognized) === "1";
  const router = useRouter();
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const event = useAppStore((state) => state.events.find((item) => item.id === state.currentEventId));
  const aiEnabled = useAppStore((state) => state.aiEnabled);
  const setRecognitionEnabled = useAppStore((state) => state.setRecognitionEnabled);
  const deleteContact = useAppStore((state) => state.deleteContact);
  const [topics, setTopics] = useState(contact?.conversationTopics ?? []);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [error, setError] = useState<string>();

  if (!contact) {
    return (
      <Screen>
        <Card><Body>This person is no longer in your relationship database.</Body></Card>
        <Button onPress={() => router.replace("/home")}>Back to event</Button>
      </Screen>
    );
  }

  const refreshTopics = async () => {
    if (!aiEnabled) {
      setError("Enable OpenAI memory intelligence in Privacy & data first.");
      return;
    }
    setError(undefined);
    setLoadingTopics(true);
    try {
      setTopics(await suggestTopics(contact, event));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh topics.");
    } finally {
      setLoadingTopics(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      `Delete ${contact.displayName}?`,
      "This removes their timeline and local recognition template from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteFaceTemplate(contact.id);
            deleteContact(contact.id);
            router.replace("/home");
          },
        },
      ],
    );
  };

  return (
    <Screen contentContainerStyle={styles.screen}>
      {wasRecognized ? (
        <View style={styles.recognizedBanner}>
          <Pill tone="safe">Matched inside this event</Pill>
          <Text style={styles.recognizedText}>The camera capture has already been discarded.</Text>
        </View>
      ) : null}

      <View style={styles.identity}>
        <Avatar name={contact.displayName} size={72} />
        <View style={styles.identityCopy}>
          <Title compact>{contact.displayName}</Title>
          <Text style={styles.role}>{[contact.role, contact.company].filter(Boolean).join(" · ")}</Text>
        </View>
      </View>

      <Card style={styles.profileCard}>
        <DetailRow label="Met" value={contact.metAt} />
        <DetailRow label="Last spoke" value={relativeDate(contact.lastSpokeAt)} />
        <DetailRow label="Company" value={contact.company} />
        <DetailRow label="Last discussed" value={contact.lastDiscussed} />
        <DetailRow label="Recent update" value={contact.recentUpdate} />
      </Card>

      <Card style={styles.askCard}>
        <View style={styles.sectionRow}>
          <View>
            <Text style={styles.sectionTitle}>Ask about</Text>
            <Text style={styles.sectionHint}>Grounded in this person’s saved context</Text>
          </View>
          <Button variant="quiet" loading={loadingTopics} onPress={refreshTopics} style={styles.smallButton}>Refresh</Button>
        </View>
        {topics.length ? topics.map((topic) => (
          <View key={topic} style={styles.topicRow}>
            <Text style={styles.topicDot}>•</Text>
            <Text style={styles.topicText}>{topic}</Text>
          </View>
        )) : <Body muted>No prompts yet. Add a memory or refresh with AI.</Body>}
      </Card>

      <ErrorBanner message={error} />
      <Button onPress={() => router.push({ pathname: "/memory/[contactId]", params: { contactId: contact.id } })}>
        Add memory after the conversation
      </Button>

      <View style={styles.sectionRow}>
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          <Text style={styles.sectionHint}>Confirmed memories only</Text>
        </View>
        <Pill>{contact.timeline.length}</Pill>
      </View>
      {contact.timeline.length ? contact.timeline.map((memory) => (
        <Card key={memory.id} style={styles.timelineCard}>
          <Text style={styles.timelineDate}>{displayDate(memory.occurredAt)}</Text>
          <Text style={styles.timelineSummary}>{memory.summary}</Text>
          {memory.nextSteps.length ? (
            <Text style={styles.nextStep}>Next: {memory.nextSteps.join(" · ")}</Text>
          ) : null}
        </Card>
      )) : (
        <Card><Body muted>No memories yet. Capture the next useful update after you speak.</Body></Card>
      )}

      <Card style={styles.controlCard}>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>Recognition candidate</Text>
            <Text style={styles.sectionHint}>Applies only when this person is also in the active event.</Text>
          </View>
          <Switch
            value={contact.recognitionEnabled}
            onValueChange={(value) => setRecognitionEnabled(contact.id, value)}
            trackColor={{ false: colors.border, true: "#A7F3D0" }}
            thumbColor={contact.recognitionEnabled ? colors.success : colors.surface}
          />
        </View>
        <Divider />
        <Button variant="danger" onPress={confirmDelete}>Delete person and template</Button>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  recognizedBanner: { gap: spacing.xs },
  recognizedText: { color: colors.inkMuted, fontSize: 12 },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  identityCopy: { flex: 1, gap: spacing.xs },
  role: { color: colors.inkMuted, fontSize: 15, lineHeight: 21 },
  profileCard: { shadowOpacity: 0.04 },
  askCard: { backgroundColor: "#F0EFFF", borderColor: "#D9D6FE", shadowOpacity: 0 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  sectionHint: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  smallButton: { minHeight: 40, paddingHorizontal: spacing.sm },
  topicRow: { flexDirection: "row", gap: spacing.sm },
  topicDot: { color: colors.primary, fontSize: 18, fontWeight: "900" },
  topicText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  timelineCard: { shadowOpacity: 0 },
  timelineDate: { color: colors.primary, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  timelineSummary: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  nextStep: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  controlCard: { marginTop: spacing.md, shadowOpacity: 0 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flex: { flex: 1 },
});
