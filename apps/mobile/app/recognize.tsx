import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Stack, useRouter } from "expo-router";
import { filterEventCandidates } from "@context/shared";
import {
  AppSymbol,
  AppText,
  Avatar,
  Button,
  EmptyState,
  ErrorBanner,
  Screen,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { contactIdFromQr } from "@/lib/badge-matcher";
import { relativeDate } from "@/lib/date";
import { useAppStore } from "@/store/app-store";

type AssistMode = "browse" | "scan";

export default function RecognizeScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<AssistMode>("browse");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();
  const [qrLocked, setQrLocked] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === "active");
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contacts = useAppStore((state) => state.contacts);
  const event = useAppStore((state) => state.events.find((item) => item.id === state.currentEventId));

  const attendees = useMemo(() => {
    if (!event) return [];
    return event.attendeeContactIds
      .map((id) => contacts.find((contact) => contact.id === id))
      .filter((contact) => contact !== undefined);
  }, [contacts, event]);
  const quickMatchCandidates = useMemo(
    () => event ? filterEventCandidates(contacts, event) : [],
    [contacts, event],
  );
  const visibleAttendees = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const visible = !normalized
      ? attendees
      : attendees.filter((contact) => [contact.displayName, contact.company, contact.role, contact.lastDiscussed]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(normalized)));
    return [...visible].sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [attendees, query]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppIsActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => () => {
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
  }, []);

  const openContact = (contactId: string, matched = false) => {
    router.replace({
      pathname: "/contact/[id]",
      params: { id: contactId, ...(matched ? { recognized: "1" } : {}) },
    });
  };

  const pauseAfterRejectedBadge = () => {
    setQrLocked(true);
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    unlockTimer.current = setTimeout(() => {
      setQrLocked(false);
      unlockTimer.current = undefined;
    }, 1_400);
  };

  const onBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (qrLocked) return;
    const contactId = contactIdFromQr(data, quickMatchCandidates);
    if (!contactId) {
      pauseAfterRejectedBadge();
      setError("That badge is not enabled for this event.");
      return;
    }
    setQrLocked(true);
    openContact(contactId, true);
  };

  const selectMode = (nextMode: AssistMode) => {
    if (unlockTimer.current) {
      clearTimeout(unlockTimer.current);
      unlockTimer.current = undefined;
    }
    setMode(nextMode);
    setError(undefined);
    setQrLocked(false);
    if (nextMode === "scan") {
      setQuery("");
      setCameraFailed(false);
    }
  };

  if (!event) {
    return (
      <>
        <Stack.Screen options={{ title: "Event Assistant" }} />
        <Screen>
          <EmptyState
            action={<Button onPress={() => router.replace("/events")} symbol={symbols.plus}>Create Event</Button>}
            body="Choose an active event before browsing or scanning."
            symbol={symbols.events}
            title="No active event"
          />
        </Screen>
      </>
    );
  }

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.eventSummary}>
        <View style={styles.flex}>
          <AppText emphasis="semibold" role="headline">{event.name}</AppText>
          <AppText role="footnote" tone="secondary">{attendees.length} people in this event</AppText>
        </View>
        <AppSymbol name={symbols.events} size={22} tone="tint" weight="semibold" />
      </View>

      <View accessibilityRole="tablist" style={styles.segmented}>
        <ModeButton active={mode === "browse"} label="Browse" onPress={() => selectMode("browse")} symbol={symbols.people} />
        <ModeButton active={mode === "scan"} label="Scan Badge" onPress={() => selectMode("scan")} symbol={symbols.scan} />
      </View>

      <AppText role="footnote" tone="secondary">
        Only people saved in this event are in scope; badge camera frames are never saved.
      </AppText>

      <ErrorBanner message={error} />

      {mode === "browse" ? (
        <View style={styles.browseHeader}>
          {Platform.OS !== "ios" && attendees.length ? (
            <TextField
              accessibilityLabel="Search this event"
              autoCapitalize="none"
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              placeholder="Search people"
              value={query}
            />
          ) : null}
          <AppText accessibilityRole="header" emphasis="semibold" role="title3">
            People
          </AppText>
        </View>
      ) : (
        <View style={[styles.scanStage, { height: Math.max(420, Math.min(620, height * 0.62)) }]}>
          {!permission ? (
            <ScanMessage
              body="Checking camera access…"
              symbol={symbols.camera}
              title="Preparing scanner"
            >
              <ActivityIndicator accessibilityLabel="Checking camera access" color={colors.onDark} />
            </ScanMessage>
          ) : !permission.granted ? (
            <ScanMessage
              body={permission.canAskAgain
                ? "Allow camera access only while you scan a Context badge."
                : "Enable camera access in iPhone Settings, then return here."}
              symbol={symbols.camera}
              title="Camera access is off"
            >
              <Button
                onPress={permission.canAskAgain ? () => { void requestPermission(); } : () => { void Linking.openSettings(); }}
                variant="inverse"
              >
                {permission.canAskAgain ? "Allow Camera" : "Open Settings"}
              </Button>
            </ScanMessage>
          ) : cameraFailed ? (
            <ScanMessage
              body="The camera could not start. No frame was saved."
              symbol={symbols.warning}
              title="Camera unavailable"
            >
              <Button onPress={() => selectMode("browse")} variant="inverse">Browse People</Button>
            </ScanMessage>
          ) : !quickMatchCandidates.length ? (
            <ScanMessage
              body="Enable Quick Badge Matching from a person’s profile first."
              symbol={symbols.scan}
              title="No scannable people"
            >
              <Button onPress={() => selectMode("browse")} variant="inverse">Browse People</Button>
            </ScanMessage>
          ) : (
            <>
              <CameraView
                active={mode === "scan" && appIsActive && !qrLocked}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                facing="back"
                onBarcodeScanned={onBarcodeScanned}
                onMountError={() => {
                  setCameraFailed(true);
                  setError("The camera could not start.");
                }}
                style={styles.camera}
              />
              <View accessibilityElementsHidden pointerEvents="none" style={styles.guide}>
                <View style={styles.guideFrame} />
                <View style={styles.scanCaption}>
                  <AppSymbol name={symbols.scan} size={17} tone="onTint" weight="semibold" />
                  <AppText emphasis="semibold" role="footnote" tone="onTint">Center a Context badge</AppText>
                </View>
              </View>
              {!appIsActive ? (
                <View style={styles.pausedOverlay}>
                  <AppText emphasis="semibold" role="headline" tone="onTint">Scanner paused</AppText>
                </View>
              ) : null}
            </>
          )}
        </View>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Event Assistant",
          ...(Platform.OS === "ios" && mode === "browse" && attendees.length
            ? {
                headerSearchBarOptions: {
                  autoCapitalize: "none" as const,
                  hideWhenScrolling: false,
                  onCancelButtonPress: () => setQuery(""),
                  onChangeText: (searchEvent) => setQuery(searchEvent.nativeEvent.text),
                  placeholder: "Search This Event",
                  placement: "stacked" as const,
                },
              }
            : {}),
        }}
      />
      <Screen contentContainerStyle={styles.screen} scroll={false}>
        <FlatList
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="automatic"
          data={mode === "browse" ? visibleAttendees : []}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(contact) => contact.id}
          ListEmptyComponent={mode === "browse" ? (
            <EmptyState
              action={attendees.length
                ? <Button onPress={() => setQuery("")} variant="secondary">Clear Search</Button>
                : <Button onPress={() => router.push({ pathname: "/contact/new", params: { eventId: event.id } })} symbol={symbols.plus}>Add Person</Button>}
              body={attendees.length ? "Try another name, company, or role." : "Add people to this event before using the assistant."}
              symbol={symbols.people}
              title={attendees.length ? "No matches" : "No people in this event"}
            />
          ) : null}
          ListHeaderComponent={listHeader}
          renderItem={({ item: contact, index }) => {
            const metadata = [contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship";
            const lastSpoke = relativeDate(contact.lastSpokeAt) ?? "not recorded";
            const last = index === visibleAttendees.length - 1;
            return (
              <View style={[styles.personRowShell, index === 0 && styles.personRowFirst, last && styles.personRowLast, !last && styles.personRowSeparated]}>
                <Pressable
                  accessibilityHint="Opens this relationship refresher"
                  accessibilityLabel={`${contact.displayName}. ${metadata}. Last spoke ${lastSpoke}.`}
                  accessibilityRole="button"
                  onPress={() => openContact(contact.id)}
                  style={({ pressed }) => [styles.personRow, pressed && styles.rowPressed]}
                >
                  <Avatar name={contact.displayName} photoUri={contact.photoUri} size={44} />
                  <View style={styles.personCopy}>
                    <AppText emphasis="medium" role="body">{contact.displayName}</AppText>
                    <AppText role="subheadline" tone="secondary">{metadata}</AppText>
                    <AppText role="footnote" tone="secondary">Last spoke {lastSpoke}</AppText>
                  </View>
                  <AppSymbol name={symbols.chevron} size={16} tone="tertiary" weight="semibold" />
                </Pressable>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      </Screen>
    </>
  );
}

function ModeButton({
  active,
  label,
  onPress,
  symbol,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  symbol: Parameters<typeof AppSymbol>[0]["name"];
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && styles.segmentPressed]}
    >
      <AppSymbol name={symbol} size={17} tone={active ? "primary" : "secondary"} weight="semibold" />
      <AppText emphasis="semibold" role="subheadline" tone={active ? "primary" : "secondary"}>{label}</AppText>
    </Pressable>
  );
}

