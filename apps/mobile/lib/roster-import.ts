import { Platform } from "react-native";
import { generateOnDevice } from "./native-local-model";
import {
  buildRosterImportPrompt,
  parseRosterImportOutput,
  type ParsedRosterImport,
} from "./roster-import-contract";

export interface ModelRosterImport extends ParsedRosterImport {
  model: string;
  sourceCharacters: number;
  analyzedCharacters: number;
  inputTruncated: boolean;
}

export async function createModelRosterDrafts(documentText: string): Promise<ModelRosterImport> {
  if (Platform.OS !== "ios") {
    throw new Error("Private PDF roster extraction requires the native iPhone app and its downloaded on-device model.");
  }
  const request = buildRosterImportPrompt(documentText);
  const result = await generateOnDevice(request.systemPrompt, request.prompt);
  const parsed = parseRosterImportOutput(result.text);
  return {
    ...parsed,
    model: `${result.model} (${result.backend})`,
    sourceCharacters: request.sourceCharacters,
    analyzedCharacters: request.analyzedCharacters,
    inputTruncated: request.inputTruncated,
  };
}
