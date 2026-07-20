import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Modal, Platform, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { ActionItem } from "@context/shared";
import {
  AppText,
  Avatar,
  BarButton,
  Button,
  EmptyState,
  ErrorBanner,
  FormField,
  ListRow,
  ListSection,
  Screen,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { displayDate, displayEventSchedule } from "@/lib/date";
import { mutationErrorMessage } from "@/lib/mutation-error";
import {
  dueAtForChoice,
  inferredQuickDueChoice,
  type QuickDueChoice,
} from "@/lib/action-schedule";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const dueChoices: Array<{ id: QuickDueChoice; title: string }> = [
  { id: "none", title: "No Due Date" },
  { id: "today", title: "Today" },
  { id: "tomorrow", title: "Tomorrow" },
  { id: "next-week", title: "In One Week" },
];

export default function ActionEditorScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    contactId?: string | string[];
    eventId?: string | string[];
  }>();
  const routeId = singleParam(params.id);
  const isNew = routeId === "new";
  const router = useRouter();
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const actions = useAppStore((state) => state.actions);
  const addAction = useAppStore((state) => state.addAction);
  const updateAction = useAppStore((state) => state.updateAction);
  const setActionCompleted = useAppStore((state) => state.setActionCompleted);
  const deleteAction = useAppStore((state) => state.deleteAction);
  const current = isNew ? undefined : actions.find((action) => action.id === routeId);
  const initialContactId = current?.contactId ?? singleParam(params.contactId) ?? contacts[0]?.id ?? "";
  const initialDueChoice = inferredQuickDueChoice(current?.dueAt);
  const [contactId, setContactId] = useState(initialContactId);
  const [title, setTitle] = useState(current?.title ?? "");
  const [dueChoice, setDueChoice] = useState<QuickDueChoice | "existing">(initialDueChoice);
  const [eventId, setEventId] = useState(current?.eventId ?? singleParam(params.eventId) ?? "");
  const [error, setError] = useState<string>();
  const [mutationBusy, setMutationBusy] = useState(false);
  const [contactPickerVisible, setContactPickerVisible] = useState(false);
  const [eventPickerVisible, setEventPickerVisible] = useState(false);
  const mutationInFlight = useRef(false);

  const selectedContact = contacts.find((contact) => contact.id === contactId);
  const selectedEvent = events.find((event) => event.id === eventId);
  const sortedContacts = useMemo(() => [...contacts].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)), [contacts]);
  const sortedEvents = useMemo(() => [...events].sort((left, right) =>
    left.startsAt.localeCompare(right.startsAt)), [events]);
  const contactPickerItems = useMemo<SelectionPickerItem[]>(() => sortedContacts.map((contact) => ({
    id: contact.id,
    kind: "person",
    title: contact.displayName,
    subtitle: [contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship",
    searchText: [contact.displayName, contact.role, contact.company, contact.email, contact.phone].filter(Boolean).join(" "),
    ...(contact.photoUri ? { photoUri: contact.photoUri } : {}),
  })), [sortedContacts]);
  const eventPickerItems = useMemo<SelectionPickerItem[]>(() => [
    { id: "", kind: "none", title: "No Event", searchText: "No Event" },
    ...sortedEvents.map((event) => ({
      id: event.id,
      kind: "event" as const,
      title: event.name,
      subtitle: displayEventSchedule(event),
      searchText: [event.name, event.locationLabel, displayEventSchedule(event)].filter(Boolean).join(" "),
    })),
  ], [sortedEvents]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  if (!isNew && !current) {
    return (
      <>
        <Stack.Screen options={{ title: "Follow-up", headerLeft: () => <BarButton onPress={close}>Close</BarButton> }} />
        <Screen>
          <EmptyState
            action={<Button onPress={() => router.replace("/")}>Open Today</Button>}
            body="This follow-up may have been deleted."
            symbol={symbols.checkCircle}
            title="Follow-up unavailable"
          />
        </Screen>
      </>
    );
  }

  if (!contacts.length) {
    return (
      <>
        <Stack.Screen options={{ title: "New Follow-up", headerLeft: () => <BarButton onPress={close}>Close</BarButton> }} />
        <Screen>
          <EmptyState
            action={<Button onPress={() => router.replace({ pathname: "/contact/new", params: { global: "1" } })} symbol={symbols.plus}>Add a Person</Button>}
            body="A follow-up needs someone to follow up with."
            symbol={symbols.people}
            title="Add a person first"
          />
        </Screen>
      </>
    );
  }

  const save = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Add what you want to follow up on.");
      return;
    }
    if (!selectedContact) {
      setError("Choose who this follow-up is for.");
      return;
    }
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    const dueAt = dueChoice === "existing" ? current?.dueAt : dueAtForChoice(dueChoice);
    setMutationBusy(true);
    setError(undefined);
    try {
      if (current) {
        await updateAction(current.id, {
          title: cleanTitle,
          dueAt: dueAt ?? null,
          eventId: eventId || null,
        });
      } else {
        const now = new Date().toISOString();
        const action: ActionItem = {
          id: `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          contactId: selectedContact.id,
          title: cleanTitle,
          ...(dueAt ? { dueAt } : {}),
          ...(eventId ? { eventId } : {}),
          status: "open",
          createdAt: now,
          updatedAt: now,
        };
        await addAction(action);
      }
      close();
    } catch (caught) {
      setError(mutationErrorMessage(
        caught,
        "Context could not save this follow-up. Your edits are still here; try again.",
      ));
    } finally {
      mutationInFlight.current = false;
      setMutationBusy(false);
    }
  };

  const deleteCurrent = async () => {
    if (!current || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setMutationBusy(true);
    setError(undefined);
    try {
      await deleteAction(current.id);
      close();
    } catch {
      setError("Context could not delete this follow-up. Nothing was changed; try again.");
    } finally {
      mutationInFlight.current = false;
      setMutationBusy(false);
    }
  };

  const toggleCompletion = async () => {
    if (!current || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setMutationBusy(true);
    setError(undefined);
    try {
      await setActionCompleted(current.id, current.status !== "completed");
      close();
    } catch (caught) {
      setError(mutationErrorMessage(
        caught,
        "Context could not update this follow-up. Nothing was changed; try again.",
      ));
    } finally {
      mutationInFlight.current = false;
      setMutationBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!current) return;
    Alert.alert(
      "Delete this follow-up?",
      "This removes the follow-up without deleting the person or memory it came from.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Follow-up", style: "destructive", onPress: () => { void deleteCurrent(); } },
      ],
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          gestureEnabled: !mutationBusy,
          title: current ? "Edit Follow-up" : "New Follow-up",
          headerLeft: () => <BarButton disabled={mutationBusy} onPress={close}>Cancel</BarButton>,
          headerRight: () => <BarButton disabled={!title.trim() || !selectedContact} loading={mutationBusy} onPress={() => { void save(); }}>Save</BarButton>,
        }}
      />
      <Screen contentContainerStyle={styles.screen} pointerEvents={mutationBusy ? "none" : "auto"}>
        <View style={styles.intro}>
          <AppText accessibilityRole="header" emphasis="semibold" role="title2">
            {current ? "Keep the next step current" : "What should happen next?"}
          </AppText>
          <AppText role="callout" tone="secondary">Keep one clear promise, reminder, or reason to reconnect.</AppText>
        </View>

        <ErrorBanner message={error} />

        <FormField
          accessibilityLabel="Follow-up"
          autoFocus={!current}
          label="FOLLOW-UP"
          maxLength={160}
          onChangeText={(value) => { setTitle(value); setError(undefined); }}
          placeholder="Send the article we discussed"
          returnKeyType="done"
          value={title}
        />

        <ListSection
          {...(current ? { footer: "The person cannot be changed after a follow-up is created." } : {})}
          title="Person"
        >
          {current && selectedContact ? (
            <ListRow
              last
              leading={<Avatar name={selectedContact.displayName} photoUri={selectedContact.photoUri} size={38} />}
              {...([selectedContact.role, selectedContact.company].filter(Boolean).join(" · ")
                ? { subtitle: [selectedContact.role, selectedContact.company].filter(Boolean).join(" · ") }
                : {})}
              title={selectedContact.displayName}
            />
          ) : selectedContact ? (
            <ListRow
              accessory="disclosure"
              last
              leading={<Avatar name={selectedContact.displayName} photoUri={selectedContact.photoUri} size={38} />}
              onPress={() => setContactPickerVisible(true)}
              {...([selectedContact.role, selectedContact.company].filter(Boolean).join(" · ")
                ? { subtitle: [selectedContact.role, selectedContact.company].filter(Boolean).join(" · ") }
                : {})}
              title={selectedContact.displayName}
            />
          ) : null}
        </ListSection>

        <ListSection title="Due">
          {dueChoice === "existing" && current?.dueAt ? (
            <ListRow
              accessory="checkmark"
              selected
              last={false}
              onPress={() => setDueChoice("existing")}
              subtitle={displayDate(current.dueAt)}
              title="Keep Current Date"
            />
          ) : null}
          {dueChoices.map((choice, index) => (
            <ListRow
              accessory={dueChoice === choice.id ? "checkmark" : "none"}
              selected={dueChoice === choice.id}
              key={choice.id}
              last={index === dueChoices.length - 1}
              onPress={() => setDueChoice(choice.id)}
              title={choice.title}
            />
          ))}
        </ListSection>

        {sortedEvents.length ? (
          <ListSection footer="Linking an event keeps this follow-up with event preparation." title="Event (Optional)">
            <ListRow
              accessory="disclosure"
              last
              onPress={() => setEventPickerVisible(true)}
              {...(selectedEvent ? { subtitle: displayEventSchedule(selectedEvent) } : {})}
              title={selectedEvent?.name ?? "No Event"}
            />
          </ListSection>
        ) : null}

        {current ? (
          <View style={styles.actions}>
            <Button
              disabled={mutationBusy}
              loading={mutationBusy}
              onPress={() => { void toggleCompletion(); }}
              symbol={symbols.checkCircle}
              variant="secondary"
            >
              {current.status === "completed" ? "Mark Open" : "Mark Complete"}
            </Button>
            <Button disabled={mutationBusy} onPress={confirmDelete} symbol={symbols.trash} variant="danger">Delete Follow-up</Button>
          </View>
        ) : null}
      </Screen>
      <SelectionPickerSheet
        items={contactPickerItems}
        onCancel={() => setContactPickerVisible(false)}
        onSelect={(id) => {
          setContactId(id);
          setError(undefined);
          setContactPickerVisible(false);
        }}
        selectedId={contactId}
        title="Choose Person"
        visible={contactPickerVisible}
      />
      <SelectionPickerSheet
        footer="Linking an event keeps this follow-up with event preparation."
        items={eventPickerItems}
        onCancel={() => setEventPickerVisible(false)}
        onSelect={(id) => {
          setEventId(id);
          setEventPickerVisible(false);
        }}
        selectedId={eventId}
        title="Choose Event"
        visible={eventPickerVisible}
      />
    </>
  );
}

interface SelectionPickerItem {
  id: string;
  kind: "event" | "none" | "person";
  title: string;
  searchText: string;
  subtitle?: string;
  photoUri?: string;
}

function SelectionPickerSheet({
  footer,
  items,
  onCancel,
  onSelect,
  selectedId,
  title,
  visible,
}: {
  footer?: string;
  items: SelectionPickerItem[];
  onCancel: () => void;
  onSelect: (id: string) => void;
  selectedId: string;
  title: string;
  visible: boolean;
}) {
  const [query, setQuery] = useState("");
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? items.filter((item) => item.searchText.toLocaleLowerCase().includes(normalized))
      : items;
  }, [items, query]);

  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  return (
    <Modal
      allowSwipeDismissal
      animationType="slide"
      onRequestClose={onCancel}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      visible={visible}
    >
      <Screen
        accessibilityViewIsModal
        contentContainerStyle={styles.pickerSheet}
        onAccessibilityEscape={onCancel}
        safeEdges={["top", "right", "bottom", "left"]}
        scroll={false}
      >
        <View style={styles.pickerBar}>
          <BarButton onPress={onCancel}>Cancel</BarButton>
          <AppText accessibilityRole="header" emphasis="semibold" role="headline" style={styles.pickerTitle}>{title}</AppText>
          <View style={styles.pickerBarSpacer} />
        </View>
        <TextField
          accessibilityLabel={`Search ${title.toLocaleLowerCase()}`}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          onChangeText={setQuery}
          placeholder={`Search ${title.replace("Choose ", "").toLocaleLowerCase()}`}
          value={query}
        />
        <FlatList
          contentContainerStyle={styles.pickerListContent}
          data={visibleItems}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id || "none"}
          ListEmptyComponent={(
            <View style={styles.pickerEmpty}>
              <AppText emphasis="semibold" role="headline">No matches</AppText>
              <AppText role="footnote" tone="secondary">Try another name or detail.</AppText>
            </View>
          )}
          renderItem={({ item, index }) => (
            <ListRow
              accessory={item.id === selectedId ? "checkmark" : "none"}
              selected={item.id === selectedId}
              last={index === visibleItems.length - 1}
              {...(item.kind === "person" ? {
                leading: <Avatar name={item.title} {...(item.photoUri ? { photoUri: item.photoUri } : {})} size={38} />,
              } : { symbol: symbols.events })}
              onPress={() => onSelect(item.id)}
              {...(item.subtitle ? { subtitle: item.subtitle } : {})}
              title={item.title}
            />
          )}
          showsVerticalScrollIndicator={false}
          style={styles.pickerList}
        />
        {footer ? <AppText role="footnote" style={styles.pickerFooter} tone="secondary">{footer}</AppText> : null}
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxxl },
  intro: { gap: spacing.xs },
  actions: { gap: spacing.sm },
  pickerSheet: { flex: 1, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.md },
  pickerBar: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerTitle: { flex: 1, minWidth: 0, textAlign: "center" },
  pickerBarSpacer: { width: 44, height: 44 },
  pickerList: { flex: 1, borderRadius: radius.lg, backgroundColor: colors.surface },
  pickerListContent: { flexGrow: 1 },
  pickerEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xs, padding: spacing.xl },
  pickerFooter: { marginHorizontal: spacing.lg },
});
