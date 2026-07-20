import { Stack, useTheme } from "expo-router";

export default function TodayStackLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{
      contentStyle: { backgroundColor: theme.colors.background },
      headerBackButtonDisplayMode: "minimal",
      headerLargeTitleEnabled: false,
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "transparent" },
      headerTintColor: theme.colors.primary,
      headerTitleStyle: { color: theme.colors.text, fontWeight: "600" },
    }}>
      <Stack.Screen name="index" options={{ title: "Today" }} />
    </Stack>
  );
}
