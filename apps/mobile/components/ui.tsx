import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { colors, controlSize, radius, shadow, spacing, typography } from "@/constants/theme";

const brandIcon = require("../assets/icon.png") as number;

export const symbols = {
  today: { ios: "house.fill", android: "home", web: "home" },
  people: { ios: "person.2.fill", android: "group", web: "group" },
  person: { ios: "person.fill", android: "person", web: "person" },
  events: { ios: "calendar", android: "calendar_month", web: "calendar_month" },
  settings: { ios: "gearshape.fill", android: "settings", web: "settings" },
  plus: { ios: "plus", android: "add", web: "add" },
  microphone: { ios: "mic.fill", android: "mic", web: "mic" },
  email: { ios: "envelope.fill", android: "mail", web: "mail" },
  phone: { ios: "phone.fill", android: "call", web: "call" },
  link: { ios: "link", android: "link", web: "link" },
  scan: { ios: "qrcode.viewfinder", android: "qr_code_scanner", web: "qr_code_scanner" },
  note: { ios: "square.and.pencil", android: "edit_note", web: "edit_note" },
  import: { ios: "person.crop.circle.badge.plus", android: "person_add", web: "person_add" },
  updates: { ios: "bell.badge.fill", android: "notifications_active", web: "notifications_active" },
  lock: { ios: "lock.fill", android: "lock", web: "lock" },
  shield: { ios: "lock.shield.fill", android: "shield_lock", web: "shield_lock" },
  sparkles: { ios: "sparkles", android: "auto_awesome", web: "auto_awesome" },
  camera: { ios: "camera.fill", android: "photo_camera", web: "photo_camera" },
  model: { ios: "cpu.fill", android: "memory", web: "memory" },
  privacy: { ios: "hand.raised.fill", android: "privacy_tip", web: "privacy_tip" },
  info: { ios: "info.circle.fill", android: "info", web: "info" },
  warning: { ios: "exclamationmark.triangle.fill", android: "warning", web: "warning" },
  check: { ios: "checkmark", android: "check", web: "check" },
  checkCircle: { ios: "checkmark.circle.fill", android: "check_circle", web: "check_circle" },
  chevron: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
  ellipsis: { ios: "ellipsis", android: "more_horiz", web: "more_horiz" },
  trash: { ios: "trash.fill", android: "delete", web: "delete" },
  share: { ios: "square.and.arrow.up", android: "share", web: "share" },
  export: { ios: "arrow.up.doc.fill", android: "upload_file", web: "upload_file" },
  restore: { ios: "arrow.counterclockwise", android: "restore", web: "restore" },
} as const satisfies Record<string, SymbolViewProps["name"]>;

export type AppSymbolName = SymbolViewProps["name"];
type TextRole = keyof typeof typography;
type TextTone = "primary" | "secondary" | "tertiary" | "tint" | "success" | "warning" | "destructive" | "onTint";
type TextEmphasis = "regular" | "medium" | "semibold" | "bold";

