import type { LocalAuthenticationError } from "expo-local-authentication";
import type { AppStateStatus } from "react-native";

export type AppLockPhase = "locked" | "authenticating" | "unlocked";

export interface AppLockState {
  enabled: boolean;
  phase: AppLockPhase;
  attempt: number;
  autoUnlockPending: boolean;
  backgroundedDuringAuthentication: boolean;
  lastNativeBackgroundEpoch: number;
  error: string | undefined;
}

export type AppLockEvent =
  | { type: "INITIALIZE"; enabled: boolean; appState: AppStateStatus }
  | { type: "ENABLE_AFTER_AUTHENTICATION" }
  | { type: "DISABLE" }
  | { type: "APP_STATE_CHANGED"; appState: AppStateStatus }
  | { type: "NATIVE_BACKGROUND_REENTRY"; epoch: number }
  | { type: "REQUEST_UNLOCK" }
  | { type: "AUTHENTICATION_SUCCEEDED"; attempt: number }
  | { type: "AUTHENTICATION_FAILED"; attempt: number; message: string };

export function isAppLockConfigurationReady(
  hydrated: boolean,
  hydrationError: string | null,
  isNative: boolean,
): boolean {
  return hydrated && hydrationError === null && isNative;
}

export function createInitialAppLockState(): AppLockState {
  return {
    enabled: false,
    // Native starts closed until the persisted preference has hydrated. This
    // prevents a protected workspace from flashing on screen for one frame.
    phase: "locked",
    attempt: 0,
    autoUnlockPending: false,
    backgroundedDuringAuthentication: false,
    lastNativeBackgroundEpoch: 0,
    error: undefined,
  };
}

function beginAuthentication(state: AppLockState): AppLockState {
  if (!state.enabled || state.phase === "authenticating") return state;
  return {
    ...state,
    phase: "authenticating",
    attempt: state.attempt + 1,
    autoUnlockPending: false,
    backgroundedDuringAuthentication: false,
    error: undefined,
  };
}

export function reduceAppLock(state: AppLockState, event: AppLockEvent): AppLockState {
  switch (event.type) {
    case "INITIALIZE": {
      if (!event.enabled) {
        return {
          ...state,
          enabled: false,
          phase: "unlocked",
          autoUnlockPending: false,
          backgroundedDuringAuthentication: false,
          error: undefined,
        };
      }
      const initialized: AppLockState = {
        ...state,
        enabled: true,
        phase: "locked",
        autoUnlockPending: event.appState !== "active",
        backgroundedDuringAuthentication: false,
        error: undefined,
      };
      return event.appState === "active" ? beginAuthentication(initialized) : initialized;
    }

    case "ENABLE_AFTER_AUTHENTICATION":
      return {
        ...state,
        enabled: true,
        phase: "unlocked",
        autoUnlockPending: false,
        backgroundedDuringAuthentication: false,
        error: undefined,
      };

    case "DISABLE":
      return {
        ...state,
        enabled: false,
        phase: "unlocked",
        autoUnlockPending: false,
        backgroundedDuringAuthentication: false,
        error: undefined,
      };

    case "APP_STATE_CHANGED": {
      if (!state.enabled || event.appState === "inactive" || event.appState === "unknown" || event.appState === "extension") {
        return state;
      }
      if (event.appState === "background") {
        if (state.phase === "authenticating") {
          return {
            ...state,
            autoUnlockPending: false,
            backgroundedDuringAuthentication: true,
          };
        }
        return {
          ...state,
          phase: "locked",
          autoUnlockPending: true,
          backgroundedDuringAuthentication: false,
          error: undefined,
        };
      }
      if (event.appState === "active" && state.phase === "locked" && state.autoUnlockPending) {
        return beginAuthentication(state);
      }
      return state;
    }

    case "NATIVE_BACKGROUND_REENTRY": {
      if (!state.enabled || event.epoch <= state.lastNativeBackgroundEpoch) return state;
      const returned = { ...state, lastNativeBackgroundEpoch: event.epoch };
      if (state.phase === "authenticating") {
        return {
          ...returned,
          autoUnlockPending: false,
          backgroundedDuringAuthentication: true,
        };
      }
      return beginAuthentication({
        ...returned,
        phase: "locked",
        autoUnlockPending: true,
        backgroundedDuringAuthentication: false,
        error: undefined,
      });
    }

    case "REQUEST_UNLOCK":
      return beginAuthentication(state);

    case "AUTHENTICATION_SUCCEEDED":
      if (state.phase !== "authenticating" || event.attempt !== state.attempt) return state;
      if (state.backgroundedDuringAuthentication) {
        return {
          ...state,
          phase: "locked",
          autoUnlockPending: false,
          backgroundedDuringAuthentication: false,
          error: "Context stayed locked because the app moved to the background. Tap Unlock Context to try again.",
        };
      }
      return {
        ...state,
        phase: "unlocked",
        autoUnlockPending: false,
        backgroundedDuringAuthentication: false,
        error: undefined,
      };

    case "AUTHENTICATION_FAILED":
      if (state.phase !== "authenticating" || event.attempt !== state.attempt) return state;
      return {
        ...state,
        phase: "locked",
        autoUnlockPending: false,
        backgroundedDuringAuthentication: false,
        error: event.message,
      };
  }
}

export function deviceAuthenticationErrorMessage(
  error: LocalAuthenticationError,
  action: "unlock" | "enable" = "unlock",
): string {
  switch (error) {
    case "user_cancel":
    case "app_cancel":
    case "system_cancel":
      return action === "enable"
        ? "Authentication was cancelled, so App Lock was not enabled."
        : "Context stayed locked. Tap Unlock Context when you are ready.";
    case "authentication_failed":
      return "Face ID, Touch ID, or the device passcode did not match. Try again.";
    case "lockout":
      return "Device authentication is temporarily locked after too many attempts. Use your device passcode or try again later.";
    case "not_enrolled":
    case "passcode_not_set":
      return "Set up Face ID, Touch ID, or a device passcode in Settings, then try again.";
    case "timeout":
      return "Device authentication timed out. Try again when you are ready.";
    case "user_fallback":
      return "Device authentication was not completed. Try again and choose Face ID, Touch ID, or the device passcode.";
    case "not_available":
    case "invalid_context":
    case "unable_to_process":
    case "no_space":
    case "unknown":
      return "iOS could not complete device authentication. Check Face ID, Touch ID, or passcode settings and try again.";
  }
}
