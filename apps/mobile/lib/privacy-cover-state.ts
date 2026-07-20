import type { AppStateStatus } from "react-native";

export interface PrivacyCoverState {
  appState: AppStateStatus;
  visible: boolean;
}

export type PrivacyCoverEvent = {
  type: "APP_STATE_CHANGED";
  appState: AppStateStatus;
};

/**
 * The app-switcher cover deliberately has its own lifecycle state instead of
 * depending on App Lock. Every non-active native state is treated as private
 * so iOS cannot snapshot relationship data while the app is leaving the
 * foreground.
 */
export function createInitialPrivacyCoverState(appState: AppStateStatus): PrivacyCoverState {
  return {
    appState,
    visible: appState !== "active",
  };
}

export function reducePrivacyCover(
  state: PrivacyCoverState,
  event: PrivacyCoverEvent,
): PrivacyCoverState {
  const visible = event.appState !== "active";
  if (state.appState === event.appState && state.visible === visible) return state;
  return { appState: event.appState, visible };
}

export function shouldHidePrivateContent(
  privacyCoverVisible: boolean,
  lockScreenVisible: boolean,
): boolean {
  return privacyCoverVisible || lockScreenVisible;
}
