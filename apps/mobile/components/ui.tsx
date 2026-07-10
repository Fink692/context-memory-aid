import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, shadow, spacing } from "@/constants/theme";

export function Screen({
  children,
  scroll = true,
  contentContainerStyle,
  ...props
}: PropsWithChildren<
  ScrollViewProps & { scroll?: boolean; contentContainerStyle?: StyleProp<ViewStyle> }
>) {
  if (!scroll) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.content, styles.flex, contentContainerStyle]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        {...props}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children, compact = false }: PropsWithChildren<{ compact?: boolean }>) {
  return <Text style={[styles.title, compact && styles.titleCompact]}>{children}</Text>;
}

export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

export function Button({
  children,
  variant = "primary",
  loading = false,
  disabled,
  style,
  ...props
}: PropsWithChildren<
  PressableProps & {
    variant?: ButtonVariant;
    loading?: boolean;
    style?: StyleProp<ViewStyle>;
  }
>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        buttonStyles[variant],
        pressed && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.white : colors.primary} />
      ) : (
        <Text style={[styles.buttonText, buttonTextStyles[variant]]}>{children}</Text>
      )}
    </Pressable>
  );
}

export function Avatar({ name, size = 52 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.32 }]}>{initials}</Text>
    </View>
  );
}

export function Pill({ children, tone = "neutral" }: PropsWithChildren<{ tone?: "neutral" | "safe" | "warning" }>) {
  return (
    <View style={[styles.pill, tone === "safe" && styles.pillSafe, tone === "warning" && styles.pillWarning]}>
      <Text style={[styles.pillText, tone === "safe" && styles.pillSafeText, tone === "warning" && styles.pillWarningText]}>
        {children}
      </Text>
    </View>
  );
}

export function DetailRow({ label, value }: { label: string; value?: ReactNode }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {typeof value === "string" ? <Text style={styles.detailValue}>{value}</Text> : value}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function SuccessBanner({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={styles.successBanner}>
      <Text style={styles.successText}>{message}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card style={styles.emptyState}>
      <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>C</Text></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action}
    </Card>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary, borderColor: colors.primary, borderWidth: 1 },
  secondary: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  quiet: { backgroundColor: "transparent" },
  danger: { backgroundColor: colors.dangerSoft, borderColor: "#FECDCA", borderWidth: 1 },
});

const buttonTextStyles = StyleSheet.create({
  primary: { color: colors.white },
  secondary: { color: colors.ink },
  quiet: { color: colors.primary },
  danger: { color: colors.danger },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  flex: { flex: 1 },
  content: { width: "100%", maxWidth: 920, alignSelf: "center", padding: spacing.lg, gap: spacing.md },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: { width: "100%", flexShrink: 1, color: colors.ink, fontSize: 38, lineHeight: 42, fontWeight: "800", letterSpacing: -1.2 },
  titleCompact: { fontSize: 30, lineHeight: 34 },
  body: { width: "100%", flexShrink: 1, color: colors.ink, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.inkMuted },
  card: {
    width: "100%",
    minWidth: 0,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow,
  },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.48 },
  buttonText: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  avatar: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  avatarText: { color: colors.primaryDark, fontWeight: "800" },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  pillSafe: { backgroundColor: colors.successSoft },
  pillSafeText: { color: colors.success },
  pillWarning: { backgroundColor: colors.warningSoft },
  pillWarningText: { color: colors.warning },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: 7 },
  detailLabel: { width: 96, color: colors.inkMuted, fontSize: 13, fontWeight: "700" },
  detailValue: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: "500" },
  errorBanner: { borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.dangerSoft, borderColor: "#FECDCA", borderWidth: 1 },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  successBanner: { borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.successSoft, borderColor: "#B7E4D2", borderWidth: 1 },
  successText: { color: colors.success, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  emptyState: { alignItems: "flex-start", padding: spacing.lg },
  emptyMark: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  emptyMarkText: { color: colors.primary, fontSize: 17, fontWeight: "900" },
  emptyTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  emptyBody: { color: colors.inkMuted, fontSize: 14, lineHeight: 21 },
  sectionHeader: { width: "100%", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: "800" },
  sectionSubtitle: { color: colors.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
});
