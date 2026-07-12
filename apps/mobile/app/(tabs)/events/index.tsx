import { useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, SectionList, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useRouter } from "expo-router";
import type { Event } from "@context/shared";
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
  Pill,
  Screen,
  SuccessBanner,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { displayDate } from "@/lib/date";
import { useAppStore } from "@/store/app-store";

type EventSection = {
  title: string;
  data: Event[];
};

function defaultDate(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function eventId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `event-${slug || "gathering"}-${Date.now().toString(36)}`;
}

export default function EventsScreen() {
  const router = useRouter();
  const events = useAppStore((state) => state.events);
  const currentEventId = useAppStore((state) => state.currentEventId);
  const addEvent = useAppStore((state) => state.addEvent);
  const updateEvent = useAppStore((state) => state.updateEvent);
  const setCurrentEventId = useAppStore((state) => state.setCurrentEventId);
  const deleteEvent = useAppStore((state) => state.deleteEvent);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string>();
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState(defaultDate);
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
    [events],
  );
  const editingEvent = events.find((event) => event.id === editingEventId);
  const sections = useMemo<EventSection[]>(() => {
    const active = sortedEvents.find((event) => event.id === currentEventId);
    const others = sortedEvents.filter((event) => event.id !== currentEventId);
    return [
      ...(active ? [{ title: "Active event", data: [active] }] : []),
      ...(others.length ? [{ title: active ? "Other events" : "Saved events", data: others }] : []),
    ];
  }, [currentEventId, sortedEvents]);

  const resetForm = () => {
    setName("");
    setStartsAt(defaultDate());
    setLocation("");
    setEditingEventId(undefined);
    setError(undefined);
  };

  const openCreate = () => {
    resetForm();
    setSuccess(undefined);
    setEditorVisible(true);
  };

  const openEdit = (event: Event) => {
    const date = new Date(event.startsAt);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    setEditingEventId(event.id);
    setName(event.name);
    setStartsAt(local.toISOString().slice(0, 16));
    setLocation(event.locationLabel ?? "");
    setError(undefined);
    setSuccess(undefined);
    setEditorVisible(true);
  };

  const closeEditor = () => {
    setEditorVisible(false);
    setError(undefined);
  };

  const saveEvent = () => {
    const cleanName = name.trim();
    const parsedDate = new Date(startsAt);
    if (!cleanName) {
      setError("Enter an event name.");
      return;
    }
    if (Number.isNaN(parsedDate.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }

    if (editingEventId) {
      updateEvent(editingEventId, {
        name: cleanName,
        startsAt: parsedDate.toISOString(),
        locationLabel: location.trim() || undefined,
      });
      setSuccess(`${cleanName} was updated.`);
    } else {
      addEvent({
        id: eventId(cleanName),
        name: cleanName,
        startsAt: parsedDate.toISOString(),
        ...(location.trim() ? { locationLabel: location.trim() } : {}),
        attendeeContactIds: [],
      });
      setSuccess(`${cleanName} is now active.`);
    }
    setEditorVisible(false);
  };

  const confirmDelete = (event: Event) => {
    Alert.alert(
      `Delete ${event.name}?`,
      "This removes the event and its attendee list. Saved people and memories stay in Context.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Event",
          style: "destructive",
          onPress: () => {
            deleteEvent(event.id);
            setEditorVisible(false);
            setSuccess("Event deleted. Saved people and memories were kept.");
          },
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton accessibilityLabel="Add event" onPress={openCreate} symbol={symbols.plus} />
          ),
        }}
      />
      <Screen contentContainerStyle={styles.screen} scroll={false}>
        <SectionList<Event, EventSection>
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="automatic"
          keyExtractor={(event) => event.id}
          ListEmptyComponent={(
            <EmptyState
              action={<Button onPress={openCreate} symbol={symbols.plus}>Add Event</Button>}
              body="Add a conference, dinner, or gathering, then choose the people who belong in it."
              symbol={symbols.events}
              title="No events yet"
            />
          )}
          ListHeaderComponent={(
            <View style={styles.notices}>
              <SuccessBanner message={success} />
              <ErrorBanner message={error} />
            </View>
          )}
          renderItem={({ item: event, index, section }) => {
            const active = event.id === currentEventId;
            const last = index === section.data.length - 1;
            return (
              <View style={[styles.eventRow, index === 0 && styles.eventRowFirst, last && styles.eventRowLast, !last && styles.eventRowSeparated]}>
                <Pressable
                  accessibilityHint="Opens the attendee checklist"
                  accessibilityLabel={`${event.name}. ${active ? "Active event. " : ""}${displayDate(event.startsAt)}. ${event.attendeeContactIds.length} ${event.attendeeContactIds.length === 1 ? "person" : "people"}.`}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: "/event/[id]/attendees", params: { id: event.id } })}
                  style={({ pressed }) => [styles.eventMain, pressed && styles.rowPressed]}
                >
                  <View style={styles.eventCopy}>
                    <View style={styles.eventTitleRow}>
                      <AppText emphasis="semibold" role="headline" style={styles.eventName}>{event.name}</AppText>
                      {active ? <Pill tone="safe">Active</Pill> : null}
                    </View>
                    <AppText role="subheadline" tone="secondary">
                      {displayDate(event.startsAt)} · {event.locationLabel ?? "Location not set"}
                    </AppText>
                    <AppText role="footnote" tone="secondary">
                      {event.attendeeContactIds.length} {event.attendeeContactIds.length === 1 ? "person" : "people"}
                    </AppText>
                  </View>
                  <AppSymbol name={symbols.chevron} size={16} tone="tertiary" weight="semibold" />
                </Pressable>
                <IconButton
                  accessibilityLabel={`Edit ${event.name}`}
                  onPress={() => openEdit(event)}
                  style={styles.editAction}
                  symbol={symbols.ellipsis}
                />
              </View>
            );
          }}
          renderSectionFooter={() => <View style={styles.sectionGap} />}
          renderSectionHeader={({ section }) => (
            <AppText emphasis="semibold" role="footnote" style={styles.sectionLabel} tone="secondary">
              {section.title}
            </AppText>
          )}
          sections={sections}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          style={styles.list}
        />
      </Screen>

      <Modal
        allowSwipeDismissal
        animationType="slide"
        onDismiss={resetForm}
        onRequestClose={closeEditor}
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        visible={editorVisible}
      >
        <Screen contentContainerStyle={styles.sheet} safeEdges={["top", "right", "bottom", "left"]}>
          <View style={styles.sheetBar}>
            <BarButton onPress={closeEditor}>Cancel</BarButton>
            <AppText accessibilityRole="header" emphasis="semibold" role="headline" style={styles.sheetTitle}>
              {editingEventId ? "Edit Event" : "New Event"}
            </AppText>
            <BarButton disabled={!name.trim()} onPress={saveEvent}>{editingEventId ? "Save" : "Add"}</BarButton>
          </View>

          <ErrorBanner message={error} />

          <View style={styles.form}>
            <FormField
              autoCapitalize="words"
              autoFocus
              label="Event name"
              maxLength={160}
              onChangeText={setName}
              placeholder="Applied AI Summit"
              returnKeyType="next"
              value={name}
            />

            <View style={styles.field}>
              <AppText emphasis="semibold" role="footnote" tone="secondary">Date and time</AppText>
              {Platform.OS === "ios" ? (
                <View style={styles.pickerRow}>
                  <DateTimePicker
                    accessibilityLabel="Event date and time"
                    display="compact"
                    minuteInterval={5}
                    mode="datetime"
                    onChange={(_event, value) => {
                      if (!value) return;
                      const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
                      setStartsAt(local.toISOString().slice(0, 16));
                    }}
                    value={Number.isNaN(new Date(startsAt).getTime()) ? new Date() : new Date(startsAt)}
                  />
                </View>
              ) : (
                <TextField
                  accessibilityLabel="Event date and time"
                  autoCapitalize="none"
                  onChangeText={setStartsAt}
                  placeholder="2026-07-10T18:30"
                  value={startsAt}
                />
              )}
            </View>

            <FormField
              autoCapitalize="words"
              label="Location"
              maxLength={160}
              onChangeText={setLocation}
              placeholder="Convention Hall A"
              returnKeyType="done"
              value={location}
            />
          </View>

          {editingEvent ? (
            <ListSection title="Event options">
              <ListRow
                accessory="none"
                last={false}
                onPress={() => {
                  const nextEventId = editingEvent.id === currentEventId ? "" : editingEvent.id;
                  setCurrentEventId(nextEventId);
                  setSuccess(nextEventId
                    ? `${editingEvent.name} is now active.`
                    : `${editingEvent.name} is still saved, but Today is back to your everyday people.`);
                  setEditorVisible(false);
                }}
                subtitle={editingEvent.id === currentEventId
                  ? "Keep the event saved and return Today to your everyday people"
                  : "Use this event on Today and in Event Assistant"}
                symbol={symbols.checkCircle}
                title={editingEvent.id === currentEventId ? "Stop Showing on Today" : "Make Active on Today"}
              />
              <ListRow
                destructive
                last
                onPress={() => confirmDelete(editingEvent)}
                symbol={symbols.trash}
                title="Delete Event"
              />
            </ListSection>
          ) : (
            <AppText role="footnote" tone="secondary">New events become active automatically.</AppText>
          )}
        </Screen>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  list: { flex: 1, width: "100%" },
  listContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  notices: { gap: spacing.sm, marginBottom: spacing.lg },
  sectionLabel: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.2 },
  sectionGap: { height: spacing.xl },
  eventRow: { flexDirection: "row", alignItems: "center", overflow: "hidden", backgroundColor: colors.surface },
  eventRowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous" },
  eventRowLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous" },
  eventRowSeparated: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  eventMain: { minHeight: 72, flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingLeft: spacing.lg, paddingVertical: spacing.md },
  eventCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  eventTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  eventName: { flexShrink: 1 },
  editAction: { marginHorizontal: spacing.xs, backgroundColor: "transparent" },
  rowPressed: { backgroundColor: colors.fill },
  sheet: { paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  sheetBar: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { flex: 1, textAlign: "center" },
  form: { gap: spacing.lg },
  field: { gap: spacing.xs },
  pickerRow: { minHeight: 52, alignItems: "flex-start", justifyContent: "center", borderRadius: radius.md, borderCurve: "continuous", backgroundColor: colors.surface, paddingHorizontal: spacing.md },
});
