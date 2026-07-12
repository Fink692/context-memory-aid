import { describe, expect, it } from "vitest";
import {
  createInitialAppLockState,
  deviceAuthenticationErrorMessage,
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
