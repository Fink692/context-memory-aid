import { useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, SectionList, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import type { Event } from "@context/shared";
import { EventEditorSheet, type EventEditorValues } from "@/components/event-editor-sheet";
import {
  AppSymbol,
  AppText,
  Button,
  EmptyState,
  ErrorBanner,
  IconButton,
  Pill,
  Screen,
  SuccessBanner,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { displayEventSchedule } from "@/lib/date";
import { eventHasEnded } from "@/lib/event-lifecycle";
import { useAppStore } from "@/store/app-store";

type EventSection = {
  title: string;
  data: Event[];
};

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
  const [success, setSuccess] = useState<string>();
  const [error, setError] = useState<string>();

  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
    [events],
  );
  const editingEvent = events.find((event) => event.id === editingEventId);
  const sections = useMemo<EventSection[]>(() => {
    const active = sortedEvents.find((event) => event.id === currentEventId);
    const others = sortedEvents.filter((event) => event.id !== currentEventId);
    const upcoming = others
      .filter((event) => !eventHasEnded(event))
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    const past = others
      .filter((event) => eventHasEnded(event))
      .sort((left, right) => right.startsAt.localeCompare(left.startsAt));
    return [
      ...(active ? [{ title: eventHasEnded(active) ? "Showing on Today · Ended" : "Showing on Today", data: [active] }] : []),
      ...(upcoming.length ? [{ title: "Upcoming", data: upcoming }] : []),
      ...(past.length ? [{ title: "Past", data: past }] : []),
    ];
  }, [currentEventId, sortedEvents]);
  const activeEvent = events.find((event) => event.id === currentEventId);
  const activeEventEnded = activeEvent ? eventHasEnded(activeEvent) : false;

  const openCreate = () => {
    setEditingEventId(undefined);
    setSuccess(undefined);
    setError(undefined);
    setEditorVisible(true);
  };

  const openEdit = (event: Event) => {
    setEditingEventId(event.id);
    setSuccess(undefined);
    setError(undefined);
    setEditorVisible(true);
  };

  const closeEditor = () => {
    setEditorVisible(false);
  };

  const saveEvent = async (values: EventEditorValues) => {
    if (editingEventId) {
      await updateEvent(editingEventId, { ...values, locationLabel: values.locationLabel ?? null });
      setSuccess(`${values.name} was updated.`);
    } else {
      await addEvent({
        id: eventId(values.name),
        ...values,
        attendeeContactIds: [],
      });
      setSuccess(`${values.name} is now showing on Today.`);
    }
    setEditorVisible(false);
  };

  const setEventActive = async (event: Event, active: boolean): Promise<boolean> => {
    setError(undefined);
    try {
      await setCurrentEventId(active ? event.id : "");
      setSuccess(active
        ? `${event.name} is now showing on Today.`
        : `${event.name} is still saved, but Today is back to your everyday people.`);
      setEditorVisible(false);
      return true;
    } catch {
      setSuccess(undefined);
      setError("Context could not update Today. The event is still saved; try again.");
      return false;
    }
  };

  const deleteSavedEvent = async (event: Event) => {
    setError(undefined);
    try {
      await deleteEvent(event.id);
      setEditorVisible(false);
      setSuccess("Event deleted. Saved people and memories were kept.");
    } catch {
      setSuccess(undefined);
      setError("Context could not delete this event. Nothing was changed; try again.");
    }
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
          onPress: () => { void deleteSavedEvent(event); },
        },
      ],
    );
  };

  const presentEventActions = (event: Event) => {
    const active = event.id === currentEventId;
    const activationLabel = active ? "Remove from Today" : "Show on Today";
    const activate = () => { void setEventActive(event, !active); };
    if (Platform.OS === "ios") {
      const options = [activationLabel, "Edit Event", "Delete Event", "Cancel"];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: 3,
          destructiveButtonIndex: 2,
          options,
          title: event.name,
        },
        (index) => {
          if (index === 0) activate();
          else if (index === 1) openEdit(event);
          else if (index === 2) confirmDelete(event);
        },
      );
      return;
    }
    Alert.alert(event.name, undefined, [
      { text: activationLabel, onPress: activate },
      { text: "Edit Event", onPress: () => openEdit(event) },
      { text: "Delete Event", style: "destructive", onPress: () => confirmDelete(event) },
      { text: "Cancel", style: "cancel" },
    ]);
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
              <ErrorBanner message={error} />
              <SuccessBanner message={success} />
              {activeEvent && activeEventEnded ? (
                <View accessibilityRole="alert" style={styles.endedNotice}>
                  <View style={styles.endedNoticeCopy}>
                    <AppText emphasis="semibold" role="headline" tone="warning">This event has ended</AppText>
                    <AppText role="footnote" tone="secondary">{activeEvent.name} can stay saved without taking over Today.</AppText>
                  </View>
                  <Button onPress={() => { void setEventActive(activeEvent, false); }} variant="secondary">Remove from Today</Button>
                </View>
              ) : null}
            </View>
          )}
          renderItem={({ item: event, index, section }) => {
            const active = event.id === currentEventId;
            const ended = eventHasEnded(event);
            const last = index === section.data.length - 1;
            return (
              <View style={[styles.eventRow, index === 0 && styles.eventRowFirst, last && styles.eventRowLast, !last && styles.eventRowSeparated]}>
                <Pressable
                  accessibilityHint="Opens the attendee checklist"
                  accessibilityLabel={`${event.name}. ${active ? "Showing on Today. " : ""}${displayEventSchedule(event)}. ${event.attendeeContactIds.length} ${event.attendeeContactIds.length === 1 ? "person" : "people"}.`}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: "/event/[id]/attendees", params: { id: event.id } })}
                  style={({ pressed }) => [styles.eventMain, pressed && styles.rowPressed]}
                >
                  <View style={styles.eventCopy}>
                    <View style={styles.eventTitleRow}>
                      <AppText emphasis="semibold" role="headline" style={styles.eventName}>{event.name}</AppText>
                      {active ? <Pill tone="safe">On Today</Pill> : null}
                      {ended ? <Pill tone="warning">Ended</Pill> : null}
                    </View>
                    <AppText role="subheadline" tone="secondary">
                      {displayEventSchedule(event)} · {event.locationLabel ?? "Location not set"}
                    </AppText>
                    <AppText role="footnote" tone="secondary">
                      {event.attendeeContactIds.length} {event.attendeeContactIds.length === 1 ? "person" : "people"}
                    </AppText>
                  </View>
                  <AppSymbol name={symbols.chevron} size={16} tone="tertiary" weight="semibold" />
                </Pressable>
                <IconButton
                  accessibilityHint={active ? "Offers event options" : "Offers Show on Today and event options"}
                  accessibilityLabel={`More actions for ${event.name}`}
                  onPress={() => presentEventActions(event)}
                  style={styles.editAction}
                  symbol={symbols.ellipsis}
                />
              </View>
            );
          }}
          renderSectionFooter={() => <View style={styles.sectionGap} />}
          renderSectionHeader={({ section }) => (
            <AppText accessibilityRole="header" emphasis="semibold" role="footnote" style={styles.sectionLabel} tone="secondary">
              {section.title}
            </AppText>
          )}
          sections={sections}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          style={styles.list}
        />
      </Screen>

      <EventEditorSheet
        active={Boolean(editingEvent && editingEvent.id === currentEventId)}
        onCancel={closeEditor}
        onSave={saveEvent}
        visible={editorVisible}
        {...(editingEvent ? {
          event: editingEvent,
          onActivationChange: async (active: boolean) => {
            if (!await setEventActive(editingEvent, active)) throw new Error("Event activation failed.");
          },
          onDelete: () => {
            closeEditor();
            confirmDelete(editingEvent);
          },
        } : {})}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  list: { flex: 1, width: "100%" },
  listContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  notices: { gap: spacing.sm, marginBottom: spacing.lg },
  endedNotice: { borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.warningSoft, padding: spacing.lg, gap: spacing.md },
  endedNoticeCopy: { gap: spacing.xs },
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
});
