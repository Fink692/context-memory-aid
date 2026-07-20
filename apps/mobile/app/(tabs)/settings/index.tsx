import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, StyleSheet, Switch, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as LocalAuthentication from "expo-local-authentication";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useRouter } from "expo-router";
import { WorkspaceBackupSchema, type LocalModelHealth, type WorkspaceBackup } from "@context/shared";
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
import {
  assertImportFileSize,
  utf8ByteLength,
  type LocalFileStat,
} from "@/lib/import-file-safety";
import { getLocalModelHealth } from "@/lib/local-model";
import { clearPrivateProfilePhotos } from "@/lib/profile-photo";
import { clearUpdateWatchData } from "@/lib/legacy-update-watch-cleanup";
import { createWorkspaceBackupV2, restoreWorkspaceBackup } from "@/lib/workspace-backup";
import {
  clearSensitiveTemporaryFiles,
  deletePickedDocumentCacheFile,
} from "@/lib/sensitive-cache";
import { useAppStore } from "@/store/app-store";

type ConfirmedWorkspaceAction = "reset" | "delete" | "restore";
type WorkspaceAction = "export" | "choose-restore" | ConfirmedWorkspaceAction;

const MAX_BACKUP_FILE_BYTES = 50_000_000;

async function failedCleanupLabels(
  tasks: Array<{ label: string; run: () => Promise<unknown> }>,
): Promise<string[]> {
  const results = await Promise.allSettled(tasks.map((task) => task.run()));
  return tasks.flatMap((task, index) => results[index]?.status === "rejected" ? [task.label] : []);
}

