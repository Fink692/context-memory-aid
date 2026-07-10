import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors, spacing } from "@/constants/theme";
import { hydrateAppStore, useAppStore } from "@/store/app-store";

export default function RootLayout() {
  const router = useRouter();
  const hydrated = useAppStore((state) => state.hydrated);
  const hydrationError = useAppStore((state) => state.hydrationError);
  const deleteAllData = useAppStore((state) => state.deleteAllData);
  useEffect(() => {
    void hydrateAppStore();
  }, []);

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <View style={styles.mark}><Text style={styles.markText}>C</Text></View>
        <Text style={styles.loadingName}>Context</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (hydrationError) {
    return (
      <View style={styles.recovery}>
        <View style={styles.recoveryCard}>
          <View style={styles.mark}><Text style={styles.markText}>C</Text></View>
          <Text accessibilityRole="header" style={styles.recoveryTitle}>Context needs a fresh start.</Text>
          <Text accessibilityRole="alert" style={styles.recoveryBody}>{hydrationError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              deleteAllData();
              router.replace("/");
            }}
            style={({ pressed }) => [styles.recoveryButton, pressed && styles.recoveryButtonPressed]}
          >
            <Text style={styles.recoveryButtonText}>Delete invalid local data</Text>
          </Pressable>
          <Text style={styles.recoveryHint}>Context will return to onboarding. This affects only this app on this device.</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.canvas },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ headerShown: false }} />
        <Stack.Screen name="recognize" options={{ title: "Memory assist" }} />
        <Stack.Screen name="events" options={{ title: "Events" }} />
        <Stack.Screen name="contact/new" options={{ title: "Add person" }} />
        <Stack.Screen name="contact/edit/[id]" options={{ title: "Edit person" }} />
        <Stack.Screen name="contact/[id]" options={{ title: "Relationship context" }} />
        <Stack.Screen name="memory/[contactId]" options={{ title: "Add memory", presentation: "modal" }} />
        <Stack.Screen name="import" options={{ title: "Import attendees" }} />
        <Stack.Screen name="updates" options={{ title: "Public Update Watch" }} />
        <Stack.Screen name="settings" options={{ title: "Privacy & data" }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.canvas },
  mark: { width: 64, height: 64, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  markText: { color: colors.white, fontSize: 31, fontWeight: "900" },
  loadingName: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  recovery: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas, padding: spacing.lg },
  recoveryCard: { width: "100%", maxWidth: 480, alignItems: "flex-start", gap: spacing.md, borderRadius: 22, borderColor: "#DDD8CA", borderWidth: 1, backgroundColor: colors.white, padding: spacing.lg },
  recoveryTitle: { color: colors.ink, fontSize: 25, lineHeight: 31, fontWeight: "800" },
  recoveryBody: { color: "#B42318", fontSize: 14, lineHeight: 21 },
  recoveryButton: { width: "100%", minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#B42318", paddingHorizontal: spacing.lg },
  recoveryButtonPressed: { opacity: 0.82 },
  recoveryButtonText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  recoveryHint: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
});
