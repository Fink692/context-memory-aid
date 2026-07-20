import { describe, expect, it } from "vitest";
import {
  markNativePrivacyShieldReady,
  markNativePrivacyShieldReleasing,
  receiveNativePrivacyShieldSnapshot,
  resolveNativePrivacyShieldRelease,
  shouldReconcileNativeBackground,
} from "./native-privacy-shield-state";
import type { NativePrivacyShieldSnapshot } from "./native-privacy-shield";

function snapshot(epoch: number, overrides: Partial<NativePrivacyShieldSnapshot> = {}): NativePrivacyShieldSnapshot {
  return {
    applicationState: "active",
    enteredBackground: true,
    epoch,
    shieldVisible: true,
    ...overrides,
  };
}

describe("native privacy shield handoff", () => {
  it("keeps a newer shield generation when a stale release resolves", () => {
    let state = receiveNativePrivacyShieldSnapshot(undefined, snapshot(4));
    state = markNativePrivacyShieldReady(state, 4);
    state = markNativePrivacyShieldReleasing(state, 4);
    state = receiveNativePrivacyShieldSnapshot(state, snapshot(5));
    state = resolveNativePrivacyShieldRelease(state, { ...snapshot(4, { shieldVisible: false }), released: true });
    expect(state?.snapshot.epoch).toBe(5);
  });

  it("hides the JS handoff only after the matching native release succeeds", () => {
    let state = receiveNativePrivacyShieldSnapshot(undefined, snapshot(2));
    state = markNativePrivacyShieldReady(state, 2);
    state = markNativePrivacyShieldReleasing(state, 2);
    state = resolveNativePrivacyShieldRelease(state, { ...snapshot(2, { shieldVisible: false }), released: true });
    expect(state).toBeUndefined();
  });

  it("keeps the cover when native release is denied while inactive", () => {
    let state = receiveNativePrivacyShieldSnapshot(undefined, snapshot(8));
    state = markNativePrivacyShieldReady(state, 8);
    state = markNativePrivacyShieldReleasing(state, 8);
    state = resolveNativePrivacyShieldRelease(state, {
      ...snapshot(8, { applicationState: "inactive" }),
      released: false,
    });
    expect(state).toMatchObject({ releasing: false, snapshot: { epoch: 8, shieldVisible: true } });
  });

  it("reconciles a genuine background epoch exactly once when App Lock is enabled", () => {
    const returned = snapshot(12);
    expect(shouldReconcileNativeBackground(returned, 11, true)).toBe(true);
    expect(shouldReconcileNativeBackground(returned, 12, true)).toBe(false);
    expect(shouldReconcileNativeBackground(returned, 11, false)).toBe(false);
    expect(shouldReconcileNativeBackground(
      snapshot(13, { enteredBackground: false }),
      12,
      true,
    )).toBe(false);
  });
});
