import { Platform, StyleSheet } from "react-native";
import { Tabs, useTheme } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { AppSymbol, symbols, type AppSymbolName } from "@/components/ui";
import { colors, controlSize, spacing, typography } from "@/constants/theme";

function WebTabIcon({ focused, name, size }: { focused: boolean; name: AppSymbolName; size: number }) {
  return (
    <AppSymbol
      name={name}
      size={Math.max(20, size)}
      tone={focused ? "tint" : "secondary"}
      weight={focused ? "semibold" : "regular"}
    />
  );
}

function WebTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarItemStyle: styles.webTabItem,
        tabBarLabelPosition: "below-icon",
        tabBarLabelStyle: styles.webTabLabel,
        tabBarStyle: styles.webTabBar,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarAccessibilityLabel: "Today tab",
          tabBarIcon: ({ focused, size }) => <WebTabIcon focused={focused} name={symbols.today} size={size} />,
          title: "Today",
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          tabBarAccessibilityLabel: "People tab",
          tabBarIcon: ({ focused, size }) => <WebTabIcon focused={focused} name={symbols.people} size={size} />,
          title: "People",
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          tabBarAccessibilityLabel: "Events tab",
          tabBarIcon: ({ focused, size }) => <WebTabIcon focused={focused} name={symbols.events} size={size} />,
          title: "Events",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarAccessibilityLabel: "Settings tab",
          tabBarIcon: ({ focused, size }) => <WebTabIcon focused={focused} name={symbols.settings} size={size} />,
          title: "Settings",
        }}
      />
    </Tabs>
  );
}

export default function MainTabsLayout() {
  if (Platform.OS === "web") return <WebTabs />;

  return <NativeMainTabs />;
}

function NativeMainTabs() {
  const navigationTheme = useTheme();
  const canvas = navigationTheme.colors.background;

  return (
    <NativeTabs
      backgroundColor={canvas}
      disableTransparentOnScrollEdge
      iconColor={{ default: colors.inkMuted, selected: colors.primary }}
      minimizeBehavior="never"
      sidebarAdaptable
      tintColor={colors.primary}
      unstable_nativeProps={{ nativeContainerStyle: { backgroundColor: canvas } }}
    >
      <NativeTabs.Trigger contentStyle={{ backgroundColor: canvas }} name="home">
        <NativeTabs.Trigger.Icon
          md={{ default: "home", selected: "home" }}
          sf={{ default: "house", selected: "house.fill" }}
        />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger contentStyle={{ backgroundColor: canvas }} name="people">
        <NativeTabs.Trigger.Icon
          md={{ default: "group", selected: "group" }}
          sf={{ default: "person.2", selected: "person.2.fill" }}
        />
        <NativeTabs.Trigger.Label>People</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger contentStyle={{ backgroundColor: canvas }} name="events">
        <NativeTabs.Trigger.Icon
          md={{ default: "calendar_month", selected: "calendar_month" }}
          sf={{ default: "calendar", selected: "calendar.circle.fill" }}
        />
        <NativeTabs.Trigger.Label>Events</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger contentStyle={{ backgroundColor: canvas }} name="settings">
        <NativeTabs.Trigger.Icon
          md={{ default: "settings", selected: "settings" }}
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
        />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

const styles = StyleSheet.create({
  webTabBar: {
    height: 64,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surfaceRaised,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  webTabItem: { minHeight: controlSize.minimumTouchTarget },
  webTabLabel: { ...typography.caption1, fontWeight: "600" },
});
