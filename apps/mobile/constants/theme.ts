export const colors = {
  ink: "#111827",
  inkMuted: "#556070",
  canvas: "#F6F4EE",
  surface: "#FFFFFF",
  surfaceAlt: "#ECE9DF",
  border: "#DDD8CA",
  primary: "#4B45E6",
  primaryDark: "#3730A3",
  accent: "#E96A4B",
  success: "#167A55",
  warning: "#9A5B00",
  danger: "#B42318",
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

export const shadow = {
  shadowColor: colors.black,
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;
