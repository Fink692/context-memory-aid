import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AppStateStatus,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import type { SearchBarCommands } from "react-native-screens";
import type { ImportContact } from "@context/shared";
import type { ContactsPermissionResponse } from "expo-contacts";
import {
  AppText,
  Avatar,
  BarButton,
  Button,
  EmptyState,
  ErrorBanner,
  ListRow,
  ListSection,
  Screen,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import {
  getDeviceContactsPermission,
  loadAccessibleDeviceContacts,
  presentLimitedContactsPicker,
  requestDeviceContactsPermission,
  type AccessibleDeviceContacts,
} from "@/lib/device-contacts";
import { persistPrivateProfilePhoto } from "@/lib/profile-photo";
import { useAppStore } from "@/store/app-store";

function sourceId(contact: ImportContact): string {
  return contact.sourceId ?? "";
}

function contactMetadata(contact: ImportContact): string {
  const work = [contact.role, contact.company].filter(Boolean).join(" · ");
  const socials = contact.socialLinks?.map((link) => `${link.platform} ${link.handle ? `@${link.handle.replace(/^@/, "")}` : link.url ?? ""}`.trim()).join(" · ");
  return [work, contact.email, contact.phone, socials].filter(Boolean).join("\n") || "Name only";
}

export default function ContactsImportScreen() {
  const router = useRouter();
  const importContacts = useAppStore((state) => state.importContacts);
  const setHasSeenContactImportPrompt = useAppStore((state) => state.setHasSeenContactImportPrompt);
  const [permission, setPermission] = useState<ContactsPermissionResponse>();
  const [candidates, setCandidates] = useState<ImportContact[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [error, setError] = useState<string>();
  const [mappingSkipped, setMappingSkipped] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const requestId = useRef(0);
  const hasLoadedCandidates = useRef(false);
  const lastAppState = useRef<AppStateStatus>(AppState.currentState);
  const searchBarRef = useRef<SearchBarCommands | null>(null);

  const applyAccessibleContacts = useCallback((
    result: AccessibleDeviceContacts,
    accessPrivileges: ContactsPermissionResponse["accessPrivileges"],
    newlyGrantedIds: string[] = [],
  ) => {
    setCandidates(result.contacts);
    setMappingSkipped(result.skipped);
    setTruncated(result.truncated);
    const availableIds = new Set(result.contacts.map(sourceId));
    const preselectLimitedContacts = !hasLoadedCandidates.current && accessPrivileges === "limited";
    hasLoadedCandidates.current = true;
    setSelectedIds((current) => preselectLimitedContacts
      ? [...availableIds]
      : [...new Set([
          ...current.filter((id) => availableIds.has(id)),
          ...newlyGrantedIds.filter((id) => availableIds.has(id)),
        ])]);
  }, []);

  const loadGrantedContacts = useCallback(async (
    nextPermission: ContactsPermissionResponse,
    request: number,
    newlyGrantedIds: string[] = [],
  ) => {
    setLoadingContacts(true);
    try {
      const result = await loadAccessibleDeviceContacts();
      if (request !== requestId.current) return;
      applyAccessibleContacts(result, nextPermission.accessPrivileges, newlyGrantedIds);
    } finally {
      if (request === requestId.current) setLoadingContacts(false);
    }
  }, [applyAccessibleContacts]);

  const inspectPermission = useCallback(async () => {
    if (Platform.OS === "web") return;
    const request = ++requestId.current;
    setBusy(true);
    setError(undefined);
    try {
      const nextPermission = await getDeviceContactsPermission();
      if (request !== requestId.current) return;
      setPermission(nextPermission);
      if (nextPermission.granted) await loadGrantedContacts(nextPermission, request);
    } catch (caught) {
      if (request === requestId.current) {
        setError(caught instanceof Error ? caught.message : "Context could not inspect Contacts access.");
      }
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  }, [loadGrantedContacts]);

  useEffect(() => {
    setHasSeenContactImportPrompt(true);
    void inspectPermission();
    return () => { requestId.current += 1; };
  }, [inspectPermission, setHasSeenContactImportPrompt]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = lastAppState.current;
      lastAppState.current = nextState;
      if (previousState === "background" && nextState === "active") void inspectPermission();
    });
    return () => subscription.remove();
  }, [inspectPermission]);

  const requestAccess = useCallback(async () => {
    const request = ++requestId.current;
    setBusy(true);
    setError(undefined);
    try {
      const nextPermission = await requestDeviceContactsPermission();
      if (request !== requestId.current) return;
      setPermission(nextPermission);
      if (!nextPermission.granted) {
        setError("Contacts access was not granted. You can enable it in iPhone Settings or keep adding people manually.");
        return;
      }
      await loadGrantedContacts(nextPermission, request);
    } catch (caught) {
      if (request === requestId.current) {
        setError(caught instanceof Error ? caught.message : "Context could not open the Contacts permission sheet.");
      }
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  }, [loadGrantedContacts]);

  const chooseMore = useCallback(async () => {
    const request = ++requestId.current;
    setBusy(true);
    setError(undefined);
    try {
      const newlyGrantedIds = await presentLimitedContactsPicker();
      if (request !== requestId.current) return;
      const nextPermission = await getDeviceContactsPermission();
      if (request !== requestId.current) return;
      setPermission(nextPermission);
      if (nextPermission.granted) await loadGrantedContacts(nextPermission, request, newlyGrantedIds);
    } catch (caught) {
      if (request === requestId.current) {
        setError(caught instanceof Error ? caught.message : "Context could not open the limited Contacts picker.");
      }
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  }, [loadGrantedContacts]);

  const closeScreen = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace("/people");
  }, [router]);

  const onNativeSearchChange = useCallback((event: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setQuery(event.nativeEvent.text);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery("");
    searchBarRef.current?.clearText();
  }, []);

  const unavailable = Platform.OS === "web";
  const denied = permission?.status === "denied";
  const granted = Boolean(permission?.granted);
  const limitedAccess = permission?.accessPrivileges === "limited";
  const accessLabel = limitedAccess ? "Selected Contacts access" : "Contacts access";

  const headerOptions = useMemo(() => ({
    headerLeft: () => <BarButton onPress={closeScreen}>Cancel</BarButton>,
    ...(limitedAccess && Platform.OS === "ios" ? {
      headerRight: () => (
        <BarButton accessibilityLabel="Choose more iPhone contacts" loading={busy} onPress={() => { void chooseMore(); }}>More</BarButton>
      ),
    } : {}),
    ...(Platform.OS === "ios" && granted && !loadingContacts && candidates.length ? {
      headerSearchBarOptions: {
        autoCapitalize: "none" as const,
        hideWhenScrolling: false,
        onCancelButtonPress: clearSearch,
        onChangeText: onNativeSearchChange,
        placeholder: "Search Contacts",
        placement: "stacked" as const,
        ref: searchBarRef,
      },
    } : {}),
  }), [busy, candidates.length, chooseMore, clearSearch, closeScreen, granted, limitedAccess, loadingContacts, onNativeSearchChange]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleCandidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return candidates;
    return candidates.filter((contact) => [
      contact.displayName,
      contact.company,
      contact.role,
      contact.email,
      contact.phone,
      ...(contact.socialLinks ?? []).flatMap((link) => [link.platform, link.handle, link.url]),
    ]
      .filter(Boolean)
      .some((value) => value?.toLocaleLowerCase().includes(normalized)));
  }, [candidates, query]);

  const toggleContact = (contact: ImportContact) => {
    const id = sourceId(contact);
    if (!id) return;
    setSelectedIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  const selectVisible = () => {
    setSelectedIds((current) => [...new Set([...current, ...visibleCandidates.map(sourceId).filter(Boolean)])]);
  };

  const confirmImport = async () => {
    const selected = candidates.filter((contact) => selectedSet.has(sourceId(contact)));
    if (!selected.length) {
      setError("Choose at least one person to import.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const privateCopies = await Promise.all(selected.map(async (contact) => {
        const photoUri = await persistPrivateProfilePhoto(contact.photoUri);
        return photoUri ? { ...contact, photoUri } : contact;
      }));
      importContacts(privateCopies, null);
      setSelectedIds([]);
      router.dismissTo("/people");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Context could not finish importing the selected people.");
    } finally {
      setBusy(false);
    }
  };

  const importLabel = selectedIds.length === 1
    ? "Import 1 Person"
    : `Import ${selectedIds.length || "Selected"} People`;

  const listHeader = (
    <View style={styles.headerStack}>
      <ErrorBanner message={error} />

      {unavailable ? (
        <EmptyState
          action={<Button onPress={() => router.push({ pathname: "/contact/new", params: { global: "1" } })} symbol={symbols.plus}>Add Manually</Button>}
          body="System Contacts are available only in the native phone app."
          symbol={symbols.import}
          title="Open this on your phone"
        />
      ) : permission === undefined ? (
        <View accessibilityLiveRegion="polite" style={styles.loadingState}>
          <ActivityIndicator accessibilityLabel="Checking Contacts access" color={colors.primary} />
          <AppText role="callout" tone="secondary">Checking Contacts access…</AppText>
        </View>
      ) : !granted && denied ? (
        <EmptyState
          action={(
            <View style={styles.emptyActions}>
              <Button accessibilityLabel="Open iPhone Settings for Contacts access" onPress={() => { void Linking.openSettings(); }} symbol={symbols.settings}>Open Settings</Button>
              <Button onPress={() => router.push({ pathname: "/contact/new", params: { global: "1" } })} symbol={symbols.plus} variant="secondary">Add Manually</Button>
            </View>
          )}
          body="Enable Contacts access in iPhone Settings, or continue by adding someone manually."
          symbol={symbols.privacy}
          title="Contacts access is off"
        />
      ) : !granted ? (
        <View style={styles.permissionStage}>
          <AppText role="callout" tone="secondary">
            Choose the people you want to review. Nothing is copied until you confirm the import.
          </AppText>
          <ListSection footer="Context never modifies Contacts and does not silently sync changes later." title="What Context can copy">
            <ListRow
              subtitle="The selected person’s name, company, and job title"
              symbol={symbols.person}
              title="Relationship basics"
            />
            <ListRow
              subtitle="Available phone, email, social profiles, and profile thumbnail"
              symbol={symbols.import}
              title="Contact details"
            />
            <ListRow
              last
              subtitle="Contacts notes, birthdays, and postal addresses are never copied"
              symbol={symbols.shield}
              title="Private fields stay out"
            />
          </ListSection>
          <Button accessibilityLabel="Choose contacts from iPhone" loading={busy} onPress={() => { void requestAccess(); }} symbol={symbols.import}>Continue to Contacts</Button>
          <BarButton onPress={() => router.push({ pathname: "/contact/new", params: { global: "1" } })}>Add manually instead</BarButton>
        </View>
      ) : loadingContacts ? (
        <View accessibilityLiveRegion="polite" style={styles.loadingState}>
          <ActivityIndicator accessibilityLabel="Loading accessible contacts" color={colors.primary} />
          <AppText role="callout" tone="secondary">Loading the people you allowed…</AppText>
        </View>
      ) : candidates.length ? (
        <View style={styles.selectionHeader}>
          <View style={styles.selectionCopy}>
            <AppText emphasis="semibold" role="headline">{accessLabel}</AppText>
            <AppText accessibilityLiveRegion="polite" role="footnote" tone="secondary">
              {selectedIds.length.toLocaleString()} selected · {visibleCandidates.length.toLocaleString()} shown
            </AppText>
          </View>
          {Platform.OS !== "ios" ? (
            <TextField
              accessibilityLabel="Search accessible Contacts"
              autoCapitalize="none"
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              placeholder="Search name, company, or role"
              value={query}
            />
          ) : null}
          <View style={styles.selectionActions}>
            <BarButton onPress={selectVisible}>Select Shown</BarButton>
            <BarButton disabled={!selectedIds.length} onPress={() => setSelectedIds([])}>Clear Selection</BarButton>
          </View>
          {mappingSkipped ? (
            <AppText emphasis="medium" role="footnote" tone="warning">
              {mappingSkipped} contact {mappingSkipped === 1 ? "record was" : "records were"} omitted because no usable name was available.
            </AppText>
          ) : null}
          {truncated ? (
            <AppText emphasis="medium" role="footnote" tone="warning">
              The review is limited to the first 5,000 accessible contacts.
            </AppText>
          ) : null}
        </View>
      ) : (
        <EmptyState
          action={limitedAccess && Platform.OS === "ios"
            ? <Button accessibilityLabel="Choose more iPhone contacts" loading={busy} onPress={() => { void chooseMore(); }} symbol={symbols.import}>Choose Contacts</Button>
            : <Button onPress={() => router.push({ pathname: "/contact/new", params: { global: "1" } })} symbol={symbols.plus}>Add Manually</Button>}
          body={limitedAccess
            ? "Choose more people, then return here to review them."
            : "Your Contacts app does not contain a person with a usable name."}
          symbol={symbols.people}
          title="No accessible people"
        />
      )}
    </View>
  );

  const noSearchResults = granted && !loadingContacts && candidates.length && !visibleCandidates.length;

  return (
    <Screen contentContainerStyle={styles.screen} scroll={false}>
      <Stack.Screen options={headerOptions} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        enabled={Platform.OS !== "web"}
        style={styles.keyboardAvoiding}
      >
        <FlatList
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="automatic"
          data={granted && !loadingContacts ? visibleCandidates : []}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={sourceId}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={noSearchResults ? (
            <View style={styles.searchEmpty}>
              <EmptyState
                action={<Button onPress={clearSearch} variant="secondary">Clear Search</Button>}
                body={`No accessible contact matches “${query.trim()}”.`}
                symbol={symbols.people}
                title="No matches"
              />
            </View>
          ) : null}
          renderItem={({ item, index }) => {
            const selected = selectedSet.has(sourceId(item));
            const metadata = contactMetadata(item);
            const last = index === visibleCandidates.length - 1;
            return (
              <Pressable
                accessibilityHint="Double tap to include or exclude this person from the import"
                accessibilityLabel={`${item.displayName}. ${metadata}. ${selected ? "Selected" : "Not selected"}.`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => toggleContact(item)}
                style={({ pressed }) => [
                  styles.contactRowSurface,
                  index === 0 && styles.groupFirst,
                  last && styles.groupLast,
                  selected && styles.contactRowSelected,
                  pressed && styles.contactRowPressed,
                ]}
              >
                <ListRow
                  accessory={selected ? "checkmark" : "none"}
                  last={last}
                  leading={<Avatar name={item.displayName} photoUri={item.photoUri} size={42} />}
                  subtitle={metadata}
                  title={item.displayName}
                />
              </Pressable>
            );
          }}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
        {granted && !loadingContacts && candidates.length ? (
          <View style={styles.stickyAction}>
            <Button
              accessibilityLabel={`${importLabel} into the private People directory`}
              disabled={!selectedIds.length || busy}
              loading={busy}
              onPress={() => { void confirmImport(); }}
              symbol={symbols.import}
            >
              {importLabel}
            </Button>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: 0 },
  keyboardAvoiding: { flex: 1, width: "100%" },
  list: { flex: 1, width: "100%" },
  listContent: { flexGrow: 1, paddingBottom: spacing.lg },
  headerStack: { gap: spacing.lg, marginBottom: spacing.sm },
  permissionStage: { gap: spacing.lg },
  loadingState: { minHeight: 240, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyActions: { width: "100%", gap: spacing.sm },
  selectionHeader: { gap: spacing.md },
  selectionCopy: { gap: spacing.xxs },
  selectionActions: { minHeight: 44, flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm },
  searchEmpty: { marginTop: spacing.lg },
  contactRowSurface: { backgroundColor: colors.surface },
  contactRowSelected: { backgroundColor: colors.primarySoft },
  contactRowPressed: { backgroundColor: colors.fill },
  groupFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
  groupLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
  stickyAction: { backgroundColor: colors.canvas, paddingTop: spacing.sm, paddingBottom: spacing.sm },
});
