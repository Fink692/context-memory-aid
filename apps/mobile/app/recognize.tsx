import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import type { Event } from "@context/shared";
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
  Screen,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { displayEventSchedule, relativeDate } from "@/lib/date";
import { eventAssistantRefresher, sortEventAssistantContacts } from "@/lib/event-assistant";
import { useAppStore } from "@/store/app-store";

export default function RecognizeScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [eventPickerVisible, setEventPickerVisible] = useState(false);
  const [error, setError] = useState<string>();
  const { fontScale } = useWindowDimensions();
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const event = useAppStore((state) => state.events.find((item) => item.id === state.currentEventId));
  const setCurrentEventId = useAppStore((state) => state.setCurrentEventId);
  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
    [events],
  );

  const attendees = useMemo(() => {
    if (!event) return [];
    return event.attendeeContactIds
      .map((id) => contacts.find((contact) => contact.id === id))
      .filter((contact) => contact !== undefined);
  }, [contacts, event]);
  const visibleAttendees = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const visible = !normalized
      ? attendees
      : attendees.filter((contact) => [
          contact.displayName,
          contact.company,
          contact.role,
          contact.lastDiscussed,
          contact.recentUpdate,
          ...(contact.conversationTopics ?? []),
        ]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(normalized)));
    return sortEventAssistantContacts(visible);
  }, [attendees, query]);

  const openContact = (contactId: string) => {
    router.push({
      pathname: "/contact/[id]",
      params: { id: contactId },
    });
  };

  const changeEvent = async (eventId: string) => {
    setError(undefined);
    try {
      await setCurrentEventId(eventId);
      setEventPickerVisible(false);
      setQuery("");
    } catch (caught) {
      setError("Context could not update the event on Today. Try again.");
      throw caught;
    }
  };

  if (!event) {
    return (
      <>
        <Stack.Screen options={{ title: "Event People" }} />
        <Screen>
          <ErrorBanner message={error} />
          <EmptyState
            action={sortedEvents.length
              ? <Button onPress={() => setEventPickerVisible(true)} symbol={symbols.events}>Choose Event</Button>
              : <Button onPress={() => router.replace("/events")} symbol={symbols.plus}>Create Event</Button>}
            body={sortedEvents.length
              ? "Choose one of your saved events to review its people."
              : "Create an event before reviewing its people."}
            symbol={symbols.events}
            title="No event on Today"
          />
        </Screen>
        <EventPickerSheet
          events={sortedEvents}
          onCancel={() => setEventPickerVisible(false)}
          onSelect={changeEvent}
          visible={eventPickerVisible}
        />
      </>
    );
  }

  const listHeader = (
    <View style={styles.listHeader}>
      <ErrorBanner message={error} />
      <View style={styles.eventSummary}>
        <View style={styles.flex}>
          <AppText emphasis="semibold" role="headline">{event.name}</AppText>
          <AppText role="footnote" tone="secondary">{displayEventSchedule(event)}</AppText>
          <AppText role="footnote" tone="secondary">{attendees.length} people in this event</AppText>
        </View>
        {sortedEvents.length > 1 ? (
          <BarButton accessibilityLabel="Change the event shown on Today" onPress={() => setEventPickerVisible(true)}>Change</BarButton>
        ) : (
          <AppSymbol name={symbols.events} size={22} tone="tint" weight="semibold" />
        )}
      </View>

      <AppText role="footnote" tone="secondary">
        Only people you included in this event appear here.
      </AppText>

      <View style={styles.browseHeader}>
        {Platform.OS !== "ios" && attendees.length ? (
          <TextField
            accessibilityLabel="Search this event"
            autoCapitalize="none"
            clearButtonMode="while-editing"
            onChangeText={setQuery}
            placeholder="Search people"
            value={query}
          />
        ) : null}
        <AppText accessibilityRole="header" emphasis="semibold" role="title3">
          People
        </AppText>
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Event People",
          ...(Platform.OS === "ios" && attendees.length
            ? {
                headerSearchBarOptions: {
                  autoCapitalize: "none" as const,
                  hideWhenScrolling: false,
                  onCancelButtonPress: () => setQuery(""),
                  onChangeText: (searchEvent) => setQuery(searchEvent.nativeEvent.text),
                  placeholder: "Search This Event",
                  placement: "stacked" as const,
                },
              }
            : {}),
        }}
      />
      <Screen contentContainerStyle={styles.screen} scroll={false}>
        <FlatList
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="automatic"
          data={visibleAttendees}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(contact) => contact.id}
          ListEmptyComponent={(
            <EmptyState
              action={attendees.length
                ? <Button onPress={() => setQuery("")} variant="secondary">Clear Search</Button>
                : <Button onPress={() => router.push({ pathname: "/contact/new", params: { eventId: event.id } })} symbol={symbols.plus}>Add Person</Button>}
              body={attendees.length ? "Try another name, company, or role." : "Add people to this event before using the assistant."}
              symbol={symbols.people}
              title={attendees.length ? "No matches" : "No people in this event"}
            />
          )}
          ListHeaderComponent={listHeader}
          renderItem={({ item: contact, index }) => {
            const metadata = [contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship";
            const lastSpoke = relativeDate(contact.lastSpokeAt) ?? "not recorded";
            const refresher = eventAssistantRefresher(contact);
            const last = index === visibleAttendees.length - 1;
            return (
              <View style={[styles.personRowShell, index === 0 && styles.personRowFirst, last && styles.personRowLast, !last && styles.personRowSeparated]}>
                <Pressable
                  accessibilityHint="Opens this relationship refresher"
                  accessibilityLabel={[
                    contact.displayName,
                    metadata,
                    `Last spoke ${lastSpoke}`,
                    refresher.recentUpdate ? `Recent update: ${refresher.recentUpdate}` : undefined,
                    refresher.lastDiscussed ? `Last discussed: ${refresher.lastDiscussed}` : undefined,
                    refresher.topic ? `Ask about: ${refresher.topic}` : undefined,
                  ].filter(Boolean).join(". ")}
                  accessibilityRole="button"
                  onPress={() => openContact(contact.id)}
                  style={({ pressed }) => [styles.personRow, pressed && styles.rowPressed]}
                >
                  <Avatar name={contact.displayName} photoUri={contact.photoUri} size={44} />
                  <View style={styles.personCopy}>
                    <AppText emphasis="medium" role="body">{contact.displayName}</AppText>
                    <AppText role="subheadline" tone="secondary">{metadata}</AppText>
                    {refresher.recentUpdate ? (
                      <AppText {...(fontScale < 1.3 ? { numberOfLines: 2 } : {})} role="footnote" tone="secondary">
                        <AppText emphasis="semibold" role="footnote" tone="secondary">Update: </AppText>{refresher.recentUpdate}
                      </AppText>
                    ) : null}
                    {refresher.lastDiscussed ? (
                      <AppText {...(fontScale < 1.3 ? { numberOfLines: 2 } : {})} role="footnote" tone="secondary">
                        <AppText emphasis="semibold" role="footnote" tone="secondary">Last discussed: </AppText>{refresher.lastDiscussed}
                      </AppText>
                    ) : null}
                    {refresher.topic ? (
                      <AppText {...(fontScale < 1.3 ? { numberOfLines: 2 } : {})} role="footnote" tone="tint">
                        <AppText emphasis="semibold" role="footnote" tone="tint">Ask about: </AppText>{refresher.topic}
                      </AppText>
                    ) : null}
                    <AppText role="caption1" tone="tertiary">Last spoke {lastSpoke}</AppText>
                  </View>
                </Pressable>
                <IconButton
                  accessibilityLabel={`Add memory for ${contact.displayName}`}
                  onPress={() => router.push({ pathname: "/memory/[contactId]", params: { contactId: contact.id } })}
                  style={styles.memoryAction}
                  symbol={symbols.note}
                />
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      </Screen>
      <EventPickerSheet
        activeEventId={event.id}
        events={sortedEvents}
        onCancel={() => setEventPickerVisible(false)}
        onSelect={changeEvent}
        visible={eventPickerVisible}
      />
    </>
  );
}

function EventPickerSheet({
  activeEventId,
  events,
  onCancel,
  onSelect,
  visible,
}: {
  activeEventId?: string;
  events: Event[];
  onCancel: () => void;
  onSelect: (eventId: string) => Promise<void> | void;
  visible: boolean;
}) {
  const [query, setQuery] = useState("");
  const [busyEventId, setBusyEventId] = useState<string>();
  const [error, setError] = useState<string>();
  const busy = Boolean(busyEventId);
  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return events;
    return events.filter((event) => [event.name, event.locationLabel]
      .filter(Boolean)
      .some((value) => value?.toLocaleLowerCase().includes(normalized)));
  }, [events, query]);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setBusyEventId(undefined);
    setError(undefined);
  }, [visible]);

  const dismiss = () => {
    if (!busy) onCancel();
  };

  const chooseEvent = async (eventId: string) => {
    if (busy) return;
    setBusyEventId(eventId);
    setError(undefined);
    try {
      await onSelect(eventId);
    } catch {
      setError("Context could not update the event on Today. Nothing was changed; try again.");
    } finally {
      setBusyEventId(undefined);
    }
  };

  return (
    <Modal
      allowSwipeDismissal={!busy}
      animationType="slide"
      onRequestClose={dismiss}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      visible={visible}
    >
      <Screen
        accessibilityViewIsModal
        contentContainerStyle={styles.pickerSheet}
        onAccessibilityEscape={dismiss}
        safeEdges={["top", "right", "bottom", "left"]}
        scroll={false}
      >
        <View style={styles.pickerBar}>
          <BarButton disabled={busy} onPress={dismiss}>Cancel</BarButton>
          <AppText accessibilityRole="header" emphasis="semibold" role="headline" style={styles.pickerTitle}>Choose Event</AppText>
          <View style={styles.pickerBarSpacer} />
        </View>
        <ErrorBanner message={error} />
        <TextField
          accessibilityLabel="Search events"
          autoCapitalize="none"
          clearButtonMode="while-editing"
          editable={!busy}
          onChangeText={setQuery}
          placeholder="Search events"
          value={query}
        />
        <FlatList
          contentContainerStyle={styles.pickerListContent}
          data={visibleEvents}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(event) => event.id}
          ListEmptyComponent={(
            <View style={styles.pickerEmpty}>
              <AppText emphasis="semibold" role="headline">No matching events</AppText>
              <AppText role="footnote" tone="secondary">Try another event name or location.</AppText>
            </View>
          )}
          renderItem={({ item: event, index }) => (
            <ListRow
              accessory={event.id === activeEventId ? "checkmark" : "disclosure"}
              disabled={busy}
              selected={event.id === activeEventId}
              last={index === visibleEvents.length - 1}
              onPress={() => { void chooseEvent(event.id); }}
              subtitle={`${displayEventSchedule(event)} · ${event.attendeeContactIds.length} ${event.attendeeContactIds.length === 1 ? "person" : "people"}`}
              symbol={symbols.events}
              title={event.name}
            />
          )}
          showsVerticalScrollIndicator={false}
          style={styles.pickerList}
        />
        <AppText role="footnote" style={styles.pickerFooter} tone="secondary">
          The event shown on Today sets the people available here.
        </AppText>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  list: { flex: 1, width: "100%" },
  listContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  listHeader: { gap: spacing.lg, marginBottom: spacing.lg },
  flex: { flex: 1, minWidth: 0 },
  eventSummary: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xs },
  browseHeader: { gap: spacing.lg },
  personRowShell: { flexDirection: "row", alignItems: "center", overflow: "hidden", backgroundColor: colors.surface },
  personRowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous" },
  personRowLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous" },
  personRowSeparated: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  personRow: { minHeight: 68, flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingLeft: spacing.lg, paddingVertical: spacing.md },
  personCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  memoryAction: { marginHorizontal: spacing.xs, backgroundColor: "transparent" },
  rowPressed: { backgroundColor: colors.fill },
  pickerSheet: { flex: 1, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.md },
  pickerBar: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerTitle: { flex: 1, minWidth: 0, textAlign: "center" },
  pickerBarSpacer: { width: 44, height: 44 },
  pickerList: { flex: 1, borderRadius: radius.lg, backgroundColor: colors.surface },
  pickerListContent: { flexGrow: 1 },
  pickerEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xs, padding: spacing.xl },
  pickerFooter: { marginHorizontal: spacing.lg },
});
