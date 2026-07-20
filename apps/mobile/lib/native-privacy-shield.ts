import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from "react-native";

export const NATIVE_PRIVACY_SHIELD_EVENT = "ContextPrivacyShieldChanged";

export type NativePrivacyApplicationState = "active" | "inactive" | "background" | "unknown";

export interface NativePrivacyShieldSnapshot {
  applicationState: NativePrivacyApplicationState;
  enteredBackground: boolean;
  epoch: number;
  shieldVisible: boolean;
}

export interface NativePrivacyShieldRelease extends NativePrivacyShieldSnapshot {
  released: boolean;
}

interface NativePrivacyShieldModule {
  addListener(eventName: string): void;
  getState(): Promise<unknown>;
  release(epoch: number): Promise<unknown>;
  removeListeners(count: number): void;
}

const nativeModule = Platform.OS === "ios"
  ? NativeModules.ContextPrivacyShield as NativePrivacyShieldModule | undefined
  : undefined;
const nativeEmitter = nativeModule ? new NativeEventEmitter(nativeModule) : undefined;

function parseSnapshot(value: unknown): NativePrivacyShieldSnapshot {
  if (!value || typeof value !== "object") throw new Error("The native privacy shield returned an invalid state.");
  const candidate = value as Partial<NativePrivacyShieldSnapshot>;
  if (
    !["active", "inactive", "background", "unknown"].includes(candidate.applicationState ?? "")
    || typeof candidate.enteredBackground !== "boolean"
    || !Number.isSafeInteger(candidate.epoch)
    || (candidate.epoch ?? 0) < 0
    || typeof candidate.shieldVisible !== "boolean"
  ) {
    throw new Error("The native privacy shield returned an invalid state.");
  }
  return candidate as NativePrivacyShieldSnapshot;
}

function parseRelease(value: unknown): NativePrivacyShieldRelease {
  const snapshot = parseSnapshot(value);
  const released = (value as Partial<NativePrivacyShieldRelease>).released;
  if (typeof released !== "boolean") throw new Error("The native privacy shield returned an invalid release result.");
  return { ...snapshot, released };
}

export function hasNativePrivacyShield(): boolean {
  return Boolean(nativeModule && nativeEmitter);
}

export async function getNativePrivacyShieldState(): Promise<NativePrivacyShieldSnapshot | undefined> {
  if (!nativeModule) return undefined;
  return parseSnapshot(await nativeModule.getState());
}

export async function releaseNativePrivacyShield(epoch: number): Promise<NativePrivacyShieldRelease | undefined> {
  if (!nativeModule) return undefined;
  return parseRelease(await nativeModule.release(epoch));
}

export function subscribeToNativePrivacyShield(
  listener: (snapshot: NativePrivacyShieldSnapshot) => void,
): EmitterSubscription | undefined {
  if (!nativeEmitter) return undefined;
  return nativeEmitter.addListener(NATIVE_PRIVACY_SHIELD_EVENT, (value: unknown) => {
    try {
      listener(parseSnapshot(value));
    } catch {
      // A malformed native event never authorizes removal. The next explicit
      // state query can recover while the opaque native shield stays visible.
    }
  });
}
