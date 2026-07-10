import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Memory, MemoryDraft } from "@context/shared";
import { Body, Button, Card, ErrorBanner, Pill, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { extractMemory, transcribeAudio } from "@/lib/api";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function AddMemoryScreen() {
  const params = useLocalSearchParams<{ contactId?: string | string[] }>();
  const contactId = singleParam(params.contactId);
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const event = useAppStore((state) => state.events.find((item) => item.id === state.currentEventId));
  const aiEnabled = useAppStore((state) => state.aiEnabled);
  const addMemory = useAppStore((state) => state.addMemory);
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState<MemoryDraft>();
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [source, setSource] = useState<"voice" | "text">("text");
  const [provider, setProvider] = useState<"openai" | "demo">();

  if (!contact) {
    return (
      <Screen><Card><Body>This person is no longer available.</Body></Card><Button onPress={() => router.back()}>Close</Button></Screen>
    );
  }

  const ensureAiEnabled = () => {
    if (aiEnabled) return true;
    setError("OpenAI memory intelligence is off. Enable it in Privacy & data to transcribe or create a draft.");
    return false;
  };

  const createDraft = async (text: string, inputSource: "voice" | "text") => {
    if (!ensureAiEnabled()) return;
    const clean = text.trim();
    if (!clean) {
      setError("Add a short note first.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const nextDraft = await extractMemory(clean, contact, event);
      setTranscript(clean);
      setDraft(nextDraft);
      setSummary(nextDraft.summary);
      setSource(inputSource);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a memory draft.");
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!ensureAiEnabled()) return;
    setError(undefined);
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError("Microphone permission is required only while you dictate this memory.");
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldPlayInBackground: false });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const stopAndTranscribe = async () => {
    setBusy(true);
    setError(undefined);
    let uri: string | null = null;
    try {
      await recorder.stop();
      const recorderWithUri = recorder as unknown as { uri?: string | null };
      uri = recorderWithUri.uri ?? recorderState.url;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false });
      if (!uri) throw new Error("The recording could not be read.");
      const result = await transcribeAudio(uri);
      setProvider(result.provider);
      await createDraft(result.transcript, "voice");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not transcribe the recording.");
    } finally {
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      setBusy(false);
    }
  };

  const confirmDraft = () => {
    if (!draft || !summary.trim()) return;
    const now = new Date().toISOString();
    const memory: Memory = {
      id: `memory-${Date.now().toString(36)}`,
      contactId: contact.id,
      summary: summary.trim(),
      tags: draft.suggestedTags,
      nextSteps: draft.suggestedFollowUps,
      source,
      occurredAt: now,
      createdAt: now,
    };
    addMemory(memory);
    router.replace({ pathname: "/contact/[id]", params: { id: contact.id } });
  };

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Pill tone="safe">Confirmation required</Pill>
        <Text style={styles.title}>What should you remember about {contact.displayName.split(" ")[0]}?</Text>
        <Body muted>Audio is temporary. The raw transcript is not stored after you confirm the draft.</Body>
      </View>

      <ErrorBanner message={error} />
      {!aiEnabled ? <Button variant="secondary" onPress={() => router.push("/settings")}>Open Privacy & data</Button> : null}

      <Card style={styles.voiceCard}>
        <View style={styles.voiceTopline}>
          <View style={styles.flex}>
            <Text style={[styles.sectionTitle, styles.voiceTitle]}>Dictate the update</Text>
            <Text style={styles.sectionHint}>
              {recorderState.isRecording
                ? `Recording · ${Math.round(recorderState.durationMillis / 1000)}s`
                : "Tap once to start, once to stop"}
            </Text>
          </View>
          <View style={[styles.recordDot, recorderState.isRecording && styles.recordDotActive]} />
        </View>
        <Button
          variant={recorderState.isRecording ? "danger" : "primary"}
          disabled={busy || !aiEnabled}
          onPress={recorderState.isRecording ? stopAndTranscribe : startRecording}
        >
          {recorderState.isRecording ? "Stop and create draft" : "Start recording"}
        </Button>
        {provider ? <Text style={styles.provider}>Transcription provider: {provider === "demo" ? "deterministic API demo mode" : "OpenAI"}</Text> : null}
      </Card>

      <View style={styles.orRow}><View style={styles.line} /><Text style={styles.orText}>or type it</Text><View style={styles.line} /></View>
      <TextInput
        accessibilityLabel="Memory note"
        value={transcript}
        onChangeText={setTranscript}
        placeholder="Alex accepted a new job in New York and is looking for AI engineers."
        placeholderTextColor={colors.inkMuted}
        multiline
        maxLength={4_000}
        style={styles.textarea}
      />
      <Button variant="secondary" loading={busy} disabled={!aiEnabled || recorderState.isRecording} onPress={() => createDraft(transcript, "text")}>
        Create editable draft
      </Button>

      {draft ? (
        <Card style={styles.draftCard}>
          <View style={styles.draftTopline}>
            <Text style={styles.sectionTitle}>Review before saving</Text>
            <Pill>{Math.round(draft.confidence * 100)}% confidence</Pill>
          </View>
          <Text style={styles.label}>Timeline summary</Text>
          <TextInput accessibilityLabel="Timeline summary" value={summary} onChangeText={setSummary} multiline maxLength={500} style={styles.summaryInput} />
          {draft.extractedFacts.length ? (
            <View style={styles.factList}>
              <Text style={styles.label}>Extracted facts</Text>
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
          <Button variant="quiet" onPress={() => { setDraft(undefined); setSummary(""); }}>Discard draft</Button>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  header: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.6 },
  voiceCard: { backgroundColor: colors.ink, borderColor: colors.ink },
  voiceTopline: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flex: { flex: 1 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  voiceTitle: { color: colors.white },
  sectionHint: { color: colors.inkMuted, fontSize: 12, marginTop: 3 },
  recordDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#667085" },
  recordDotActive: { backgroundColor: "#F04438" },
  provider: { color: "#C9CED7", fontSize: 11, textAlign: "center" },
  orRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  orText: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  textarea: { minHeight: 128, textAlignVertical: "top", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, color: colors.ink, fontSize: 15, lineHeight: 22 },
  draftCard: { borderColor: "#B7E4D2", backgroundColor: "#F1FBF7" },
  draftTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  label: { color: colors.inkMuted, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  summaryInput: { minHeight: 88, textAlignVertical: "top", borderRadius: radius.md, borderWidth: 1, borderColor: "#B7E4D2", backgroundColor: colors.surface, padding: spacing.md, color: colors.ink, fontSize: 15, lineHeight: 22 },
  factList: { gap: spacing.xs },
  fact: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  followUp: { color: colors.success, fontSize: 13, lineHeight: 19, fontWeight: "600" },
});
