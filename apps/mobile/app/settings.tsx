import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Switch, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { ExportBundleSchema, type ExportBundle } from "@context/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button, Card, Divider, ErrorBanner, Pill, Screen, SectionHeader, SuccessBanner } from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import { getApiHealth, type ApiHealth } from "@/lib/api";
import { deleteFaceTemplate } from "@/lib/face-templates";
import { useAppStore } from "@/store/app-store";

type Confirmation = "reset" | "delete" | "restore" | null;

export default function SettingsScreen() {
  const router = useRouter();
  const aiEnabled = useAppStore((state) => state.aiEnabled);
  const setAiEnabled = useAppStore((state) => state.setAiEnabled);
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const exportBundle = useAppStore((state) => state.exportBundle);
  const replaceBundle = useAppStore((state) => state.replaceBundle);
  const resetSample = useAppStore((state) => state.resetSample);
  const deleteAllData = useAppStore((state) => state.deleteAllData);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [health, setHealth] = useState<ApiHealth>();
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [pendingBundle, setPendingBundle] = useState<ExportBundle>();
  const [destructiveBusy, setDestructiveBusy] = useState(false);

  const memoryCount = useMemo(
    () => contacts.reduce((total, contact) => total + contact.timeline.length, 0),
    [contacts],
  );

  const checkService = async () => {
    setCheckingHealth(true);
    setError(undefined);
    try {
      setHealth(await getApiHealth());
    } catch (caught) {
      setHealth(undefined);
      setError(caught instanceof Error ? caught.message : "Could not reach the memory service.");
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    if (aiEnabled) void checkService();
  }, [aiEnabled]);

  const exportData = async () => {
    setError(undefined);
    setSuccess(undefined);
    const json = JSON.stringify(exportBundle(), null, 2);
    try {
      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `context-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
      } else {
        const directory = FileSystem.cacheDirectory;
        if (!directory) throw new Error("A temporary export directory is unavailable.");
        const uri = `${directory}context-backup-${Date.now()}.json`;
        try {
          await FileSystem.writeAsStringAsync(uri, json);
          if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is unavailable on this device.");
          await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Export Context backup" });
        } finally {
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        }
      }
      setSuccess("A portable JSON backup was created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export your data.");
    }
  };

  const chooseBackup = async () => {
    setError(undefined);
    setSuccess(undefined);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/json", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (asset.size && asset.size > 5_000_000) throw new Error("Backups must be smaller than 5 MB.");
      const text = await (await fetch(asset.uri)).text();
      const parsed = ExportBundleSchema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new Error("That file is not a valid Context backup.");
      setPendingBundle(parsed.data);
      setConfirmation("restore");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that backup.");
    }
  };

  const removeTemplates = async () => {
    await Promise.all(contacts.map((contact) => deleteFaceTemplate(contact.id)));
  };

  const runDestructiveAction = async () => {
    setDestructiveBusy(true);
    setError(undefined);
    try {
      await removeTemplates();
      if (confirmation === "reset") {
        resetSample();
        setSuccess("The sample workspace was restored.");
      } else if (confirmation === "restore" && pendingBundle) {
        replaceBundle(pendingBundle);
        setPendingBundle(undefined);
        setSuccess("Your backup was restored.");
      } else if (confirmation === "delete") {
        deleteAllData();
        setConfirmation(null);
        router.replace("/onboarding");
        return;
      }
      setConfirmation(null);
    } catch {
      setError("Context could not remove existing secure matching data, so no destructive changes were made.");
      setConfirmation(null);
    } finally {
      setDestructiveBusy(false);
    }
  };

  const confirmationCopy = confirmation === "delete"
    ? {
        title: "Delete every local record?",
        body: "This permanently removes contacts, events, memories, preferences, and secure quick-match data from this device.",
        label: "Delete everything",
      }
    : confirmation === "restore"
      ? {
          title: "Replace this workspace?",
          body: `The backup contains ${pendingBundle?.contacts.length ?? 0} people and ${pendingBundle?.events.length ?? 0} events. It will replace the current local workspace.`,
          label: "Restore backup",
        }
      : {
          title: "Restore the sample workspace?",
          body: "This replaces the current local contacts, events, and memories with the fictional sample workspace.",
          label: "Restore sample",
        };

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Pill tone="safe">Private by default</Pill>
        <Text style={styles.title}>You can see, move, or erase everything.</Text>
      </View>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <SectionHeader subtitle="Controls for notes that use the configured memory service" title="Smart memory tools" />
      <Card>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>Editable smart drafts</Text>
            <Text style={styles.sectionBody}>When on, deliberate actions may send the selected person’s saved profile and your note to the configured API. Other contacts and all matching data stay local.</Text>
          </View>
          <Switch
            accessibilityLabel="Editable smart drafts"
            onValueChange={setAiEnabled}
            thumbColor={aiEnabled ? colors.success : colors.surface}
            trackColor={{ false: colors.border, true: "#A7F3D0" }}
            value={aiEnabled}
          />
        </View>
        {aiEnabled ? (
          <>
            <Divider />
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, health && styles.statusDotOnline]} />
              <View style={styles.flex}>
                <Text style={styles.statusTitle}>{health ? `Connected · ${health.aiMode === "openai" ? "OpenAI mode" : "private rules mode"}` : "Connection not verified"}</Text>
                <Text style={styles.statusBody}>{health?.aiMode === "openai" ? "Smart drafts and voice transcription are available." : health ? "Typed smart drafts are available; voice transcription is off." : "Check the configured service before relying on smart features."}</Text>
              </View>
              <Button loading={checkingHealth} onPress={() => { void checkService(); }} style={styles.checkButton} variant="quiet">Check</Button>
            </View>
          </>
        ) : null}
      </Card>

      <SectionHeader subtitle="Current workspace on this device" title="Your data" />
      <Card style={styles.statsCard}>
        <View style={styles.stat}><Text style={styles.statValue}>{contacts.length}</Text><Text style={styles.statLabel}>people</Text></View>
        <View style={styles.statDivider} />
        <View style={styles.stat}><Text style={styles.statValue}>{events.length}</Text><Text style={styles.statLabel}>events</Text></View>
        <View style={styles.statDivider} />
        <View style={styles.stat}><Text style={styles.statValue}>{memoryCount}</Text><Text style={styles.statLabel}>memories</Text></View>
      </Card>
      <View style={styles.actionGrid}>
        <Button onPress={() => { void exportData(); }} style={styles.actionButton} variant="secondary">Export backup</Button>
        <Button onPress={() => { void chooseBackup(); }} style={styles.actionButton} variant="secondary">Restore backup</Button>
      </View>

      <Card style={styles.boundaryCard}>
        <Text style={styles.sectionTitle}>Recognition boundary</Text>
        <Text style={styles.sectionBody}>The finished event flow uses manual lookup and deliberate QR badge scanning. There is no stranger identification, background camera, location tracking, or cloud face matching.</Text>
        <Divider />
        <Text style={styles.caveat}>Biometric matching remains disabled until a licensed on-device model, consent flow, and demographic performance review pass the documented integration gates.</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Retention</Text>
        <Text style={styles.sectionBody}>Profile data remains until you delete it. Camera frames used for QR scanning are not saved. Audio recordings are temporary cache files deleted after transcription. Confirmed summaries are stored; raw transcripts are not.</Text>
      </Card>

      <View style={styles.actions}>
        <Button onPress={() => setConfirmation("reset")} variant="secondary">Restore fictional sample workspace</Button>
        <Button onPress={() => setConfirmation("delete")} variant="danger">Delete all local data</Button>
      </View>
      <Button onPress={() => router.replace("/home")} variant="quiet">Back to event briefing</Button>

      <ConfirmDialog
        body={confirmationCopy.body}
        busy={destructiveBusy}
        confirmLabel={confirmationCopy.label}
        destructive
        onCancel={() => { setConfirmation(null); setPendingBundle(undefined); }}
        onConfirm={() => { void runDestructiveAction(); }}
        title={confirmationCopy.title}
        visible={confirmation !== null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  header: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: "800" },
  switchRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  sectionBody: { color: colors.inkMuted, fontSize: 13, lineHeight: 20, marginTop: spacing.xs },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  statusDotOnline: { backgroundColor: colors.success },
  statusTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  statusBody: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  checkButton: { minHeight: 38, paddingHorizontal: spacing.sm },
  statsCard: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: colors.ink, fontSize: 25, fontWeight: "800", fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.inkMuted, fontSize: 11, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 38, backgroundColor: colors.border },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionButton: { flex: 1, minWidth: 190 },
  boundaryCard: { backgroundColor: colors.primarySoft, borderColor: "#D9D6FE" },
  caveat: { color: colors.warning, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