export function Screen({
  children,
  scroll = true,
  safeEdges = ["right", "bottom", "left"],
  contentContainerStyle,
  ...props
}: PropsWithChildren<
  ScrollViewProps & { scroll?: boolean; safeEdges?: Edge[]; contentContainerStyle?: StyleProp<ViewStyle> }
>) {
  if (!scroll) {
    return (
      <SafeAreaView collapsable={false} edges={safeEdges} style={styles.safeArea}>
        <View collapsable={false} style={[styles.content, styles.flex, contentContainerStyle]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView collapsable={false} edges={safeEdges} style={styles.safeArea}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
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

export function AppText({
  children,
  role = "body",
  tone = "primary",
  emphasis = "regular",
  style,
  ...props
}: PropsWithChildren<Omit<TextProps, "role"> & {
  role?: TextRole;
  tone?: TextTone;
  emphasis?: TextEmphasis;
}>) {
  return (
    <Text {...props} style={[typography[role], textToneStyles[tone], textEmphasisStyles[emphasis], style]}>
      {children}
    </Text>
  );
}

export function AppSymbol({
  name,
  size = 20,
  tone = "tint",
  weight,
  type,
  style,
  animationSpec,
}: {
  name: AppSymbolName;
  size?: number;
  tone?: TextTone;
  weight?: SymbolViewProps["weight"];
  type?: SymbolViewProps["type"];
  style?: SymbolViewProps["style"];
  animationSpec?: SymbolViewProps["animationSpec"];
}) {
  return (
    <SymbolView
      accessible={false}
      name={name}
      size={size}
      style={style}
      tintColor={textToneStyles[tone].color ?? colors.primary}
      {...(weight === undefined ? {} : { weight })}
      {...(type === undefined ? {} : { type })}
      {...(animationSpec === undefined ? {} : { animationSpec })}
    />
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <AppText emphasis="semibold" role="footnote" tone="tint">{children}</AppText>;
}

export function Title({ children, compact = false }: PropsWithChildren<{ compact?: boolean }>) {
  return <AppText accessibilityRole="header" emphasis="bold" role={compact ? "title1" : "largeTitle"}>{children}</AppText>;
}

export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  return <AppText tone={muted ? "secondary" : "primary"}>{children}</AppText>;
}

export function TextField({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.inkTertiary}
      {...props}
      style={[styles.textField, style]}
    />
  );
}

export function FormField({
  label,
  trailing,
  containerStyle,
  ...props
}: TextInputProps & {
  label: string;
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.formField, containerStyle]}>
      <AppText emphasis="semibold" role="footnote" tone="secondary">{label}</AppText>
      <View style={styles.formInputRow}>
        <TextInput
          accessibilityLabel={props.accessibilityLabel ?? label}
          placeholderTextColor={colors.inkTertiary}
          {...props}
          style={[styles.formInput, props.multiline && styles.formInputMultiline, props.style]}
        />
        {trailing ? <View style={styles.formTrailing}>{trailing}</View> : null}
      </View>
    </View>
  );
}

type CardVariant = "flat" | "raised" | "tinted";

export function Card({
  children,
  style,
  variant = "flat",
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; variant?: CardVariant }>) {
  return <View style={[styles.card, cardStyles[variant], style]}>{children}</View>;
}

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "inverse";

function accessibleText(children: ReactNode): string | undefined {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (!Array.isArray(children)) return undefined;
  const label = children
    .map(accessibleText)
    .filter((value): value is string => Boolean(value))
    .join("");
  return label || undefined;
}

export function Button({
  children,
  variant = "primary",
  loading = false,
  disabled,
  style,
  accessibilityLabel,
  accessibilityState,
  symbol,
  ...props
}: PropsWithChildren<
  Omit<PressableProps, "style"> & {
    variant?: ButtonVariant;
    loading?: boolean;
    symbol?: AppSymbolName;
    style?: StyleProp<ViewStyle>;
  }
>) {
  const flattenedStyle = StyleSheet.flatten(style);
  const requestedMinHeight = typeof flattenedStyle?.minHeight === "number"
    ? flattenedStyle.minHeight
    : controlSize.buttonHeight;
  const minHeight = Math.max(controlSize.minimumTouchTarget, requestedMinHeight);
  const foregroundTone: TextTone = variant === "primary" || variant === "inverse"
    ? "onTint"
    : variant === "danger"
      ? "destructive"
      : "tint";

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel ?? accessibleText(children)}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled || loading), busy: loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        buttonStyles[variant],
        pressed && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled,
        style,
        { minHeight },
      ]}
    >
      <View style={styles.buttonContent}>
        {symbol ? <AppSymbol name={symbol} size={17} tone={foregroundTone} weight="semibold" /> : null}
        <AppText emphasis="semibold" role="headline" style={loading && styles.buttonTextLoading} tone={foregroundTone}>{children}</AppText>
        {loading ? <ActivityIndicator color={textToneStyles[foregroundTone].color} style={styles.buttonSpinner} /> : null}
      </View>
    </Pressable>
  );
}

export function IconButton({
  symbol,
  accessibilityLabel,
  tone = "tint",
  loading = false,
  disabled,
  style,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  symbol: AppSymbolName;
  accessibilityLabel: string;
  tone?: TextTone;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed, (disabled || loading) && styles.buttonDisabled, style]}
    >
      {loading ? <ActivityIndicator color={textToneStyles[tone].color} /> : <AppSymbol name={symbol} size={20} tone={tone} weight="semibold" />}
    </Pressable>
  );
}

export function BarButton({
  children,
  disabled,
  loading = false,
  destructive = false,
  style,
  ...props
}: PropsWithChildren<Omit<PressableProps, "style"> & {
  loading?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <Pressable
      {...props}
      accessibilityLabel={props.accessibilityLabel ?? accessibleText(children)}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.barButton, pressed && styles.buttonPressed, (disabled || loading) && styles.buttonDisabled, style]}
    >
      <AppText emphasis="semibold" role="body" style={loading && styles.buttonTextLoading} tone={destructive ? "destructive" : "tint"}>{children}</AppText>
      {loading ? <ActivityIndicator color={destructive ? colors.danger : colors.primary} style={styles.buttonSpinner} /> : null}
    </Pressable>
  );
}

