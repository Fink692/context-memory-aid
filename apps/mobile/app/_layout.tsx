import { useEffect, useReducer, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, ScrollView, StyleSheet, useColorScheme, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppText, BrandMark, Button } from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import {
  createInitialAppLockState,
  deviceAuthenticationErrorMessage,
  reduceAppLock,
} from "@/lib/app-lock-state";
import { clearAllFaceTemplates } from "@/lib/face-templates";
import { clearUpdateWatchData } from "@/lib/update-watcher";
import { hydrateAppStore, useAppStore } from "@/store/app-store";

const lightNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: "#5856D6",
    background: "#F2F2F7",
    card: "#F2F2F7",
    text: "#111114",
    border: "rgba(60, 60, 67, 0.22)",
    notification: "#FF3B30",
  },
};

const darkNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: "#7D7AFF",
    background: "#000000",
    card: "#000000",
    text: "#FFFFFF",
    border: "rgba(84, 84, 88, 0.65)",
    notification: "#FF453A",
  },
};

export default function RootLayout() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const navigationTheme = colorScheme === "dark" ? darkNavigationTheme : lightNavigationTheme;
  const hydrated = useAppStore((state) => state.hydrated);
  const hydrationError = useAppStore((state) => state.hydrationError);
  const appLockEnabled = useAppStore((state) => state.appLockEnabled);
  const deleteAllData = useAppStore((state) => state.deleteAllData);
  const [lockState, dispatchLock] = useReducer(reduceAppLock, undefined, createInitialAppLockState);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string>();
  const lockConfigurationInitialized = useRef(false);
  useEffect(() => {
    void hydrateAppStore();
  }, []);

  useEffect(() => {
    if (!hydrated || Platform.OS === "web") return;
    if (!lockConfigurationInitialized.current) {
      lockConfigurationInitialized.current = true;
      dispatchLock({ type: "INITIALIZE", enabled: appLockEnabled, appState: AppState.currentState });
      return;
    }
    dispatchLock({ type: appLockEnabled ? "ENABLE_AFTER_AUTHENTICATION" : "DISABLE" });
  }, [appLockEnabled, hydrated]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (state) => {
      dispatchLock({ type: "APP_STATE_CHANGED", appState: state });
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (lockState.phase !== "authenticating" || Platform.OS === "web") return;
    const attempt = lockState.attempt;
    let disposed = false;
    void (async () => {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock Context",
          promptDescription: "Open your private relationship memory",
          cancelLabel: "Not now",
          fallbackLabel: "Use device passcode",
          disableDeviceFallback: false,
        });
        if (disposed) return;
        dispatchLock(result.success
          ? { type: "AUTHENTICATION_SUCCEEDED", attempt }
          : {
              type: "AUTHENTICATION_FAILED",
              attempt,
              message: deviceAuthenticationErrorMessage(result.error),
            });
      } catch {
        if (!disposed) {
          dispatchLock({
            type: "AUTHENTICATION_FAILED",
            attempt,
            message: "iOS could not start device authentication. Check Face ID, Touch ID, or passcode settings and try again.",
          });
        }
      }
    })();
    return () => { disposed = true; };
  }, [lockState.attempt, lockState.phase]);

  const resetInvalidWorkspace = async () => {
    setRecoveryBusy(true);
    setRecoveryError(undefined);
    try {
      if (Platform.OS === "web") await clearUpdateWatchData().catch(() => undefined);
      else await Promise.all([clearUpdateWatchData(), clearAllFaceTemplates()]);
      deleteAllData();
      router.replace("/onboarding");
    } catch {
      setRecoveryError("Context could not clear every private storage area. Nothing was reset; try again.");
    } finally {
      setRecoveryBusy(false);
    }
  };

  if (!hydrated) {
    return (
      <ScrollView
        contentContainerStyle={styles.loading}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        style={styles.gateScroller}
      >
        <BrandMark size={64} />
        <AppText emphasis="semibold" role="headline">Context</AppText>
        <ActivityIndicator
          accessibilityLabel="Loading Context"
          accessibilityRole="progressbar"
          accessibilityState={{ busy: true }}
          color={colors.primary}
        />
      </ScrollView>
    );
  }

  if (hydrationError) {
    return (
      <ScrollView
        accessibilityViewIsModal
        contentContainerStyle={styles.recovery}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        style={styles.gateScroller}
      >
        <View style={styles.recoveryCard}>
          <BrandMark size={64} />
          <AppText accessibilityRole="header" emphasis="bold" role="title1">Context needs a fresh start.</AppText>
          <AppText accessibilityRole="alert" role="callout" tone="destructive">{hydrationError}</AppText>
          {recoveryError ? <AppText accessibilityRole="alert" role="callout" tone="destructive">{recoveryError}</AppText> : null}
          <Button
            accessibilityLabel="Delete invalid local data"
            loading={recoveryBusy}
            onPress={() => { void resetInvalidWorkspace(); }}
            style={styles.fullButton}
            variant="danger"
          >
            Delete Invalid Data
          </Button>
          <AppText role="footnote" tone="secondary">Context will return to onboarding. This affects only this app on this device.</AppText>
        </View>
      </ScrollView>
    );
  }

  const locked = appLockEnabled && Platform.OS !== "web" && lockState.phase !== "unlocked";

  return (
    <ThemeProvider value={navigationTheme}>
      <View style={styles.root}>
        <View
          accessibilityElementsHidden={locked}
          importantForAccessibility={locked ? "no-hide-descendants" : "auto"}
          style={[styles.appContent, locked && styles.appContentLocked]}
        >
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: navigationTheme.colors.card },
              headerShadowVisible: false,
              headerBackButtonDisplayMode: "minimal",
              headerTintColor: navigationTheme.colors.primary,
              headerTitleStyle: { color: navigationTheme.colors.text, fontWeight: "600" },
              contentStyle: { backgroundColor: navigationTheme.colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="recognize" options={{ title: "Memory assist" }} />
            <Stack.Screen name="event/[id]/attendees" options={{ title: "Manage attendees" }} />
            <Stack.Screen name="contact/new" options={{ title: "New Person", presentation: "modal" }} />
            <Stack.Screen name="contact/edit/[id]" options={{ title: "Edit Person", presentation: "modal" }} />
            <Stack.Screen name="contact/[id]" options={{ title: "Relationship context" }} />
            <Stack.Screen name="contact/badge/[id]" options={{ title: "Context badge" }} />
            <Stack.Screen name="badge/[badgeId]" options={{ headerShown: false }} />
            <Stack.Screen name="memory/[contactId]" options={{ title: "New Memory", presentation: "modal" }} />
            <Stack.Screen name="contacts-import" options={{ title: "Import Contacts", presentation: "modal" }} />
            <Stack.Screen name="import" options={{ title: "Import People" }} />
            <Stack.Screen name="updates" options={{ title: "Public Update Watch" }} />
            <Stack.Screen name="privacy" options={{ title: "Privacy notice" }} />
          </Stack>
        </View>
        {locked ? (
          <ScrollView
            accessibilityViewIsModal
            contentContainerStyle={styles.lockedContent}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
            style={styles.locked}
          >
            <View style={styles.lockCard}>
              <BrandMark size={72} />
              <AppText accessibilityRole="header" emphasis="bold" role="title1">Context is locked.</AppText>
              <AppText tone="secondary">Use Face ID, Touch ID, or your device passcode to open your relationship memory.</AppText>
              {lockState.error ? <AppText accessibilityRole="alert" role="callout" tone="destructive">{lockState.error}</AppText> : null}
              <Button
                accessibilityLabel="Unlock Context"
                loading={lockState.phase === "authenticating"}
                onPress={() => dispatchLock({ type: "REQUEST_UNLOCK" })}
                style={styles.fullButton}
              >
                Unlock Context
              </Button>
              <AppText role="footnote" tone="secondary">Authentication is handled by iOS. Context never receives or stores biometric data.</AppText>
            </View>
          </ScrollView>
        ) : null}
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  appContent: { flex: 1, backgroundColor: colors.canvas },
  appContentLocked: { pointerEvents: "none" },
  gateScroller: { flex: 1, backgroundColor: colors.canvas },
  loading: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.canvas, padding: spacing.lg },
  recovery: { flexGrow: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas, padding: spacing.lg },
  recoveryCard: { width: "100%", maxWidth: 420, alignItems: "flex-start", gap: spacing.lg, padding: spacing.lg },
  locked: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.canvas },
  lockedContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  lockCard: { width: "100%", maxWidth: 420, alignItems: "flex-start", gap: spacing.lg, padding: spacing.lg },
  fullButton: { width: "100%" },
});
