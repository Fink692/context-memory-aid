import { describe, expect, it } from "vitest";
import {
  composeDictationValue,
  createInitialDictationState,
  joinTranscriptParts,
  reduceDictation,
  remainingDictationCharacters,
} from "./dictation-state";
import type { OnDeviceSpeechEvent } from "./native-speech-to-text";

function event(overrides: Partial<OnDeviceSpeechEvent> = {}): OnDeviceSpeechEvent {
  return {
    available: true,
    phase: "recording",
    microphonePermission: "granted",
    speechPermission: "not-required",
    sessionId: "session-current",
    engine: "speech-transcriber",
    locale: "en-CA",
    finalizedText: "",
    volatileText: "",
    text: "",
    elapsedMs: 1_000,
    isFinal: false,
    ...overrides,
  };
}

describe("on-device dictation state", () => {
  it("preserves existing text and replaces volatile guesses without duplication", () => {
    let state = reduceDictation(createInitialDictationState(), {
      type: "BEGIN",
      input: {
        sessionId: "session-current",
        targetId: "memory-note",
        targetLabel: "Memory note",
        baseValue: "Already typed.",
      },
    });
    state = reduceDictation(state, {
      type: "NATIVE_EVENT",
      event: event({ volatileText: "Alex moved" }),
      maxLength: 100,
      separator: " ",
    });
    expect(state.value).toBe("Already typed. Alex moved");

    state = reduceDictation(state, {
      type: "NATIVE_EVENT",
      event: event({ volatileText: "Alex moved to Winnipeg" }),
      maxLength: 100,
      separator: " ",
    });
    expect(state.value).toBe("Already typed. Alex moved to Winnipeg");
    expect(state.value.match(/Alex moved/g)).toHaveLength(1);
  });

  it("joins finalized and volatile segments with normalized whitespace", () => {
    expect(joinTranscriptParts(" Alex accepted  the role. ", " Starts Monday. ")).toBe(
      "Alex accepted the role. Starts Monday.",
    );
    expect(composeDictationValue("Topics", "First", "Second", 100, "\n")).toBe(
      "Topics\nFirst Second",
    );
  });

  it("enforces the field limit and reports only the remaining capacity", () => {
    expect(composeDictationValue("1234", "56789", "", 7)).toBe("1234 56");
    expect(remainingDictationCharacters("1234", 7)).toBe(2);
    expect(remainingDictationCharacters("1234 ", 7)).toBe(2);
    expect(remainingDictationCharacters("full", 4)).toBe(0);
  });

  it("ignores stale native events and stale final results", () => {
    const state = reduceDictation(createInitialDictationState(), {
      type: "BEGIN",
      input: {
        sessionId: "session-current",
        targetId: "role",
        targetLabel: "Role",
        baseValue: "Engineer",
      },
    });
    const afterEvent = reduceDictation(state, {
      type: "NATIVE_EVENT",
      event: event({ sessionId: "session-old", volatileText: "Ignore me" }),
      maxLength: 120,
      separator: " ",
    });
    const afterFinal = reduceDictation(afterEvent, {
      type: "FINAL_RESULT",
      sessionId: "session-old",
      text: "Ignore me too",
      maxLength: 120,
      separator: " ",
      engine: "legacy-on-device",
      locale: "en-US",
    });
    expect(afterFinal).toEqual(state);
  });

  it("restores the captured base value when cancelled", () => {
    let state = reduceDictation(createInitialDictationState(), {
      type: "BEGIN",
      input: {
        sessionId: "session-current",
        targetId: "company",
        targetLabel: "Company",
        baseValue: "Northstar",
      },
    });
    state = reduceDictation(state, {
      type: "NATIVE_EVENT",
      event: event({ volatileText: "Labs" }),
      maxLength: 120,
      separator: " ",
    });
    state = reduceDictation(state, { type: "CANCELLED", sessionId: "session-current" });
    expect(state).toMatchObject({ phase: "idle", value: "Northstar", sessionId: undefined });
  });

  it("commits a final result and retains a visible limit reason", () => {
    let state = reduceDictation(createInitialDictationState(), {
      type: "BEGIN",
      input: {
        sessionId: "session-current",
        targetId: "met-at",
        targetLabel: "Where you met",
        baseValue: "",
      },
    });
    state = reduceDictation(state, {
      type: "FINAL_RESULT",
      sessionId: "session-current",
      text: "Applied AI Summit",
      maxLength: 160,
      separator: " ",
      engine: "speech-transcriber",
      locale: "en-CA",
      reason: "duration-limit",
    });
    expect(state).toMatchObject({
      phase: "idle",
      value: "Applied AI Summit",
      reason: "duration-limit",
      engine: "speech-transcriber",
    });
  });
});
