import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  useWindowDimensions,
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
  Screen,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { shouldStackSharedRow } from "@/lib/accessibility-layout";
import { sortOpenActions } from "@/lib/action-schedule";
import { displayDate, relativeDate } from "@/lib/date";
import { useAppStore } from "@/store/app-store";

export default function PeopleScreen() {
  const router = useRouter();
  const contacts = useAppStore((state) => state.contacts);
  const actions = useAppStore((state) => state.actions);
  const [query, setQuery] = useState("");
  const searchBarRef = useRef<SearchBarCommands | null>(null);
  const { fontScale, width } = useWindowDimensions();
  const stackPeopleHeading = shouldStackSharedRow({ fontScale, width });

  const addPerson = useCallback(() => {
    router.push({ pathname: "/contact/new", params: { global: "1" } });
  }, [router]);

  const scanContact = useCallback(() => {
    router.push("/contact-receive");
  }, [router]);

  const importContacts = useCallback(() => {
    router.push("/contacts-import");
  }, [router]);

  const importFile = useCallback(() => {
    router.push("/import");
  }, [router]);

  const presentAddOptions = useCallback(() => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: 4,
          options: ["Scan Contact QR", "Add Manually", "Import from Contacts", "Import from File", "Cancel"],
          title: "Add a Person",
        },
        (index) => {
          if (index === 0) scanContact();
          if (index === 1) addPerson();
          if (index === 2) importContacts();
          if (index === 3) importFile();
        },
      );
      return;
    }

    Alert.alert("Add a Person", undefined, [
      { text: "Scan Contact QR", onPress: scanContact },
      { text: "Add Manually", onPress: addPerson },
      ...(Platform.OS === "web" ? [] : [{ text: "Import from Contacts", onPress: importContacts }]),
      { text: "Import from File", onPress: importFile },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [addPerson, importContacts, importFile, scanContact]);

  const onNativeSearchChange = useCallback((event: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setQuery(event.nativeEvent.text);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery("");
    searchBarRef.current?.clearText();
  }, []);

  const screenOptions = useMemo(() => ({
    headerRight: () => (
      <IconButton
        accessibilityLabel={contacts.length ? "Add, scan, or import a person" : "Add person"}
        onPress={contacts.length ? presentAddOptions : addPerson}
        symbol={symbols.plus}
      />
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
  }), [addPerson, clearSearch, contacts.length, onNativeSearchChange, presentAddOptions]);

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

  const nextActionByContact = useMemo(() => {
    const nextByContact = new Map<string, (typeof actions)[number]>();
    sortOpenActions(actions).forEach((action) => {
      if (!nextByContact.has(action.contactId)) nextByContact.set(action.contactId, action);
    });
    return nextByContact;
  }, [actions]);

  const listHeader = (
    <View style={styles.listHeader}>
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
        <View style={[styles.peopleHeading, stackPeopleHeading && styles.peopleHeadingStacked]}>
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
                        <Button onPress={scanContact} symbol={symbols.scan}>Scan Contact QR</Button>
                      ) : null}
                      {Platform.OS !== "web" ? (
                        <Button onPress={importContacts} symbol={symbols.import} variant="secondary">Import from Contacts</Button>
                      ) : null}
                      <Button onPress={importFile} symbol={symbols.import} variant="secondary">
                        Import from File
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
          const profile = [contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship";
          const memoryCount = contact.timeline.length;
          const nextAction = nextActionByContact.get(contact.id);
          const lastSpoke = relativeDate(contact.lastSpokeAt);
          const relationshipSummary = nextAction
            ? `Next: ${nextAction.title}`
            : contact.recentUpdate
              ? `Recent: ${contact.recentUpdate}`
              : contact.lastDiscussed
                ? `Last discussed: ${contact.lastDiscussed}`
                : lastSpoke
                  ? `Last spoke ${lastSpoke}`
                  : contact.relationshipContext ?? profile;
          const relationshipDetail = nextAction?.dueAt
            ? `Due ${displayDate(nextAction.dueAt)}`
            : nextAction
              ? "Follow-up"
              : undefined;
          const memorySummary = memoryCount
            ? `${memoryCount} ${memoryCount === 1 ? "memory" : "memories"}`
            : "No memories";
          const last = index === visibleContacts.length - 1;
          return (
            <View style={[styles.personRowSurface, index === 0 && styles.groupFirst, last && styles.groupLast]}>
              <ListRow
                accessibilityLabel={`${contact.displayName}. ${profile}. ${relationshipSummary}. ${memorySummary}.`}
                accessory="disclosure"
                {...(relationshipDetail ? { detail: relationshipDetail } : {})}
                last={last}
                leading={<Avatar name={contact.displayName} photoUri={contact.photoUri} size={44} />}
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: contact.id } })}
                subtitle={relationshipSummary}
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
  peopleHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  peopleHeadingStacked: { flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start" },
  emptyContainer: { marginTop: spacing.lg },
  emptyActions: { width: "100%", gap: spacing.sm },
  personRowSurface: { backgroundColor: colors.surface },
  groupFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
  groupLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
});
