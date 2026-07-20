import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppSymbol, AppText, Button, ErrorBanner, Pill, SuccessBanner, symbols } from "./ui";
import { colors, radius, spacing } from "@/constants/theme";
import { shouldStackSharedRow } from "@/lib/accessibility-layout";
import {
  GEMMA_LICENSE_URL,
  GEMMA_MODEL_CARD_URL,
  cancelOnDeviceModelDownload,
  deleteOnDeviceModel,
  generateOnDevice,
  getOnDeviceModelStatus,
  isOnDeviceModelRuntimeAvailable,
  loadOnDeviceModel,
  startOnDeviceModelDownload,
  subscribeToOnDeviceModelStatus,
  unloadOnDeviceModel,
  type OnDeviceModelStatus,
} from "@/lib/native-local-model";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}

function statusLabel(status?: OnDeviceModelStatus): string {
  if (!status) return "Checking runtime";
  switch (status.status) {
    case "not-installed": return "Model not downloaded";
    case "downloading": return `Downloading · ${Math.round(status.progress * 100)}%`;
    case "verifying": return "Verifying model integrity";
    case "ready": return "Downloaded and ready";
    case "loading": return "Loading model into memory";
    case "loaded": return `Ready${status.backend ? ` · ${status.backend}` : ""}`;
    case "error": return "Model needs attention";
  }
}

