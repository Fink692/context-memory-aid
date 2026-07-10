import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRouter } from "expo-router";
import { filterEventCandidates } from "@context/shared";
import { Avatar, Body, Button, Card, EmptyState, ErrorBanner, Pill, Screen, SectionHeader } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { contactIdFromQr } from "@/lib/badge-matcher";
import { relativeDate } from "@/lib/date";
import { useAppStore } from "@/store/app-store";

type AssistMode = "browse" | "scan";

export default function RecognizeScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<AssistMode>("browse");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();
  const [qrLocked, setQrLocked] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const contacts = useAppStore((state) => state.contacts);
  const event = useAppStore((state) => state.events.find((item) => item.id === state.currentEventId));

  const attendees = useMemo(() => {
    if (!event) return [];
    return event.attendeeContactIds
      .map((id) => contacts.find((contact) => contact.id === id))
      .filter((contact) => contact !== undefined);
  }, [contacts, event]);
  const quickMatchCandidates = event ? filterEventCandidates(contacts, event) : [];
  const visibleAttendees = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return attendees;
    return attendees.filter((contact) =>
      [contact.displayName, contact.company, contact.role, contact.lastDiscussed]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalized)),
    );
  }, [attendees, query]);

  const openContact = (contactId: string, matched = false) => {
    router.replace({
      pathname: "/contact/[id]",
      params: { id: contactId, ...(matched ? { recognized: "1" } : {}) },
    });
  };

  const onBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (qrLocked) return;
    const contactId = contactIdFromQr(data, quickMatchCandidates);
    if (!contactId) {
      setError("That badge is not enabled for this event. Nothing was searched outside your saved contacts.");
      return;
    }
    setQrLocked(true);
    openContact(contactId, true);
  };

  if (!event) {
    return (
      <Screen>
        <EmptyState
          action={<Button onPress={() => router.replace("/events")}>Create an event</Button>}
          body="The event assistant needs an active attendee boundary before it can help."
          title="No active event"
        />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.boundaryRow}>
          <Pill tone="safe">{attendees.length} saved people in scope</Pill>
          <Pill>{event.name}</Pill>
        </View>
        <Text style={styles.title}>Who are you about to meet?</Text>
        <Body muted>Search your event list or scan a Context badge. No stranger search, background camera, or internet identity lookup.</Body>
      </View>

      <View accessibilityRole="tablist" style={styles.segmented}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === "browse" }}
          onPress={() => { setMode("browse"); setError(undefined); }}
          style={[styles.segment, mode === "browse" && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, mode === "browse" && styles.segmentTextActive]}>Browse people</Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === "scan" }}
          onPress={() => { setMode("scan"); setError(undefined); }}
          style={[styles.segment, mode === "scan" && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, mode === "scan" && styles.segmentTextActive]}>Scan a badge</Text>
        </Pressable>
      </View>

      <ErrorBanner message={error} />

      {mode === "browse" ? (
        <View style={styles.modeContent}>
          {attendees.length ? (
            <TextInput
              accessibilityLabel="Search this event"
              autoCapitalize="none"
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              placeholder="Search name, company, role, or topic"
              placeholderTextColor={colors.inkMuted}
              style={styles.search}
              value={query}
            />
          ) : null}
          <SectionHeader subtitle="Tap once for a discreet relationship refresher" title="Event directory" />
          <View style={styles.peopleList}>
            {visibleAttendees.map((contact) => (
              <Pressable
                accessibilityLabel={`Open refresher for ${contact.displayName}`}
                accessibilityRole="button"
                key={contact.id}
                onPress={() => openContact(contact.id)}
              >
                {({ pressed }) => (
                  <Card style={[styles.personCard, pressed && styles.pressed]}>
                    <Avatar name={contact.displayName} />
                    <View style={styles.personCopy}>
                      <Text style={styles.personName}>{contact.displayName}</Text>
                      <Text numberOfLines={1} style={styles.personMeta}>{[contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship"}</Text>
                      <Text numberOfLines={1} style={styles.personContext}>Last spoke {relativeDate(contact.lastSpokeAt) ?? "not recorded"}</Text>
                    </View>
                    <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
                  </Card>
                )}
              </Pressable>
            ))}
          </View>
          {!attendees.length ? (
            <EmptyState
              action={<Button onPress={() => router.push("/contact/new")}>Add a person</Button>}
              body="Add people manually or import an attendee CSV before the event."
              title="No one is in this event yet"
            />
          ) : null}
          {attendees.length && !visibleAttendees.length ? (
            <EmptyState
              action={<Button onPress={() => setQuery("")} variant="secondary">Clear search</Button>}
              body="Try a name, company, role, or saved conversation topic."
              title="No matching people"
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.modeContent}>
          <Card style={styles.boundaryCard}>
            <Text style={styles.boundaryTitle}>Badge matching stays inside this event</Text>
            <Text style={styles.boundaryBody}>{quickMatchCandidates.length} people have quick matching enabled. The camera reads only Context QR badges and does not capture or identify faces.</Text>
          </Card>

          {!permission ? (
            <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
          ) : !permission.granted ? (
            <EmptyState
              action={permission.canAskAgain ? <Button onPress={requestPermission}>Allow camera while scanning</Button> : undefined}
              body={permission.canAskAgain
                ? "Context uses the camera only while this scanner is open."
                : "Enable camera access for Context in your browser or device settings, then return here."}
              title="Camera access is off"
            />
          ) : cameraFailed ? (
            <EmptyState
              action={<Button onPress={() => { setMode("browse"); setError(undefined); }}>Browse people instead</Button>}
              body="The browser or operating system could not start this camera. Check system privacy settings, or use the event directory."
              title="Camera unavailable"
            />
          ) : quickMatchCandidates.length ? (
            <View style={styles.cameraShell}>
              <CameraView
                active={mode === "scan" && !qrLocked}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                facing="back"
                onBarcodeScanned={onBarcodeScanned}
                onMountError={() => {
                  setCameraFailed(true);
                  setError("The camera could not start. No image or frame was saved.");
                }}
                style={styles.camera}
              />
              <View style={styles.guide}>
                <View style={styles.guideFrame} />
                <Text style={styles.guideText}>Center a Context badge</Text>
              </View>
            </View>
          ) : (
            <EmptyState
              body="Open a person’s profile and enable Quick matching before scanning their badge."
              title="No badge candidates yet"
            />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  header: { gap: spacing.sm },
  boundaryRow: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm },
  title: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: "800" },
  segmented: { flexDirection: "row", borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surfaceAlt, padding: 4 },
  segment: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, paddingHorizontal: spacing.sm },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.inkMuted, fontSize: 14, fontWeight: "700" },
  segmentTextActive: { color: colors.ink },
  modeContent: { gap: spacing.md },
  search: { minHeight: 48, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 15 },
  peopleList: { gap: spacing.sm },
  personCard: { flexDirection: "row", alignItems: "center" },
  personCopy: { flex: 1, minWidth: 0, gap: 2 },
  personName: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  personMeta: { color: colors.inkMuted, fontSize: 13 },
  personContext: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  chevron: { color: colors.inkMuted, fontSize: 28, fontWeight: "300" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  boundaryCard: { backgroundColor: colors.primarySoft, borderColor: "#D9D6FE" },
  boundaryTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  boundaryBody: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  cameraShell: { minHeight: 480, overflow: "hidden", borderRadius: radius.lg, backgroundColor: colors.ink },
  camera: { flex: 1 },
  guide: { ...StyleSheet.absoluteFill, pointerEvents: "none", alignItems: "center", justifyContent: "center", gap: spacing.md },
  guideFrame: { width: "64%", maxWidth: 340, aspectRatio: 1, borderColor: "rgba(255,255,255,0.9)", borderWidth: 2, borderRadius: radius.lg },
  guideText: { color: colors.white, fontSize: 13, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
});
