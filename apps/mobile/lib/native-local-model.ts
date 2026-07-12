import { NativeEventEmitter, NativeModules, Platform, type EmitterSubscription } from "react-native";

export const GEMMA_MODEL_NAME = "Gemma 4 E2B IT";
export const GEMMA_MODEL_SIZE = 2_588_147_712;
export const GEMMA_MODEL_CARD_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm";
export const GEMMA_LICENSE_URL = "https://www.apache.org/licenses/LICENSE-2.0";

export type OnDeviceModelStatusName =
  | "not-installed"
  | "downloading"
  | "verifying"
  | "ready"
  | "loading"
  | "loaded"
  | "error";

export interface OnDeviceModelStatus {
  model: string;
  version: string;
  status: OnDeviceModelStatusName;
  installed: boolean;
  loaded: boolean;
  busy: boolean;
  downloadedBytes: number;
  totalBytes: number;
  progress: number;
  backend?: string;
  message?: string;
}
interface GenerateResult {
  text: string;
  model: string;
  backend: string;
}

interface NativeLocalLLMModule {
  getStatus(): Promise<OnDeviceModelStatus>;
  startDownload(): Promise<OnDeviceModelStatus>;
  cancelDownload(): Promise<OnDeviceModelStatus>;
  deleteModel(): Promise<OnDeviceModelStatus>;
  loadModel(): Promise<OnDeviceModelStatus>;
  unloadModel(): Promise<OnDeviceModelStatus>;
  generate(systemPrompt: string, prompt: string): Promise<GenerateResult>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

function nativeModule(): NativeLocalLLMModule {
  if (Platform.OS !== "ios") throw new Error("Gemma 4 on-device inference is currently available only in the native iOS build.");
  const module = NativeModules.ContextLocalLLM as NativeLocalLLMModule | undefined;
  if (!module) throw new Error("This app build does not include the Gemma 4 runtime. Rebuild the native iOS app.");
  return module;
}

export function isOnDeviceModelRuntimeAvailable(): boolean {
  return Platform.OS === "ios" && Boolean(NativeModules.ContextLocalLLM);
}

export function getOnDeviceModelStatus(): Promise<OnDeviceModelStatus> {
  return nativeModule().getStatus();
}

export function startOnDeviceModelDownload(): Promise<OnDeviceModelStatus> {
  return nativeModule().startDownload();
}

export function cancelOnDeviceModelDownload(): Promise<OnDeviceModelStatus> {
  return nativeModule().cancelDownload();
}

export function deleteOnDeviceModel(): Promise<OnDeviceModelStatus> {
  return nativeModule().deleteModel();
}

export function loadOnDeviceModel(): Promise<OnDeviceModelStatus> {
  return nativeModule().loadModel();
}

export function unloadOnDeviceModel(): Promise<OnDeviceModelStatus> {
  return nativeModule().unloadModel();
}

export function generateOnDevice(systemPrompt: string, prompt: string): Promise<GenerateResult> {
  return nativeModule().generate(systemPrompt, prompt);
}

export function subscribeToOnDeviceModelStatus(
  listener: (status: OnDeviceModelStatus) => void,
): EmitterSubscription {
  const module = nativeModule();
  return new NativeEventEmitter(module).addListener("ContextLocalLLMDownloadProgress", listener);
}
