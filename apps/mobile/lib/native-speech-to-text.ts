import { NativeEventEmitter, NativeModules, Platform, type EmitterSubscription } from "react-native";

export const ON_DEVICE_SPEECH_EVENT = "ContextSpeechToTextEvent";

export type OnDeviceSpeechPhase =
  | "idle"
  | "preparing"
  | "downloading-assets"
  | "recording"
  | "finalizing"
  | "unavailable"
  | "error";

export type OnDeviceSpeechEngine = "speech-transcriber" | "legacy-on-device";
export type SpeechPermissionName = "not-determined" | "granted" | "denied" | "restricted" | "not-required";

export interface OnDeviceSpeechStatus {
  available: boolean;
  phase: OnDeviceSpeechPhase;
  microphonePermission: Exclude<SpeechPermissionName, "not-required">;
  speechPermission: SpeechPermissionName;
  sessionId?: string;
  engine?: OnDeviceSpeechEngine;
  locale?: string;
  message?: string;
}
export interface OnDeviceSpeechEvent extends OnDeviceSpeechStatus {
  finalizedText: string;
  volatileText: string;
  text: string;
  elapsedMs: number;
  isFinal: boolean;
  assetProgress?: number;
  reason?: string;
}

export interface OnDeviceSpeechResult {
  sessionId: string;
  text: string;
  engine: OnDeviceSpeechEngine;
  locale: string;
  reason?: string;
}

export interface StartOnDeviceSpeechOptions {
  sessionId: string;
  localeTag?: string;
  maxDurationSeconds: number;
  maxCharacters: number;
  contextualStrings?: string[];
}

interface NativeSpeechToTextModule {
  getStatus(localeTag: string): Promise<OnDeviceSpeechStatus>;
  start(
    sessionId: string,
    localeTag: string,
    maxDurationSeconds: number,
    maxCharacters: number,
    contextualStrings: string[],
  ): Promise<OnDeviceSpeechStatus>;
  stop(sessionId: string): Promise<OnDeviceSpeechResult>;
  cancel(sessionId: string): Promise<OnDeviceSpeechStatus>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

function nativeModule(): NativeSpeechToTextModule {
  if (Platform.OS !== "ios") {
    throw new Error("On-device dictation is currently available only in the native iOS app.");
  }
  const module = NativeModules.ContextSpeechToText as NativeSpeechToTextModule | undefined;
  if (!module) {
    throw new Error("This app build does not include on-device dictation. Rebuild the native iOS app.");
  }
  return module;
}

export function isOnDeviceSpeechRuntimeAvailable(): boolean {
  return Platform.OS === "ios" && Boolean(NativeModules.ContextSpeechToText);
}

export function getOnDeviceSpeechStatus(localeTag = ""): Promise<OnDeviceSpeechStatus> {
  return nativeModule().getStatus(localeTag);
}

export function startOnDeviceSpeech(options: StartOnDeviceSpeechOptions): Promise<OnDeviceSpeechStatus> {
  return nativeModule().start(
    options.sessionId,
    options.localeTag ?? "",
    options.maxDurationSeconds,
    options.maxCharacters,
    options.contextualStrings ?? [],
  );
}

export function stopOnDeviceSpeech(sessionId: string): Promise<OnDeviceSpeechResult> {
  return nativeModule().stop(sessionId);
}

export function cancelOnDeviceSpeech(sessionId: string): Promise<OnDeviceSpeechStatus> {
  return nativeModule().cancel(sessionId);
}

export function subscribeToOnDeviceSpeech(
  listener: (event: OnDeviceSpeechEvent) => void,
): EmitterSubscription {
  const module = nativeModule();
  return new NativeEventEmitter(module).addListener(ON_DEVICE_SPEECH_EVENT, listener);
}