function ScanMessage({
  body,
  children,
  symbol,
  title,
}: {
  body: string;
  children?: ReactNode;
  symbol: Parameters<typeof AppSymbol>[0]["name"];
  title: string;
}) {
  return (
    <View style={styles.scanMessage}>
      <AppSymbol name={symbol} size={36} tone="onTint" weight="semibold" />
      <AppText accessibilityRole="header" emphasis="semibold" role="title3" tone="onTint">{title}</AppText>
      <AppText role="callout" style={styles.scanMessageBody}>{body}</AppText>
      {children ? <View style={styles.scanMessageAction}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  list: { flex: 1, width: "100%" },
  listContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  listHeader: { gap: spacing.lg, marginBottom: spacing.lg },
  flex: { flex: 1, minWidth: 0 },
  eventSummary: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xs },
  segmented: { flexDirection: "row", borderRadius: radius.md, borderCurve: "continuous", backgroundColor: colors.fill, padding: spacing.xs },
  segment: { minHeight: 44, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.sm, borderCurve: "continuous", paddingHorizontal: spacing.sm },
  segmentActive: { backgroundColor: colors.surface },
  segmentPressed: { opacity: 0.68 },
  browseHeader: { gap: spacing.lg },
  personRowShell: { overflow: "hidden", backgroundColor: colors.surface },
  personRowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous" },
  personRowLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous" },
  personRowSeparated: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  personRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  personCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  rowPressed: { backgroundColor: colors.fill },
  scanStage: { marginHorizontal: -spacing.lg, overflow: "hidden", backgroundColor: colors.black },
  camera: { flex: 1 },
  guide: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: spacing.xl },
  guideFrame: { width: "66%", maxWidth: 340, aspectRatio: 1, borderColor: "rgba(255,255,255,0.92)", borderWidth: 2, borderRadius: radius.feature, borderCurve: "continuous" },
  scanCaption: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.64)", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  pausedOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.72)" },
  scanMessage: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  scanMessageBody: { maxWidth: 360, color: colors.onDarkMuted, textAlign: "center" },
  scanMessageAction: { width: "100%", maxWidth: 320, marginTop: spacing.md },
});
