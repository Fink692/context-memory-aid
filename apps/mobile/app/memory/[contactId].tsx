import { useEffect, useMemo, useRef, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Linking, Platform, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { createLocalMemoryDraft, type Memory, type MemoryDraft } from "@context/shared";
import {
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
import { dueAtForChoice, inferredQuickDueChoice, type QuickDueChoice } from "@/lib/action-schedule";
import { activeEventForContact } from "@/lib/contact-event-context";
import { displayDate } from "@/lib/date";
import { createModelMemoryDraft } from "@/lib/local-model";
import { mutationErrorMessage } from "@/lib/mutation-error";
import { explicitlyScaledTextStyle, shouldStackSharedRow } from "@/lib/accessibility-layout";
import {
  editableFollowUpsForMemory,
  isoWithSelectedLocalDate,
  parseMemoryTags,
  suggestedTimelineSummary,
  type EditableFollowUp,
} from "@/lib/memory-editor";
import { useOnDeviceDictation, type OnDeviceDictationController } from "@/lib/use-on-device-dictation";
import { useAppStore, type ActionDraft } from "@/store/app-store";

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
  const params = useLocalSearchParams<{ contactId?: string | string[]; memoryId?: string | string[] }>();
  const contactId = singleParam(params.contactId);
  const memoryId = singleParam(params.memoryId);
  const router = useRouter();
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const actions = useAppStore((state) => state.actions);
  const event = useAppStore((state) => activeEventForContact(state.events, state.currentEventId, contactId));
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const addMemory = useAppStore((state) => state.addMemory);
  const updateMemory = useAppStore((state) => state.updateMemory);
  const existingMemory = contact?.timeline.find((memory) => memory.id === memoryId);
  const linkedActions = useMemo(
    () => memoryId ? actions.filter((action) => action.memoryId === memoryId) : [],
    [actions, memoryId],
  );
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryLocked, setSummaryLocked] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [followUps, setFollowUps] = useState<EditableFollowUp[]>([]);
  const [newFollowUp, setNewFollowUp] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString());
  const [extractedFacts, setExtractedFacts] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [saveBusy, setSaveBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftEngine, setDraftEngine] = useState<"model" | "device" | "rules">();
  const [draftStale, setDraftStale] = useState(false);
  const draftRequest = useRef(0);
  const initializedKey = useRef<string | undefined>(undefined);
  const dictation = useOnDeviceDictation();
  const { fontScale, width } = useWindowDimensions();
  const stackDueChoices = shouldStackSharedRow({ fontScale, width });

  useEffect(() => {
    if (!contact || (memoryId && !existingMemory)) return;
    const key = `${contact.id}:${memoryId ?? "new"}`;
    if (initializedKey.current === key) return;
    initializedKey.current = key;
    draftRequest.current += 1;
    setDraftBusy(false);
    setDraftEngine(undefined);
    setDraftStale(false);
    setExtractedFacts([]);
    setError(undefined);
    setNewFollowUp("");
    if (existingMemory) {
      setNote(existingMemory.details ?? existingMemory.summary);
      setSummary(existingMemory.summary);
      setSummaryLocked(true);
      setTagsInput(existingMemory.tags.join(", "));
      setFollowUps(editableFollowUpsForMemory(existingMemory, linkedActions));
      setOccurredAt(existingMemory.occurredAt);
      return;
    }
    setNote("");
    setSummary("");
    setSummaryLocked(false);
    setTagsInput("");
    setFollowUps([]);
    setOccurredAt(new Date().toISOString());
  }, [contact?.id, existingMemory?.id, memoryId]);

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
            title: memoryId ? "Edit Memory" : "New Memory",
            headerLeft: () => <BarButton onPress={() => { void close(); }}>Close</BarButton>,
          }}
        />
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

  if (memoryId && !existingMemory) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Edit Memory",
            headerLeft: () => <BarButton onPress={() => { void close(); }}>Close</BarButton>,
          }}
        />
        <Screen>
          <EmptyState
            action={<Button onPress={() => router.replace({ pathname: "/contact/[id]", params: { id: contact.id } })}>Open Person</Button>}
            body="This memory may have been removed from the timeline."
            symbol={symbols.note}
            title="Memory unavailable"
          />
        </Screen>
      </>
    );
  }

  const dictationContributed = dictation.state.targetId === "memory-note" && Boolean(dictation.state.finalizedText.trim());
  const cleanNote = note.trim();
  const cleanSummary = summary.trim();
  const editing = Boolean(existingMemory);

  const saveCurrent = async () => {
    if (!cleanNote) {
      setError("Add what happened before saving.");
      return;
    }
    if (!cleanSummary) {
      setError("Add a short timeline summary before saving.");
      return;
    }
    const actionDrafts: ActionDraft[] = followUps.slice(0, 5).flatMap((followUp) => {
      const title = followUp.title.trim();
      return title ? [{
        title,
        ...(followUp.dueAt ? { dueAt: followUp.dueAt } : {}),
        ...(followUp.eventId ? { eventId: followUp.eventId } : {}),
      }] : [];
    });
    const tags = parseMemoryTags(tagsInput);
    setSaveBusy(true);
    setError(undefined);
    try {
      if (existingMemory) {
        await updateMemory(contact.id, existingMemory.id, {
          summary: cleanSummary,
          details: cleanNote,
          tags,
          nextSteps: actionDrafts.map((action) => action.title),
          occurredAt,
        }, actionDrafts);
      } else {
        const now = new Date().toISOString();
        const memory: Memory = {
          id: `memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          contactId: contact.id,
          summary: cleanSummary,
          details: cleanNote,
          tags,
          nextSteps: actionDrafts.map((action) => action.title),
          source: dictationContributed ? "voice" : "text",
          occurredAt,
          createdAt: now,
        };
        await addMemory(memory, actionDrafts);
      }
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: "/contact/[id]", params: { id: contact.id } });
    } catch (caught) {
      setError(mutationErrorMessage(
        caught,
        "Context could not save this memory. Your note and reviewed follow-ups are still here; try again.",
      ));
    } finally {
      setSaveBusy(false);
    }
  };

  const applyDraft = (nextDraft: MemoryDraft, engine: "model" | "device" | "rules") => {
    const nextFollowUps = uniqueStrings(nextDraft.suggestedFollowUps).slice(0, 5).map((title, index) => {
      const current = followUps.find((followUp) => followUp.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase());
      const actionEventId = current?.eventId ?? event?.id;
      return {
        id: current?.id ?? `suggested-${Date.now().toString(36)}-${index}`,
        title,
        ...(current?.dueAt ? { dueAt: current.dueAt } : {}),
        ...(actionEventId ? { eventId: actionEventId } : {}),
      };
    });
    setSummary(nextDraft.summary);
    setSummaryLocked(true);
    setTagsInput(uniqueStrings(nextDraft.suggestedTags).join(", "));
    setFollowUps(nextFollowUps);
    setExtractedFacts(uniqueStrings(nextDraft.extractedFacts));
    setDraftEngine(engine);
    setDraftStale(false);
  };

  const createDraft = async () => {
    if (dictation.busy) {
      setError("Stop or cancel dictation before summarizing.");
      return;
    }
    if (!localToolsEnabled) {
      setError("Smart Assist is off. You can still save the note as written.");
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
      applyDraft(result.draft, Platform.OS === "android" ? "device" : "model");
    } catch {
      if (request !== draftRequest.current || note.trim() !== cleanNote) return;
      const nextDraft = createLocalMemoryDraft(cleanNote);
      applyDraft(nextDraft, "rules");
      setError("Smart Assist was unavailable, so a basic summary was prepared instead.");
    } finally {
      if (request === draftRequest.current) setDraftBusy(false);
    }
  };

  const changeNote = (value: string) => {
    draftRequest.current += 1;
    setDraftBusy(false);
    setNote(value);
    setError(undefined);
    if (!summaryLocked) setSummary(suggestedTimelineSummary(value));
    if (draftEngine) setDraftStale(true);
  };

  const resetReview = () => {
    setSummary(suggestedTimelineSummary(note));
    setSummaryLocked(false);
    setTagsInput("");
    setFollowUps([]);
    setExtractedFacts([]);
    setDraftEngine(undefined);
    setDraftStale(false);
    setError(undefined);
  };

  const addFollowUp = () => {
    const title = newFollowUp.trim();
    if (!title || followUps.length >= 5) return;
    setFollowUps((current) => [...current, {
      id: `follow-up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      title,
      ...(event?.id ? { eventId: event.id } : {}),
    }]);
    setNewFollowUp("");
  };

  const updateFollowUp = (id: string, updates: Partial<EditableFollowUp>) => {
    setFollowUps((current) => current.map((followUp) => followUp.id === id ? { ...followUp, ...updates } : followUp));
  };

  const setFollowUpDue = (id: string, choice: QuickDueChoice) => {
    const dueAt = dueAtForChoice(choice);
    setFollowUps((current) => current.map((followUp) => {
      if (followUp.id !== id) return followUp;
      if (!dueAt) {
        const { dueAt: _dueAt, ...withoutDueAt } = followUp;
        return withoutDueAt;
      }
      return { ...followUp, dueAt };
    }));
  };

  const canSave = Boolean(cleanNote && cleanSummary) && !dictation.busy && !draftBusy && !saveBusy;
  const canSummarize = localToolsEnabled && cleanNote.length >= 40 && !dictation.busy;
  const reviewFooter = draftEngine === "rules"
    ? "Basic draft · Review every field before saving."
    : draftEngine
      ? "AI-assisted · Review every field before saving."
      : "Your timeline shows the summary. The full note stays with the memory.";

  return (
    <>
      <Stack.Screen
        options={{
          gestureEnabled: !saveBusy,
          title: editing ? "Edit Memory" : "New Memory",
          headerLeft: () => <BarButton disabled={saveBusy} onPress={() => { void close(); }}>Cancel</BarButton>,
          headerRight: () => <BarButton disabled={!canSave} loading={saveBusy} onPress={() => { void saveCurrent(); }}>Save</BarButton>,
        }}
      />
      <Screen contentContainerStyle={styles.screen} pointerEvents={saveBusy ? "none" : "auto"}>
        <View style={styles.intro}>
          <AppText accessibilityRole="header" emphasis="semibold" role="title2">What do you want to remember about {contact.displayName}?</AppText>
          <AppText role="callout" tone="secondary">What happened, what mattered, or what should you follow up on?</AppText>
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
            placeholder="Add the full story here."
            placeholderTextColor={colors.fieldPlaceholder}
            allowFontScaling={false}
            style={[
              styles.textarea,
              explicitlyScaledTextStyle(StyleSheet.flatten(styles.textarea), fontScale, "body"),
            ]}
            value={note}
          />
          <View style={styles.editorFooter}>
            <AppText role="caption1" tone="secondary">{note.length.toLocaleString()}/4,000</AppText>
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

        <ListSection title="When it happened">
          <ListRow
            {...(Platform.OS === "ios" ? { accessoryNode: (
              <DateTimePicker
                accessibilityLabel="Date this memory happened"
                display="compact"
                mode="date"
                onValueChange={(_pickerEvent, value) => setOccurredAt(isoWithSelectedLocalDate(occurredAt, value))}
                value={new Date(occurredAt)}
              />
            ) } : { detail: displayDate(occurredAt) })}
            last
            title="Occurred"
          />
        </ListSection>

        {canSummarize ? (
          <Button
            loading={draftBusy}
            onPress={() => { void createDraft(); }}
            symbol={symbols.sparkles}
            variant="secondary"
          >
            {draftEngine ? "Prepare Again" : "Prepare with Smart Assist"}
          </Button>
        ) : null}

        {draftStale ? (
          <AppText accessibilityLiveRegion="polite" role="footnote" tone="warning">The full note changed after Smart Assist. Prepare again or review the fields below yourself.</AppText>
        ) : null}

        <ListSection footer={reviewFooter} groupStyle={styles.reviewGroup} title="Review Memory">
          <FormField
            accessibilityLabel="Timeline summary"
            editable={!dictation.busy}
            label="Timeline summary"
            maxLength={500}
            multiline
            onChangeText={(value) => {
              setSummary(value);
              setSummaryLocked(true);
              setError(undefined);
            }}
            placeholder="A short reminder for the timeline"
            value={summary}
          />
          <FormField
            accessibilityHint="Separate tags with commas"
            autoCapitalize="words"
            editable={!dictation.busy}
            label="Tags"
            maxLength={400}
            onChangeText={setTagsInput}
            placeholder="Hiring, Winnipeg, AI"
            value={tagsInput}
          />
        </ListSection>

        {extractedFacts.length ? (
          <ListSection footer="These details helped prepare the draft. They are not saved as separate facts." title="Detected Details">
            {extractedFacts.map((fact, index) => (
              <ListRow key={`${fact.toLocaleLowerCase()}-${index}`} last={index === extractedFacts.length - 1} symbol={symbols.checkCircle} title={fact} />
            ))}
          </ListSection>
        ) : null}

        <ListSection
          footer="Each saved follow-up becomes an action on Today. You can change or remove every suggestion."
          groupStyle={styles.followUpGroup}
          title="Follow-ups"
        >
          {followUps.map((followUp, index) => {
            const selectedDue = inferredQuickDueChoice(followUp.dueAt);
            return (
              <View key={followUp.id} style={[styles.followUpEditor, index > 0 && styles.followUpSeparated]}>
                <FormField
                  accessibilityLabel={`Follow-up ${index + 1}`}
                  label={`Follow-up ${index + 1}`}
                  maxLength={160}
                  onChangeText={(title) => updateFollowUp(followUp.id, { title })}
                  trailing={(
                    <IconButton
                      accessibilityLabel={`Remove follow-up ${index + 1}`}
                      onPress={() => setFollowUps((current) => current.filter((item) => item.id !== followUp.id))}
                      symbol={symbols.trash}
                      tone="destructive"
                    />
                  )}
                  value={followUp.title}
                />
                <AppText emphasis="semibold" role="caption1" tone="secondary">DUE</AppText>
                {selectedDue === "existing" && followUp.dueAt ? (
                  <AppText role="footnote" tone="secondary">Currently {displayDate(followUp.dueAt)}. Choose a quick date to change it.</AppText>
                ) : null}
                <View
                  accessibilityLabel={`Due date for follow-up ${index + 1}`}
                  style={[styles.dueChoices, stackDueChoices && styles.dueChoicesStacked]}
                >
                  {(["none", "today", "tomorrow"] as const).map((choice) => (
                    <Button
                      accessibilityLabel={`${choice === "none" ? "No date" : choice === "today" ? "Today" : "Tomorrow"} due date`}
                      accessibilityState={{ selected: selectedDue === choice }}
                      key={choice}
                      onPress={() => setFollowUpDue(followUp.id, choice)}
                      style={[styles.dueChoice, stackDueChoices && styles.dueChoiceStacked]}
                      variant={selectedDue === choice ? "secondary" : "quiet"}
                    >
                      {choice === "none" ? "No date" : choice === "today" ? "Today" : "Tomorrow"}
                    </Button>
                  ))}
                </View>
              </View>
            );
          })}
          {followUps.length < 5 ? (
            <View style={[styles.addFollowUp, followUps.length > 0 && styles.followUpSeparated]}>
              <FormField
                label="Add a follow-up"
                maxLength={160}
                onChangeText={setNewFollowUp}
                onSubmitEditing={addFollowUp}
                placeholder="Send the introduction"
                returnKeyType="done"
                value={newFollowUp}
              />
              <Button disabled={!newFollowUp.trim()} onPress={addFollowUp} symbol={symbols.plus} variant="secondary">Add Follow-up</Button>
            </View>
          ) : null}
        </ListSection>

        {draftEngine || tagsInput || followUps.length ? (
          <View style={styles.resetRow}>
            <BarButton onPress={resetReview}>Reset Review Fields</BarButton>
          </View>
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
      ? "Preparing dictation…"
      : `Preparing dictation · ${Math.round(controller.state.assetProgress * 100)}%`; break;
    case "recording": status = `Listening · ${Math.floor(controller.state.elapsedMs / 1_000)}s`; break;
    case "finalizing": status = "Finishing transcription…"; break;
    case "error": status = controller.state.error; break;
    case "idle":
      if (controller.state.reason === "duration-limit") status = "The one-minute limit was reached. Review the ending before saving.";
      if (controller.state.reason === "character-limit") status = "The note limit was reached. Review the ending before saving.";
      break;
    case "unavailable": status = "Dictation is unavailable."; break;
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
  dictationStatusRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md },
  dictationStatus: { flex: 1 },
  reviewGroup: { padding: spacing.lg, gap: spacing.lg },
  followUpGroup: { overflow: "hidden" },
  followUpEditor: { padding: spacing.lg, gap: spacing.sm },
  followUpSeparated: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  dueChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  dueChoicesStacked: { flexDirection: "column", flexWrap: "nowrap" },
  dueChoice: { minWidth: 92, flexGrow: 1, paddingHorizontal: spacing.sm },
  dueChoiceStacked: { width: "100%", minWidth: 0, flexGrow: 0 },
  addFollowUp: { padding: spacing.lg, gap: spacing.md },
  resetRow: { alignItems: "flex-end" },
});
