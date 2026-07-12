import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { colors } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

export default function IndexScreen() {
  const hydrated = useAppStore((state) => state.hydrated);
  const hasSeenOnboarding = useAppStore((state) => state.hasSeenOnboarding);

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          accessibilityLabel="Loading Context"
          accessibilityRole="progressbar"
          accessibilityState={{ busy: true }}
          color={colors.primary}
        />
      </View>
    );
  }

  return <Redirect href={hasSeenOnboarding ? "/home" : "/onboarding"} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas },
});
