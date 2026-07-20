import { useCallback, useState } from "react";
import { Platform, StyleSheet, Switch, View } from "react-native";
import { Stack } from "expo-router";
import type { OnDeviceModelStatus } from "@/lib/native-local-model";
import { OnDeviceModelManager } from "@/components/on-device-model-manager";
import {
  AppText,
  ErrorBanner,
  ListRow,
  ListSection,
  Screen,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

export default function SmartAssistScreen() {
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const setLocalToolsEnabled = useAppStore((state) => state.setLocalToolsEnabled);
  const [status, setStatus] = useState<OnDeviceModelStatus>();
  const [error, setError] = useState<string>();
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const ready = Platform.OS !== "ios" || Boolean(status?.installed);

  const handleStatusChange = useCallback((next: OnDeviceModelStatus | undefined) => {
    setStatus(next);
    if (Platform.OS === "ios"
      && next
      && !next.installed
      && useAppStore.getState().localToolsEnabled) {
      void setLocalToolsEnabled(false).catch(() => {
        setError("Context could not save the Smart Assist setting. Try again.");
      });
    }
  }, [setLocalToolsEnabled]);

  const changeEnabled = async (enabled: boolean) => {
    setError(undefined);
    if (enabled && !ready) {
      setError("Download the on-device model before turning on Smart Assist.");
      return;
    }
    setPreferenceBusy(true);
    try {
      await setLocalToolsEnabled(enabled);
    } catch {
      setError("Context could not save the Smart Assist setting. Nothing was changed; try again.");
    } finally {
      setPreferenceBusy(false);
    }
  };

  const statusLabel = !status
    ? "Checking"
    : status.status === "downloading"
      ? `Downloading ${Math.round(status.progress * 100)}%`
      : status.installed
        ? localToolsEnabled ? "Ready" : "Off"
        : "Not set up";

  return (
    <>
      <Stack.Screen options={{ title: "Smart Assist" }} />
      <Screen contentContainerStyle={styles.screen}>
        <View style={styles.intro}>
          <AppText accessibilityRole="header" emphasis="semibold" role="title2">Private help you review</AppText>
          <AppText role="callout" tone="secondary">
            Draft memory summaries and conversation starters on this iPhone. Nothing is saved until you approve it.
          </AppText>
        </View>

        <ErrorBanner message={error} />

        <ListSection footer={ready ? "You can turn Smart Assist off without deleting the model." : "Set up the model below, then turn Smart Assist on."} title="Smart Assist">
          <ListRow
            accessoryNode={(
              <Switch
                accessibilityLabel="Smart Assist"
                disabled={!ready || preferenceBusy}
                onValueChange={(enabled) => { void changeEnabled(enabled); }}
                trackColor={{ false: colors.fillStrong, true: colors.primary }}
                value={ready && localToolsEnabled}
              />
            )}
            detail={statusLabel}
            last
            subtitle="Draft memories and conversation starters on this iPhone"
            symbol={symbols.sparkles}
            title="Smart Assist"
          />
        </ListSection>

        {Platform.OS === "ios" ? (
          <View style={styles.manager}>
            <OnDeviceModelManager onStatusChange={handleStatusChange} />
          </View>
        ) : (
          <View style={styles.basicNotice}>
            <AppText emphasis="semibold" role="headline">Basic assistance is ready</AppText>
            <AppText role="footnote" tone="secondary">This platform uses the private assistance available on this device.</AppText>
          </View>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxxl },
  intro: { gap: spacing.xs },
  manager: { borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.surface, padding: spacing.lg },
  basicNotice: { borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.xs },
});
