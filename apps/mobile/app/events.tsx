import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import type { Event } from "@context/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Body, Button, Card, EmptyState, ErrorBanner, Pill, Screen, SectionHeader, SuccessBanner } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { displayDate } from "@/lib/date";
import { useAppStore } from "@/store/app-store";

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
  const setCurrentEventId = useAppStore((state) => state.setCurrentEventId);
  const deleteEvent = useAppStore((state) => state.deleteEvent);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState(defaultDate);
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<Event>();

  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
    [events],
  );

  const createEvent = () => {
    const cleanName = name.trim();
    const parsedDate = new Date(startsAt);
    if (!cleanName) {
      setError("Event name is required.");
      return;
    }
    if (Number.isNaN(parsedDate.getTime())) {
      setError("Enter a valid date and time, such as 2026-07-10T18:30.");
      return;
    }
    addEvent({
      id: eventId(cleanName),
      name: cleanName,
      startsAt: parsedDate.toISOString(),
      ...(location.trim() ? { locationLabel: location.trim() } : {}),
      attendeeContactIds: [],
    });
    setName("");
    setStartsAt(defaultDate());
    setLocation("");
    setError(undefined);
    setSuccess(`${cleanName} is now the active event.`);
  };

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Pill tone="safe">Deliberate boundaries</Pill>
        <Text style={styles.title}>Choose who belongs in the room.</Text>
        <Body muted>Events limit quick matching and keep each networking moment focused.</Body>
      </View>

      <SuccessBanner message={success} />
      <ErrorBanner message={error} />

      <Card style={styles.formCard}>
        <Text style={styles.formTitle}>Create an event</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Event name</Text>
          <TextInput
            accessibilityLabel="Event name"
            maxLength={160}
            onChangeText={setName}
            placeholder="Applied AI Summit"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
            value={name}
          />
        </View>
        <View style={styles.formRow}>
          <View style={[styles.field, styles.flexField]}>
            <Text style={styles.label}>Date and time</Text>
            <TextInput
              accessibilityLabel="Event date and time"
              autoCapitalize="none"
              onChangeText={setStartsAt}
              placeholder="2026-07-10T18:30"
              placeholderTextColor={colors.inkMuted}
              style={styles.input}
              value={startsAt}
            />
          </View>
          <View style={[styles.field, styles.flexField]}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              accessibilityLabel="Event location"
              maxLength={160}
              onChangeText={setLocation}
              placeholder="Convention Hall A"
              placeholderTextColor={colors.inkMuted}
              style={styles.input}
              value={location}
            />
          </View>
        </View>
        <Button onPress={createEvent}>Create and make active</Button>
      </Card>

      <SectionHeader title="Your events" subtitle="Switch the active boundary at any time" />
      {sortedEvents.length ? (
        <View style={styles.eventList}>
          {sortedEvents.map((event) => {
            const active = event.id === currentEventId;
            return (
              <Card key={event.id} style={[styles.eventCard, active && styles.eventCardActive]}>
                <View style={styles.eventCopy}>
                  <View style={styles.eventTopline}>
                    <Text style={styles.eventName}>{event.name}</Text>
                    {active ? <Pill tone="safe">Active</Pill> : null}
                  </View>
                  <Text style={styles.eventMeta}>{displayDate(event.startsAt)} · {event.locationLabel ?? "Location not stored"}</Text>
                  <Text style={styles.eventCount}>{event.attendeeContactIds.length} people</Text>
                </View>
                <View style={styles.eventActions}>
                  {!active ? (
                    <Button
                      accessibilityLabel={`Make ${event.name} the active event`}
                      onPress={() => {
                        setCurrentEventId(event.id);
                        setSuccess(`${event.name} is now active.`);
                      }}
                      style={styles.selectButton}
                      variant="secondary"
                    >
                      Make active
                    </Button>
                  ) : null}
                  <Button accessibilityLabel={`Remove ${event.name}`} onPress={() => setPendingDelete(event)} style={styles.deleteButton} variant="quiet">Remove</Button>
                </View>
              </Card>
            );
          })}
        </View>
      ) : (
        <EmptyState
          title="No events yet"
          body="Create your first event above, then add or import the people you expect to meet."
        />
      )}

      <Button onPress={() => router.replace("/home")} variant="secondary">Return to briefing</Button>

      <ConfirmDialog
        body={`This removes ${pendingDelete?.name ?? "this event"} and its attendee boundary. Saved people and memories remain in your relationship database.`}
        confirmLabel="Remove event"
        destructive
        onCancel={() => setPendingDelete(undefined)}
        onConfirm={() => {
          if (pendingDelete) deleteEvent(pendingDelete.id);
          setPendingDelete(undefined);
          setSuccess("Event removed. Saved relationship data was kept.");
        }}
        title="Remove this event?"
        visible={Boolean(pendingDelete)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  header: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 31, lineHeight: 37, fontWeight: "800" },
  formCard: { padding: spacing.lg },
  formTitle: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  formRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  field: { gap: spacing.xs },
  flexField: { flex: 1, minWidth: 230 },
  label: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  input: { minHeight: 50, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surfaceRaised, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 15 },
  eventList: { gap: spacing.sm },
  eventCard: { flexDirection: "row", alignItems: "center" },
  eventCardActive: { borderColor: colors.success, backgroundColor: "#F7FCF9" },
  eventCopy: { flex: 1, minWidth: 0, gap: 3 },
  eventTopline: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  eventName: { flexShrink: 1, color: colors.ink, fontSize: 17, fontWeight: "800" },
  eventMeta: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  eventCount: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  eventActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: spacing.xs },
  selectButton: { minHeight: 40, paddingHorizontal: spacing.sm },
  deleteButton: { minHeight: 42, paddingHorizontal: spacing.sm },
});
