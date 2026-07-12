import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import type { SearchBarCommands } from "react-native-screens";
import {
  AppText,
  Avatar,
  Button,
  EmptyState,
  IconButton,
  ListRow,
  ListSection,
  Screen,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

export default function PeopleScreen() {
  const router = useRouter();
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const [query, setQuery] = useState("");
  const searchBarRef = useRef<SearchBarCommands | null>(null);

  const addPerson = useCallback(() => {
    router.push({ pathname: "/contact/new", params: { global: "1" } });
  }, [router]);

  const onNativeSearchChange = useCallback((event: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setQuery(event.nativeEvent.text);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery("");
    searchBarRef.current?.clearText();
  }, []);

  const screenOptions = useMemo(() => ({
    headerRight: () => (
      <IconButton accessibilityLabel="Add person" onPress={addPerson} symbol={symbols.plus} />
    ),
    ...(Platform.OS === "ios" && contacts.length ? {
      headerSearchBarOptions: {
        autoCapitalize: "none" as const,
        hideWhenScrolling: false,
        onCancelButtonPress: clearSearch,
        onChangeText: onNativeSearchChange,
        placeholder: "Search people",
        placement: "stacked" as const,
        ref: searchBarRef,
      },
    } : {}),
  }), [addPerson, clearSearch, contacts.length, onNativeSearchChange]);

  const membershipsByContact = useMemo(() => {
    const memberships = new Map<string, typeof events>();
    events.forEach((event) => {
      event.attendeeContactIds.forEach((contactId) => {
        memberships.set(contactId, [...(memberships.get(contactId) ?? []), event]);
      });
    });
    return memberships;
  }, [events]);

  const visibleContacts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return [...contacts]
      .filter((contact) => !normalized || [
        contact.displayName,
        contact.company,
        contact.role,
        contact.email,
        contact.phone,
        contact.metAt,
        contact.relationshipContext,
        contact.lastDiscussed,
        contact.recentUpdate,
        ...(contact.socialLinks ?? []).flatMap((link) => [link.platform, link.handle, link.url]),
        ...(contact.conversationTopics ?? []),
      ].filter(Boolean).some((value) => value?.toLocaleLowerCase().includes(normalized)))
      .sort((left, right) => left.displayName.localeCompare(right.displayName)
        || (left.company ?? "").localeCompare(right.company ?? ""));
  }, [contacts, query]);

  const listHeader = (
    <View style={styles.listHeader}>
      <ListSection>
          {Platform.OS !== "web" ? (
            <ListRow
              accessory="disclosure"
              onPress={() => router.push("/contacts-import")}
              subtitle="Choose exactly who to copy from your phone"
              symbol={symbols.import}
              title="Import from Contacts"
            />
          ) : null}
          <ListRow
            accessory="disclosure"
            last
            onPress={() => router.push("/import")}
            subtitle={Platform.OS === "ios" ? "Review people from a CSV or let on-device Gemma read a PDF" : "Review people from a CSV before saving"}
            symbol={symbols.sparkles}
            title={Platform.OS === "ios" ? "Import CSV or PDF" : "Import CSV"}
          />
      </ListSection>

      {contacts.length && Platform.OS !== "ios" ? (
        <TextField
          accessibilityLabel="Search all saved people"
          autoCapitalize="none"
          clearButtonMode="while-editing"
          onChangeText={setQuery}
          placeholder="Search name, company, role, or topic"
          value={query}
        />
      ) : null}

      {contacts.length ? (
        <View style={styles.peopleHeading}>
          <AppText emphasis="semibold" role="footnote" tone="secondary">Saved people</AppText>
          <AppText role="footnote" tone="secondary">{visibleContacts.length.toLocaleString()} shown</AppText>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen contentContainerStyle={styles.screen} scroll={false}>
      <Stack.Screen options={screenOptions} />
      <FlatList
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.peopleList}
        contentInsetAdjustmentBehavior="automatic"
        data={visibleContacts}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(contact) => contact.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={(
          <View style={styles.emptyContainer}>
            <EmptyState
              action={contacts.length
                ? <Button onPress={clearSearch} variant="secondary">Clear Search</Button>
                : (
                    <View style={styles.emptyActions}>
                      {Platform.OS !== "web" ? (
                        <Button onPress={() => router.push("/contacts-import")} symbol={symbols.import}>Import from Contacts</Button>
                      ) : null}
                      <Button onPress={() => router.push("/import")} symbol={symbols.sparkles} variant="secondary">
                        {Platform.OS === "ios" ? "Import CSV or PDF" : "Import CSV"}
                      </Button>
                      <Button
                        onPress={addPerson}
                        symbol={symbols.plus}
                        variant="secondary"
                      >
                        Describe or Dictate
                      </Button>
                    </View>
                  )}
              body={contacts.length
                ? `No saved person matches “${query.trim()}”.`
                : "Describe or dictate one person, choose people from Contacts, or review a CSV/PDF roster. Events are optional."}
              symbol={symbols.people}
              title={contacts.length ? "No matches" : "No saved people"}
            />
          </View>
        )}
        renderItem={({ item: contact, index }) => {
          const memberships = membershipsByContact.get(contact.id) ?? [];
          const profile = [contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship";
          const eventSummary = memberships.length
            ? `Assigned to ${memberships.map((event) => event.name).join(", ")}`
            : "Not assigned to an event";
          const memoryCount = contact.timeline.length;
          const last = index === visibleContacts.length - 1;
          return (
            <View style={[styles.personRowSurface, index === 0 && styles.groupFirst, last && styles.groupLast]}>
              <ListRow
                accessibilityLabel={`${contact.displayName}. ${profile}. ${eventSummary}. ${memoryCount} ${memoryCount === 1 ? "memory" : "memories"}.`}
                accessory="disclosure"
                detail={`${memberships.length} ${memberships.length === 1 ? "event" : "events"}`}
                last={last}
                leading={<Avatar name={contact.displayName} photoUri={contact.photoUri} size={44} />}
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: contact.id } })}
                subtitle={profile}
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
  peopleList: { flexGrow: 1, paddingBottom: spacing.xxl },
  listHeader: { gap: spacing.lg, marginBottom: spacing.sm },
  peopleHeading: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.lg },
  emptyContainer: { marginTop: spacing.lg },
  emptyActions: { width: "100%", gap: spacing.sm },
  personRowSurface: { backgroundColor: colors.surface },
  groupFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
  groupLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
});
