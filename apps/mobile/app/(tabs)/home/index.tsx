import { useMemo, useState } from "react";
import { FlatList, Platform, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppSymbol,
  AppText,
  Avatar,
  BarButton,
  Button,
  EmptyState,
  ListRow,
  ListSection,
  Screen,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { displayDate, relativeDate } from "@/lib/date";
import { useAppStore } from "@/store/app-store";

export default function HomeScreen() {
  const router = useRouter();
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const currentEventId = useAppStore((state) => state.currentEventId);
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const hasSeenContactImportPrompt = useAppStore((state) => state.hasSeenContactImportPrompt);
  const setHasSeenContactImportPrompt = useAppStore((state) => state.setHasSeenContactImportPrompt);
  const [query, setQuery] = useState("");
  const event = events.find((item) => item.id === currentEventId);

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

  const directoryPeople = useMemo(() => [...contacts].sort((left, right) => {
    if (left.lastSpokeAt && right.lastSpokeAt) return right.lastSpokeAt.localeCompare(left.lastSpokeAt);
    if (left.lastSpokeAt) return -1;
    if (right.lastSpokeAt) return 1;
    return left.displayName.localeCompare(right.displayName);
  }), [contacts]);

  const visibleAttendees = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return attendees;
    return attendees.filter((contact) =>
      [contact.displayName, contact.company, contact.role, contact.lastDiscussed, contact.recentUpdate, ...(contact.conversationTopics ?? [])]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalized)),
    );
  }, [attendees, query]);

  const visibleDirectoryPeople = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return directoryPeople;
    return directoryPeople.filter((contact) =>
      [
        contact.displayName,
        contact.company,
        contact.role,
        contact.email,
        contact.phone,
        contact.metAt,
        contact.relationshipContext,
        contact.lastDiscussed,
        contact.recentUpdate,
      ]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalized)),
    );
  }, [directoryPeople, query]);

  const staleCount = attendees.filter((contact) => {
    if (!contact.lastSpokeAt) return true;
    return Date.now() - new Date(contact.lastSpokeAt).getTime() > 180 * 24 * 60 * 60 * 1_000;
  }).length;

  const addPerson = () => router.push(event
    ? { pathname: "/contact/new", params: { eventId: event.id } }
    : { pathname: "/contact/new", params: { global: "1" } });

  const listHeader = (
    <View style={styles.listHeader}>
      {Platform.OS !== "web" && !hasSeenContactImportPrompt ? (
        <View style={styles.contactsPrompt}>
          <View style={styles.promptHeading}>
            <View style={styles.promptSymbol}>
              <AppSymbol name={symbols.import} size={21} tone="tint" weight="semibold" />
            </View>
            <View style={styles.flex}>
              <AppText emphasis="semibold" role="headline">Bring in people you already know</AppText>
              <AppText role="footnote" tone="secondary">
                Choose exactly who to copy. Context can bring over available names, work details, phone, email, social profiles, and profile thumbnails—never Contacts notes, birthdays, or postal addresses. It never modifies Contacts.
              </AppText>
            </View>
          </View>
          <View style={styles.promptActions}>
            <Button
              onPress={() => {
                setHasSeenContactImportPrompt(true);
                router.push("/contacts-import");
              }}
              symbol={symbols.import}
              variant="secondary"
            >
              Choose Contacts
            </Button>
            <BarButton onPress={() => setHasSeenContactImportPrompt(true)}>Don’t show again</BarButton>
          </View>
        </View>
      ) : null}

      {event ? (
        <>
          <View style={styles.eventFeature}>
            <View style={styles.eventTopline}>
              <AppText emphasis="semibold" role="footnote" tone="tint">Active event</AppText>
              <View style={styles.assistStatus}>
                <AppSymbol
                  name={symbols.sparkles}
                  size={14}
                  tone={localToolsEnabled ? "success" : "secondary"}
                  weight="semibold"
                />
                <AppText emphasis="medium" role="footnote" tone={localToolsEnabled ? "success" : "secondary"}>
                  {localToolsEnabled
                    ? "Smart assist on"
                    : "Manual notes"}
                </AppText>
              </View>
            </View>
            <View style={styles.eventCopy}>
              <AppText accessibilityRole="header" emphasis="semibold" role="title2">{event.name}</AppText>
              <AppText role="callout" tone="secondary">
                {displayDate(event.startsAt)} · {event.locationLabel ?? "Location not stored"}
              </AppText>
              <AppText emphasis="medium" role="subheadline" tone="secondary">
                {attendees.length} {attendees.length === 1 ? "person" : "people"} · {staleCount} worth revisiting
              </AppText>
            </View>
            <Button onPress={() => router.push("/recognize")} symbol={symbols.sparkles}>Open Assistant</Button>
          </View>

          <ListSection title="Event">
            <ListRow
              accessibilityLabel={`Manage ${attendees.length} people for ${event.name}`}
              accessory="disclosure"
              detail={attendees.length.toLocaleString()}
              onPress={() => router.push({ pathname: "/event/[id]/attendees", params: { id: event.id } })}
              subtitle="Choose who appears in this event"
              symbol={symbols.people}
              title="Manage people"
            />
            <ListRow
              accessory="disclosure"
              last
              onPress={() => router.push("/events")}
              subtitle="Change the active room or edit its details"
              symbol={symbols.events}
              title="Switch or edit event"
            />
          </ListSection>

          <View style={styles.peopleHeading}>
            <View style={styles.flex}>
              <AppText accessibilityRole="header" emphasis="semibold" role="title3">People at this event</AppText>
              <AppText role="footnote" tone="secondary">Ordered by who may need the biggest refresher</AppText>
            </View>
            <BarButton accessibilityLabel={`Add a person to ${event.name}`} onPress={addPerson}>Add</BarButton>
          </View>

          {attendees.length ? (
            <TextField
              accessibilityLabel="Search people in this event"
              autoCapitalize="none"
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              placeholder="Search this event"
              value={query}
            />
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.everydayFeature}>
            <AppText emphasis="semibold" role="footnote" tone="tint">Everyday relationships</AppText>
            <View style={styles.eventCopy}>
              <AppText accessibilityRole="header" emphasis="semibold" role="title2">Who do you want to remember?</AppText>
              <AppText role="callout" tone="secondary">
                Save someone from work, your neighborhood, a shop, school, travel, or anywhere else. An event is never required.
              </AppText>
            </View>
            <Button onPress={addPerson} symbol={symbols.plus}>Add a Person</Button>
          </View>

          <ListSection title="Optional Event Tools">
            <ListRow
              accessory="disclosure"
              last
              onPress={() => router.push("/events")}
              subtitle="Group people for a conference, class, trip, party, or community gathering"
              symbol={symbols.events}
              title="Create or Choose an Event"
            />
          </ListSection>

          {directoryPeople.length ? (
            <>
              <View style={styles.peopleHeading}>
                <View style={styles.flex}>
                  <AppText accessibilityRole="header" emphasis="semibold" role="title3">Your people</AppText>
                  <AppText role="footnote" tone="secondary">Everyone stays available, with or without an event</AppText>
                </View>
                <BarButton onPress={addPerson}>Add</BarButton>
              </View>
              <TextField
                accessibilityLabel="Search all people"
                autoCapitalize="none"
                clearButtonMode="while-editing"
                onChangeText={setQuery}
                placeholder="Search people"
                value={query}
              />
            </>
          ) : null}
        </>
      )}
    </View>
  );

  const listFooter = event ? (
    <View style={styles.listFooter}>
      {!attendees.length ? (
        <EmptyState
          action={<Button onPress={() => router.push({ pathname: "/event/[id]/attendees", params: { id: event.id } })} symbol={symbols.people}>Choose People</Button>}
          body="Add someone new, choose a saved person, or import an attendee list."
          symbol={symbols.people}
          title="No people in this event"
        />
      ) : null}

      {attendees.length && !visibleAttendees.length ? (
        <EmptyState
          action={<Button onPress={() => setQuery("")} variant="secondary">Clear Search</Button>}
          body={`No one in ${event.name} matches “${query.trim()}”.`}
          symbol={symbols.people}
          title="No matches"
        />
      ) : null}
    </View>
  ) : (
    <View style={styles.listFooter}>
      {!directoryPeople.length ? (
        <EmptyState
          action={<Button onPress={addPerson} symbol={symbols.plus}>Add Your First Person</Button>}
          body="Start with anyone you would be glad to recognize or remember next time."
          symbol={symbols.people}
          title="Your people will appear here"
        />
      ) : null}
      {directoryPeople.length && !visibleDirectoryPeople.length ? (
        <EmptyState
          action={<Button onPress={() => setQuery("")} variant="secondary">Clear Search</Button>}
          body={`No saved person matches “${query.trim()}”.`}
          symbol={symbols.people}
          title="No matches"
        />
      ) : null}
    </View>
  );

  const visiblePeople = event ? visibleAttendees : visibleDirectoryPeople;

  return (
    <Screen contentContainerStyle={styles.screen} scroll={false}>
      <FlatList
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        data={visiblePeople}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(contact) => contact.id}
        ListFooterComponent={listFooter}
        ListHeaderComponent={listHeader}
        renderItem={({ item: contact, index }) => {
          const metadata = [contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship";
          const refresher = contact.recentUpdate ?? contact.lastDiscussed ?? metadata;
          const lastSpoke = relativeDate(contact.lastSpokeAt) ?? "not recorded";
          const last = index === visiblePeople.length - 1;
          return (
            <View style={[styles.personRowSurface, index === 0 && styles.groupFirst, last && styles.groupLast]}>
              <ListRow
                accessibilityLabel={`Open ${contact.displayName}. ${metadata}. ${refresher}. Last spoke ${lastSpoke}.`}
                accessory="disclosure"
                detail={lastSpoke}
                last={last}
                leading={<Avatar name={contact.displayName} photoUri={contact.photoUri} size={44} />}
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: contact.id } })}
                subtitle={refresher}
                title={contact.displayName}
              />
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: 0 },
  list: { flex: 1, width: "100%", backgroundColor: colors.canvas },
  listContent: { flexGrow: 1, paddingBottom: spacing.xxl },
  listHeader: { gap: spacing.xl, marginBottom: spacing.sm },
  listFooter: { gap: spacing.lg, marginTop: spacing.lg },
  flex: { flex: 1, minWidth: 0 },
  contactsPrompt: {
    borderRadius: radius.lg,
    borderCurve: "continuous",
    backgroundColor: colors.primarySoft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  promptHeading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  promptSymbol: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  promptActions: { alignItems: "stretch", gap: spacing.xs },
  eventFeature: {
    borderRadius: radius.feature,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  everydayFeature: {
    borderRadius: radius.feature,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  eventTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm },
  assistStatus: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  eventCopy: { gap: spacing.xs },
  peopleHeading: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.md },
  personRowSurface: { backgroundColor: colors.surface },
  groupFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
  groupLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
});