export function OnDeviceModelManager({
  onStatusChange,
}: {
  onStatusChange?: (status: OnDeviceModelStatus | undefined) => void;
} = {}) {
  const [status, setStatus] = useState<OnDeviceModelStatus>();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [actionBusy, setActionBusy] = useState(false);
  const { fontScale, width } = useWindowDimensions();
  const stackActions = shouldStackSharedRow({ fontScale, width });
  const request = useRef(0);
  const runtimeAvailable = Platform.OS === "ios" && isOnDeviceModelRuntimeAvailable();

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  const refresh = useCallback(async () => {
    const current = ++request.current;
    try {
      const next = await getOnDeviceModelStatus();
      if (request.current === current) {
        setStatus(next);
        setError(next.status === "error" ? next.message : undefined);
        if (next.status === "error") setSuccess(undefined);
      }
    } catch (caught) {
      if (request.current === current) {
        setSuccess(undefined);
        setError(caught instanceof Error ? caught.message : "The Gemma runtime is unavailable.");
      }
    }
  }, []);

  useEffect(() => {
    if (!runtimeAvailable) {
      setError("This native build does not include the Gemma 4 runtime.");
      return;
    }
    void refresh();
    const subscription = subscribeToOnDeviceModelStatus((next) => {
      request.current += 1;
      setStatus(next);
      setError(next.status === "error" ? next.message : undefined);
      if (next.status === "error") setSuccess(undefined);
    });
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => {
      request.current += 1;
      subscription.remove();
      appState.remove();
    };
  }, [refresh, runtimeAvailable]);

  const loadAndTestModel = async (): Promise<OnDeviceModelStatus> => {
    await loadOnDeviceModel();
    await generateOnDevice(
      "This is a Smart Assist self-test. Reply with only READY.",
      "Confirm that Smart Assist is responding.",
    );
    return getOnDeviceModelStatus();
  };

  const runAction = async (
    action: () => Promise<OnDeviceModelStatus>,
    message?: string,
  ) => {
    setActionBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const next = await action();
      setStatus(next);
      setSuccess(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Smart Assist model action failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const isTransferring = status?.status === "downloading" || status?.status === "verifying";
  const progress = Math.max(0, Math.min(1, status?.progress ?? 0));

  const confirmDownload = () => {
    Alert.alert(
      "Download Gemma 4?",
      "The 2.59 GB public model downloads over Wi-Fi and is verified before use.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Download",
          onPress: () => { void runAction(startOnDeviceModelDownload, "Download started. Keep Context open until verification finishes."); },
        },
      ],
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete the Smart Assist model?",
      "This removes the model and compiled cache. Your people and memories remain untouched.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Model",
          style: "destructive",
          onPress: () => { void runAction(deleteOnDeviceModel, "The downloaded model and cache were deleted."); },
        },
      ],
    );
  };

  const openReference = async (url: string, label: string) => {
    setError(undefined);
    try {
      await Linking.openURL(url);
    } catch {
      setError(`${label} could not be opened right now.`);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.modelSymbol}>
          <AppSymbol name={symbols.model} size={20} tone="tint" weight="semibold" />
        </View>
        <View style={styles.flex}>
          <AppText emphasis="semibold" role="headline">Smart Assist Model</AppText>
          <AppText role="footnote" tone="secondary">Gemma 4 E2B IT · {statusLabel(status)}</AppText>
        </View>
        <Pill tone={status?.installed ? "safe" : "warning"}>{status?.installed ? "Installed" : "Optional"}</Pill>
      </View>
      {!status?.installed ? <AppText role="footnote" tone="secondary">2.59 GB download · about 4.6 GB free space required · Wi-Fi only</AppText> : null}

      {isTransferring ? (
        <View style={styles.progressBlock}>
          <View
            accessible
            accessibilityLabel={`Gemma model download ${Math.round(progress * 100)} percent`}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            style={styles.progressTrack}
          >
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <AppText role="caption1" tone="secondary">{status?.status === "verifying"
            ? "Checking the complete file against its published SHA-256 digest…"
            : `${formatBytes(status?.downloadedBytes ?? 0)} of ${formatBytes(status?.totalBytes ?? 0)}`}</AppText>
        </View>
      ) : null}

      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <View style={[styles.actions, stackActions && styles.actionsStacked]}>
        {runtimeAvailable && status && !status.installed && !isTransferring ? (
          <Button disabled={actionBusy} onPress={confirmDownload} style={[styles.action, stackActions && styles.actionStacked]} symbol={symbols.model}>Download Model</Button>
        ) : null}
        {status?.status === "downloading" ? (
          <Button loading={actionBusy} onPress={() => { void runAction(cancelOnDeviceModelDownload, "Model download cancelled."); }} style={[styles.action, stackActions && styles.actionStacked]} variant="secondary">Cancel download</Button>
        ) : null}
        {status?.installed && !status.loaded ? (
          <Button loading={actionBusy} onPress={() => { void runAction(loadAndTestModel, "Gemma 4 completed its self-test and is ready."); }} style={[styles.action, stackActions && styles.actionStacked]} variant="secondary">Run Self-Test</Button>
        ) : null}
        {status?.loaded ? (
          <Button loading={actionBusy} onPress={() => { void runAction(unloadOnDeviceModel, "Gemma 4 was unloaded from memory. It remains downloaded."); }} style={[styles.action, stackActions && styles.actionStacked]} variant="secondary">Unload Model</Button>
        ) : null}
        {status?.installed ? (
          <Button disabled={actionBusy || status.busy} onPress={confirmDelete} style={[styles.action, stackActions && styles.actionStacked]} variant="quiet">Delete Model</Button>
        ) : null}
        <Button disabled={!runtimeAvailable} loading={actionBusy} onPress={() => { void refresh(); }} style={[styles.action, stackActions && styles.actionStacked]} variant="quiet">Refresh</Button>
      </View>

      <View style={[styles.links, stackActions && styles.linksStacked]}>
        <Button onPress={() => { void openReference(GEMMA_MODEL_CARD_URL, "The model card"); }} style={[styles.linkButton, stackActions && styles.linkButtonStacked]} variant="quiet">Model card</Button>
        <Button onPress={() => { void openReference(GEMMA_LICENSE_URL, "The model license"); }} style={[styles.linkButton, stackActions && styles.linkButtonStacked]} variant="quiet">Apache 2.0 license</Button>
      </View>
      <AppText role="footnote" tone="secondary">Suggestions stay editable and nothing is saved until you confirm it.</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: spacing.md },
  modelSymbol: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  flex: { flex: 1, minWidth: 220 },
  progressBlock: { gap: spacing.xs },
  progressTrack: { height: 8, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.fillStrong },
  progressFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.success },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionsStacked: { flexDirection: "column" },
  action: { flexGrow: 1, minWidth: 160 },
  actionStacked: { width: "100%", minWidth: 0, flexGrow: 0 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  linksStacked: { flexDirection: "column" },
  linkButton: { minHeight: 36, paddingHorizontal: spacing.sm },
  linkButtonStacked: { width: "100%" },
});
