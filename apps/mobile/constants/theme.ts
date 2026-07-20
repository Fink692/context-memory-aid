import {
  DynamicColorIOS,
  Platform,
  PlatformColor,
  type ColorValue,
  type TextStyle,
  type ViewStyle,
} from "react-native";

function systemColor(name: string, fallback: string): ColorValue {
  return Platform.OS === "ios" ? PlatformColor(name) : fallback;
}

function adaptiveColor(light: string, dark: string): ColorValue {
  return Platform.OS === "ios" ? DynamicColorIOS({ light, dark }) : light;
}

/**
 * Semantic, appearance-aware colors. Content uses iOS system materials while
 * Context keeps system indigo as its single recognizable tint.
 */
export const colors = {
  ink: systemColor("label", "#111114"),
  inkMuted: adaptiveColor("#5E5E65", "#B8B8BE"),
  inkTertiary: adaptiveColor("#6E6E73", "#A0A0A7"),
  fieldPlaceholder: adaptiveColor("#6E6E73", "#AEAEB2"),
  canvas: systemColor("systemGroupedBackground", "#F2F2F7"),
  canvasPlain: systemColor("systemBackground", "#FFFFFF"),
  surface: systemColor("secondarySystemGroupedBackground", "#FFFFFF"),
  surfaceAlt: systemColor("tertiarySystemGroupedBackground", "#F2F2F7"),
  surfaceRaised: systemColor("systemBackground", "#FFFFFF"),
  fill: systemColor("tertiarySystemFill", "#E5E5EA"),
  fillStrong: systemColor("secondarySystemFill", "#D1D1D6"),
  border: systemColor("separator", "rgba(60, 60, 67, 0.22)"),
  borderStrong: systemColor("opaqueSeparator", "#C6C6C8"),
  primary: adaptiveColor("#5856D6", "#7D7AFF"),
  primaryFill: adaptiveColor("#5856D6", "#5E5CE6"),
  primaryDark: adaptiveColor("#3634A3", "#B8B7FF"),
  primarySoft: adaptiveColor("#EEEDFF", "#2B294F"),
  primaryBorder: adaptiveColor("#D8D7FA", "#464378"),
  accent: adaptiveColor("#E96A4B", "#FF8A70"),
  success: systemColor("systemGreenColor", "#248A3D"),
  successSoft: adaptiveColor("#E8F7EC", "#173C25"),
  successSurface: adaptiveColor("#F2FBF4", "#142B1C"),
  successBorder: adaptiveColor("#B9E4C4", "#2F6840"),
  warning: systemColor("systemOrangeColor", "#C93400"),
  warningSoft: adaptiveColor("#FFF2D8", "#442E0C"),
  danger: systemColor("systemRedColor", "#D70015"),
  dangerSoft: adaptiveColor("#FFE9E7", "#4A171B"),
  onDark: "#FFFFFF",
  onDarkMuted: "#D1D1D6",
  white: "#FFFFFF",
  black: "#000000",
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radius = {
  sm: 10,
  md: 12,
  lg: 16,
  feature: 20,
  pill: 999,
} as const;

export const controlSize = {
  compactHeight: 44,
  buttonHeight: 50,
  minimumTouchTarget: 44,
  rowHeight: 52,
} as const;

export const typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700", letterSpacing: 0.2 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: 0.1 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: "600" },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 23, fontWeight: "400" },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: "400" },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: "400" },
} satisfies Record<string, TextStyle>;

/** Reserved for true overlays and floating affordances, never ordinary rows. */
export const shadow: ViewStyle = Platform.select({
  web: { boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)" },
  default: {
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
}) ?? {};
