import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Avatar, Body, Button, Card, Eyebrow, Pill, Screen, Title } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { displayDate, relativeDate } from "@/lib/date";
import { useAppStore } from "@/store/app-store";

export default function HomeScreen() {
  const router = useRouter();
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const currentEventId = useAppStore((state) => state.currentEventId);
  const aiEnabled = useAppStore((state) => state.aiEnabled);
  const event = events.find((item) => item.id === currentEventId);
  const attendees = event
    ? event.attendeeContactIds
        .map((id) => contacts.find((contact) => contact.id === id))
        .filter((contact) => contact !== undefined)
    : [];

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>C</Text></View>
          <Text style={styles.brandName}>Context</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push("/settings")} style={styles.iconButton}>
          <Text style={styles.iconButtonText}>Privacy</Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Eyebrow>Today’s room</Eyebrow>
        <Title compact>Walk in already remembering.</Title>
        <Body muted>Brief yourself before the hello. Capture the update after.</Body>
      </View>

      {event ? (
        <Card style={styles.eventCard}>
          <View style={styles.eventTopline}>
            <Pill tone="safe">Active event boundary</Pill>
            <Pill tone={aiEnabled ? "safe" : "neutral"}>{aiEnabled ? "AI enabled" : "AI off"}</Pill>
          </View>
          <Text style={styles.eventName}>{event.name}</Text>
          <Text style={styles.eventMeta}>
            {displayDate(event.startsAt)} · {event.locationLabel ?? "Location not stored"}
          </Text>
          <Text style={styles.eventCount}>{attendees.length} known people in this attendee set</Text>
          <Button onPress={() => router.push("/recognize")}>Start memory assist</Button>
        </Card>
      ) : (
        <Card>
          <Text style={styles.emptyEventName}>No active event yet</Text>
          <Body muted>Import an attendee list to create a deliberate matching boundary.</Body>
          <Button onPress={() => router.push("/import")}>Import attendees</Button>
        </Card>
      )}

      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionTitle}>People to remember</Text>
          <Text style={styles.sectionSubtitle}>Only saved contacts in this event</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push("/contact/new")}>
          <Text style={styles.textAction}>Add person</Text>
        </Pressable>
      </View>

      <View style={styles.peopleList}>
        {attendees.map((contact) => (
          <Pressable
            key={contact.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${contact.displayName}`}
            onPress={() => router.push({ pathname: "/contact/[id]", params: { id: contact.id } })}
          >
            {({ pressed }) => (
              <Card style={[styles.personCard, pressed && styles.pressed]}>
                <Avatar name={contact.displayName} />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{contact.displayName}</Text>
                  <Text style={styles.personRole} numberOfLines={1}>
                    {[contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship"}
                  </Text>
                  <Text style={styles.personContext} numberOfLines={1}>
                    Last spoke {relativeDate(contact.lastSpokeAt) ?? "not recorded"}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Card>
            )}
          </Pressable>
        ))}
      </View>

      <View style={styles.bottomActions}>
        <Button variant="secondary" onPress={() => router.push("/import")} style={styles.flexButton}>Import CSV</Button>
        <Button variant="secondary" onPress={() => router.push("/settings")} style={styles.flexButton}>Data controls</Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  topbar: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandMark: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  brandMarkText: { color: colors.white, fontSize: 18, fontWeight: "900" },
  brandName: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  iconButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  iconButtonText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  header: { width: "100%", gap: spacing.sm, paddingVertical: spacing.md },
  eventCard: { padding: spacing.lg, backgroundColor: colors.ink, borderColor: colors.ink },
  eventTopline: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm },
  eventName: { color: colors.white, fontSize: 24, lineHeight: 30, fontWeight: "800", marginTop: spacing.sm },
  emptyEventName: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: "800" },
  eventMeta: { color: "#C9CED7", fontSize: 14, lineHeight: 20 },
  eventCount: { color: colors.white, fontSize: 14, fontWeight: "700", marginBottom: spacing.sm },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md, marginTop: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  sectionSubtitle: { color: colors.inkMuted, fontSize: 13, marginTop: 2 },
  textAction: { color: colors.primary, fontSize: 14, fontWeight: "800", paddingVertical: 8 },
  peopleList: { gap: spacing.sm },
  personCard: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, shadowOpacity: 0.04 },
  pressed: { opacity: 0.75 },
  personCopy: { flex: 1, gap: 2 },
  personName: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  personRole: { color: colors.inkMuted, fontSize: 13 },
  personContext: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 2 },
  chevron: { color: colors.inkMuted, fontSize: 28, fontWeight: "300" },
  bottomActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  flexButton: { flex: 1 },
});
