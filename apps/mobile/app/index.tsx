import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { colors, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

export default function IndexScreen() {
  const hydrated = useAppStore((state) => state.hydrated);
  const hasSeenOnboarding = useAppStore((state) => state.hasSeenOnboarding);

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <View style={styles.mark}><Text style={styles.markText}>C</Text></View>
        <Text style={styles.name}>Context</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <Redirect href={hasSeenOnboarding ? "/home" : "/onboarding"} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.canvas },
  mark: { width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  markText: { color: colors.white, fontSize: 34, fontWeight: "900" },
  name: { color: colors.ink, fontSize: 22, fontWeight: "800" },
});
