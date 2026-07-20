import { describe, expect, it } from "vitest";
import {
  createInitialAppLockState,
  reduceAppLock,
  type AppLockState,
} from "./app-lock-state";
import {
  createInitialPrivacyCoverState,
  reducePrivacyCover,
  shouldHidePrivateContent,
} from "./privacy-cover-state";

function initializeUnlockedAppLock(): AppLockState {
  let state = reduceAppLock(createInitialAppLockState(), {
    type: "INITIALIZE",
    enabled: true,
    appState: "active",
  });
  state = reduceAppLock(state, { type: "AUTHENTICATION_SUCCEEDED", attempt: 1 });
  return state;
}

describe("app-switcher privacy cover", () => {
  it("covers active → inactive → background and clears only after active", () => {
    let state = createInitialPrivacyCoverState("active");
    expect(state.visible).toBe(false);

    state = reducePrivacyCover(state, { type: "APP_STATE_CHANGED", appState: "inactive" });
    expect(state.visible).toBe(true);

    state = reducePrivacyCover(state, { type: "APP_STATE_CHANGED", appState: "background" });
    expect(state.visible).toBe(true);

    state = reducePrivacyCover(state, { type: "APP_STATE_CHANGED", appState: "active" });
    expect(state.visible).toBe(false);
  });

  it("treats unknown native lifecycle states as private", () => {
    expect(createInitialPrivacyCoverState("unknown").visible).toBe(true);
    expect(createInitialPrivacyCoverState("extension").visible).toBe(true);
  });

  it("keeps private content hidden after reactivation until App Lock succeeds", () => {
    let lockState = initializeUnlockedAppLock();
    let privacyCover = createInitialPrivacyCoverState("active");
    expect(shouldHidePrivateContent(privacyCover.visible, lockState.phase !== "unlocked")).toBe(false);

    privacyCover = reducePrivacyCover(privacyCover, { type: "APP_STATE_CHANGED", appState: "inactive" });
    lockState = reduceAppLock(lockState, { type: "APP_STATE_CHANGED", appState: "inactive" });
    expect(shouldHidePrivateContent(privacyCover.visible, lockState.phase !== "unlocked")).toBe(true);

    privacyCover = reducePrivacyCover(privacyCover, { type: "APP_STATE_CHANGED", appState: "background" });
    lockState = reduceAppLock(lockState, { type: "APP_STATE_CHANGED", appState: "background" });
    expect(shouldHidePrivateContent(privacyCover.visible, lockState.phase !== "unlocked")).toBe(true);

    privacyCover = reducePrivacyCover(privacyCover, { type: "APP_STATE_CHANGED", appState: "active" });
    lockState = reduceAppLock(lockState, { type: "APP_STATE_CHANGED", appState: "active" });
    expect(lockState.phase).toBe("authenticating");
    expect(privacyCover.visible).toBe(false);
    expect(shouldHidePrivateContent(privacyCover.visible, lockState.phase !== "unlocked")).toBe(true);

    lockState = reduceAppLock(lockState, {
      type: "AUTHENTICATION_SUCCEEDED",
      attempt: lockState.attempt,
    });
    expect(shouldHidePrivateContent(privacyCover.visible, lockState.phase !== "unlocked")).toBe(false);
  });
});
