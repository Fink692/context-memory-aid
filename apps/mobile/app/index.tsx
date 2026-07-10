import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Body, Button, Card, ErrorBanner, Screen } from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

export default function IndexScreen() {
  const hydrated = useAppStore((state) => state.hydrated);
  const hydrationError = useAppStore((state) => state.hydrationError);
  const hasSeenOnboarding = useAppStore((state) => state.hasSeenOnboarding);
  const deleteAllData = useAppStore((state) => state.deleteAllData);
  const router = useRouter();

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <View style={styles.mark}><Text style={styles.markText}>C</Text></View>
        <Text style={styles.name}>Context</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (hydrationError) {
    return (
      <Screen contentContainerStyle={styles.recovery}>
        <Card>
          <Text style={styles.recoveryTitle}>Context needs a fresh start.</Text>
          <ErrorBanner message={hydrationError} />
          <Body muted>This resets only the app workspace on this device.</Body>
          <Button
            onPress={() => {
              deleteAllData();
              router.replace("/onboarding");
            }}
          >
            Start a new workspace
          </Button>
        </Card>
      </Screen>
    );
  }

  return <Redirect href={hasSeenOnboarding ? "/home" : "/onboarding"} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.canvas },
  mark: { width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  markText: { color: colors.white, fontSize: 34, fontWeight: "900" },
  name: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  recovery: { flex: 1, justifyContent: "center" },
  recoveryTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: "800" },
});
