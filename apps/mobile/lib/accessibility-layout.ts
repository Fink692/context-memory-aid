import type { TextStyle } from "react-native";

export interface WindowMetrics {
  width: number;
  height: number;
  fontScale: number;
}

const LARGE_CONTENT_FONT_SCALE = 1.3;
const PHONE_SHORT_EDGE = 600;
const FONT_SCALE_BREAKPOINTS = [
  0.823,
  0.882,
  0.941,
  1,
  1.118,
  1.235,
  1.353,
  1.786,
  2.143,
  2.643,
  3.143,
  3.571,
] as const;

export type DynamicTextRole =
  | "largeTitle"
  | "title1"
  | "title2"
  | "title3"
  | "headline"
  | "body"
  | "callout"
  | "subheadline"
  | "footnote"
  | "caption1"
  | "caption2";

/**
 * UIFontMetrics multipliers measured from the iOS 26.5 simulator for the
 * matching semantic text styles. React Native's fontScale reports the
 * breakpoint on the left; UIKit deliberately scales large titles less than
 * body copy at accessibility sizes.
 */
const DYNAMIC_TYPE_MULTIPLIERS: Record<DynamicTextRole, readonly number[]> = {
  largeTitle: [0.931373, 0.95098, 0.980392, 1, 1.04902, 1.117647, 1.166667, 1.264706, 1.392157, 1.490196, 1.607843, 1.705882],
  title1: [0.916667, 0.940476, 0.97619, 1, 1.059524, 1.119048, 1.202381, 1.357143, 1.5, 1.678571, 1.797619, 2],
  title2: [0.863636, 0.893939, 0.924242, 1, 1.075758, 1.136364, 1.212121, 1.469697, 1.681818, 1.863636, 2.106061, 2.363636],
  title3: [0.883333, 0.916667, 0.966667, 1, 1.116667, 1.2, 1.283333, 1.516667, 1.766667, 2.033333, 2.316667, 2.6],
  headline: [0.862745, 0.901961, 0.960784, 1, 1.098039, 1.176471, 1.313725, 1.54902, 1.823529, 2.176471, 2.313725, 2.823529],
  body: [0.862745, 0.901961, 0.960784, 1, 1.098039, 1.176471, 1.313725, 1.54902, 1.823529, 2.176471, 2.54902, 2.823529],
  callout: [0.854167, 0.895833, 0.958333, 1, 1.104167, 1.1875, 1.333333, 1.520833, 1.854167, 2.1875, 2.479167, 2.854167],
  subheadline: [0.8, 0.911111, 0.955556, 1, 1.111111, 1.2, 1.311111, 1.555556, 1.8, 2.155556, 2.511111, 2.911111],
  footnote: [0.897436, 0.897436, 0.897436, 1, 1.102564, 1.230769, 1.333333, 1.615385, 1.846154, 2.230769, 2.564103, 2.897436],
  caption1: [0.805556, 0.805556, 0.805556, 1, 1.194444, 1.305556, 1.444444, 1.694444, 2, 2.444444, 2.75, 3.194444],
  caption2: [1, 1, 1, 1, 1.393939, 1.545455, 1.69697, 1.909091, 2.242424, 2.69697, 3.151515, 3.69697],
};

/**
 * Resolve the multiplier that should actually be applied to an explicit text
 * style. Unlike maxFontSizeMultiplier, an override here is a ceiling rather
 * than the current scale. Keeping the calculation in JavaScript makes both
 * glyphs and Yoga line boxes update together when iOS changes content size.
 */
export function semanticFontScale(
  fontScale: number,
  role: DynamicTextRole,
  maximum?: number | null,
): number {
  const requested = Number.isFinite(fontScale) ? fontScale : 1;
  const roleMultipliers = DYNAMIC_TYPE_MULTIPLIERS[role];
  let scale = roleMultipliers[0] ?? 1;

  if (requested >= (FONT_SCALE_BREAKPOINTS.at(-1) ?? 1)) {
    scale = roleMultipliers.at(-1) ?? 1;
  } else if (requested > FONT_SCALE_BREAKPOINTS[0]) {
    for (let index = 1; index < FONT_SCALE_BREAKPOINTS.length; index += 1) {
      const upperBreakpoint = FONT_SCALE_BREAKPOINTS[index];
      if (upperBreakpoint == null || requested > upperBreakpoint) continue;
      const lowerBreakpoint = FONT_SCALE_BREAKPOINTS[index - 1] ?? 1;
      const lowerScale = roleMultipliers[index - 1] ?? 1;
      const upperScale = roleMultipliers[index] ?? lowerScale;
      const progress = (requested - lowerBreakpoint) / (upperBreakpoint - lowerBreakpoint);
      scale = lowerScale + ((upperScale - lowerScale) * progress);
      break;
    }
  }

  return maximum != null && Number.isFinite(maximum) && maximum >= 1
    ? Math.min(scale, maximum)
    : scale;
}

/**
 * Scale the measurable parts of a resolved text style explicitly. React
 * Native 0.86 can repaint Dynamic Type glyphs before Fabric invalidates the
 * matching paragraph measurements after an app resumes. Explicit font and
 * line-height changes avoid that split state while preserving the user's live
 * iOS text-size choice.
 */
export function explicitlyScaledTextStyle(
  style: TextStyle | undefined,
  fontScale: number,
  role: DynamicTextRole,
  maximum?: number | null,
): TextStyle {
  const scale = semanticFontScale(fontScale, role, maximum);
  return {
    ...(typeof style?.fontSize === "number" ? { fontSize: style.fontSize * scale } : {}),
    ...(typeof style?.lineHeight === "number" ? { lineHeight: style.lineHeight * scale } : {}),
  };
}

/**
 * Rows keep their familiar compact shape at standard text sizes, then give
 * secondary content its own line before Dynamic Type can squeeze it away.
 */
export function shouldStackSharedRow(
  metrics: Pick<WindowMetrics, "width" | "fontScale">,
): boolean {
  return metrics.fontScale >= LARGE_CONTENT_FONT_SCALE || metrics.width < 350;
}

/**
 * The fixed-position relationship canvas is useful on a large viewport, but
 * it cannot reflow safely on a phone or at accessibility text sizes.
 */
export function connectionsPresentation(metrics: WindowMetrics): {
  compactHeader: boolean;
  forceOutline: boolean;
  largeContent: boolean;
} {
  const largeContent = metrics.fontScale >= LARGE_CONTENT_FONT_SCALE;
  const phoneSized = Math.min(metrics.width, metrics.height) < PHONE_SHORT_EDGE;
  return {
    compactHeader: largeContent || metrics.width < 700,
    forceOutline: largeContent || phoneSized,
    largeContent,
  };
}
