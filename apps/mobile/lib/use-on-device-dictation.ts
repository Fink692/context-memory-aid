import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  cancelOnDeviceSpeech,
  isOnDeviceSpeechRuntimeAvailable,
  startOnDeviceSpeech,
  stopOnDeviceSpeech,
  subscribeToOnDeviceSpeech,
  type OnDeviceSpeechEvent,
} from "./native-speech-to-text";
import {
  composeDictationValue,
  createInitialDictationState,
  reduceDictation,
  remainingDictationCharacters,
  type DictationState,
} from "./dictation-state";

export interface DictationTargetOptions {
  targetId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  maxDurationSeconds?: number;
  separator?: string;
  localeTag?: string;
  contextualStrings?: string[];
}

interface ActiveTarget extends Required<Pick<DictationTargetOptions, "targetId" | "label" | "value" | "onChange" | "maxLength">> {
  sessionId: string;
  separator: string;
}

export interface OnDeviceDictationController {
  state: DictationState;
  available: boolean;
  busy: boolean;
  start: (options: DictationTargetOptions) => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
  isTargetActive: (targetId: string) => boolean;
}

function sessionId(): string {
  return `dictation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function errorMessage(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : "Dictation could not start.";
  if (/permission|denied|microphone/i.test(message)) {
    return `${message} You can keep typing or enable access in iOS Settings.`;
  }
  return message;
}

function isBusyPhase(phase: DictationState["phase"]): boolean {
  return phase === "preparing"
    || phase === "downloading-assets"
    || phase === "recording"
    || phase === "finalizing";
}

export function useOnDeviceDictation(): OnDeviceDictationController {
  const [state, dispatch] = useReducer(reduceDictation, undefined, createInitialDictationState);
  const activeTarget = useRef<ActiveTarget | undefined>(undefined);
  const available = isOnDeviceSpeechRuntimeAvailable();

  useEffect(() => {
    if (!available) return;
    const subscription = subscribeToOnDeviceSpeech((event: OnDeviceSpeechEvent) => {
      const target = activeTarget.current;
      if (!target || event.sessionId !== target.sessionId) return;
      target.onChange(composeDictationValue(
        target.value,
        event.finalizedText,
        event.volatileText,
        target.maxLength,
        target.separator,
      ));
      dispatch({
        type: "NATIVE_EVENT",
        event,
        maxLength: target.maxLength,
        separator: target.separator,
      });
      if (event.phase === "error" || (event.phase === "idle" && event.isFinal)) {
        activeTarget.current = undefined;
      }
    });
    return () => {
      subscription.remove();
      const target = activeTarget.current;
      activeTarget.current = undefined;
      if (target) void cancelOnDeviceSpeech(target.sessionId).catch(() => undefined);
    };
  }, [available]);

  const start = useCallback(async (options: DictationTargetOptions) => {
    if (activeTarget.current) return;
    const separator = options.separator ?? " ";
    const remaining = remainingDictationCharacters(options.value, options.maxLength, separator);
    const nextSessionId = sessionId();
    if (!available) {
      dispatch({
        type: "BEGIN",
        input: {
          sessionId: nextSessionId,
          targetId: options.targetId,
          targetLabel: options.label,
          baseValue: options.value,
        },
      });
      dispatch({
        type: "FAILED",
        sessionId: nextSessionId,
        message: "Dictation is available in the iOS app. You can keep typing.",
      });
      return;
    }
    if (remaining === 0) {
      dispatch({
        type: "BEGIN",
        input: {
          sessionId: nextSessionId,
          targetId: options.targetId,
          targetLabel: options.label,
          baseValue: options.value,
        },
      });
      dispatch({
        type: "FAILED",
        sessionId: nextSessionId,
        message: `${options.label} is already at its character limit.`,
      });
      return;
    }

    activeTarget.current = {
      sessionId: nextSessionId,
      targetId: options.targetId,
      label: options.label,
      value: options.value,
      onChange: options.onChange,
      maxLength: options.maxLength,
      separator,
    };
    dispatch({
      type: "BEGIN",
      input: {
        sessionId: nextSessionId,
        targetId: options.targetId,
        targetLabel: options.label,
        baseValue: options.value,
      },
    });

    try {
      await startOnDeviceSpeech({
        sessionId: nextSessionId,
        localeTag: options.localeTag ?? "",
        maxDurationSeconds: options.maxDurationSeconds ?? 60,
        maxCharacters: remaining,
        contextualStrings: options.contextualStrings ?? [],
      });
    } catch (caught) {
      if (activeTarget.current?.sessionId !== nextSessionId) return;
      activeTarget.current = undefined;
      dispatch({ type: "FAILED", sessionId: nextSessionId, message: errorMessage(caught) });
    }
  }, [available]);

  const stop = useCallback(async () => {
    const target = activeTarget.current;
    if (!target) return;
    dispatch({ type: "STOP_REQUESTED", sessionId: target.sessionId });
    try {
      const result = await stopOnDeviceSpeech(target.sessionId);
      target.onChange(composeDictationValue(
        target.value,
        result.text,
        "",
        target.maxLength,
        target.separator,
      ));
      dispatch({
        type: "FINAL_RESULT",
        sessionId: target.sessionId,
        text: result.text,
        maxLength: target.maxLength,
        separator: target.separator,
        engine: result.engine,
        locale: result.locale,
        ...(result.reason ? { reason: result.reason } : {}),
      });
    } catch (caught) {
      dispatch({ type: "FAILED", sessionId: target.sessionId, message: errorMessage(caught) });
    } finally {
      if (activeTarget.current?.sessionId === target.sessionId) activeTarget.current = undefined;
    }
  }, []);

  const cancel = useCallback(async () => {
    const target = activeTarget.current;
    if (!target) return;
    activeTarget.current = undefined;
    target.onChange(target.value);
    dispatch({ type: "CANCELLED", sessionId: target.sessionId });
    try {
      await cancelOnDeviceSpeech(target.sessionId);
    } catch {
      // The local form is already restored. Cancellation cleanup is best effort
      // when iOS has torn down the audio route or the screen is unmounting.
    }
  }, []);

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);
  const busy = isBusyPhase(state.phase);
  const isTargetActive = useCallback(
    (targetId: string) => busy && state.targetId === targetId,
    [busy, state.targetId],
  );

  return { state, available, busy, start, stop, cancel, reset, isTargetActive };
}
