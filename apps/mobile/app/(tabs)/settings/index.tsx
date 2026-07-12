import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, StyleSheet, Switch, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as LocalAuthentication from "expo-local-authentication";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { ExportBundleSchema, type ExportBundle, type LocalModelHealth } from "@context/shared";
import { OnDeviceModelManager } from "@/components/on-device-model-manager";
import {
  AppText,
  Button,
  ErrorBanner,
  ListRow,
  ListSection,
  Screen,
  SuccessBanner,
  symbols,
} from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import { deviceAuthenticationErrorMessage } from "@/lib/app-lock-state";
import { clearAllFaceTemplates } from "@/lib/face-templates";
import { getLocalModelHealth } from "@/lib/local-model";
import { clearUpdateWatchData } from "@/lib/update-watcher";
import { useAppStore } from "@/store/app-store";

type WorkspaceAction = "reset" | "delete" | "restore";

export default function SettingsScreen() {
  const router = useRouter();
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const setLocalToolsEnabled = useAppStore((state) => state.setLocalToolsEnabled);
  const appLockEnabled = useAppStore((state) => state.appLockEnabled);
  const setAppLockEnabled = useAppStore((state) => state.setAppLockEnabled);
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const exportBundle = useAppStore((state) => state.exportBundle);
  const replaceBundle = useAppStore((state) => state.replaceBundle);
  const resetSample = useAppStore((state) => state.resetSample);
  const deleteAllData = useAppStore((state) => state.deleteAllData);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [destructiveBusy, setDestructiveBusy] = useState(false);
  const [modelHealth, setModelHealth] = useState<LocalModelHealth>();
  const [modelError, setModelError] = useState<string>();
  const [modelBusy, setModelBusy] = useState(false);
  const [appLockBusy, setAppLockBusy] = useState(false);
  const modelRequest = useRef(0);

  const memoryCount = useMemo(
    () => contacts.reduce((total, contact) => total + contact.timeline.length, 0),
    [contacts],
  );

  const checkLocalModel = useCallback(async () => {
    const request = ++modelRequest.current;
    setModelBusy(true);
    setModelError(undefined);
    try {
      const health = await getLocalModelHealth();
      if (request === modelRequest.current) setModelHealth(health);
    } catch (caught) {
      if (request !== modelRequest.current) return;
      setModelHealth(undefined);
      setModelError(caught instanceof Error ? caught.message : "The local model service is unavailable.");
    } finally {
      if (request === modelRequest.current) setModelBusy(false);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" && localToolsEnabled) void checkLocalModel();
    else {
      modelRequest.current += 1;
      setModelHealth(undefined);
      setModelError(undefined);
      setModelBusy(false);
    }
    return () => { modelRequest.current += 1; };
  }, [checkLocalModel, localToolsEnabled]);

  const changeAppLock = async (enabled: boolean) => {
    setError(undefined);
    setSuccess(undefined);
    if (!enabled) {
      setAppLockEnabled(false);
      setSuccess("App Lock is off.");
      return;
    }
    if (Platform.OS === "web") {
      setError("App Lock uses device authentication and is not available in a browser.");
      return;
    }
    setAppLockBusy(true);
    try {
      const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
      if (enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
        throw new Error("Set up Face ID, Touch ID, or a device passcode before enabling App Lock.");
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Enable App Lock",
        promptDescription: "Confirm that only you can open Context",
        cancelLabel: "Cancel",
        fallbackLabel: "Use device passcode",
        disableDeviceFallback: false,
      });
      if (!result.success) throw new Error(deviceAuthenticationErrorMessage(result.error, "enable"));
      setAppLockEnabled(true);
      setSuccess("App Lock is on. Context will lock whenever you leave the app.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "App Lock could not be enabled.");
    } finally {
      setAppLockBusy(false);
    }
  };

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

  const runWorkspaceAction = async (action: WorkspaceAction, bundle?: ExportBundle) => {
    setDestructiveBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const cleanupResults = await Promise.allSettled([clearAllFaceTemplates(), clearUpdateWatchData()]);
      const cleanupNote = cleanupResults.some((result) => result.status === "rejected")
        ? " An unavailable optional PC companion may still need manual cleanup."
        : "";
      if (action === "reset") {
        resetSample();
        setSuccess(`The sample workspace was restored.${cleanupNote}`);
      } else if (action === "restore" && bundle) {
        replaceBundle(bundle);
        setSuccess(`Your backup was restored.${cleanupNote}`);
      } else if (action === "delete") {
        deleteAllData();
        router.replace("/onboarding");
      }
    } catch {
      setError("Context could not finish that local workspace change. Your existing data was kept.");
    } finally {
      setDestructiveBusy(false);
    }
  };

  const confirmWorkspaceAction = (action: WorkspaceAction, bundle?: ExportBundle) => {
    const copy = action === "delete"
      ? {
          title: "Erase all Context data?",
          message: "This permanently removes people, events, memories, preferences, badge data, public sources, and pending suggestions from this device.",
          confirm: "Erase All Data",
        }
      : action === "restore"
        ? {
            title: "Replace this workspace?",
            message: `The backup contains ${bundle?.contacts.length ?? 0} people and ${bundle?.events.length ?? 0} events. It will replace the current workspace.`,
            confirm: "Restore Backup",
          }
        : {
            title: "Restore sample data?",
            message: "This replaces the current people, events, and memories with the fictional sample workspace.",
            confirm: "Restore Sample",
          };
    if (Platform.OS === "web") {
      if (window.confirm(`${copy.title}\n\n${copy.message}`)) void runWorkspaceAction(action, bundle);
      return;
    }
    Alert.alert(copy.title, copy.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: copy.confirm,
        style: action === "delete" ? "destructive" : "default",
        onPress: () => { void runWorkspaceAction(action, bundle); },
      },
    ]);
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
      const text = Platform.OS === "web"
        ? await (await fetch(asset.uri)).text()
        : await FileSystem.readAsStringAsync(asset.uri);
      const parsed = ExportBundleSchema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new Error("That file is not a valid Context backup.");
      confirmWorkspaceAction("restore", parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that backup.");
    }
  };

  const modelStatus = modelHealth?.ok ? `${modelHealth.model} ready` : modelError ?? "Checking local model";

  return (
    <Screen contentContainerStyle={styles.screen}>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <ListSection title="Security" footer="Authentication is handled by the operating system. Context never receives your biometric data or passcode.">
        <ListRow
          accessoryNode={(
            <Switch
              accessibilityLabel="App Lock"
              disabled={appLockBusy || Platform.OS === "web"}
              onValueChange={(value) => { void changeAppLock(value); }}
              trackColor={{ false: colors.fillStrong, true: colors.primary }}
              value={appLockEnabled}
            />
          )}
          last
          subtitle="Require Face ID, Touch ID, or passcode after leaving Context"
          symbol={symbols.lock}
          title="App Lock"
        />
      </ListSection>

      <ListSection
        title="Intelligence"
        footer={Platform.OS === "web" ? "Optional assistance connects only to the model running on this computer." : "Drafts and prompts remain editable until you save them."}
      >
        <ListRow
          accessoryNode={(
            <Switch
              accessibilityLabel="Private smart assist"
              onValueChange={setLocalToolsEnabled}
              trackColor={{ false: colors.fillStrong, true: colors.primary }}
              value={localToolsEnabled}
            />
          )}
          last={!(Platform.OS === "web" && localToolsEnabled) && Platform.OS !== "ios"}
          subtitle={Platform.OS === "web" ? "Use the local model on this computer" : "Create private drafts and conversation prompts"}
          symbol={symbols.sparkles}
          title="Private Smart Assist"
        />
        {Platform.OS === "web" && localToolsEnabled ? (
          <ListRow
            accessoryNode={<Button loading={modelBusy} onPress={() => { void checkLocalModel(); }} variant="quiet">Check</Button>}
            last
            subtitle={modelStatus}
            symbol={symbols.model}
            title="Local Model"
          />
        ) : null}
        {Platform.OS === "ios" ? <View style={styles.modelManager}><OnDeviceModelManager /></View> : null}
      </ListSection>

      <ListSection title="Workspace">
        <ListRow detail={contacts.length.toLocaleString()} symbol={symbols.people} title="People" />
        <ListRow detail={events.length.toLocaleString()} symbol={symbols.events} title="Events" />
        <ListRow detail={memoryCount.toLocaleString()} last symbol={symbols.note} title="Memories" />
      </ListSection>

      <ListSection title="Data" footer="Backups are portable and unencrypted. Save them only in a location you trust.">
        {Platform.OS !== "web" ? <ListRow onPress={() => router.push("/contacts-import")} symbol={symbols.import} title="Import from Contacts" /> : null}
        <ListRow onPress={() => { void exportData(); }} symbol={symbols.export} title="Export Backup" />
        <ListRow onPress={() => { void chooseBackup(); }} symbol={symbols.restore} title="Restore Backup" />
        <ListRow last onPress={() => confirmWorkspaceAction("reset")} symbol={symbols.people} title="Restore Sample Data" />
      </ListSection>

      <ListSection title="Privacy & About" footer="No stranger identification, background camera, location tracking, or cloud AI provider is configured.">
        <ListRow accessory="disclosure" last onPress={() => router.push("/privacy")} symbol={symbols.privacy} title="Privacy Notice" />
      </ListSection>

      <ListSection title="Danger Zone">
        <ListRow
          destructive
          last
          onPress={() => confirmWorkspaceAction("delete")}
          symbol={symbols.trash}
          subtitle={destructiveBusy ? "Erasing local data…" : "Permanently remove every local record"}
          title="Erase All Data"
        />
      </ListSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl, gap: spacing.xl },
  modelManager: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.lg },
});