export default function SettingsScreen() {
  const router = useRouter();
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const setLocalToolsEnabled = useAppStore((state) => state.setLocalToolsEnabled);
  const appLockEnabled = useAppStore((state) => state.appLockEnabled);
  const setAppLockEnabled = useAppStore((state) => state.setAppLockEnabled);
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const resetSample = useAppStore((state) => state.resetSample);
  const deleteAllData = useAppStore((state) => state.deleteAllData);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [workspaceAction, setWorkspaceAction] = useState<WorkspaceAction>();
  const [modelHealth, setModelHealth] = useState<LocalModelHealth>();
  const [modelError, setModelError] = useState<string>();
  const [modelBusy, setModelBusy] = useState(false);
  const [appLockBusy, setAppLockBusy] = useState(false);
  const modelRequest = useRef(0);
  const workspaceActionBusy = useRef(false);

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
      if (request === modelRequest.current) {
        setModelHealth(health);
        if (
          Platform.OS === "ios"
          && health.status !== "ready"
          && useAppStore.getState().localToolsEnabled
        ) {
          try {
            await setLocalToolsEnabled(false);
          } catch {
            throw new Error("Context could not save the Smart Assist setting. Try again.");
          }
        }
      }
    } catch (caught) {
      if (request !== modelRequest.current) return;
      setModelHealth(undefined);
      setModelError(caught instanceof Error ? caught.message : "Smart Assist is unavailable right now.");
    } finally {
      if (request === modelRequest.current) setModelBusy(false);
    }
  }, [setLocalToolsEnabled]);

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

  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "ios") return undefined;
    void checkLocalModel();
    return () => { modelRequest.current += 1; };
  }, [checkLocalModel]));

  const changeAppLock = async (enabled: boolean) => {
    setError(undefined);
    setSuccess(undefined);
    if (Platform.OS === "web") {
      setError("App Lock uses device authentication and is not available in a browser.");
      return;
    }
    setAppLockBusy(true);
    try {
      if (!enabled) {
        try {
          await setAppLockEnabled(false);
        } catch {
          throw new Error("Context could not save this change, so App Lock remains on. Try again.");
        }
        setSuccess("App Lock is off.");
        return;
      }
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
      try {
        await setAppLockEnabled(true);
      } catch {
        throw new Error("Context could not save this change, so App Lock remains off. Try again.");
      }
      setSuccess("App Lock is on. Context will lock whenever you leave the app.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "App Lock could not be enabled.");
    } finally {
      setAppLockBusy(false);
    }
  };

  const exportData = async () => {
    if (workspaceActionBusy.current) return;
    workspaceActionBusy.current = true;
    setWorkspaceAction("export");
    setError(undefined);
    setSuccess(undefined);
    try {
      const backup = await createWorkspaceBackupV2();
      const json = JSON.stringify(backup);
      if (utf8ByteLength(json) > MAX_BACKUP_FILE_BYTES) {
        throw new Error("This workspace is larger than the 50 MB portable backup limit. Remove or replace large profile photos, then try again.");
      }
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
          if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is unavailable right now.");
          await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Export Context backup" });
        } finally {
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        }
      }
      setSuccess("Sharing closed for a portable workspace backup. Confirm that the destination saved the JSON file.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export your data.");
    } finally {
      workspaceActionBusy.current = false;
      setWorkspaceAction(undefined);
    }
  };

  const runWorkspaceAction = async (action: ConfirmedWorkspaceAction, bundle?: WorkspaceBackup) => {
    if (workspaceActionBusy.current) return;
    workspaceActionBusy.current = true;
    setWorkspaceAction(action);
    setError(undefined);
    setSuccess(undefined);
    try {
      if (action === "reset") {
        await resetSample();
        setSuccess("The sample workspace was restored.");
        const failed = await failedCleanupLabels([
          { label: "old matching data", run: clearAllFaceTemplates },
          { label: "old supporting data", run: clearUpdateWatchData },
          { label: "old private photos", run: clearPrivateProfilePhotos },
          { label: "temporary import and backup files", run: clearSensitiveTemporaryFiles },
        ]);
        if (failed.length) setError(`The sample workspace is saved, but Context could not yet remove ${failed.join(", ")}. Try Restore Sample Data again to retry cleanup.`);
      } else if (action === "restore" && bundle) {
        const result = await restoreWorkspaceBackup(bundle);
        setSuccess("Your backup was restored.");
        const failed = await failedCleanupLabels([
          { label: "old matching data", run: clearAllFaceTemplates },
          { label: "old supporting data", run: clearUpdateWatchData },
        ]);
        if (result.stalePhotoCleanupCount) failed.push(`${result.stalePhotoCleanupCount} old private photo ${result.stalePhotoCleanupCount === 1 ? "file" : "files"}`);
        if (failed.length) setError(`The backup is saved, but Context could not yet remove ${failed.join(", ")}. Restoring the same backup again is safe.`);
      } else if (action === "delete") {
        await deleteAllData();
        const failed = await failedCleanupLabels([
          { label: "matching data", run: clearAllFaceTemplates },
          { label: "supporting data", run: clearUpdateWatchData },
          { label: "private photos", run: clearPrivateProfilePhotos },
          { label: "temporary import and backup files", run: clearSensitiveTemporaryFiles },
        ]);
        if (failed.length) {
          setError(`Your people, memories, events, and follow-ups are erased. Context could not yet remove ${failed.join(", ")}. Tap Erase All Data again to retry cleanup.`);
        } else {
          router.replace("/onboarding");
        }
      } else {
        throw new Error("No backup was selected.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Context could not finish that workspace change.");
    } finally {
      workspaceActionBusy.current = false;
      setWorkspaceAction(undefined);
    }
  };

  const confirmWorkspaceAction = (action: ConfirmedWorkspaceAction, bundle?: WorkspaceBackup) => {
    if (workspaceActionBusy.current) return;
    const copy = action === "delete"
      ? {
          title: "Erase all Context data?",
          message: "This permanently removes people, events, memories, follow-ups, preferences, and private supporting data.",
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
    if (workspaceActionBusy.current) return;
    let pickedCacheUri: string | undefined;
    let selectedBundle: WorkspaceBackup | undefined;
    setWorkspaceAction("choose-restore");
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
      pickedCacheUri = asset.uri;
      let text: string;
      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        if (!response.ok) throw new Error("That backup could not be opened.");
        const blob = await response.blob();
        assertImportFileSize({
          reportedSize: asset.size ?? blob.size,
          maximumBytes: MAX_BACKUP_FILE_BYTES,
          tooLargeMessage: "Backups must be smaller than 50 MB.",
          unverifiableMessage: "Context could not verify the backup size. Choose another file.",
        });
        text = await blob.text();
      } else {
        let stat: LocalFileStat | undefined;
        try {
          stat = await FileSystem.getInfoAsync(asset.uri);
        } catch {
          stat = { exists: false };
        }
        assertImportFileSize({
          reportedSize: asset.size,
          ...(stat ? { stat } : {}),
          maximumBytes: MAX_BACKUP_FILE_BYTES,
          tooLargeMessage: "Backups must be smaller than 50 MB.",
          unverifiableMessage: "Context could not verify the backup size. Choose another file.",
        });
        text = await FileSystem.readAsStringAsync(asset.uri);
      }
      const parsed = WorkspaceBackupSchema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new Error("That file is not a valid Context backup.");
      selectedBundle = parsed.data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that backup.");
    } finally {
      await deletePickedDocumentCacheFile(pickedCacheUri).catch(() => undefined);
      setWorkspaceAction(undefined);
    }
    if (selectedBundle) confirmWorkspaceAction("restore", selectedBundle);
  };

  const modelStatus = modelHealth?.ok ? `${modelHealth.model} ready` : modelError ?? "Checking assistant";
  const smartAssistStatus = modelBusy
    ? "Checking"
    : modelHealth?.status !== "ready"
      ? "Not set up"
      : localToolsEnabled
        ? "Ready"
        : "Off";
  const blockingWorkspaceMessage = workspaceAction === "restore"
    ? "Restoring your backup…"
    : workspaceAction === "reset"
      ? "Restoring sample data…"
      : workspaceAction === "delete"
        ? "Erasing local data…"
        : undefined;

  return (
    <Screen contentContainerStyle={styles.screen}>
      <Modal
        animationType="fade"
        onRequestClose={() => undefined}
        presentationStyle="overFullScreen"
        transparent
        visible={Boolean(blockingWorkspaceMessage)}
      >
        <View
          accessibilityLabel={blockingWorkspaceMessage}
          accessibilityLiveRegion="polite"
          accessibilityViewIsModal
          style={styles.workspaceBlocker}
        >
          <View style={styles.workspaceBlockerCard}>
            <ActivityIndicator accessibilityLabel={blockingWorkspaceMessage} color={colors.primary} size="large" />
            <AppText accessibilityRole="header" emphasis="semibold" role="headline">{blockingWorkspaceMessage}</AppText>
            <AppText role="footnote" style={styles.workspaceBlockerCopy} tone="secondary">
              Keep Context open until this finishes.
            </AppText>
          </View>
        </View>
      </Modal>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <ListSection title="Security" footer="Authentication is handled by the operating system. Context never receives your biometric data or passcode.">
        <ListRow
          accessoryNode={(
            <Switch
              accessibilityLabel="App Lock"
              disabled={appLockBusy || Boolean(workspaceAction) || Platform.OS === "web"}
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
        title="Smart Assist"
        footer="Drafts and conversation starters remain editable until you save them."
      >
        {Platform.OS === "ios" ? (
          <ListRow
            accessory="disclosure"
            detail={smartAssistStatus}
            last
            onPress={() => router.push("/smart-assist")}
            subtitle="Draft memories and conversation starters on this iPhone"
            symbol={symbols.sparkles}
            title="Smart Assist"
          />
        ) : (
          <>
            <ListRow
              accessoryNode={(
                <Switch
                  accessibilityLabel="Smart Assist"
                  disabled={Boolean(workspaceAction)}
                  onValueChange={(enabled) => {
                    void setLocalToolsEnabled(enabled).catch(() => {
                      setError("Context could not save the Smart Assist setting. Nothing was changed; try again.");
                    });
                  }}
                  trackColor={{ false: colors.fillStrong, true: colors.primary }}
                  value={localToolsEnabled}
                />
              )}
              last={!(Platform.OS === "web" && localToolsEnabled)}
              subtitle="Create drafts and conversation prompts you can review"
              symbol={symbols.sparkles}
              title="Smart Assist"
            />
            {Platform.OS === "web" && localToolsEnabled ? (
              <ListRow
                accessoryNode={<Button loading={modelBusy} onPress={() => { void checkLocalModel(); }} variant="quiet">Check</Button>}
                last
                subtitle={modelStatus}
                symbol={symbols.model}
                title="Assistant Status"
              />
            ) : null}
          </>
        )}
      </ListSection>

      <ListSection title="Workspace">
        <ListRow detail={contacts.length.toLocaleString()} symbol={symbols.people} title="People" />
        <ListRow detail={events.length.toLocaleString()} symbol={symbols.events} title="Events" />
        <ListRow detail={memoryCount.toLocaleString()} last symbol={symbols.note} title="Memories" />
      </ListSection>

      <ListSection title="Data" footer="Backups are portable and unencrypted. Save them only in a location you trust.">
        {Platform.OS !== "web" ? <ListRow disabled={Boolean(workspaceAction)} onPress={() => router.push("/contacts-import")} symbol={symbols.import} title="Import from Contacts" /> : null}
        <ListRow
          {...(workspaceAction === "export" ? { detail: "Preparing backup…" } : {})}
          disabled={Boolean(workspaceAction)}
          onPress={() => { void exportData(); }}
          symbol={symbols.export}
          title="Export Backup"
        />
        <ListRow
          {...(workspaceAction === "choose-restore"
            ? { detail: "Reading backup…" }
            : workspaceAction === "restore"
              ? { detail: "Restoring backup…" }
              : {})}
          disabled={Boolean(workspaceAction)}
          onPress={() => { void chooseBackup(); }}
          symbol={symbols.restore}
          title="Restore Backup"
        />
        <ListRow
          {...(workspaceAction === "reset" ? { detail: "Restoring sample…" } : {})}
          disabled={Boolean(workspaceAction)}
          last
          onPress={() => confirmWorkspaceAction("reset")}
          symbol={symbols.people}
          title="Restore Sample Data"
        />
      </ListSection>

      <ListSection title="Privacy & About" footer="No stranger identification, background camera, advertising, or location tracking.">
        <ListRow accessory="disclosure" last onPress={() => router.push("/privacy")} symbol={symbols.privacy} title="Privacy Notice" />
      </ListSection>

      <ListSection title="Danger Zone">
        <ListRow
          destructive
          disabled={Boolean(workspaceAction)}
          last
          onPress={() => confirmWorkspaceAction("delete")}
          symbol={symbols.trash}
          subtitle={workspaceAction === "delete" ? "Erasing data…" : "Permanently remove every record"}
          title="Erase All Data"
        />
      </ListSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl, gap: spacing.xl },
  workspaceBlocker: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0, 0, 0, 0.42)", padding: spacing.xl },
  workspaceBlockerCard: { width: "100%", maxWidth: 340, alignItems: "center", borderRadius: 16, borderCurve: "continuous", backgroundColor: colors.surfaceRaised, padding: spacing.xl, gap: spacing.md },
  workspaceBlockerCopy: { textAlign: "center" },
});