export function Avatar({ name, photoUri, size = 52 }: { name: string; photoUri?: string | undefined; size?: number }) {
  const localPhotoUri = typeof photoUri === "string" && /^(?:file|content):\/\//i.test(photoUri.trim())
    ? photoUri.trim()
    : undefined;
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    setPhotoFailed(false);
  }, [localPhotoUri]);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text allowFontScaling={false} style={[styles.avatarText, { fontSize: size * 0.32 }]}>{initials}</Text>
      {localPhotoUri && !photoFailed ? (
        <Image
          accessible={false}
          onError={() => setPhotoFailed(true)}
          resizeMode="cover"
          source={{ uri: localPhotoUri }}
          style={styles.avatarImage}
        />
      ) : null}
    </View>
  );
}

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      accessible={false}
      resizeMode="cover"
      source={brandIcon}
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
    />
  );
}

export function Pill({ children, tone = "neutral" }: PropsWithChildren<{ tone?: "neutral" | "safe" | "warning" }>) {
  return (
    <View style={[styles.pill, tone === "safe" && styles.pillSafe, tone === "warning" && styles.pillWarning]}>
      <AppText emphasis="semibold" role="caption1" tone={tone === "safe" ? "success" : tone === "warning" ? "warning" : "secondary"}>
        {children}
      </AppText>
    </View>
  );
}

export function DetailRow({ label, value }: { label: string; value?: ReactNode }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <AppText emphasis="semibold" role="footnote" tone="secondary">{label}</AppText>
      {typeof value === "string" ? <AppText role="callout" style={styles.detailValue}>{value}</AppText> : value}
    </View>
  );
}

export function ListSection({
  children,
  title,
  footer,
  style,
  groupStyle,
}: PropsWithChildren<{
  title?: string;
  footer?: string;
  style?: StyleProp<ViewStyle>;
  groupStyle?: StyleProp<ViewStyle>;
}>) {
  return (
    <View style={[styles.listSection, style]}>
      {title ? <AppText emphasis="semibold" role="footnote" style={styles.listSectionTitle} tone="secondary">{title}</AppText> : null}
      <View style={[styles.listGroup, groupStyle]}>{children}</View>
      {footer ? <AppText role="footnote" style={styles.listSectionFooter} tone="secondary">{footer}</AppText> : null}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  detail,
  leading,
  symbol,
  accessory = "none",
  accessoryNode,
  destructive = false,
  last = false,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  detail?: string;
  leading?: ReactNode;
  symbol?: AppSymbolName;
  accessory?: "none" | "disclosure" | "checkmark";
  accessoryNode?: ReactNode;
  destructive?: boolean;
  last?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <>
      {leading ?? (symbol ? <View style={styles.rowSymbol}><AppSymbol name={symbol} size={19} tone={destructive ? "destructive" : "tint"} weight="semibold" /></View> : null)}
      <View style={styles.rowCopy}>
        <AppText emphasis="regular" role="body" tone={destructive ? "destructive" : "primary"}>{title}</AppText>
        {subtitle ? <AppText role="subheadline" tone="secondary">{subtitle}</AppText> : null}
      </View>
      {detail ? <AppText role="subheadline" style={styles.rowDetail} tone="secondary">{detail}</AppText> : null}
      {accessoryNode}
      {accessory === "disclosure" ? <AppSymbol name={symbols.chevron} size={16} tone="tertiary" weight="semibold" /> : null}
      {accessory === "checkmark" ? <AppSymbol name={symbols.check} size={18} tone="tint" weight="semibold" /> : null}
    </>
  );
  const rowStyle = [styles.listRow, !last && styles.listRowSeparated];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, detail].filter(Boolean).join(". ")}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [rowStyle, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

export function ErrorBanner({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={[styles.notice, styles.errorBanner]}>
      <AppSymbol name={symbols.warning} size={18} tone="destructive" />
      <AppText emphasis="medium" role="subheadline" style={styles.noticeCopy} tone="destructive">{message}</AppText>
    </View>
  );
}

export function SuccessBanner({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={[styles.notice, styles.successBanner]}>
      <AppSymbol name={symbols.checkCircle} size={18} tone="success" />
      <AppText emphasis="medium" role="subheadline" style={styles.noticeCopy} tone="success">{message}</AppText>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
  symbol = symbols.info,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  symbol?: AppSymbolName;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptySymbol}><AppSymbol name={symbol} size={30} tone="tint" weight="semibold" /></View>
      <AppText accessibilityRole="header" emphasis="semibold" role="title3">{title}</AppText>
      <AppText role="callout" style={styles.emptyBody} tone="secondary">{body}</AppText>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
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
        <AppText accessibilityRole="header" emphasis="semibold" role="title2">{title}</AppText>
        {subtitle ? <AppText role="footnote" tone="secondary">{subtitle}</AppText> : null}
      </View>
      {action}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const textToneStyles = StyleSheet.create<Record<TextTone, TextStyle>>({
  primary: { color: colors.ink },
  secondary: { color: colors.inkMuted },
  tertiary: { color: colors.inkTertiary },
  tint: { color: colors.primary },
  success: { color: colors.success },
  warning: { color: colors.warning },
  destructive: { color: colors.danger },
  onTint: { color: colors.onDark },
});

const textEmphasisStyles = StyleSheet.create<Record<TextEmphasis, TextStyle>>({
  regular: { fontWeight: "400" },
  medium: { fontWeight: "500" },
  semibold: { fontWeight: "600" },
  bold: { fontWeight: "700" },
});

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft },
  quiet: { backgroundColor: "transparent" },
  danger: { backgroundColor: colors.dangerSoft },
  inverse: { backgroundColor: "rgba(255, 255, 255, 0.14)", borderColor: "rgba(255, 255, 255, 0.42)", borderWidth: StyleSheet.hairlineWidth },
});

