import { describe, expect, it } from "vitest";
import {
  createInitialAppLockState,
  deviceAuthenticationErrorMessage,
  isAppLockConfigurationReady,
  reduceAppLock,
  type AppLockState,
} from "./app-lock-state";

function initializeLocked(): AppLockState {
  return reduceAppLock(createInitialAppLockState(), {
    type: "INITIALIZE",
    enabled: true,
    appState: "active",
  });
}

describe("App Lock lifecycle", () => {
  it("does not initialize an unlocked default before a protected hydration retry succeeds", () => {
    let state = createInitialAppLockState();
    let initialized = false;

    if (isAppLockConfigurationReady(true, "Stored workspace could not be read.", true)) {
      initialized = true;
      state = reduceAppLock(state, { type: "INITIALIZE", enabled: false, appState: "active" });
    }
    expect(initialized).toBe(false);
    expect(state.phase).toBe("locked");

    if (isAppLockConfigurationReady(true, null, true) && !initialized) {
      initialized = true;
      state = reduceAppLock(state, { type: "INITIALIZE", enabled: true, appState: "active" });
    }
    expect(initialized).toBe(true);
    expect(state).toMatchObject({ enabled: true, phase: "authenticating", attempt: 1 });
  });

  it("ignores Face ID's inactive transition and accepts the successful result once", () => {
    let state = initializeLocked();
    expect(state).toMatchObject({ phase: "authenticating", attempt: 1 });

    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "inactive" });
    state = reduceAppLock(state, { type: "AUTHENTICATION_SUCCEEDED", attempt: 1 });
    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "active" });

    expect(state).toMatchObject({ phase: "unlocked", attempt: 1, autoUnlockPending: false });
  });

  it("does not automatically reopen authentication after cancellation", () => {
    let state = initializeLocked();
    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "inactive" });
    state = reduceAppLock(state, {
      type: "AUTHENTICATION_FAILED",
      attempt: 1,
      message: deviceAuthenticationErrorMessage("user_cancel"),
    });
    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "active" });

    expect(state).toMatchObject({ phase: "locked", attempt: 1, autoUnlockPending: false });
    expect(state.error).toContain("when you are ready");

    state = reduceAppLock(state, { type: "REQUEST_UNLOCK" });
    expect(state).toMatchObject({ phase: "authenticating", attempt: 2 });
  });

  it("locks on a genuine background transition and prompts once on return", () => {
    let state = initializeLocked();
    state = reduceAppLock(state, { type: "AUTHENTICATION_SUCCEEDED", attempt: 1 });
    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "inactive" });
    expect(state.phase).toBe("unlocked");

    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "background" });
    expect(state).toMatchObject({ phase: "locked", autoUnlockPending: true });
    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "inactive" });
    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "active" });
    expect(state).toMatchObject({ phase: "authenticating", attempt: 2, autoUnlockPending: false });

    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "active" });
    state = reduceAppLock(state, { type: "REQUEST_UNLOCK" });
    expect(state).toMatchObject({ phase: "authenticating", attempt: 2 });
  });

  it("reconciles a missed native background once without replaying it during Face ID", () => {
    let state = initializeLocked();
    state = reduceAppLock(state, { type: "AUTHENTICATION_SUCCEEDED", attempt: 1 });
    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "inactive" });
    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "active" });
    expect(state.phase).toBe("unlocked");

    state = reduceAppLock(state, { type: "NATIVE_BACKGROUND_REENTRY", epoch: 7 });
    expect(state).toMatchObject({
      phase: "authenticating",
      attempt: 2,
      lastNativeBackgroundEpoch: 7,
      backgroundedDuringAuthentication: false,
    });

    state = reduceAppLock(state, { type: "NATIVE_BACKGROUND_REENTRY", epoch: 7 });
    expect(state).toMatchObject({
      phase: "authenticating",
      attempt: 2,
      backgroundedDuringAuthentication: false,
    });
    state = reduceAppLock(state, { type: "AUTHENTICATION_SUCCEEDED", attempt: 2 });
    expect(state.phase).toBe("unlocked");
  });

  it("rejects an authentication result when a newer native background occurred during it", () => {
    let state = initializeLocked();
    state = reduceAppLock(state, { type: "NATIVE_BACKGROUND_REENTRY", epoch: 9 });
    expect(state.backgroundedDuringAuthentication).toBe(true);
    state = reduceAppLock(state, { type: "AUTHENTICATION_SUCCEEDED", attempt: 1 });
    expect(state.phase).toBe("locked");
  });

  it("does not accept a stale success after authentication was backgrounded", () => {
    let state = initializeLocked();
    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "background" });
    state = reduceAppLock(state, { type: "APP_STATE_CHANGED", appState: "active" });
    state = reduceAppLock(state, { type: "AUTHENTICATION_SUCCEEDED", attempt: 1 });
    expect(state.phase).toBe("locked");

    state = reduceAppLock(state, { type: "REQUEST_UNLOCK" });
    expect(state.attempt).toBe(2);
    state = reduceAppLock(state, { type: "AUTHENTICATION_SUCCEEDED", attempt: 1 });
    expect(state.phase).toBe("authenticating");
    state = reduceAppLock(state, { type: "AUTHENTICATION_SUCCEEDED", attempt: 2 });
    expect(state.phase).toBe("unlocked");
  });

  it("keeps the current session open after App Lock was just enabled", () => {
    let state = reduceAppLock(createInitialAppLockState(), {
      type: "INITIALIZE",
      enabled: false,
      appState: "active",
    });
    state = reduceAppLock(state, { type: "ENABLE_AFTER_AUTHENTICATION" });
    expect(state).toMatchObject({ enabled: true, phase: "unlocked", attempt: 0 });
  });

  it("provides actionable failure messages", () => {
    expect(deviceAuthenticationErrorMessage("lockout")).toContain("temporarily locked");
    expect(deviceAuthenticationErrorMessage("not_enrolled")).toContain("device passcode");
    expect(deviceAuthenticationErrorMessage("user_cancel", "enable")).toContain("not enabled");
  });
});
