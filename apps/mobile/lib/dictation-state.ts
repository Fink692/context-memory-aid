import type { OnDeviceSpeechEngine, OnDeviceSpeechEvent, OnDeviceSpeechPhase } from "./native-speech-to-text";

export interface DictationState {
  phase: OnDeviceSpeechPhase;
  sessionId: string | undefined;
  targetId: string | undefined;
  targetLabel: string | undefined;
  baseValue: string;
  value: string;
  finalizedText: string;
  volatileText: string;
  engine: OnDeviceSpeechEngine | undefined;
  locale: string | undefined;
  elapsedMs: number;
  assetProgress: number | undefined;
  error: string | undefined;
  reason: string | undefined;
}
export interface BeginDictationInput {
  sessionId: string;
  targetId: string;
  targetLabel: string;
  baseValue: string;
}

export type DictationAction =
  | { type: "BEGIN"; input: BeginDictationInput }
  | { type: "NATIVE_EVENT"; event: OnDeviceSpeechEvent; maxLength: number; separator: string }
  | { type: "FINAL_RESULT"; sessionId: string; text: string; maxLength: number; separator: string; engine: OnDeviceSpeechEngine; locale: string; reason?: string }
  | { type: "STOP_REQUESTED"; sessionId: string }
  | { type: "FAILED"; sessionId: string; message: string }
  | { type: "CANCELLED"; sessionId: string }
  | { type: "RESET" };

export function createInitialDictationState(): DictationState {
  return {
    phase: "idle",
    sessionId: undefined,
    targetId: undefined,
    targetLabel: undefined,
    baseValue: "",
    value: "",
    finalizedText: "",
    volatileText: "",
    engine: undefined,
    locale: undefined,
    elapsedMs: 0,
    assetProgress: undefined,
    error: undefined,
    reason: undefined,
  };
}

function cleanTranscriptPart(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function joinTranscriptParts(finalizedText: string, volatileText: string): string {
  const finalized = cleanTranscriptPart(finalizedText);
  const volatile = cleanTranscriptPart(volatileText);
  return [finalized, volatile].filter(Boolean).join(" ");
}

export function composeDictationValue(
  baseValue: string,
  finalizedText: string,
  volatileText: string,
  maxLength: number,
  separator = " ",
): string {
  const safeMaximum = Math.max(0, Math.floor(maxLength));
  const base = baseValue.slice(0, safeMaximum);
  const transcript = joinTranscriptParts(finalizedText, volatileText);
  if (!transcript || base.length >= safeMaximum) return base;

  const needsSeparator = Boolean(base) && !/\s$/u.test(base) && !/^\s/u.test(transcript);
  const combined = `${base}${needsSeparator ? separator : ""}${transcript}`;
  return combined.slice(0, safeMaximum);
}

export function remainingDictationCharacters(baseValue: string, maxLength: number, separator = " "): number {
  const safeMaximum = Math.max(0, Math.floor(maxLength));
  const separatorLength = baseValue && !/\s$/u.test(baseValue) ? separator.length : 0;
  return Math.max(0, safeMaximum - baseValue.length - separatorLength);
}

export function reduceDictation(state: DictationState, action: DictationAction): DictationState {
  switch (action.type) {
    case "BEGIN":
      return {
        ...createInitialDictationState(),
        phase: "preparing",
        sessionId: action.input.sessionId,
        targetId: action.input.targetId,
        targetLabel: action.input.targetLabel,
        baseValue: action.input.baseValue,
        value: action.input.baseValue,
      };

    case "NATIVE_EVENT": {
      if (action.event.sessionId !== state.sessionId) return state;
      return {
        ...state,
        phase: action.event.phase,
        value: composeDictationValue(
          state.baseValue,
          action.event.finalizedText,
          action.event.volatileText,
          action.maxLength,
          action.separator,
        ),
        finalizedText: action.event.finalizedText,
        volatileText: action.event.volatileText,
        engine: action.event.engine ?? state.engine,
        locale: action.event.locale ?? state.locale,
        elapsedMs: action.event.elapsedMs,
        assetProgress: action.event.assetProgress,
        error: action.event.phase === "error" ? action.event.message ?? "Dictation stopped." : undefined,
        reason: action.event.reason,
      };
    }

    case "FINAL_RESULT": {
      if (action.sessionId !== state.sessionId) return state;
      return {
        ...state,
        phase: "idle",
        value: composeDictationValue(state.baseValue, action.text, "", action.maxLength, action.separator),
        finalizedText: action.text,
        volatileText: "",
        engine: action.engine,
        locale: action.locale,
        assetProgress: undefined,
        error: undefined,
        reason: action.reason,
      };
    }

    case "STOP_REQUESTED":
      return action.sessionId === state.sessionId ? { ...state, phase: "finalizing", error: undefined } : state;

    case "FAILED":
      return action.sessionId === state.sessionId
        ? { ...state, phase: "error", assetProgress: undefined, error: action.message }
        : state;

    case "CANCELLED":
      return action.sessionId === state.sessionId
        ? { ...createInitialDictationState(), value: state.baseValue }
        : state;

    case "RESET":
      return createInitialDictationState();
  }
}
