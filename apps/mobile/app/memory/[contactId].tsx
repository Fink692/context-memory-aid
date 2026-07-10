import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Memory, MemoryDraft } from "@context/shared";
import { Body, Button, Card, EmptyState, ErrorBanner, Pill, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { extractMemory, getApiHealth, transcribeAudio } from "@/lib/api";
import { useAppStore } from "@/store/app-store";

type ServiceState = "checking" | "openai" | "rules" | "offline";

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
  const [serviceState, setServiceState] = useState<ServiceState>(aiEnabled ? "checking" : "rules");

  useEffect(() => {
    if (!aiEnabled) {
      setServiceState("rules");
      return;
    }
    let active = true;
    setServiceState("checking");
    void getApiHealth()
      .then((health) => { if (active) setServiceState(health.aiMode); })
      .catch(() => { if (active) setServiceState("offline"); });
    return () => { active = false; };
  }, [aiEnabled]);

  useEffect(() => () => {
    void (async () => {
      try {
        if (recorder.isRecording) await recorder.stop();
      } finally {
        const uri = recorder.uri;
        if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false }).catch(() => undefined);
      }
    })();
  }, [recorder]);

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

  const saveMemory = (memorySummary: string, memorySource: "voice" | "text", tags: string[] = [], nextSteps: string[] = []) => {
    const now = new Date().toISOString();
    const memory: Memory = {
      id: `memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      contactId: contact.id,
      summary: memorySummary,
      tags,
      nextSteps,
      source: memorySource,
      occurredAt: now,
      createdAt: now,
    };
    addMemory(memory);
    router.replace({ pathname: "/contact/[id]", params: { id: contact.id } });
  };

  const createSmartDraft = async (text: string, inputSource: "voice" | "text") => {
    if (!aiEnabled) {
      setError("Smart drafts are off. You can still save the note exactly as written.");
      return;
    }
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

  const saveAsWritten = () => {
    const clean = transcript.trim();
    if (!clean) {
      setError("Add a short note first.");
      return;
    }
    if (clean.length > 500) {
      setError("Notes saved as written must be 500 characters or fewer. Shorten it or use a smart draft.");
      return;
    }
    saveMemory(clean, "text", ["note"]);
  };

  const startRecording = async () => {
    if (!aiEnabled || serviceState !== "openai") {
      setError("Voice transcription is available only when the memory service is connected to OpenAI. Typed notes always work.");
      return;
    }
    setError(undefined);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError("Microphone permission is required only while you dictate this memory.");
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldPlayInBackground: false });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setError("Context could not start recording. Check microphone access and try again.");
    }
  };

  const stopAndTranscribe = async () => {
    setBusy(true);
    setError(undefined);
    let uri: string | null = recorder.uri;
    try {
      if (recorder.isRecording) await recorder.stop();
      uri = recorder.uri ?? recorderState.url;
      if (!uri) throw new Error("The recording could not be read.");
      const result = await transcribeAudio(uri);
      const nextDraft = await extractMemory(result.transcript, contact, event);
      setTranscript(result.transcript);
      setDraft(nextDraft);
      setSummary(nextDraft.summary);
      setSource("voice");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not transcribe the recording.");
    } finally {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false }).catch(() => undefined);
      const cleanupUri = uri ?? recorder.uri;
      if (cleanupUri) await FileSystem.deleteAsync(cleanupUri, { idempotent: true }).catch(() => undefined);
      setBusy(false);
    }
  };

  const confirmDraft = () => {
    if (!draft || !summary.trim()) {
      setError("The timeline summary cannot be empty.");
      return;
    }
    saveMemory(summary.trim(), source, draft.suggestedTags, draft.suggestedFollowUps);
  };

  const serviceLabel = serviceState === "openai"
    ? "OpenAI connected"
    : serviceState === "rules"
      ? "Private rules-based drafts"
      : serviceState === "checking"
        ? "Checking memory service"
        : "Memory service offline";

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Pill tone="safe">Nothing saves without confirmation</Pill>
        <Text style={styles.title}>What changed with {contact.displayName.split(" ")[0]}?</Text>
        <Body muted>Write the useful part. Save it directly or turn it into an editable smart draft.</Body>
      </View>

      <ErrorBanner message={error} />

      <Card style={styles.serviceCard}>
        <View style={styles.serviceRow}>
          <View style={[styles.serviceDot, serviceState === "openai" && styles.serviceDotOnline, serviceState === "offline" && styles.serviceDotOffline]} />
          <View style={styles.flex}>
            <Text style={styles.serviceTitle}>{aiEnabled ? serviceLabel : "Smart drafts are off"}</Text>
            <Text style={styles.serviceBody}>{aiEnabled
              ? serviceState === "openai"
                ? "Typed and dictated notes can become editable drafts."
                : "Typed notes can use deterministic rules. Voice transcription requires OpenAI mode."
              : "Typed notes can still be saved exactly as written without contacting the API."}</Text>
          </View>
          {!aiEnabled ? <Button onPress={() => router.push("/settings")} style={styles.settingsButton} variant="quiet">Settings</Button> : null}
        </View>
      </Card>

      <Card style={styles.voiceCard}>
        <View style={styles.voiceTopline}>
          <View style={styles.flex}>
            <Text style={styles.voiceTitle}>Dictate the update</Text>
            <Text style={styles.voiceHint}>{recorderState.isRecording
              ? `Recording · ${Math.round(recorderState.durationMillis / 1_000)}s`
              : serviceState === "openai" ? "Audio is deleted after transcription" : "Requires OpenAI transcription mode"}</Text>
          </View>
          <View style={[styles.recordDot, recorderState.isRecording && styles.recordDotActive]} />
        </View>
        <Button
          disabled={busy || (!recorderState.isRecording && serviceState !== "openai")}
          onPress={recorderState.isRecording ? stopAndTranscribe : startRecording}
          variant={recorderState.isRecording ? "danger" : "primary"}
        >
          {recorderState.isRecording ? "Stop and create draft" : "Start recording"}
        </Button>
      </Card>

      <View style={styles.orRow}><View style={styles.line} /><Text style={styles.orText}>or type it</Text><View style={styles.line} /></View>
      <TextInput
        accessibilityLabel="Memory note"
        maxLength={4_000}
        multiline
        onChangeText={(value) => {
          setTranscript(value);
          if (draft) {
            setDraft(undefined);
            setSummary("");
          }
        }}
        placeholder="Alex accepted a new role in New York and is looking for AI engineers."
        placeholderTextColor={colors.inkMuted}
        style={styles.textarea}
        value={transcript}
      />
      <Text style={styles.characterCount}>{transcript.length.toLocaleString()} / 4,000</Text>
      <View style={styles.noteActions}>
        <Button disabled={!aiEnabled || recorderState.isRecording} loading={busy} onPress={() => { void createSmartDraft(transcript, "text"); }} style={styles.flexButton} variant="secondary">Create smart draft</Button>
        <Button disabled={busy || recorderState.isRecording} onPress={saveAsWritten} style={styles.flexButton}>Save as written</Button>
      </View>

      {draft ? (
        <Card style={styles.draftCard}>
          <View style={styles.draftTopline}>
            <View style={styles.flex}>
              <Text style={styles.sectionTitle}>Review before saving</Text>
              <Text style={styles.sectionHint}>Edit anything that does not sound like you.</Text>
            </View>
            <Pill>{Math.round(draft.confidence * 100)}% confidence</Pill>
          </View>
          <Text style={styles.label}>Timeline summary</Text>
          <TextInput accessibilityLabel="Timeline summary" maxLength={500} multiline onChangeText={setSummary} style={styles.summaryInput} value={summary} />
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
  serviceCard: {},
  serviceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  serviceDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning },
  serviceDotOnline: { backgroundColor: colors.success },
  serviceDotOffline: { backgroundColor: colors.danger },
  serviceTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  serviceBody: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  settingsButton: { minHeight: 38, paddingHorizontal: spacing.sm },
  voiceCard: { backgroundColor: colors.ink, borderColor: colors.ink },
  voiceTopline: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flex: { flex: 1 },
  voiceTitle: { color: colors.white, fontSize: 17, fontWeight: "800" },
  voiceHint: { color: "#C9CED7", fontSize: 12, marginTop: 3 },
  recordDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#667085" },
  recordDotActive: { backgroundColor: "#F04438" },
  orRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  orText: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  textarea: { minHeight: 138, textAlignVertical: "top", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, color: colors.ink, fontSize: 15, lineHeight: 22 },
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
