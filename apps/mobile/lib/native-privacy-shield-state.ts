import type {
  NativePrivacyShieldRelease,
  NativePrivacyShieldSnapshot,
} from "./native-privacy-shield";

export interface NativePrivacyShieldHandoff {
  readyToRelease: boolean;
  releasing: boolean;
  snapshot: NativePrivacyShieldSnapshot;
}

function sameSnapshot(
  left: NativePrivacyShieldSnapshot,
  right: NativePrivacyShieldSnapshot,
): boolean {
  return left.applicationState === right.applicationState
    && left.enteredBackground === right.enteredBackground
    && left.epoch === right.epoch
    && left.shieldVisible === right.shieldVisible;
}

export function receiveNativePrivacyShieldSnapshot(
  current: NativePrivacyShieldHandoff | undefined,
  snapshot: NativePrivacyShieldSnapshot,
): NativePrivacyShieldHandoff | undefined {
  if (current && snapshot.epoch < current.snapshot.epoch) return current;
  if (!snapshot.shieldVisible) {
    return current && snapshot.epoch < current.snapshot.epoch ? current : undefined;
  }
  if (current && sameSnapshot(current.snapshot, snapshot)) return current;
  return { readyToRelease: false, releasing: false, snapshot };
}

export function markNativePrivacyShieldReady(
  current: NativePrivacyShieldHandoff | undefined,
  epoch: number,
): NativePrivacyShieldHandoff | undefined {
  return current?.snapshot.epoch === epoch
    ? { ...current, readyToRelease: true, releasing: false }
    : current;
}

export function markNativePrivacyShieldReleasing(
  current: NativePrivacyShieldHandoff | undefined,
  epoch: number,
): NativePrivacyShieldHandoff | undefined {
  return current?.snapshot.epoch === epoch && current.readyToRelease
    ? { ...current, releasing: true }
    : current;
}

export function resolveNativePrivacyShieldRelease(
  current: NativePrivacyShieldHandoff | undefined,
  result: NativePrivacyShieldRelease,
): NativePrivacyShieldHandoff | undefined {
  if (!current || result.epoch < current.snapshot.epoch) return current;
  if (result.released && result.epoch === current.snapshot.epoch) return undefined;
  const snapshot: NativePrivacyShieldSnapshot = result;
  if (result.epoch === current.snapshot.epoch && sameSnapshot(current.snapshot, snapshot)) {
    return { ...current, releasing: false };
  }
  return receiveNativePrivacyShieldSnapshot(current, snapshot);
}

export function shouldReconcileNativeBackground(
  snapshot: NativePrivacyShieldSnapshot,
  lastReconciledEpoch: number,
  appLockEnabled: boolean,
): boolean {
  return appLockEnabled
    && snapshot.applicationState === "active"
    && snapshot.enteredBackground
    && snapshot.epoch > lastReconciledEpoch;
}
