import { useEffect, useRef, useState } from "react";
import { Linking, Platform, StyleSheet, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { createLocalMemoryDraft, type Memory, type MemoryDraft } from "@context/shared";
import {
  AppSymbol,
  AppText,
  BarButton,
  Button,
  EmptyState,
  ErrorBanner,
  FormField,
  IconButton,
  ListRow,
  ListSection,
  Screen,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing, typography } from "@/constants/theme";
import { activeEventForContact } from "@/lib/contact-event-context";
import { createModelMemoryDraft } from "@/lib/local-model";
import { useOnDeviceDictation, type OnDeviceDictationController } from "@/lib/use-on-device-dictation";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const clean = value.trim();
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) return [];
    seen.add(key);
    return [clean];
  });
}

export default function AddMemoryScreen() {
  const params = useLocalSearchParams<{ contactId?: string | string[] }>();
  const contactId = singleParam(params.contactId);
  const router = useRouter();
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const event = useAppStore((state) => activeEventForContact(state.events, state.currentEventId, contactId));
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const addMemory = useAppStore((state) => state.addMemory);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<MemoryDraft>();
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string>();
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftEngine, setDraftEngine] = useState<"model" | "device" | "rules">();
  const draftRequest = useRef(0);
  const dictation = useOnDeviceDictation();

  useEffect(() => {
    draftRequest.current += 1;
    setDraftBusy(false);
    setDraft(undefined);
    setSummary("");
    setDraftEngine(undefined);
    setError(undefined);
  }, [contact, event, localToolsEnabled]);

  useEffect(() => () => { draftRequest.current += 1; }, []);

  const close = async () => {
    if (dictation.busy) await dictation.cancel();
    if (router.canGoBack()) router.back();
    else router.replace("/people");
  };

  if (!contact) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "New Memory",
            headerLeft: () => <BarButton onPress={() => { void close(); }}>Close</BarButton>,
          }}
        />
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

  const dictationContributed = dictation.state.targetId === "memory-note" && Boolean(dictation.state.finalizedText.trim());
  const extractedFacts = draft ? uniqueStrings(draft.extractedFacts) : [];
  const suggestedFollowUps = draft ? uniqueStrings(draft.suggestedFollowUps) : [];
  const cleanNote = note.trim();

  const saveMemory = (
    memorySummary: string,
    tags: string[] = [],
    nextSteps: string[] = [],
    source: Memory["source"] = "text",
  ) => {
    const now = new Date().toISOString();
    const memory: Memory = {
      id: `memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      contactId: contact.id,
      summary: memorySummary,
      tags,
      nextSteps,
      source,
      occurredAt: now,
      createdAt: now,
    };
    addMemory(memory);
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/contact/[id]", params: { id: contact.id } });
  };

  const createDraft = async () => {
    if (dictation.busy) {
      setError("Stop or cancel dictation before summarizing.");
      return;
    }
    if (!localToolsEnabled) {
      setError("On-device assistance is off. You can still save a note as written.");
      return;
    }
    if (!cleanNote) {
      setError("Add a note before summarizing.");
      return;
    }
    const request = ++draftRequest.current;
    setDraftBusy(true);
    setError(undefined);
    try {
      const result = await createModelMemoryDraft(cleanNote, contact, event);
      if (request !== draftRequest.current || note.trim() !== cleanNote) return;
      setDraft(result.draft);
      setSummary(result.draft.summary);
      setDraftEngine(Platform.OS === "android" ? "device" : "model");
    } catch {
      if (request !== draftRequest.current || note.trim() !== cleanNote) return;
      const nextDraft = createLocalMemoryDraft(cleanNote);
      setDraft(nextDraft);
      setSummary(nextDraft.summary);
      setDraftEngine("rules");
      setError("The local model was unavailable, so a private on-device fallback prepared this summary.");
    } finally {
      if (request === draftRequest.current) setDraftBusy(false);
    }
  };

  const saveAsWritten = () => {
    if (!cleanNote) {
      setError("Add a note before saving.");
      return;
    }
    if (cleanNote.length > 500) {
      setError("Shorten this note to 500 characters or summarize it before saving.");
      return;
    }
    saveMemory(cleanNote, ["note"], [], dictationContributed ? "voice" : "text");
  };

  const confirmDraft = () => {
    if (!draft || !summary.trim()) {
      setError("The timeline summary cannot be empty.");
      return;
    }
    saveMemory(summary.trim(), uniqueStrings(draft.suggestedTags), suggestedFollowUps, dictationContributed ? "voice" : "text");
  };

  const saveCurrent = () => {
    if (draft) confirmDraft();
    else saveAsWritten();
  };

  const changeNote = (value: string) => {
    draftRequest.current += 1;
    setDraftBusy(false);
    setNote(value);
    setError(undefined);
    if (draft) {
      setDraft(undefined);
      setSummary("");
      setDraftEngine(undefined);
    }
  };

  const discardDraft = () => {
    setDraft(undefined);
    setSummary("");
    setDraftEngine(undefined);
    setError(undefined);
  };

  const canSave = draft
    ? Boolean(summary.trim()) && !dictation.busy && !draftBusy
    : Boolean(cleanNote) && cleanNote.length <= 500 && !dictation.busy && !draftBusy;
  const canSummarize = !draft && localToolsEnabled && cleanNote.length >= 40 && !dictation.busy;

  return (
    <>
      <Stack.Screen
        options={{
          title: "New Memory",
          headerLeft: () => <BarButton onPress={() => { void close(); }}>Cancel</BarButton>,
          headerRight: () => <BarButton disabled={!canSave} onPress={saveCurrent}>Save</BarButton>,
        }}
      />
      <Screen contentContainerStyle={styles.screen}>
        <View style={styles.intro}>
          <AppText accessibilityRole="header" emphasis="semibold" role="title2">Memory for {contact.displayName}</AppText>
          <AppText role="callout" tone="secondary">Capture the detail you want to remember next time.</AppText>
        </View>

        <ErrorBanner message={error} />

        <View style={styles.editor}>
          <TextInput
            accessibilityLabel={`Memory note about ${contact.displayName}`}
            autoFocus
            editable={!dictation.busy}
            maxLength={4_000}
            multiline
            onChangeText={changeNote}
            placeholder="They accepted a new role in New York and are looking for AI engineers."
            placeholderTextColor={colors.inkTertiary}
            style={styles.textarea}
            value={note}
          />
          <View style={styles.editorFooter}>
            <View style={styles.trustLine}>
              <AppSymbol name={symbols.shield} size={14} tone="secondary" />
              <AppText role="footnote" tone="secondary">Processed on this device</AppText>
            </View>
            {dictation.available ? (
              <IconButton
                accessibilityLabel={dictation.isTargetActive("memory-note") ? "Stop dictating this memory" : "Dictate this memory"}
                disabled={dictation.busy && !dictation.isTargetActive("memory-note")}
                onPress={() => { void toggleMemoryDictation(dictation, note, changeNote, contact.displayName, contact.company, contact.role, event?.name); }}
                symbol={symbols.microphone}
                tone={dictation.isTargetActive("memory-note") ? "destructive" : "tint"}
              />
            ) : null}
          </View>
          <MemoryDictationStatus controller={dictation} />
        </View>

        {cleanNote.length > 500 && !draft ? (
          <AppText role="footnote" tone="warning">Summarize or shorten this note to 500 characters before saving.</AppText>
        ) : null}
        {canSummarize ? (
          <Button
            loading={draftBusy}
            onPress={() => { void createDraft(); }}
            symbol={symbols.sparkles}
            variant="secondary"
          >
            Summarize
          </Button>
        ) : null}

        {draft ? (
          <>
            <ListSection
              footer={`${draftEngine === "rules" ? "Private fallback" : "Local model"} · Edit before saving`}
              groupStyle={styles.reviewGroup}
              title="Review Summary"
            >
              <FormField
                accessibilityLabel="Timeline summary"
                editable={!dictation.busy}
                label="Summary"
                maxLength={500}
                multiline
                onChangeText={setSummary}
                value={summary}
              />
            </ListSection>

            {extractedFacts.length ? (
              <ListSection title="Detected Details">
                {extractedFacts.map((fact, index) => (
                  <ListRow key={fact.toLocaleLowerCase()} last={index === extractedFacts.length - 1} symbol={symbols.checkCircle} title={fact} />
                ))}
              </ListSection>
            ) : null}

            {suggestedFollowUps.length ? (
              <ListSection title="Suggested Follow-up">
                {suggestedFollowUps.map((followUp, index) => (
                  <ListRow key={followUp.toLocaleLowerCase()} last={index === suggestedFollowUps.length - 1} symbol={symbols.sparkles} title={followUp} />
                ))}
              </ListSection>
            ) : null}

            <View style={styles.discardRow}>
              <BarButton onPress={discardDraft}>Discard Summary</BarButton>
            </View>
          </>
        ) : null}
      </Screen>
    </>
  );
}

async function toggleMemoryDictation(
  controller: OnDeviceDictationController,
  note: string,
  onChange: (value: string) => void,
  displayName: string,
  company?: string,
  role?: string,
  eventName?: string,
) {
  if (controller.isTargetActive("memory-note")) {
    if (controller.state.phase === "recording") await controller.stop();
    else await controller.cancel();
    return;
  }
  await controller.start({
    targetId: "memory-note",
    label: `a note about ${displayName}`,
    value: note,
    onChange,
    maxDurationSeconds: 60,
    maxLength: 4_000,
    contextualStrings: [displayName, company ?? "", role ?? "", eventName ?? ""].filter(Boolean),
  });
}

function MemoryDictationStatus({ controller }: { controller: OnDeviceDictationController }) {
  if (controller.state.targetId !== "memory-note") return null;
  const active = controller.isTargetActive("memory-note");
  const isError = controller.state.phase === "error";
  let status: string | undefined;
  switch (controller.state.phase) {
    case "preparing": status = "Preparing dictation…"; break;
    case "downloading-assets": status = controller.state.assetProgress === undefined
      ? "Preparing on-device speech…"
      : `Preparing on-device speech · ${Math.round(controller.state.assetProgress * 100)}%`; break;
    case "recording": status = `Listening · ${Math.floor(controller.state.elapsedMs / 1_000)}s`; break;
    case "finalizing": status = "Finishing transcription…"; break;
    case "error": status = controller.state.error; break;
    case "idle":
      if (controller.state.reason === "duration-limit") status = "The one-minute limit was reached. Review the ending before saving.";
      if (controller.state.reason === "character-limit") status = "The note limit was reached. Review the ending before saving.";
      break;
    case "unavailable": status = "On-device dictation is unavailable."; break;
  }
  if (!status) return null;
  const openSettings = Boolean(isError && /settings/i.test(controller.state.error ?? ""));
  return (
    <View style={styles.dictationStatusRow}>
      <AppText accessibilityLiveRegion="polite" role="footnote" style={styles.dictationStatus} tone={isError ? "destructive" : "secondary"}>{status}</AppText>
      {active ? <BarButton onPress={() => { void controller.cancel(); }}>Cancel</BarButton> : null}
      {openSettings ? <BarButton onPress={() => { void Linking.openSettings(); }}>Open Settings</BarButton> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxxl },
  intro: { gap: spacing.xs },
  editor: { overflow: "hidden", borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.surface },
  textarea: { minHeight: 220, padding: spacing.lg, color: colors.ink, textAlignVertical: "top", ...typography.body },
  editorFooter: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md },
  trustLine: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dictationStatusRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md },
  dictationStatus: { flex: 1 },
  reviewGroup: { padding: spacing.lg },
  discardRow: { alignItems: "flex-end" },
});
