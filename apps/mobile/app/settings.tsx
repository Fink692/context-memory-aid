import { useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { Button, Card, Divider, ErrorBanner, Pill, Screen } from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import { deleteFaceTemplate } from "@/lib/face-templates";
import { useAppStore } from "@/store/app-store";

export default function SettingsScreen() {
  const router = useRouter();
  const aiEnabled = useAppStore((state) => state.aiEnabled);
  const setAiEnabled = useAppStore((state) => state.setAiEnabled);
  const contacts = useAppStore((state) => state.contacts);
  const exportBundle = useAppStore((state) => state.exportBundle);
  const resetDemo = useAppStore((state) => state.resetDemo);
  const deleteAllData = useAppStore((state) => state.deleteAllData);
  const [error, setError] = useState<string>();

  const exportData = async () => {
    setError(undefined);
    try {
      const directory = FileSystem.cacheDirectory;
      if (!directory) throw new Error("A temporary export directory is unavailable.");
      const uri = `${directory}context-export-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(exportBundle(), null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Export Context data" });
      } else {
        throw new Error("Sharing is unavailable on this device.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export data.");
    }
  };

  const removeTemplates = async () => {
    await Promise.all(contacts.map((contact) => deleteFaceTemplate(contact.id)));
  };

  const confirmReset = () => {
    Alert.alert("Reset fictional demo?", "This restores the seeded event and removes changes to the demo timeline.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", onPress: () => { void removeTemplates(); resetDemo(); } },
    ]);
  };

  const confirmDeleteAll = () => {
    Alert.alert("Delete all local data?", "This removes contacts, timelines, event lists, and secure face templates from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete everything",
        style: "destructive",
        onPress: () => {
          void removeTemplates().finally(() => {
            deleteAllData();
            router.replace("/onboarding");
          });
        },
      },
    ]);
  };

  return (
    <Screen contentContainerStyle={styles.screen}>
      <Pill tone="safe">Private by default</Pill>
      <Text style={styles.title}>You can see, move, or erase everything.</Text>
      <ErrorBanner message={error} />

      <Card>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>OpenAI memory intelligence</Text>
            <Text style={styles.sectionBody}>When on, deliberate actions may send the selected contact’s full saved profile and timeline plus your note. Other contacts and all face data stay local.</Text>
          </View>
          <Switch
            accessibilityLabel="OpenAI memory intelligence"
            value={aiEnabled}
            onValueChange={setAiEnabled}
            trackColor={{ false: colors.border, true: "#A7F3D0" }}
            thumbColor={aiEnabled ? colors.success : colors.surface}
          />
        </View>
      </Card>

      <Card style={styles.boundaryCard}>
        <Text style={styles.sectionTitle}>Recognition boundary</Text>
        <Text style={styles.sectionBody}>One-shot camera only · active event attendees only · saved contacts only · no internet identity search · no cloud face matching.</Text>
        <Divider />
        <Text style={styles.caveat}>The included hackathon fallback is explicitly labeled and does not infer identity from pixels. A licensed, reviewed local embedding model must be added before claiming real face recognition.</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Retention</Text>
        <Text style={styles.sectionBody}>Profile data remains until you delete it. Camera captures and audio recordings are temporary cache files deleted immediately after processing. Confirmed summaries are stored; raw transcripts are not.</Text>
      </Card>

      <View style={styles.actions}>
        <Button variant="secondary" onPress={exportData}>Export JSON copy</Button>
        <Button variant="secondary" onPress={confirmReset}>Reset fictional demo</Button>
        <Button variant="danger" onPress={confirmDeleteAll}>Delete all local data</Button>
      </View>
      <Button variant="quiet" onPress={() => router.replace("/home")}>Back to event briefing</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  title: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: "800", letterSpacing: -0.6 },
  switchRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  flex: { flex: 1 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  sectionBody: { color: colors.inkMuted, fontSize: 13, lineHeight: 20, marginTop: spacing.xs },
  boundaryCard: { backgroundColor: "#F0EFFF", borderColor: "#D9D6FE", shadowOpacity: 0 },
  caveat: { color: colors.warning, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
