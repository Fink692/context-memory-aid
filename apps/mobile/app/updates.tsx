import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, Linking, Modal, Platform, StyleSheet, Switch, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { WatchSource, WatchSourceKind, WatchUpdate } from "@context/shared";
import {
  AppText,
  Avatar,
  BarButton,
  Button,
  EmptyState,
  ErrorBanner,
  FormField,
  IconButton,
  ListRow,
  ListSection,
  Screen,
  SuccessBanner,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { displayDate } from "@/lib/date";
import { fingerprint } from "@/lib/web-source-parser";
import {
  addWatchSource,
  checkWatchSources,
  dismissWatchUpdate,
  listWatchSources,
  listWatchUpdates,
  removeWatchSource,
  watcherHealth,
} from "@/lib/update-watcher";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function messageFrom(error: unknown): string {
  if (Platform.OS === "web" && error instanceof Error && /fetch|network request failed/i.test(error.message)) {
    return "The local watcher is not running. On this PC, run npm run dev:watcher and try again.";
  }
  return error instanceof Error ? error.message : "Update Watch could not complete that action.";
}

export default function UpdatesScreen() {
  const params = useLocalSearchParams<{ contactId?: string | string[] }>();
  const router = useRouter();
  const contacts = useAppStore((state) => state.contacts);
  const addMemory = useAppStore((state) => state.addMemory);
  const setUpdateWatchUsed = useAppStore((state) => state.setUpdateWatchUsed);
  const initialContactId = singleParam(params.contactId);
  const [contactId, setContactId] = useState(
    contacts.some((contact) => contact.id === initialContactId) ? initialContactId! : contacts[0]?.id ?? "",
  );
  const [sources, setSources] = useState<WatchSource[]>([]);
  const [updates, setUpdates] = useState<WatchUpdate[]>([]);
  const [serviceReady, setServiceReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("Public updates");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<WatchSourceKind>("rss");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [sourceSheetVisible, setSourceSheetVisible] = useState(false);
  const [personPickerVisible, setPersonPickerVisible] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const [reviewUpdate, setReviewUpdate] = useState<WatchUpdate>();
  const loadGeneration = useRef(0);
  const contact = contacts.find((item) => item.id === contactId);
  const deviceLabel = Platform.OS === "web" ? "this PC" : "this device";

  const sortedPeople = useMemo(
    () => [...contacts].sort((left, right) => left.displayName.localeCompare(right.displayName)
      || (left.company ?? "").localeCompare(right.company ?? "")),
    [contacts],
  );
  const visiblePeople = useMemo(() => {
    const normalized = personQuery.trim().toLocaleLowerCase();
    return sortedPeople.filter((item) => !normalized
      || [item.displayName, item.company, item.role]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalized)));
  }, [personQuery, sortedPeople]);

  useEffect(() => {
    if (contactId && contacts.some((item) => item.id === contactId)) return;
    const fallbackId = contacts[0]?.id ?? "";
    if (fallbackId !== contactId) setContactId(fallbackId);
  }, [contactId, contacts]);

  const load = useCallback(async () => {
    if (!contactId) {
      setSources([]);
      setUpdates([]);
      setServiceReady(false);
      return;
    }
    const generation = ++loadGeneration.current;
    setLoading(true);
    try {
      await watcherHealth();
      if (Platform.OS !== "web") await checkWatchSources(contactId, false);
      const [nextSources, nextUpdates] = await Promise.all([
        listWatchSources(contactId),
        listWatchUpdates(contactId),
      ]);
      if (generation !== loadGeneration.current) return;
      setSources(nextSources);
      setUpdates(nextUpdates);
      if (nextSources.length || nextUpdates.length) setUpdateWatchUsed(true);
      setServiceReady(true);
      setError(undefined);
    } catch (loadError) {
      if (generation !== loadGeneration.current) return;
      setServiceReady(false);
      setSources([]);
      setUpdates([]);
      setError(messageFrom(loadError));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [contactId, setUpdateWatchUsed]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setUrl("");
    setConfirmed(false);
    setSources([]);
    setUpdates([]);
    setServiceReady(false);
    setError(undefined);
    setSuccess(undefined);
    setReviewUpdate(undefined);
  }, [contactId]);
  useEffect(() => () => { loadGeneration.current += 1; }, []);
  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => subscription.remove();
  }, [load]);

  const searchQuery = useMemo(() => {
    if (!contact) return "";
    return `\"${contact.displayName}\" ${contact.company ?? ""} public profile news`;
  }, [contact]);
  const initialLoading = loading && !updates.length && !sources.length;

  const closePersonPicker = () => {
    setPersonPickerVisible(false);
    setPersonQuery("");
  };

  const selectPerson = (nextContactId: string) => {
    if (busy) return;
    setContactId(nextContactId);
    closePersonPicker();
  };

  const openSourceSheet = () => {
    setLabel("Public updates");
    setUrl("");
    setKind("rss");
    setConfirmed(false);
    setSuccess(undefined);
    if (serviceReady) setError(undefined);
    setSourceSheetVisible(true);
  };

  const closeSourceSheet = () => {
    setSourceSheetVisible(false);
    setLabel("Public updates");
    setUrl("");
    setKind("rss");
    setConfirmed(false);
  };

  const run = async (action: () => Promise<void>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await action();
      return true;
    } catch (actionError) {
      setError(messageFrom(actionError));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveSource = () => run(async () => {
    if (!contact) throw new Error("Choose a saved person first.");
    if (!confirmed) throw new Error("Confirm that this source belongs to the selected person.");
    await addWatchSource({ contactId: contact.id, contactName: contact.displayName, label, url, kind });
    setUpdateWatchUsed(true);
    setSuccess("Source added. New items will wait here for your review.");
    await load();
  });

  const submitSource = async () => {
    if (await saveSource()) closeSourceSheet();
  };

  const checkNow = () => run(async () => {
    const report = await checkWatchSources(contactId);
    await load();
    setSuccess(`Checked ${report.checked} source${report.checked === 1 ? "" : "s"}. Found ${report.discovered} new suggestion${report.discovered === 1 ? "" : "s"}; ${report.failed} need attention.`);
  });

  const saveUpdate = (update: WatchUpdate) => run(async () => {
    const summary = update.summary && update.summary !== update.title
      ? `${update.title}: ${update.summary}`.slice(0, 500)
      : update.title.slice(0, 500);
    const now = new Date().toISOString();
    const memoryId = `public-update-${fingerprint(update.sourceId, update.id)}`;
    const savedContact = contacts.find((item) => item.id === update.contactId);
    if (!savedContact) throw new Error("This saved person is no longer available.");
    const alreadySaved = savedContact.timeline.some((memory) => memory.id === memoryId);
    const sourceUrl = update.url ?? sources.find((source) => source.id === update.sourceId)?.url;
    if (!alreadySaved) {
      addMemory({
        id: memoryId,
        contactId: update.contactId,
        summary,
        tags: ["public-update", update.sourceLabel.toLowerCase().slice(0, 40)],
        nextSteps: [],
        source: "public-update",
        sourceLabel: update.sourceLabel,
        ...(sourceUrl ? { sourceUrl } : {}),
        occurredAt: update.publishedAt ?? update.discoveredAt,
        createdAt: now,
      });
    }
    try {
      await dismissWatchUpdate(update.id);
    } catch (dismissError) {
      throw new Error(`${alreadySaved ? "This update was already saved" : "The memory was saved"}, but the suggestion could not be cleared. Retrying is safe and will not create a duplicate. ${messageFrom(dismissError)}`);
    }
    await load();
    setSuccess(alreadySaved ? "The existing memory was kept and the duplicate suggestion was cleared." : "Update added to the relationship timeline.");
  });

  const saveReviewedUpdate = async () => {
    if (!reviewUpdate) return;
    if (await saveUpdate(reviewUpdate)) setReviewUpdate(undefined);
  };

  const dismissUpdate = async (update: WatchUpdate) => {
    const dismissed = await run(async () => {
      await dismissWatchUpdate(update.id);
      await load();
      setSuccess("Suggestion dismissed.");
    });
    if (dismissed) setReviewUpdate(undefined);
  };

  const confirmDismissUpdate = (update: WatchUpdate) => {
    Alert.alert(
      "Dismiss this suggestion?",
      "It will be removed from this review list and won’t be added to memory.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Dismiss", style: "destructive", onPress: () => { void dismissUpdate(update); } },
      ],
    );
  };

  const presentSourceActions = (source: WatchSource) => {
    Alert.alert(
      source.label,
      `${source.kind === "rss" ? "RSS / Atom" : "Public website"}\n${source.url}`,
      [
        { text: "Open Source", onPress: () => { void Linking.openURL(source.url); } },
        {
          text: "Remove Source",
          style: "destructive",
          onPress: () => {
            void run(async () => {
              await removeWatchSource(source.id);
              await load();
              setSuccess(`Source removed from ${deviceLabel}.`);
            });
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const listHeader = (
    <View style={styles.listHeader}>
      <ListSection title="Person">
        <ListRow
          accessory="disclosure"
          last
          leading={contact ? <Avatar name={contact.displayName} photoUri={contact.photoUri} size={44} /> : undefined}
          onPress={() => {
            setPersonQuery("");
            setPersonPickerVisible(true);
          }}
          subtitle={contact ? [contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship" : "Choose a saved person"}
          title={contact?.displayName ?? "No Person Selected"}
        />
      </ListSection>

      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {initialLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator accessibilityLabel="Loading Update Watch" color={colors.primary} />
          <AppText role="footnote" tone="secondary">Checking confirmed sources…</AppText>
        </View>
      ) : serviceReady && updates.length ? (
        <View style={styles.sectionIntro}>
          <AppText emphasis="semibold" role="footnote" tone="secondary">PENDING REVIEW · {updates.length}</AppText>
          <AppText role="footnote" tone="secondary">Nothing enters memory until you approve it.</AppText>
        </View>
      ) : serviceReady ? (
        <ListSection title="Pending Review">
          <ListRow
            last
            subtitle={sources.length ? "No confirmed source has a new item waiting." : "Add a source to begin watching for public updates."}
            symbol={symbols.checkCircle}
            title="You’re All Caught Up"
          />
        </ListSection>
      ) : null}
    </View>
  );

  const listFooter = initialLoading ? null : (
    <View style={styles.listFooter}>
      <ListSection
        footer={Platform.OS === "web"
          ? "The local PC watcher also checks due sources monthly."
          : "Due sources check when this screen opens or Context returns to the foreground."}
        title="Sources"
      >
        {sources.length ? (
          <>
            {sources.map((source) => {
              const metadata = [
                source.kind === "rss" ? "RSS / Atom" : "Public website",
                source.lastCheckedAt ? `Checked ${displayDate(source.lastCheckedAt)}` : "Not checked yet",
                source.lastError,
              ].filter(Boolean).join(" · ");
              return (
                <ListRow
                  accessory="disclosure"
                  key={source.id}
                  onPress={() => presentSourceActions(source)}
                  subtitle={metadata}
                  symbol={source.lastError ? symbols.warning : symbols.updates}
                  title={source.label}
                />
              );
            })}
            <ListRow
              accessoryNode={(
                <IconButton
                  accessibilityLabel="Check watched sources now"
                  disabled={!serviceReady}
                  loading={busy}
                  onPress={() => { void checkNow(); }}
                  symbol={symbols.restore}
                />
              )}
              last
              subtitle="Look for new items from every confirmed source"
              title="Check Now"
            />
          </>
        ) : (
          <ListRow
            accessory="disclosure"
            last
            onPress={openSourceSheet}
            subtitle="RSS feeds and public websites are supported"
            symbol={symbols.plus}
            title="Add a Source"
          />
        )}
      </ListSection>
    </View>
  );

  if (!contacts.length) {
    return (
      <>
        <Stack.Screen options={{ title: "Update Watch" }} />
        <Screen>
          <EmptyState
            action={<Button onPress={() => router.push({ pathname: "/contact/new", params: { global: "1" } })}>Add Person</Button>}
            body="Add a person before confirming public sources for them."
            symbol={symbols.people}
            title="No People Yet"
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Update Watch",
          headerRight: () => <BarButton disabled={!contact || busy} onPress={openSourceSheet}>Add</BarButton>,
        }}
      />
      <Screen contentContainerStyle={styles.screen} scroll={false}>
        <FlatList
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="automatic"
          data={updates}
          keyExtractor={(update) => update.id}
          ListFooterComponent={listFooter}
          ListHeaderComponent={listHeader}
          renderItem={({ item: update, index }) => {
            const first = index === 0;
            const last = index === updates.length - 1;
            const subtitle = [
              displayDate(update.publishedAt ?? update.discoveredAt),
              update.summary,
              `From ${update.sourceLabel}`,
            ].filter(Boolean).join("\n");
            return (
              <View style={[styles.groupedRow, first && styles.groupedRowFirst, last && styles.groupedRowLast]}>
                <ListRow
                  accessibilityLabel={`${update.title}. ${subtitle}. ${displayDate(update.publishedAt ?? update.discoveredAt)}`}
                  accessory="disclosure"
                  last={last}
                  onPress={() => setReviewUpdate(update)}
                  subtitle={subtitle}
                  title={update.title}
                />
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      </Screen>

      <Modal
        animationType="slide"
        onRequestClose={closePersonPicker}
        presentationStyle="pageSheet"
        visible={personPickerVisible}
      >
        <Screen contentContainerStyle={styles.sheetScreen} safeEdges={["top", "right", "bottom", "left"]} scroll={false}>
          <SheetHeader onClose={closePersonPicker} title="Choose Person" />
          <TextField
            accessibilityLabel="Search saved people"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            clearButtonMode="while-editing"
            editable={!busy}
            onChangeText={setPersonQuery}
            placeholder="Search name, company, or role"
            value={personQuery}
          />
          <AppText accessibilityLiveRegion="polite" role="footnote" tone="secondary">{visiblePeople.length.toLocaleString()} shown</AppText>
          <FlatList
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.personListContent}
            contentInsetAdjustmentBehavior="automatic"
            data={visiblePeople}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<EmptyState body="Try another name, company, or role." symbol={symbols.people} title="No Matching People" />}
            renderItem={({ item, index }) => {
              const selected = item.id === contactId;
              const first = index === 0;
              const last = index === visiblePeople.length - 1;
              const metadata = [item.role, item.company].filter(Boolean).join(" · ") || "Saved relationship";
              return (
                <View style={[styles.groupedRow, first && styles.groupedRowFirst, last && styles.groupedRowLast]}>
                  <ListRow
                    accessory={selected ? "checkmark" : "none"}
                    accessibilityLabel={`${item.displayName}. ${metadata}${selected ? ". Selected" : ""}`}
                    last={last}
                    leading={<Avatar name={item.displayName} photoUri={item.photoUri} size={40} />}
                    onPress={() => selectPerson(item.id)}
                    subtitle={metadata}
                    title={item.displayName}
                  />
                </View>
              );
            }}
            showsVerticalScrollIndicator={false}
            style={styles.personList}
          />
        </Screen>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={closeSourceSheet}
        presentationStyle="pageSheet"
        visible={sourceSheetVisible}
      >
        <Screen contentContainerStyle={styles.sheetScreen} safeEdges={["top", "right", "bottom", "left"]}>
          <SheetHeader
            onClose={closeSourceSheet}
            right={(
              <BarButton
                disabled={!serviceReady || !url.trim() || !confirmed || busy}
                loading={busy}
                onPress={() => { void submitSource(); }}
              >
                Add
              </BarButton>
            )}
            title="Add Source"
          />
          <ErrorBanner message={error} />

          <ListSection title="Person">
            <ListRow
              {...(contact ? {
                leading: <Avatar name={contact.displayName} photoUri={contact.photoUri} size={40} />,
                subtitle: [contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship",
              } : {})}
              last
              title={contact?.displayName ?? "No Person Selected"}
            />
          </ListSection>

          <Button
            disabled={busy || !contact}
            onPress={() => { void Linking.openURL(`https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}`); }}
            symbol={symbols.share}
            variant="secondary"
          >
            Search Public Web
          </Button>

          <ListSection title="Source Type">
            <ListRow
              accessory={kind === "rss" ? "checkmark" : "none"}
              onPress={() => setKind("rss")}
              subtitle="Best for reliable new-entry detection"
              title="RSS / Atom"
            />
            <ListRow
              accessory={kind === "website" ? "checkmark" : "none"}
              last
              onPress={() => setKind("website")}
              subtitle="Creates a baseline before suggesting changes"
              title="Public Website"
            />
          </ListSection>

          <ListSection groupStyle={styles.formGroup} title="Details">
            <View style={styles.formField}>
              <FormField
                accessibilityLabel="Source label"
                editable={!busy}
                label="Label"
                maxLength={120}
                onChangeText={setLabel}
                placeholder="Public updates"
                value={label}
              />
            </View>
            <View style={[styles.formField, styles.formFieldSeparated]}>
              <FormField
                accessibilityLabel="Public HTTPS source URL"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                keyboardType="url"
                label="HTTPS URL"
                maxLength={2048}
                onChangeText={setUrl}
                placeholder="https://example.com/feed.xml"
                value={url}
              />
            </View>
          </ListSection>

          <ListSection
            footer="Confirm the identity yourself. Nothing from a source becomes a memory until you approve it."
            title="Identity"
          >
            <ListRow
              accessoryNode={(
                <Switch
                  accessibilityLabel={`Confirm this source belongs to ${contact?.displayName ?? "the selected person"}`}
                  accessibilityState={{ checked: confirmed, disabled: busy }}
                  disabled={busy}
                  onValueChange={setConfirmed}
                  trackColor={{ false: colors.fillStrong, true: colors.primary }}
                  value={confirmed}
                />
              )}
              last
              subtitle="Prevents wrong-person updates from entering memory"
              title={`Belongs to ${contact?.displayName ?? "this person"}`}
            />
          </ListSection>

          <AppText role="footnote" tone="secondary">
            Use an official feed, personal site, company newsroom, public blog, or GitHub activity feed. Context does not bypass social-network access controls.
          </AppText>
        </Screen>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setReviewUpdate(undefined)}
        presentationStyle="pageSheet"
        visible={Boolean(reviewUpdate)}
      >
        <Screen contentContainerStyle={styles.sheetScreen} safeEdges={["top", "right", "bottom", "left"]}>
          <SheetHeader
            onClose={() => setReviewUpdate(undefined)}
            right={<BarButton loading={busy} onPress={() => { void saveReviewedUpdate(); }}>Save</BarButton>}
            title="Review Update"
          />
          <ErrorBanner message={error} />
          {reviewUpdate ? (
            <>
              <View style={styles.reviewHeader}>
                <AppText accessibilityRole="header" emphasis="semibold" role="title2">{reviewUpdate.title}</AppText>
                {reviewUpdate.summary ? <AppText tone="secondary">{reviewUpdate.summary}</AppText> : null}
                <AppText role="footnote" tone="secondary">Nothing is saved until you choose Save.</AppText>
              </View>

              <ListSection title="Details">
                <ListRow detail={displayDate(reviewUpdate.publishedAt ?? reviewUpdate.discoveredAt)} title="Published" />
                <ListRow detail={reviewUpdate.sourceLabel} last title="Source" />
              </ListSection>

              {reviewUpdate.url ? (
                <Button
                  onPress={() => { void Linking.openURL(reviewUpdate.url!); }}
                  symbol={symbols.share}
                  variant="secondary"
                >
                  Open Source
                </Button>
              ) : null}

              <ListSection title="More">
                <ListRow
                  destructive
                  last
                  onPress={() => confirmDismissUpdate(reviewUpdate)}
                  symbol={symbols.trash}
                  title="Dismiss Suggestion"
                />
              </ListSection>
            </>
          ) : null}
        </Screen>
      </Modal>
    </>
  );
}

function SheetHeader({
  onClose,
  right,
  title,
}: {
  onClose: () => void;
  right?: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.sheetHeader}>
      <BarButton onPress={onClose}>Cancel</BarButton>
      <AppText accessibilityRole="header" emphasis="semibold" role="headline" style={styles.sheetTitle}>{title}</AppText>
      {right ?? <View style={styles.headerSpacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: spacing.lg },
  list: { flex: 1, width: "100%" },
  listContent: { flexGrow: 1, paddingBottom: spacing.xxxl },
  listHeader: { gap: spacing.xl },
  listFooter: { marginTop: spacing.xl },
  sectionIntro: { gap: spacing.xxs, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  loadingRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  groupedRow: { overflow: "hidden", backgroundColor: colors.surface },
  groupedRowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous" },
  groupedRowLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous" },
  sheetScreen: { paddingBottom: spacing.xxxl },
  sheetHeader: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: -spacing.sm, marginBottom: spacing.sm },
  sheetTitle: { flex: 1, textAlign: "center" },
  headerSpacer: { width: 60, height: 44 },
  personList: { flex: 1, width: "100%" },
  personListContent: { flexGrow: 1, paddingBottom: spacing.xl },
  formGroup: { paddingHorizontal: spacing.lg },
  formField: { paddingVertical: spacing.sm },
  formFieldSeparated: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  reviewHeader: { gap: spacing.sm },
});
