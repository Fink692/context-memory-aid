import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { Body, Button, Card, ErrorBanner, Pill, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { DEMO_UNKNOWN_ID, contactIdFromQr, runClearlyLabeledDemoMatch } from "@/lib/demo-matcher";
import { useAppStore } from "@/store/app-store";
import { filterEventCandidates } from "@context/shared";

export default function RecognizeScreen() {
  const router = useRouter();
  const camera = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [qrLocked, setQrLocked] = useState(false);
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const currentEventId = useAppStore((state) => state.currentEventId);
  const demoTargetId = useAppStore((state) => state.demoTargetId);
  const setDemoTargetId = useAppStore((state) => state.setDemoTargetId);
  const event = events.find((item) => item.id === currentEventId);
  const candidates = event ? filterEventCandidates(contacts, event) : [];

  const openContact = (contactId: string) => {
    router.replace({ pathname: "/contact/[id]", params: { id: contactId, recognized: "1" } });
  };

  const onBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (qrLocked || busy) return;
    const contactId = contactIdFromQr(data, candidates);
    if (!contactId) return;
    setQrLocked(true);
    openContact(contactId);
  };

  const captureAndMatch = async () => {
    setError(undefined);
    setBusy(true);
    let captureUri: string | undefined;
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.35, skipProcessing: false });
      captureUri = photo?.uri;
      if (!captureUri) throw new Error("The camera could not capture an image.");

      const result = await runClearlyLabeledDemoMatch({
        candidates,
        selectedContactId: demoTargetId,
      });
      if (result.status === "matched" && result.contactId) {
        openContact(result.contactId);
      } else if (result.status === "ambiguous") {
        setError("Two saved attendees were too similar. Open the attendee list instead.");
      } else {
        setError("No match in this event. The image was discarded and nothing was searched online.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Matching failed safely.");
    } finally {
      if (captureUri) {
        await FileSystem.deleteAsync(captureUri, { idempotent: true }).catch(() => undefined);
      }
      setBusy(false);
    }
  };

  if (!event) {
    return (
      <Screen>
        <Card><Body>No active event. Import or select an event before using memory assist.</Body></Card>
        <Button onPress={() => router.replace("/import")}>Import attendees</Button>
      </Screen>
    );
  }

  if (!permission) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (!permission.granted) {
    return (
      <Screen contentContainerStyle={styles.permissionScreen}>
        <Pill tone="safe">Deliberate access only</Pill>
        <Text style={styles.permissionTitle}>Camera access is off.</Text>
        <Body muted>
          Context opens the camera only on this screen. Captures remain local and are deleted immediately after matching.
        </Body>
        <Button onPress={requestPermission}>Allow camera for this demo</Button>
        {!permission.canAskAgain ? <Body muted>Enable camera access in your device settings.</Body> : null}
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentContainerStyle={styles.screen}>
      <View style={styles.boundaryRow}>
        <Pill tone="safe">{candidates.length} enrolled attendees only</Pill>
        <Pill tone="demo">Demo adapter</Pill>
      </View>
      <Text style={styles.eventName}>{event.name}</Text>

      <View style={styles.cameraShell}>
        <CameraView
          ref={camera}
          style={styles.camera}
          facing="back"
          active={!busy}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={onBarcodeScanned}
        />
        <View pointerEvents="none" style={styles.guide}>
          <View style={styles.guideFrame} />
          <Text style={styles.guideText}>Center one person, then tap once</Text>
        </View>
        {busy ? (
          <View style={styles.processing}>
            <ActivityIndicator color={colors.white} size="large" />
            <Text style={styles.processingText}>Checking this event’s saved contacts…</Text>
          </View>
        ) : null}
      </View>

      <ErrorBanner message={error} />

      <View style={styles.demoPanel}>
        <Text style={styles.demoTitle}>Hackathon demo target</Text>
        <Text style={styles.demoBody}>
          This control is intentionally visible: until a reviewed, licensed on-device embedding model is bundled, the fallback simulates only the match decision. QR badges using context://contact/&lt;id&gt; work as a deterministic backup.
        </Text>
        <View style={styles.chips}>
          {candidates.map((contact) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: demoTargetId === contact.id }}
              key={contact.id}
              onPress={() => setDemoTargetId(contact.id)}
              style={[styles.chip, demoTargetId === contact.id && styles.chipSelected]}
            >
              <Text style={[styles.chipText, demoTargetId === contact.id && styles.chipTextSelected]}>{contact.displayName.split(" ")[0]}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: demoTargetId === DEMO_UNKNOWN_ID }}
            onPress={() => setDemoTargetId(DEMO_UNKNOWN_ID)}
            style={[styles.chip, demoTargetId === DEMO_UNKNOWN_ID && styles.chipSelected]}
          >
            <Text style={[styles.chipText, demoTargetId === DEMO_UNKNOWN_ID && styles.chipTextSelected]}>Unknown</Text>
          </Pressable>
        </View>
      </View>

      <Button loading={busy} disabled={!candidates.length} onPress={captureAndMatch}>Capture and check locally</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas },
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.md },
  permissionScreen: { flex: 1, justifyContent: "center" },
  permissionTitle: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: "800" },
  boundaryRow: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm },
  eventName: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  cameraShell: { flex: 1, minHeight: 280, overflow: "hidden", borderRadius: radius.lg, backgroundColor: colors.ink },
  camera: { flex: 1 },
  guide: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: spacing.md },
  guideFrame: { width: "67%", aspectRatio: 0.8, borderColor: "rgba(255,255,255,0.85)", borderWidth: 2, borderRadius: 120 },
  guideText: { color: colors.white, fontSize: 13, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.48)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  processing: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: "rgba(17,24,39,0.78)" },
  processingText: { color: colors.white, fontSize: 15, fontWeight: "700" },
  demoPanel: { gap: spacing.sm },
  demoTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  demoBody: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { minHeight: 38, justifyContent: "center", borderRadius: radius.pill, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, paddingHorizontal: 14 },
  chipSelected: { borderColor: colors.primary, backgroundColor: "#E8E7FF" },
  chipText: { color: colors.inkMuted, fontSize: 13, fontWeight: "700" },
  chipTextSelected: { color: colors.primaryDark },
});
