import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Platform, ScrollView, StyleSheet, useColorScheme, View, type LayoutChangeEvent } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppText, BrandMark, Button } from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import {
  createInitialAppLockState,
  deviceAuthenticationErrorMessage,
  isAppLockConfigurationReady,
  reduceAppLock,
} from "@/lib/app-lock-state";
import { clearAllFaceTemplates } from "@/lib/face-templates";
import {
  createInitialPrivacyCoverState,
  reducePrivacyCover,
  shouldHidePrivateContent,
} from "@/lib/privacy-cover-state";
import {
  getNativePrivacyShieldState,
  hasNativePrivacyShield,
  releaseNativePrivacyShield,
  subscribeToNativePrivacyShield,
  type NativePrivacyShieldSnapshot,
} from "@/lib/native-privacy-shield";
import {
  markNativePrivacyShieldReady,
  markNativePrivacyShieldReleasing,
  receiveNativePrivacyShieldSnapshot,
  resolveNativePrivacyShieldRelease,
  shouldReconcileNativeBackground,
  type NativePrivacyShieldHandoff,
} from "@/lib/native-privacy-shield-state";
import { clearPrivateProfilePhotos, prunePrivateProfilePhotos } from "@/lib/profile-photo";
import { clearSensitiveTemporaryFiles } from "@/lib/sensitive-cache";
import { clearUpdateWatchData } from "@/lib/legacy-update-watch-cleanup";
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
  const [privacyCover, dispatchPrivacyCover] = useReducer(
    reducePrivacyCover,
    AppState.currentState,
    createInitialPrivacyCoverState,
  );
  const [recoveryAction, setRecoveryAction] = useState<"retry" | "erase">();
  const [recoveryError, setRecoveryError] = useState<string>();
  const nativePrivacyBridgeAvailable = Platform.OS === "ios" && hasNativePrivacyShield();
  const [nativePrivacyStateLoaded, setNativePrivacyStateLoaded] = useState(!nativePrivacyBridgeAvailable);
  const [nativePrivacyHandoff, setNativePrivacyHandoff] = useState<NativePrivacyShieldHandoff>();
  const configuredAppLockEnabled = useRef<boolean | undefined>(undefined);
  const lockConfigurationInitialized = useRef(false);
  const lastReconciledNativeBackgroundEpoch = useRef(0);
  const nativeReleaseEpochInFlight = useRef(0);
  const profilePhotoPruneStarted = useRef(false);
  const receiveNativePrivacySnapshot = useCallback((snapshot: NativePrivacyShieldSnapshot) => {
    setNativePrivacyHandoff((current) => receiveNativePrivacyShieldSnapshot(current, snapshot));
    setNativePrivacyStateLoaded(true);
  }, []);
  useEffect(() => {
    void clearSensitiveTemporaryFiles().catch(() => undefined);
    void hydrateAppStore();
  }, []);

  useEffect(() => {
    const nativeLifecycleReady = !nativePrivacyBridgeAvailable
      || (nativePrivacyStateLoaded
        && (!nativePrivacyHandoff || nativePrivacyHandoff.snapshot.applicationState === "active"));
    if (
      !nativeLifecycleReady
      || !isAppLockConfigurationReady(hydrated, hydrationError, Platform.OS !== "web")
    ) {
      // A failed storage read must not initialize the default (unlocked)
      // preference. A successful retry then takes the first-run INITIALIZE
      // path and authenticates a protected workspace before showing it.
      if (hydrationError) {
        lockConfigurationInitialized.current = false;
        configuredAppLockEnabled.current = undefined;
      }
      return;
    }
    if (!lockConfigurationInitialized.current) {
      const initialNativeBackgroundEpoch = nativePrivacyHandoff?.snapshot.enteredBackground
        ? nativePrivacyHandoff.snapshot.epoch
        : 0;
      lastReconciledNativeBackgroundEpoch.current = Math.max(
        lastReconciledNativeBackgroundEpoch.current,
        initialNativeBackgroundEpoch,
      );
      lockConfigurationInitialized.current = true;
      configuredAppLockEnabled.current = appLockEnabled;
      dispatchLock({ type: "INITIALIZE", enabled: appLockEnabled, appState: AppState.currentState });
      return;
    }
    if (configuredAppLockEnabled.current === appLockEnabled) return;
    configuredAppLockEnabled.current = appLockEnabled;
    dispatchLock({ type: appLockEnabled ? "ENABLE_AFTER_AUTHENTICATION" : "DISABLE" });
  }, [appLockEnabled, hydrated, hydrationError, nativePrivacyBridgeAvailable, nativePrivacyHandoff, nativePrivacyStateLoaded]);

  useEffect(() => {
    // A picker save can finish just before process termination. Prune only
    // after the persisted workspace has hydrated and passed store validation;
    // hydration failures deliberately leave every private photo untouched.
    if (!hydrated || hydrationError || profilePhotoPruneStarted.current) return;
    profilePhotoPruneStarted.current = true;
    const referencedUris = useAppStore.getState().contacts.map((contact) => contact.photoUri);
    void prunePrivateProfilePhotos(referencedUris).catch(() => undefined);
  }, [hydrated, hydrationError]);

  useEffect(() => {
    if (!nativePrivacyBridgeAvailable) return undefined;
    let disposed = false;
    const subscription = subscribeToNativePrivacyShield((snapshot) => {
      if (!disposed) receiveNativePrivacySnapshot(snapshot);
    });
    void getNativePrivacyShieldState()
      .then((snapshot) => {
        if (!disposed && snapshot) receiveNativePrivacySnapshot(snapshot);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      subscription?.remove();
    };
  }, [nativePrivacyBridgeAvailable, receiveNativePrivacySnapshot]);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const subscription = AppState.addEventListener("change", (state) => {
      if (nativePrivacyBridgeAvailable) {
        // UIKit owns the authoritative iOS lifecycle. RN AppState is only a
        // prompt to query it, so a delayed JS "background" event cannot
        // re-lock or uncover the wrong native shield epoch.
        void getNativePrivacyShieldState()
          .then((snapshot) => { if (snapshot) receiveNativePrivacySnapshot(snapshot); })
          .catch(() => undefined);
        return;
      }
      // Keep this independent from App Lock: even unlocked workspaces must not
      // appear in an app-switcher snapshot on native builds without the bridge.
      dispatchPrivacyCover({ type: "APP_STATE_CHANGED", appState: state });
      dispatchLock({ type: "APP_STATE_CHANGED", appState: state });
    });
    return () => subscription.remove();
  }, [nativePrivacyBridgeAvailable, receiveNativePrivacySnapshot]);

  useEffect(() => {
    const handoff = nativePrivacyHandoff;
    if (
      !handoff
      || handoff.readyToRelease
      || handoff.snapshot.applicationState !== "active"
      || !hydrated
    ) return;
    if (shouldReconcileNativeBackground(
      handoff.snapshot,
      lastReconciledNativeBackgroundEpoch.current,
      appLockEnabled,
    )) {
      lastReconciledNativeBackgroundEpoch.current = handoff.snapshot.epoch;
      dispatchLock({ type: "NATIVE_BACKGROUND_REENTRY", epoch: handoff.snapshot.epoch });
    }
    setNativePrivacyHandoff((current) => markNativePrivacyShieldReady(current, handoff.snapshot.epoch));
  }, [appLockEnabled, hydrated, nativePrivacyHandoff]);

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

  const retrySavedWorkspace = async () => {
    if (recoveryAction) return;
    setRecoveryAction("retry");
    setRecoveryError(undefined);
    await hydrateAppStore();
    if (useAppStore.getState().hydrationError) {
      setRecoveryError("Context still could not open the saved workspace. You can try again or erase the local copy and start fresh.");
    }
    setRecoveryAction(undefined);
  };

  const eraseLocalWorkspace = async () => {
    if (recoveryAction) return;
    setRecoveryAction("erase");
    setRecoveryError(undefined);
    try {
      await deleteAllData();
      const cleanupResults = Platform.OS === "web"
        ? await Promise.allSettled([clearUpdateWatchData()])
        : await Promise.allSettled([
            clearAllFaceTemplates(),
            clearUpdateWatchData(),
            clearPrivateProfilePhotos(),
            clearSensitiveTemporaryFiles(),
          ]);
      router.replace("/onboarding");
      const cleanupFailures = cleanupResults.filter((result) => result.status === "rejected").length;
      if (cleanupFailures) {
        Alert.alert(
          "Workspace erased",
          "Your people, memories, events, and follow-ups were erased. Some supporting private files could not be removed; Context will retry cleanup the next time you erase local data.",
        );
      }
    } catch {
      setRecoveryError("Context could not save the erase operation, so your workspace was kept. Try again.");
    } finally {
      setRecoveryAction(undefined);
    }
  };

  const confirmEraseLocalWorkspace = () => {
    if (recoveryAction) return;
    Alert.alert(
      "Erase all local Context data?",
      "This permanently removes every person, memory, event, follow-up, relationship link, and private photo stored by this app on this iPhone. Backup files you exported remain unchanged.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Erase Local Data", style: "destructive", onPress: () => { void eraseLocalWorkspace(); } },
      ],
    );
  };

  const commitNativePrivacyCover = (epoch: number) => {
    const handoff = nativePrivacyHandoff;
    if (
      !handoff
      || handoff.snapshot.epoch !== epoch
      || !handoff.readyToRelease
      || handoff.releasing
      || nativeReleaseEpochInFlight.current === epoch
    ) return;
    nativeReleaseEpochInFlight.current = epoch;
    setNativePrivacyHandoff((current) => markNativePrivacyShieldReleasing(current, epoch));
    void releaseNativePrivacyShield(epoch)
      .then((result) => {
        if (!result) return;
        setNativePrivacyHandoff((current) => resolveNativePrivacyShieldRelease(current, result));
        if (result.released) {
          dispatchPrivacyCover({ type: "APP_STATE_CHANGED", appState: "active" });
        }
      })
      .catch(() => {
        setNativePrivacyHandoff((current) => current?.snapshot.epoch === epoch
          ? { ...current, releasing: false }
          : current);
      })
      .finally(() => {
        if (nativeReleaseEpochInFlight.current === epoch) nativeReleaseEpochInFlight.current = 0;
      });
  };

  const appSwitcherCoverVisible = Platform.OS === "ios"
    && (privacyCover.visible || Boolean(nativePrivacyHandoff));
  const privacyCoverElement = appSwitcherCoverVisible ? (
    <AppSwitcherPrivacyCover
      key={nativePrivacyHandoff
        ? `${nativePrivacyHandoff.snapshot.epoch}:${nativePrivacyHandoff.snapshot.applicationState}:${nativePrivacyHandoff.readyToRelease ? "ready" : "waiting"}`
        : "app-state"}
      {...(nativePrivacyHandoff?.readyToRelease
        ? { onLayout: () => commitNativePrivacyCover(nativePrivacyHandoff.snapshot.epoch) }
        : {})}
    />
  ) : null;

  if (!hydrated) {
    return (
      <View style={styles.root}>
        <ScrollView
          accessibilityElementsHidden={appSwitcherCoverVisible}
          contentContainerStyle={styles.loading}
          contentInsetAdjustmentBehavior="automatic"
          importantForAccessibility={appSwitcherCoverVisible ? "no-hide-descendants" : "auto"}
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
        {privacyCoverElement}
      </View>
    );
  }

  if (hydrationError) {
    return (
      <View style={styles.root}>
        <ScrollView
          accessibilityElementsHidden={appSwitcherCoverVisible}
          accessibilityViewIsModal={!appSwitcherCoverVisible}
          contentContainerStyle={styles.recovery}
          contentInsetAdjustmentBehavior="automatic"
          importantForAccessibility={appSwitcherCoverVisible ? "no-hide-descendants" : "auto"}
          showsVerticalScrollIndicator={false}
          style={styles.gateScroller}
        >
          <View style={styles.recoveryCard}>
            <BrandMark size={64} />
            <AppText accessibilityRole="header" emphasis="bold" role="title1">Context couldn’t open your saved data</AppText>
            <AppText accessibilityRole="alert" role="callout" tone="destructive">{hydrationError}</AppText>
            {recoveryError ? <AppText accessibilityRole="alert" role="callout" tone="destructive">{recoveryError}</AppText> : null}
            <Button
              disabled={Boolean(recoveryAction && recoveryAction !== "retry")}
              loading={recoveryAction === "retry"}
              onPress={() => { void retrySavedWorkspace(); }}
              style={styles.fullButton}
            >
              Try Again
            </Button>
            <Button
              accessibilityLabel="Erase local data"
              disabled={Boolean(recoveryAction && recoveryAction !== "erase")}
              loading={recoveryAction === "erase"}
              onPress={confirmEraseLocalWorkspace}
              style={styles.fullButton}
              variant="danger"
            >
              Erase Local Data
            </Button>
            <AppText role="footnote" tone="secondary">Erasing permanently removes this app’s local people, memories, events, follow-ups, relationship links, and private photos, then returns to onboarding.</AppText>
          </View>
        </ScrollView>
        {privacyCoverElement}
      </View>
    );
  }

  const locked = appLockEnabled && Platform.OS !== "web" && lockState.phase !== "unlocked";
  const privateContentCovered = shouldHidePrivateContent(appSwitcherCoverVisible, locked);

  return (
    <ThemeProvider value={navigationTheme}>
      <View style={styles.root}>
        <View
          accessibilityElementsHidden={privateContentCovered}
          importantForAccessibility={privateContentCovered ? "no-hide-descendants" : "auto"}
          style={[styles.appContent, privateContentCovered && styles.appContentLocked]}
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
            <Stack.Screen name="recognize" options={{ title: "Event People" }} />
            <Stack.Screen name="event/[id]/attendees" options={{ title: "Event People" }} />
            <Stack.Screen name="contact/new" options={{ title: "New Person", presentation: "modal" }} />
            <Stack.Screen name="contact/edit/[id]" options={{ title: "Edit Person", presentation: "modal" }} />
            <Stack.Screen name="contact/share/[id]" options={{ title: "Share Contact", presentation: "modal" }} />
            <Stack.Screen name="contact/[id]" options={{ title: "Relationship context" }} />
            <Stack.Screen name="contact-receive" options={{ title: "Scan Contact", presentation: "modal" }} />
            <Stack.Screen name="memory/[contactId]" options={{ title: "New Memory", presentation: "modal" }} />
            <Stack.Screen name="action/[id]" options={{ title: "Follow-up", presentation: "modal" }} />
            <Stack.Screen name="smart-assist" options={{ title: "Smart Assist" }} />
            <Stack.Screen name="contacts-import" options={{ title: "Import Contacts", presentation: "modal" }} />
            <Stack.Screen name="import" options={{ title: "Import People" }} />
            <Stack.Screen name="privacy" options={{ title: "Privacy notice" }} />
          </Stack>
        </View>
        {locked ? (
          <ScrollView
            accessibilityElementsHidden={appSwitcherCoverVisible}
            accessibilityViewIsModal={!appSwitcherCoverVisible}
            contentContainerStyle={styles.lockedContent}
            contentInsetAdjustmentBehavior="automatic"
            importantForAccessibility={appSwitcherCoverVisible ? "no-hide-descendants" : "auto"}
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
        {privacyCoverElement}
      </View>
    </ThemeProvider>
  );
}

function AppSwitcherPrivacyCover({ onLayout }: { onLayout?: (event: LayoutChangeEvent) => void }) {
  return (
    <View
      accessibilityLabel="Context privacy screen"
      accessibilityViewIsModal
      accessible
      collapsable={false}
      importantForAccessibility="yes"
      onLayout={onLayout}
      pointerEvents="auto"
      style={styles.privacyCover}
    >
      <BrandMark size={64} />
    </View>
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
  privacyCover: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvasPlain,
  },
  lockedContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  lockCard: { width: "100%", maxWidth: 420, alignItems: "flex-start", gap: spacing.lg, padding: spacing.lg },
  fullButton: { width: "100%" },
});
