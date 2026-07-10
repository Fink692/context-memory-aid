import { Platform, type ViewStyle } from "react-native";

export const colors = {
  ink: "#111827",
  inkMuted: "#556070",
  canvas: "#F6F4EE",
  surface: "#FFFFFF",
  surfaceAlt: "#ECE9DF",
  surfaceRaised: "#FBFAF7",
  border: "#DDD8CA",
  borderStrong: "#C8C1B1",
  primary: "#4B45E6",
  primaryDark: "#3730A3",
  primarySoft: "#E8E7FF",
  accent: "#E96A4B",
  success: "#167A55",
  successSoft: "#DDF7EC",
  warning: "#9A5B00",
  warningSoft: "#FFF1D6",
  danger: "#B42318",
  dangerSoft: "#FEE4E2",
  white: "#FFFFFF",
  black: "#000000",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

export const shadow: ViewStyle = Platform.select({
  web: { boxShadow: "0 10px 28px rgba(17, 24, 39, 0.08)" },
  default: {
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
}) ?? {};
