import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/constants/theme";
import { hydrateAppStore } from "@/store/app-store";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  }));

  useEffect(() => {
    void hydrateAppStore();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
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
        <Stack.Screen name="contact/new" options={{ title: "Add person" }} />
        <Stack.Screen name="contact/[id]" options={{ title: "Relationship context" }} />
        <Stack.Screen name="memory/[contactId]" options={{ title: "Add memory", presentation: "modal" }} />
        <Stack.Screen name="import" options={{ title: "Import attendees" }} />
        <Stack.Screen name="settings" options={{ title: "Privacy & data" }} />
      </Stack>
    </QueryClientProvider>
  );
}
