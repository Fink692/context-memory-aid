import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Avatar, Body, Button, Card, EmptyState, Eyebrow, Pill, Screen, SectionHeader, Title } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { displayDate, relativeDate } from "@/lib/date";
import { useAppStore } from "@/store/app-store";

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const currentEventId = useAppStore((state) => state.currentEventId);
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const [query, setQuery] = useState("");
  const event = events.find((item) => item.id === currentEventId);
  const isWide = width >= 780;

  const attendees = useMemo(() => {
    if (!event) return [];
    return event.attendeeContactIds
      .map((id) => contacts.find((contact) => contact.id === id))
      .filter((contact) => contact !== undefined)
      .sort((left, right) => {
        if (!left.lastSpokeAt) return -1;
        if (!right.lastSpokeAt) return 1;
        return left.lastSpokeAt.localeCompare(right.lastSpokeAt);
      });
  }, [contacts, event]);

  const visibleAttendees = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return attendees;
    return attendees.filter((contact) =>
      [contact.displayName, contact.company, contact.role, contact.lastDiscussed]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalized)),
    );
  }, [attendees, query]);

  const staleCount = attendees.filter((contact) => {
    if (!contact.lastSpokeAt) return true;
    return Date.now() - new Date(contact.lastSpokeAt).getTime() > 180 * 24 * 60 * 60 * 1_000;
  }).length;

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>C</Text></View>
          <View>
            <Text style={styles.brandName}>Context</Text>
            <Text style={styles.brandTagline}>Relationship memory</Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="Open privacy and data settings"
          accessibilityRole="button"
          onPress={() => router.push("/settings")}
          style={({ pressed }) => [styles.topAction, pressed && styles.pressed]}
        >
          <Text style={styles.topActionText}>Privacy & data</Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Eyebrow>Today’s room</Eyebrow>
        <Title compact>Walk in already remembering.</Title>
        <Body muted>Brief yourself before the hello. Capture the useful update after.</Body>
      </View>

      {event ? (
        <View style={[styles.briefingGrid, isWide && styles.briefingGridWide]}>
          <Card style={[styles.eventCard, isWide && styles.eventCardWide]}>
            <View style={styles.eventTopline}>
              <Pill tone="safe">Active event</Pill>
              <Pill tone={localToolsEnabled ? "safe" : "neutral"}>{localToolsEnabled ? "Local drafts on" : "Manual notes"}</Pill>
            </View>
            <Text style={styles.eventName}>{event.name}</Text>
            <Text style={styles.eventMeta}>{displayDate(event.startsAt)} · {event.locationLabel ?? "Location not stored"}</Text>
            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{attendees.length}</Text>
                <Text style={styles.metricLabel}>people</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{staleCount}</Text>
                <Text style={styles.metricLabel}>worth revisiting</Text>
              </View>
            </View>
            <Button onPress={() => router.push("/recognize")}>Open event assistant</Button>
            <Button onPress={() => router.push("/events")} variant="quiet">Switch or edit event</Button>
          </Card>

          <Card style={[styles.prepCard, isWide && styles.prepCardWide]}>
            <Text style={styles.prepEyebrow}>Before you walk in</Text>
            <Text style={styles.prepTitle}>Three useful refreshers</Text>
            {attendees.slice(0, 3).map((contact, index) => (
              <Pressable
                accessibilityLabel={`Open refresher for ${contact.displayName}`}
                accessibilityRole="button"
                key={contact.id}
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: contact.id } })}
                style={({ pressed }) => [styles.prepRow, pressed && styles.pressed]}
              >
                <Text style={styles.prepNumber}>{String(index + 1).padStart(2, "0")}</Text>
                <View style={styles.prepCopy}>
                  <Text style={styles.prepName}>{contact.displayName}</Text>
                  <Text numberOfLines={2} style={styles.prepContext}>{contact.recentUpdate ?? contact.lastDiscussed ?? "No recent context saved"}</Text>
                </View>
              </Pressable>
            ))}
            {!attendees.length ? <Body muted>Add people to generate a pre-event briefing.</Body> : null}
          </Card>
        </View>
      ) : (
        <EmptyState
          action={<Button onPress={() => router.push("/events")}>Create your first event</Button>}
          body="Create an event, then add or import the people you expect to meet."
          title="No active event yet"
        />
      )}

      <SectionHeader
        action={(
          <Pressable accessibilityRole="button" onPress={() => router.push("/contact/new")}>
            <Text style={styles.textAction}>Add person</Text>
          </Pressable>
        )}
        subtitle={event ? "Ordered by who may need the biggest refresher" : "Create an event before adding attendees"}
        title="People to remember"
      />

      {attendees.length ? (
        <TextInput
          accessibilityLabel="Search people in this event"
          autoCapitalize="none"
          clearButtonMode="while-editing"
          onChangeText={setQuery}
          placeholder="Search name, company, role, or topic"
          placeholderTextColor={colors.inkMuted}
          style={styles.search}
          value={query}
        />
      ) : null}

      <View style={styles.peopleList}>
        {visibleAttendees.map((contact) => (
          <Pressable
            accessibilityLabel={`Open ${contact.displayName}`}
            accessibilityRole="button"
            key={contact.id}
            onPress={() => router.push({ pathname: "/contact/[id]", params: { id: contact.id } })}
          >
            {({ pressed }) => (
              <Card style={[styles.personCard, pressed && styles.pressed]}>
                <Avatar name={contact.displayName} />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{contact.displayName}</Text>
                  <Text numberOfLines={1} style={styles.personRole}>{[contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship"}</Text>
                  <Text numberOfLines={1} style={styles.personContext}>Last spoke {relativeDate(contact.lastSpokeAt) ?? "not recorded"}</Text>
                </View>
                <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
              </Card>
            )}
          </Pressable>
        ))}
      </View>

      {event && !attendees.length ? (
        <EmptyState
          action={<Button onPress={() => router.push("/contact/new")}>Add the first person</Button>}
          body="Add someone manually or import a CSV attendee list."
          title="This event has no people yet"
        />
      ) : null}

      {attendees.length && !visibleAttendees.length ? (
        <EmptyState
          action={<Button onPress={() => setQuery("")} variant="secondary">Clear search</Button>}
          body={`No one in ${event?.name ?? "this event"} matches “${query.trim()}”.`}
          title="No matches"
        />
      ) : null}

      <View style={styles.bottomActions}>
        <Button disabled={!event} onPress={() => router.push("/import")} style={styles.flexButton} variant="secondary">Import people</Button>
        <Button onPress={() => router.push("/events")} style={styles.flexButton} variant="secondary">Manage events</Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  topbar: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  brandRow: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandMark: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  brandMarkText: { color: colors.white, fontSize: 19, fontWeight: "900" },
  brandName: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  brandTagline: { color: colors.inkMuted, fontSize: 11, marginTop: 1 },
  topAction: { minHeight: 44, justifyContent: "center", borderRadius: radius.pill, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  topActionText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  header: { width: "100%", gap: spacing.sm, paddingVertical: spacing.md },
  briefingGrid: { gap: spacing.sm },
  briefingGridWide: { flexDirection: "row", alignItems: "stretch" },
  eventCard: { padding: spacing.lg, backgroundColor: colors.ink, borderColor: colors.ink },
  eventCardWide: { flex: 1.15 },
  prepCard: { padding: spacing.lg },
  prepCardWide: { flex: 0.85 },
  eventTopline: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm },
  eventName: { color: colors.white, fontSize: 25, lineHeight: 31, fontWeight: "800", marginTop: spacing.sm },
  eventMeta: { color: "#C9CED7", fontSize: 14, lineHeight: 20 },
  metrics: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.sm },
  metric: { flex: 1 },
  metricValue: { color: colors.white, fontSize: 24, fontWeight: "800", fontVariant: ["tabular-nums"] },
  metricLabel: { color: "#C9CED7", fontSize: 11, lineHeight: 16 },
  metricDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: "#475467" },
  prepEyebrow: { color: colors.primary, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  prepTitle: { color: colors.ink, fontSize: 19, lineHeight: 25, fontWeight: "800" },
  prepRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  prepNumber: { width: 25, color: colors.primary, fontSize: 11, fontWeight: "900", fontVariant: ["tabular-nums"] },
  prepCopy: { flex: 1, minWidth: 0 },
  prepName: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  prepContext: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 1 },
  textAction: { color: colors.primary, fontSize: 14, fontWeight: "800", paddingVertical: 8 },
  search: { minHeight: 48, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 15 },
  peopleList: { gap: spacing.sm },
  personCard: { flexDirection: "row", alignItems: "center", borderRadius: radius.md },
  pressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  personCopy: { flex: 1, minWidth: 0, gap: 2 },
  personName: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  personRole: { color: colors.inkMuted, fontSize: 13 },
  personContext: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 2 },
  chevron: { color: colors.inkMuted, fontSize: 28, fontWeight: "300" },
  bottomActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  flexButton: { flex: 1, minWidth: 170 },
});
