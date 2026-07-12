import { useMemo, useState } from "react";
import { Platform, Pressable, SectionList, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { Contact } from "@context/shared";
import {
  AppSymbol,
  AppText,
  Button,
  EmptyState,
  IconButton,
  ListRow,
  ListSection,
  Pill,
  Screen,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { displayDate } from "@/lib/date";
import { useAppStore } from "@/store/app-store";

type AttendeeSection = {
  title: string;
  data: Contact[];
};

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function EventAttendeesScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = singleParam(params.id);
  const router = useRouter();
  const contacts = useAppStore((state) => state.contacts);
  const event = useAppStore((state) => state.events.find((item) => item.id === eventId));
  const addContactToEvent = useAppStore((state) => state.addContactToEvent);
  const removeContactFromEvent = useAppStore((state) => state.removeContactFromEvent);
  const [query, setQuery] = useState("");

  const attendeeIds = useMemo(() => new Set(event?.attendeeContactIds ?? []), [event?.attendeeContactIds]);
  const sections = useMemo<AttendeeSection[]>(() => {
    if (!event) return [];
    const normalized = query.trim().toLocaleLowerCase();
    const visible = [...contacts]
      .filter((contact) => !normalized || [
        contact.displayName,
        contact.company,
        contact.role,
        contact.lastDiscussed,
        ...(contact.conversationTopics ?? []),
      ].filter(Boolean).some((value) => value?.toLocaleLowerCase().includes(normalized)))
      .sort((left, right) => left.displayName.localeCompare(right.displayName)
        || (left.company ?? "").localeCompare(right.company ?? ""));
    const attending = visible.filter((contact) => attendeeIds.has(contact.id));
    const available = visible.filter((contact) => !attendeeIds.has(contact.id));
    return [
      ...(attending.length ? [{ title: `Attending · ${attending.length}`, data: attending }] : []),
      ...(available.length ? [{ title: "Other saved people", data: available }] : []),
    ];
  }, [attendeeIds, contacts, event, query]);

  if (!event) {
    return (
      <Screen>
        <EmptyState
          action={<Button onPress={() => router.replace("/events")}>Return to Events</Button>}
          body="It may have been deleted. Saved people and memories are still in Context."
          symbol={symbols.events}
          title="Event unavailable"
        />
      </Screen>
    );
  }

  const openImport = () => {
    router.push({ pathname: "/import", params: { eventId: event.id } });
  };

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.summary}>
        <AppText role="callout" tone="secondary">
          {displayDate(event.startsAt)} · {event.locationLabel ?? "Location not set"}
        </AppText>
        <Pill tone="safe">{event.attendeeContactIds.length} attending</Pill>
      </View>

      <ListSection footer="Tap a name to include or remove it. Removing someone from this event keeps their profile and memories.">
        <ListRow
          last={false}
          onPress={() => router.push({ pathname: "/contact/new", params: { eventId: event.id } })}
          symbol={symbols.plus}
          title="Add New Person"
        />
        <ListRow last onPress={openImport} symbol={symbols.import} title={Platform.OS === "ios" ? "Import Attendee CSV or PDF" : "Import Attendee CSV"} />
      </ListSection>

      {Platform.OS !== "ios" && contacts.length ? (
        <TextField
          accessibilityLabel={`Search people for ${event.name}`}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          onChangeText={setQuery}
          placeholder="Search saved people"
          value={query}
        />
      ) : null}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: event.name,
          ...(Platform.OS === "ios" && contacts.length
            ? {
                headerSearchBarOptions: {
                  autoCapitalize: "none" as const,
                  hideWhenScrolling: false,
                  onCancelButtonPress: () => setQuery(""),
                  onChangeText: (searchEvent) => setQuery(searchEvent.nativeEvent.text),
                  placeholder: "Search People",
                  placement: "stacked" as const,
                },
              }
            : {}),
        }}
      />
      <Screen contentContainerStyle={styles.screen} scroll={false}>
        <SectionList<Contact, AttendeeSection>
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(contact) => contact.id}
          ListEmptyComponent={(
            <EmptyState
              action={contacts.length
                ? <Button onPress={() => setQuery("")} variant="secondary">Clear Search</Button>
                : <Button onPress={() => router.push({ pathname: "/contact/new", params: { eventId: event.id } })} symbol={symbols.plus}>Add Person</Button>}
              body={contacts.length
                ? `No saved person matches “${query.trim()}”.`
                : "Add someone here or import an attendee CSV."}
              symbol={symbols.people}
              title={contacts.length ? "No matches" : "No saved people"}
            />
          )}
          ListHeaderComponent={listHeader}
          renderItem={({ item: contact, index, section }) => {
            const attending = attendeeIds.has(contact.id);
            const last = index === section.data.length - 1;
            const metadata = [contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship";
            return (
              <View style={[styles.personRow, index === 0 && styles.personRowFirst, last && styles.personRowLast, !last && styles.personRowSeparated]}>
                <Pressable
                  accessibilityHint="Double tap to change attendance"
                  accessibilityLabel={`${contact.displayName}. ${metadata}. ${attending ? "Attending" : "Not attending"}.`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: attending }}
                  onPress={() => {
                    if (attending) removeContactFromEvent(contact.id, event.id);
                    else addContactToEvent(contact.id, event.id);
                  }}
                  style={({ pressed }) => [styles.checklistAction, pressed && styles.rowPressed]}
                >
                  <View style={[styles.checkbox, attending && styles.checkboxSelected]}>
                    {attending ? <AppSymbol name={symbols.check} size={17} tone="onTint" weight="bold" /> : null}
                  </View>
                  <View style={styles.personCopy}>
                    <AppText emphasis="medium" role="body">{contact.displayName}</AppText>
                    <AppText role="subheadline" tone="secondary">{metadata}</AppText>
                  </View>
                </Pressable>
                <IconButton
                  accessibilityLabel={`Open profile for ${contact.displayName}`}
                  onPress={() => router.push({ pathname: "/contact/[id]", params: { id: contact.id } })}
                  style={styles.profileAction}
                  symbol={symbols.person}
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
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  list: { flex: 1, width: "100%" },
  listContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  listHeader: { gap: spacing.lg, marginBottom: spacing.xl },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm },
  sectionLabel: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.2 },
  sectionGap: { height: spacing.xl },
  personRow: { minHeight: 68, flexDirection: "row", alignItems: "center", overflow: "hidden", backgroundColor: colors.surface },
  personRowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous" },
  personRowLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous" },
  personRowSeparated: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  checklistAction: { minHeight: 68, flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingLeft: spacing.lg, paddingVertical: spacing.sm },
  checkbox: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderColor: colors.borderStrong, borderWidth: StyleSheet.hairlineWidth, backgroundColor: colors.surfaceAlt },
  checkboxSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  personCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  profileAction: { marginHorizontal: spacing.xs, backgroundColor: "transparent" },
  rowPressed: { backgroundColor: colors.fill },
});
