import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Linking,
  StyleSheet,
  Switch,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Stack, useRouter } from "expo-router";
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
  SuccessBanner,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { createContactFromShare, parseContactShareVCard } from "@/lib/contact-share";
import {
  ContactShareReceiveError,
  blockedIdentifierFieldsForMatch,
  contactShareIdentifierEvidence,
  contactShareConflictRows,
  contactShareUpdates,
  findContactShareMatches,
  type ContactShareConflictField,
  type ContactShareIdentifierField,
} from "@/lib/contact-share-receive";
import { createContactId } from "@/lib/entity-id";
import { useAppStore } from "@/store/app-store";

type ReceivedCard = ReturnType<typeof parseContactShareVCard>;
type SaveResultKind = "added" | "updated" | "unchanged";

export default function ReceiveContactScreen() {
  const router = useRouter();
  const { fontScale, height, width } = useWindowDimensions();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const contacts = useAppStore((state) => state.contacts);
  const addContact = useAppStore((state) => state.addContact);
  const updateContact = useAppStore((state) => state.updateContact);
  const [scannerStarted, setScannerStarted] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === "active");
  const [scanLocked, setScanLocked] = useState(false);
  const [receivedCard, setReceivedCard] = useState<ReceivedCard>();
  const [selectedMatchId, setSelectedMatchId] = useState<string>();
  const [useReceivedFields, setUseReceivedFields] = useState<Set<ContactShareConflictField>>(() => new Set());
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [permissionFailure, setPermissionFailure] = useState<string>();
  const [cameraFailure, setCameraFailure] = useState<string>();
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraReadyAnnounced, setCameraReadyAnnounced] = useState(false);
  const [success, setSuccess] = useState<{ kind: SaveResultKind; message: string; contactId: string }>();
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const matches = useMemo(
    () => receivedCard ? findContactShareMatches(contacts, receivedCard) : [],
    [contacts, receivedCard],
  );
  const identifierEvidence = useMemo(
    () => receivedCard
      ? contactShareIdentifierEvidence(contacts, receivedCard)
      : { emailContactIds: [], phoneContactIds: [], conflicting: false },
    [contacts, receivedCard],
  );
  const selectedMatch = useMemo(
    () => contacts.find((contact) => contact.id === selectedMatchId),
    [contacts, selectedMatchId],
  );
  const blockedIdentifiers = useMemo(
    () => selectedMatch
      ? blockedIdentifierFieldsForMatch(identifierEvidence, selectedMatch.id)
      : new Set<ContactShareIdentifierField>(),
    [identifierEvidence, selectedMatch],
  );
  const conflicts = useMemo(
    () => selectedMatch && receivedCard ? contactShareConflictRows(selectedMatch, receivedCard) : [],
    [receivedCard, selectedMatch],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      setAppIsActive(active);
      if (active) {
        void getPermission().then((nextPermission) => {
          if (nextPermission.granted) setError(undefined);
        }).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [getPermission]);

  useEffect(() => () => {
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
  }, []);

  useEffect(() => {
    setSelectedMatchId(matches.length === 1 ? matches[0]?.id : undefined);
    setUseReceivedFields(new Set());
  }, [receivedCard]);

  const close = () => {
    if (saveBusy) return;
    if (router.canGoBack()) router.back();
    else router.replace("/people");
  };

  const startScanner = async () => {
    if (permissionBusy) return;
    setPermissionBusy(true);
    setError(undefined);
    setPermissionFailure(undefined);
    try {
      const nextPermission = permission?.granted ? permission : await requestPermission();
      setScannerStarted(true);
      if (!nextPermission.granted) {
        setError("Camera access is off. Nothing was scanned or saved.");
      } else {
        setCameraFailure(undefined);
      }
    } catch {
      setScannerStarted(false);
      setPermissionFailure("Context could not request camera access. Nothing was scanned or saved. Try again.");
    } finally {
      setPermissionBusy(false);
    }
  };

  const unlockAfterRejectedCode = () => {
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    unlockTimer.current = setTimeout(() => {
      setScanLocked(false);
      unlockTimer.current = undefined;
    }, 1_400);
  };

  const onBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanLocked) return;
    setScanLocked(true);
    setError(undefined);
    try {
      const parsed = parseContactShareVCard(data);
      setReceivedCard(parsed);
      setScannerStarted(false);
      void AccessibilityInfo.announceForAccessibility(`Contact card for ${parsed.displayName} scanned. Review before saving.`);
    } catch {
      setError("That QR code is not a supported single contact card. Try another code.");
      unlockAfterRejectedCode();
    }
  };

  const resetScanner = () => {
    setReceivedCard(undefined);
    setSuccess(undefined);
    setSelectedMatchId(undefined);
    setUseReceivedFields(new Set());
    setScanLocked(false);
    setScannerStarted(Boolean(permission?.granted));
    setCameraFailure(undefined);
    setCameraReadyAnnounced(false);
    setError(undefined);
  };

  const saveNew = async () => {
    if (!receivedCard || saveBusy) return;
    setSaveBusy(true);
    setError(undefined);
    try {
      const id = createContactId(receivedCard.displayName);
      await addContact(createContactFromShare(receivedCard, id), null);
      setSuccess({ kind: "added", message: `${receivedCard.displayName}’s contact details were added.`, contactId: id });
    } catch {
      setError("Context could not add this person. The scanned card is still here so you can try again.");
    } finally {
      setSaveBusy(false);
    }
  };

  const updateExisting = async () => {
    if (!receivedCard || !selectedMatch || saveBusy) return;
    setSaveBusy(true);
    setError(undefined);
    try {
      const updates = contactShareUpdates(
        selectedMatch,
        receivedCard,
        useReceivedFields,
        blockedIdentifiers,
      );
      const changed = Object.keys(updates).length > 0;
      if (changed) await updateContact(selectedMatch.id, updates);
      const savedDisplayName = updates.displayName ?? selectedMatch.displayName;
      setSuccess({
        kind: changed ? "updated" : "unchanged",
        message: changed
          ? `${savedDisplayName}’s contact details were updated. Memories and relationship context were kept.`
          : `${selectedMatch.displayName}’s saved contact details are already up to date.`,
        contactId: selectedMatch.id,
      });
    } catch (caught) {
      setError(caught instanceof ContactShareReceiveError
        ? caught.message
        : "Context could not update this person. The scanned card is still here so you can try again.");
    } finally {
      setSaveBusy(false);
    }
  };

  const toggleConflict = (field: ContactShareConflictField) => {
    setUseReceivedFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  if (success) {
    const unchanged = success.kind === "unchanged";
    const resultTitle = unchanged ? "Already Current" : "Contact Saved";
    const emptyTitle = unchanged
      ? "Already up to date"
      : success.kind === "added" ? "Saved to People" : "Updated in People";
    const resultBody = unchanged
      ? "Nothing needed to change. Your existing memories, events, and relationship notes remain private and untouched."
      : "Only the received contact details were saved. No memories, events, or relationship notes came with the card.";
    return (
      <>
        <Stack.Screen options={{
          title: resultTitle,
          headerLeft: () => <BarButton onPress={() => router.dismissTo("/people")}>Done</BarButton>,
        }} />
        <Screen contentContainerStyle={styles.screen}>
          <SuccessBanner message={success.message} />
          <EmptyState
            action={(
              <View style={styles.actions}>
                <Button
                  onPress={() => router.replace({ pathname: "/contact/[id]", params: { id: success.contactId } })}
                  symbol={symbols.person}
                >
                  View Person
                </Button>
                <Button onPress={resetScanner} symbol={symbols.scan} variant="secondary">Scan Another</Button>
              </View>
            )}
            body={resultBody}
            symbol={symbols.checkCircle}
            title={emptyTitle}
          />
        </Screen>
      </>
    );
  }

  if (receivedCard) {
    const receivedRows = [
      { label: "Company", value: receivedCard.company },
      { label: "Role", value: receivedCard.role },
      { label: "Email", value: receivedCard.email },
      { label: "Phone", value: receivedCard.phone },
    ].filter((row): row is { label: string; value: string } => Boolean(row.value));

    return (
      <>
        <Stack.Screen options={{
          title: "Review Person",
          headerLeft: () => <BarButton disabled={saveBusy} onPress={close}>Cancel</BarButton>,
          gestureEnabled: !saveBusy,
        }} />
        <Screen contentContainerStyle={styles.screen} pointerEvents={saveBusy ? "none" : "auto"}>
          <View style={styles.identity}>
            <Avatar name={receivedCard.displayName} size={72} />
            <View style={styles.identityCopy}>
              <AppText accessibilityRole="header" emphasis="semibold" role="title2">{receivedCard.displayName}</AppText>
              <AppText role="callout" tone="secondary">Review these received contact details before saving.</AppText>
            </View>
          </View>

          <ListSection footer="Unsupported vCard fields are ignored. Embedded links are never opened automatically." title="Received">
            <ListRow last={!receivedRows.length && !receivedCard.socialLinks?.length} subtitle={receivedCard.displayName} title="Name" />
            {receivedRows.map((row, index) => (
              <ListRow
                key={row.label}
                last={index === receivedRows.length - 1 && !receivedCard.socialLinks?.length}
                subtitle={row.value}
                title={row.label}
              />
            ))}
            {(receivedCard.socialLinks ?? []).map((link, index) => (
              <ListRow
                key={`${link.platform}-${link.url}-${index}`}
                last={index === receivedCard.socialLinks!.length - 1}
                subtitle={link.url}
                title={link.platform}
              />
            ))}
          </ListSection>

          {identifierEvidence.conflicting ? (
            <View accessibilityRole="alert" style={styles.identityWarning}>
              <AppText emphasis="semibold" role="headline" tone="warning">Email and phone point to different people</AppText>
              <AppText role="footnote" tone="secondary">
                Choose which saved person to update. Context will not copy an identifier already owned by the other match or create a new duplicate.
              </AppText>
            </View>
          ) : null}

          {matches.length ? (
            <ListSection
              footer={identifierEvidence.conflicting
                ? "Choose the correct saved person. Conflicting identifiers stay with their current owners."
                : "Choose a possible match to update it, or save this card as a separate person. Nothing is merged automatically."}
              title={matches.length === 1 ? "Possible Match" : "Possible Matches"}
            >
              {matches.map((match, index) => (
                <ListRow
                  accessory={selectedMatchId === match.id ? "checkmark" : "none"}
                  key={match.id}
                  last={index === matches.length - 1}
                  leading={<Avatar name={match.displayName} photoUri={match.photoUri} size={42} />}
                  onPress={() => {
                    setSelectedMatchId(match.id);
                    setUseReceivedFields(new Set());
                  }}
                  selected={selectedMatchId === match.id}
                  subtitle={[match.role, match.company, match.email, match.phone].filter(Boolean).join(" · ") || "Saved person"}
                  title={match.displayName}
                />
              ))}
            </ListSection>
          ) : null}

          {selectedMatch && conflicts.length ? (
            <ListSection footer="Current details stay unless you turn on Use Received. Received social profiles replace only the same networks; other saved profiles stay. Private Context data is always preserved." title="Conflicting Details">
              {conflicts.map((conflict, index) => {
                const blocked = (conflict.field === "email" || conflict.field === "phone")
                  && blockedIdentifiers.has(conflict.field);
                const selected = !blocked && useReceivedFields.has(conflict.field);
                return (
                  <ListRow
                    accessoryNode={(
                      <Switch
                        accessibilityLabel={`Use received ${conflict.label}`}
                        accessibilityHint={blocked
                          ? "This identifier belongs to another saved person and cannot be copied"
                          : "Current details stay when this switch is off"}
                        disabled={blocked}
                        onValueChange={() => toggleConflict(conflict.field)}
                        trackColor={{ false: colors.fillStrong as string, true: colors.primaryFill as string }}
                        value={selected}
                      />
                    )}
                    key={conflict.field}
                    last={index === conflicts.length - 1}
                    subtitle={blocked
                      ? `Current: ${conflict.current}\nReceived: ${conflict.received}\nKept current — the received ${conflict.label.toLocaleLowerCase()} belongs to another saved person.`
                      : `Current: ${conflict.current}\nReceived: ${conflict.received}`}
                    title={conflict.label}
                  />
                );
              })}
            </ListSection>
          ) : null}

          <ErrorBanner message={error} />
          {selectedMatch ? (
            <Button loading={saveBusy} onPress={() => { void updateExisting(); }} symbol={symbols.checkCircle}>Update Existing</Button>
          ) : !matches.length ? (
            <Button loading={saveBusy} onPress={() => { void saveNew(); }} symbol={symbols.import}>Add to People</Button>
          ) : null}
          {matches.length && !identifierEvidence.conflicting ? (
            <Button disabled={saveBusy} onPress={() => { void saveNew(); }} symbol={symbols.plus} variant="secondary">Save as New Person</Button>
          ) : null}
          <Button disabled={saveBusy} onPress={resetScanner} variant="quiet">Scan Again</Button>
        </Screen>
      </>
    );
  }

  const cameraGranted = Boolean(permission?.granted);
  const permissionDenied = scannerStarted && permission && !permission.granted;
  const scannerLandscape = width > height;
  const compactLandscapeInstructions = scannerLandscape && fontScale >= 1.8;
  const guideSize = scannerLandscape
    ? Math.max(112, Math.min(
      compactLandscapeInstructions ? 220 : 280,
      width * (compactLandscapeInstructions ? 0.3 : 0.34),
      height * (compactLandscapeInstructions ? 0.44 : 0.54),
    ))
    : Math.max(156, Math.min(340, width * 0.74, height * 0.48));

  const retryCamera = () => {
    setCameraFailure(undefined);
    setError(undefined);
    setScanLocked(false);
    setCameraReadyAnnounced(false);
    setCameraAttempt((attempt) => attempt + 1);
  };

  return (
    <>
      <Stack.Screen options={{
        title: "Scan Contact",
        headerLeft: () => <BarButton onPress={close}>Cancel</BarButton>,
      }} />
      {!scannerStarted ? (
        <Screen contentContainerStyle={styles.permissionScreen}>
          <ErrorBanner message={permissionFailure} />
          <EmptyState
            action={(
              <Button loading={permissionBusy} onPress={() => { void startScanner(); }} symbol={symbols.camera}>
                {permissionFailure ? "Try Camera Again" : "Continue"}
              </Button>
            )}
            body="Context uses the camera only while this scanner is open. Video stays on this iPhone and is not saved."
            symbol={symbols.scan}
            title="Scan a Contact QR"
          />
          <AppText role="footnote" style={styles.centerText} tone="secondary">
            Scanning and review work offline. Nothing is added until you confirm it.
          </AppText>
        </Screen>
      ) : permissionDenied ? (
        <Screen contentContainerStyle={styles.permissionScreen}>
          <ErrorBanner message={error} />
          <EmptyState
            action={(
              <Button
                onPress={permission.canAskAgain ? () => { void startScanner(); } : () => { void Linking.openSettings(); }}
                symbol={symbols.settings}
              >
                {permission.canAskAgain ? "Try Camera Again" : "Open Settings"}
              </Button>
            )}
            body={permission.canAskAgain
              ? "Allow camera access only while you scan a contact card."
              : "Enable Camera for Context in iPhone Settings, then return here."}
            symbol={symbols.camera}
            title="Camera access is off"
          />
        </Screen>
      ) : cameraGranted && cameraFailure ? (
        <Screen contentContainerStyle={styles.permissionScreen}>
          <ErrorBanner message={cameraFailure} />
          <EmptyState
            action={<Button onPress={retryCamera} symbol={symbols.camera}>Try Camera Again</Button>}
            body="Nothing was scanned or saved. You can retry without leaving this screen."
            symbol={symbols.warning}
            title="Camera could not start"
          />
        </Screen>
      ) : cameraGranted ? (
        <SafeAreaView edges={["right", "bottom", "left"]} style={styles.scannerScreen}>
          <CameraView
            active={appIsActive && !scanLocked}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            facing="back"
            key={cameraAttempt}
            onBarcodeScanned={onBarcodeScanned}
            onCameraReady={() => {
              if (cameraReadyAnnounced) return;
              setCameraReadyAnnounced(true);
              void AccessibilityInfo.announceForAccessibility("Camera ready. Center a contact QR code in the frame.");
            }}
            onMountError={() => {
              const message = "The camera could not start. Nothing was scanned or saved.";
              setCameraFailure(message);
              setError(undefined);
            }}
            style={styles.camera}
          />
          <View
            pointerEvents="none"
            style={[
              styles.guide,
              scannerLandscape && styles.guideLandscape,
              compactLandscapeInstructions && styles.guideLandscapeLargeText,
            ]}
          >
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.guideFrame, { width: guideSize, height: guideSize }]} />
            <View
              accessibilityLabel="Center a contact QR. Only one contact card is read. Camera video is never saved."
              accessible
              style={[
                styles.scanCaption,
                scannerLandscape && styles.scanCaptionLandscape,
                compactLandscapeInstructions && styles.scanCaptionLandscapeLargeText,
              ]}
            >
              <AppText emphasis="semibold" role="headline" tone="onTint">
                {compactLandscapeInstructions ? "Center QR" : "Center a contact QR"}
              </AppText>
              <AppText role="footnote" style={styles.scanCaptionDetail}>
                {compactLandscapeInstructions ? "Video isn’t saved." : "Only one vCard is read. Video is never saved."}
              </AppText>
            </View>
          </View>
          {error ? <View style={styles.scannerError}><ErrorBanner message={error} /></View> : null}
          {!appIsActive ? (
            <View style={styles.pausedOverlay}>
              <ActivityIndicator color={colors.onDark} />
              <AppText emphasis="semibold" role="headline" tone="onTint">Scanner paused</AppText>
            </View>
          ) : null}
        </SafeAreaView>
      ) : (
        <Screen contentContainerStyle={styles.permissionScreen}>
          <ActivityIndicator accessibilityLabel="Preparing camera" color={colors.primary} />
        </Screen>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl, gap: spacing.xl },
  permissionScreen: { flexGrow: 1, justifyContent: "center", gap: spacing.xl },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.xs },
  identityCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  actions: { width: "100%", gap: spacing.sm },
  identityWarning: { gap: spacing.xs, borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.warningSoft, padding: spacing.lg },
  centerText: { maxWidth: 380, alignSelf: "center", textAlign: "center" },
  scannerScreen: { flex: 1, backgroundColor: colors.black },
  camera: { flex: 1 },
  guide: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: spacing.xl, padding: spacing.xl },
  guideLandscape: { flexDirection: "row" },
  guideLandscapeLargeText: { gap: spacing.md, padding: spacing.md },
  guideFrame: { borderColor: "rgba(255,255,255,0.96)", borderWidth: 3, borderRadius: radius.feature, borderCurve: "continuous" },
  scanCaption: { maxWidth: 360, alignItems: "center", gap: spacing.xs, borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  scanCaptionLandscape: { maxWidth: 320, flexShrink: 1 },
  scanCaptionLandscapeLargeText: { maxWidth: 260, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  scanCaptionDetail: { color: colors.onDarkMuted, textAlign: "center" },
  scannerError: { position: "absolute", right: spacing.lg, bottom: spacing.xl, left: spacing.lg },
  pausedOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: "rgba(0,0,0,0.76)" },
});
