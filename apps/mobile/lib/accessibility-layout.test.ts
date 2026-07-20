import { describe, expect, it } from "vitest";
import {
  connectionsPresentation,
  explicitlyScaledTextStyle,
  semanticFontScale,
  shouldStackSharedRow,
} from "./accessibility-layout";

describe("adaptive accessibility layouts", () => {
  it("matches UIKit's semantic ramps and honors a constrained control ceiling", () => {
    expect(semanticFontScale(1, "largeTitle")).toBe(1);
    expect(semanticFontScale(3.571, "largeTitle")).toBeCloseTo(1.705882, 6);
    expect(semanticFontScale(3.571, "body")).toBeCloseTo(2.823529, 6);
    expect(semanticFontScale(3.571, "body", 1.3)).toBe(1.3);
    expect(semanticFontScale(Number.NaN, "body")).toBe(1);
  });

  it("interpolates between content-size breakpoints", () => {
    const midpoint = (1.353 + 1.786) / 2;
    const expected = (1.313725 + 1.54902) / 2;
    expect(semanticFontScale(midpoint, "body")).toBeCloseTo(expected, 6);
  });

  it("scales font size and line height while leaving UIKit kerning unchanged", () => {
    const scaled = explicitlyScaledTextStyle(
      { fontSize: 17, lineHeight: 23, letterSpacing: 0.2 },
      3.571,
      "body",
    );
    expect(scaled.fontSize).toBeCloseTo(48, 4);
    expect(scaled.lineHeight).toBeCloseTo(64.941167, 4);
    expect(scaled).not.toHaveProperty("letterSpacing");
    const capped = explicitlyScaledTextStyle({ fontSize: 17, lineHeight: 23 }, 3.571, "body", 1.3);
    expect(capped.fontSize).toBeCloseTo(22.1, 6);
    expect(capped.lineHeight).toBeCloseTo(29.9, 6);
  });

  it("stacks shared rows when Dynamic Type needs more room", () => {
    expect(shouldStackSharedRow({ width: 430, fontScale: 1 })).toBe(false);
    expect(shouldStackSharedRow({ width: 430, fontScale: 1.3 })).toBe(true);
    expect(shouldStackSharedRow({ width: 320, fontScale: 1 })).toBe(true);
  });

  it("keeps the fixed relationship canvas off phones in either orientation", () => {
    expect(connectionsPresentation({ width: 393, height: 852, fontScale: 1 }).forceOutline).toBe(true);
    expect(connectionsPresentation({ width: 852, height: 393, fontScale: 1 }).forceOutline).toBe(true);
    expect(connectionsPresentation({ width: 1024, height: 1366, fontScale: 1 }).forceOutline).toBe(false);
  });

  it("forces the outline and compact header for accessibility text on larger screens", () => {
    expect(connectionsPresentation({ width: 1024, height: 1366, fontScale: 1.3 })).toEqual({
      compactHeader: true,
      forceOutline: true,
      largeContent: true,
    });
  });
});