const cardStyles = StyleSheet.create({
  flat: {},
  raised: { ...shadow },
  tinted: { backgroundColor: colors.primarySoft },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", backgroundColor: colors.canvas, padding: spacing.lg, gap: spacing.lg },
  textField: {
    minHeight: 50,
    borderRadius: radius.md,
    borderCurve: "continuous",
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    color: colors.ink,
    ...typography.body,
  },
  formField: { gap: spacing.xs },
  formInputRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  formInput: { minHeight: 52, flex: 1, paddingHorizontal: spacing.lg, color: colors.ink, ...typography.body },
  formInputMultiline: { minHeight: 120, paddingTop: spacing.md, textAlignVertical: "top" },
  formTrailing: { paddingRight: spacing.xs },
  card: {
    width: "100%",
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  button: {
    minHeight: controlSize.buttonHeight,
    borderRadius: radius.md,
    borderCurve: "continuous",
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContent: { position: "relative", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  buttonSpinner: { position: "absolute" },
  buttonPressed: { opacity: 0.68 },
  buttonDisabled: { opacity: 0.42 },
  buttonTextLoading: { opacity: 0 },
  iconButton: {
    width: controlSize.minimumTouchTarget,
    height: controlSize.minimumTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
  },
  barButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs },
  avatar: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft, overflow: "hidden" },
  avatarImage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, height: "100%", width: "100%" },
  avatarText: { color: colors.primaryDark, fontWeight: "600" },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: colors.fill, paddingHorizontal: 9, paddingVertical: 4 },
  pillSafe: { backgroundColor: colors.successSoft },
  pillWarning: { backgroundColor: colors.warningSoft },
  detailRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.lg, paddingVertical: spacing.sm },
  detailValue: { flex: 1, textAlign: "right" },
  listSection: { width: "100%", gap: spacing.sm },
  listSectionTitle: { marginHorizontal: spacing.lg, textTransform: "uppercase", letterSpacing: 0.2 },
  listSectionFooter: { marginHorizontal: spacing.lg },
  listGroup: { overflow: "hidden", borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.surface },
  listRow: { minHeight: controlSize.rowHeight, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 11 },
  listRowSeparated: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  rowPressed: { backgroundColor: colors.fill },
  rowSymbol: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.primarySoft },
  rowCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  rowDetail: { flexShrink: 1, textAlign: "right" },
  notice: { flexDirection: "row", alignItems: "flex-start", borderRadius: radius.md, borderCurve: "continuous", padding: spacing.md, gap: spacing.sm },
  noticeCopy: { flex: 1 },
  errorBanner: { backgroundColor: colors.dangerSoft },
  successBanner: { backgroundColor: colors.successSoft },
  emptyState: { width: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, gap: spacing.sm },
  emptySymbol: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.primarySoft, marginBottom: spacing.xs },
  emptyBody: { maxWidth: 360, textAlign: "center" },
  emptyAction: { width: "100%", maxWidth: 360, marginTop: spacing.sm },
  sectionHeader: { width: "100%", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.md },
  sectionCopy: { flex: 1, minWidth: 220, gap: spacing.xxs },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
});
