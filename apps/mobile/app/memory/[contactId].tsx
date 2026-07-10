import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createLocalMemoryDraft, type Memory, type MemoryDraft } from "@context/shared";
import { Body, Button, Card, EmptyState, ErrorBanner, Pill, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function AddMemoryScreen() {
  const params = useLocalSearchParams<{ contactId?: string | string[] }>();
  const contactId = singleParam(params.contactId);
  const router = useRouter();
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const addMemory = useAppStore((state) => state.addMemory);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<MemoryDraft>();
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string>();

  if (!contact) {
    return (
      <Screen>
        <EmptyState
          action={<Button onPress={() => router.replace("/home")}>Return home</Button>}
          body="It may have been deleted from this device."
          title="This person is no longer available"
        />
      </Screen>
    );
  }

  const saveMemory = (memorySummary: string, tags: string[] = [], nextSteps: string[] = []) => {
    const now = new Date().toISOString();
    const memory: Memory = {
      id: `memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      contactId: contact.id,
      summary: memorySummary,
      tags,
      nextSteps,
      source: "text",
      occurredAt: now,
      createdAt: now,
    };
    addMemory(memory);
    router.replace({ pathname: "/contact/[id]", params: { id: contact.id } });
  };

  const createDraft = () => {
    if (!localToolsEnabled) {
      setError("Local smart tools are off. You can still save the note exactly as written.");
      return;
    }
    const clean = note.trim();
    if (!clean) {
      setError("Add a short note first.");
      return;
    }
    const nextDraft = createLocalMemoryDraft(clean);
    setError(undefined);
    setDraft(nextDraft);
    setSummary(nextDraft.summary);
  };

  const saveAsWritten = () => {
    const clean = note.trim();
    if (!clean) {
      setError("Add a short note first.");
      return;
    }
    if (clean.length > 500) {
      setError("Notes saved as written must be 500 characters or fewer. Shorten it or use a local draft.");
      return;
    }
    saveMemory(clean, ["note"]);
  };

  const confirmDraft = () => {
    if (!draft || !summary.trim()) {
      setError("The timeline summary cannot be empty.");
      return;
    }
    saveMemory(summary.trim(), draft.suggestedTags, draft.suggestedFollowUps);
  };

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Pill tone="safe">100% on-device · works offline</Pill>
        <Text style={styles.title}>What changed with {contact.displayName.split(" ")[0]}?</Text>
        <Body muted>Type the useful part. Save it directly or shape it into an editable local draft.</Body>
      </View>

      <ErrorBanner message={error} />

      <Card style={styles.localCard}>
        <View style={styles.localRow}>
          <View style={[styles.localDot, localToolsEnabled && styles.localDotEnabled]} />
          <View style={styles.flex}>
            <Text style={styles.localTitle}>{localToolsEnabled ? "Local rules ready" : "Local smart tools are off"}</Text>
            <Text style={styles.localBody}>{localToolsEnabled
              ? "Drafting runs instantly on this device. Your note and relationship profile are never uploaded."
              : "Manual notes still work without any service, account, or internet connection."}</Text>
          </View>
          {!localToolsEnabled ? <Button onPress={() => router.push("/settings")} style={styles.settingsButton} variant="quiet">Settings</Button> : null}
        </View>
      </Card>

      <Card style={styles.freeCard}>
        <Text style={styles.freeTitle}>Zero-cost by design</Text>
        <Text style={styles.freeBody}>Context uses typed notes instead of cloud speech transcription, so there is no paid API, usage meter, or audio upload.</Text>
      </Card>

      <TextInput
        accessibilityLabel="Memory note"
        maxLength={4_000}
        multiline
        onChangeText={(value) => {
          setNote(value);
          if (draft) {
            setDraft(undefined);
            setSummary("");
          }
        }}
        placeholder="Alex accepted a new role in New York and is looking for AI engineers."
        placeholderTextColor={colors.inkMuted}
        style={styles.textarea}
        value={note}
      />
      <Text style={styles.characterCount}>{note.length.toLocaleString()} / 4,000</Text>
      <View style={styles.noteActions}>
        <Button disabled={!localToolsEnabled} onPress={createDraft} style={styles.flexButton} variant="secondary">Create local draft</Button>
        <Button onPress={saveAsWritten} style={styles.flexButton}>Save as written</Button>
      </View>

      {draft ? (
        <Card style={styles.draftCard}>
          <View style={styles.draftTopline}>
            <View style={styles.flex}>
              <Text style={styles.sectionTitle}>Review before saving</Text>
              <Text style={styles.sectionHint}>Deterministic rules suggested this. Edit anything that does not sound like you.</Text>
            </View>
            <Pill>Local rules</Pill>
          </View>
          <Text style={styles.label}>Timeline summary</Text>
          <TextInput accessibilityLabel="Timeline summary" maxLength={500} multiline onChangeText={setSummary} style={styles.summaryInput} value={summary} />
          {draft.extractedFacts.length ? (
            <View style={styles.factList}>
              <Text style={styles.label}>Detected details</Text>
              {draft.extractedFacts.map((fact) => <Text key={fact} style={styles.fact}>• {fact}</Text>)}
            </View>
          ) : null}
          {draft.suggestedFollowUps.length ? (
            <View style={styles.factList}>
              <Text style={styles.label}>Suggested follow-up</Text>
              {draft.suggestedFollowUps.map((item) => <Text key={item} style={styles.followUp}>• {item}</Text>)}
            </View>
          ) : null}
          <Button onPress={confirmDraft}>Confirm and add to timeline</Button>
          <Button onPress={() => { setDraft(undefined); setSummary(""); }} variant="quiet">Discard draft</Button>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  header: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: "800" },
  localCard: { backgroundColor: colors.primarySoft, borderColor: "#D9D6FE" },
  localRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  localDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.inkMuted },
  localDotEnabled: { backgroundColor: colors.success },
  localTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  localBody: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  settingsButton: { minHeight: 38, paddingHorizontal: spacing.sm },
  freeCard: { backgroundColor: colors.ink, borderColor: colors.ink },
  freeTitle: { color: colors.white, fontSize: 16, fontWeight: "800" },
  freeBody: { color: "#C9CED7", fontSize: 13, lineHeight: 19 },
  flex: { flex: 1 },
  textarea: { minHeight: 148, textAlignVertical: "top", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, color: colors.ink, fontSize: 15, lineHeight: 22 },
  characterCount: { color: colors.inkMuted, fontSize: 11, textAlign: "right", marginTop: -spacing.sm, fontVariant: ["tabular-nums"] },
  noteActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  flexButton: { flex: 1, minWidth: 210 },
  draftCard: { borderColor: "#B7E4D2", backgroundColor: "#F1FBF7" },
  draftTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  sectionHint: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  label: { color: colors.inkMuted, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  summaryInput: { minHeight: 88, textAlignVertical: "top", borderRadius: radius.md, borderWidth: 1, borderColor: "#B7E4D2", backgroundColor: colors.surface, padding: spacing.md, color: colors.ink, fontSize: 15, lineHeight: 22 },
  factList: { gap: spacing.xs },
  fact: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  followUp: { color: colors.success, fontSize: 13, lineHeight: 19, fontWeight: "600" },
});
