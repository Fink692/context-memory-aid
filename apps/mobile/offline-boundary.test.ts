import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("offline runtime boundary", () => {
  it("permits only loopback services, confirmed on-device sources, and explicit user-opened external links", () => {
    const files = ["app", "lib", "store"]
      .flatMap((directory) => sourceFiles(resolve(process.cwd(), directory)))
      .map((path) => ({ path: path.replaceAll("\\", "/"), source: readFileSync(path, "utf8") }));
    const source = files.map((file) => file.source).join("\n");

    expect(source).not.toContain("EXPO_PUBLIC_API_URL");
    const urls = [...source.matchAll(/https?:\/\/[^\s"'`]+/gi)].map((match) => match[0]);
    expect(new Set(urls)).toEqual(new Set([
      "http://127.0.0.1:8789",
      "https://example.com/feed.xml",
      "https://github.com/Fink692/context-memory-aid",
      "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm",
      "https://www.apache.org/licenses/LICENSE-2.0",
      "https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}",
      "https://www.facebook.com/${encoded}",
      "https://www.instagram.com/${encoded}",
      "https://www.linkedin.com/in/${encoded}",
      "https://www.threads.net/@${encoded}",
      "https://www.tiktok.com/@${encoded}",
      "https://x.com/${encoded}",
    ]));

    const networkFiles = files.filter((file) => /\bfetch\s*\(/.test(file.source)).map((file) => file.path);
    expect(networkFiles.every((path) => path.endsWith("/app/import.tsx") || path.endsWith("/app/(tabs)/settings/index.tsx") || path.endsWith("/lib/device-update-watcher.ts") || path.endsWith("/lib/update-watcher.ts") || path.endsWith("/lib/local-model.ts"))).toBe(true);
    const deviceWatcher = files.find((file) => file.path.endsWith("/lib/device-update-watcher.ts"))?.source ?? "";
    expect(deviceWatcher).toContain("Only public HTTPS URLs without embedded credentials are supported.");
    expect(deviceWatcher).toContain("robots.txt");
    expect(deviceWatcher).toContain("2 MB safety limit");
    expect(source).not.toMatch(/api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/i);
  });

  it("pins desktop/web model inference to the loopback-only Ollama runtime", () => {
    const modelService = readFileSync(resolve(process.cwd(), "..", "..", "tools", "local-model.mjs"), "utf8");
    const urls = [...modelService.matchAll(/https?:\/\/[^\s"'`]+/gi)].map((match) => match[0]);
    expect(new Set(urls)).toEqual(new Set(["http://127.0.0.1:11434"]));
    expect(modelService).not.toMatch(/api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/i);
  });

  it("pins native inference to the verified Gemma 4 artifact", () => {
    const nativeModel = readFileSync(resolve(process.cwd(), "native", "ContextLocalLLM.swift"), "utf8");
    const urls = [...nativeModel.matchAll(/https?:\/\/[^\s"'`]+/gi)].map((match) => match[0]);
    expect(new Set(urls)).toEqual(new Set([
      "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm?download=true",
    ]));
    expect(nativeModel).toContain("private let modelSize: Int64 = 2_588_147_712");
    expect(nativeModel).toContain("181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c");
    expect(nativeModel).toContain("configuration.allowsCellularAccess = false");
    expect(nativeModel).not.toMatch(/api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/i);
  });

  it("ships without the former API client", () => {
    expect(existsSync(resolve(process.cwd(), "lib", "api.ts"))).toBe(false);
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies).not.toHaveProperty("expo-audio");
    expect(packageJson.dependencies).not.toHaveProperty("@tanstack/react-query");
  });

  it("limits system Contacts import to the explicitly supported profile fields", () => {
    const deviceContacts = readFileSync(resolve(process.cwd(), "lib", "device-contacts.ts"), "utf8");
    const mapper = readFileSync(resolve(process.cwd(), "lib", "device-contact-mapper.ts"), "utf8");
    const appConfig = readFileSync(resolve(process.cwd(), "app.json"), "utf8");

    expect(deviceContacts).toContain("ContactField.FULL_NAME");
    expect(deviceContacts).toContain("ContactField.COMPANY");
    expect(deviceContacts).toContain("ContactField.JOB_TITLE");
    expect(deviceContacts).toContain("ContactField.EMAILS");
    expect(deviceContacts).toContain("ContactField.PHONES");
    expect(deviceContacts).toContain("ContactField.SOCIAL_PROFILES");
    expect(deviceContacts).toContain("ContactField.THUMBNAIL");
    expect(deviceContacts).not.toMatch(/ContactField\.(NOTE|IMAGE|BIRTHDAY|ADDRESSES)/);
    expect(mapper).toContain("system-contact:${platform}");
    expect(appConfig).toContain('"expo-contacts"');
    expect(appConfig).toContain("Context does not modify Contacts.");
    expect(appConfig).toContain('"android.permission.WRITE_CONTACTS"');
  });

  it("keeps iPhone dictation on device and never creates an audio file", () => {
    const nativeSpeech = readFileSync(resolve(process.cwd(), "native", "ContextSpeechToText.swift"), "utf8");
    const appConfig = readFileSync(resolve(process.cwd(), "app.json"), "utf8");

    expect(nativeSpeech).toContain("SpeechTranscriber");
    expect(nativeSpeech).toContain("AssetInventory.assetInstallationRequest");
    expect(nativeSpeech).toContain("supportsOnDeviceRecognition");
    expect(nativeSpeech).toContain("request.requiresOnDeviceRecognition = true");
    expect(nativeSpeech).not.toMatch(/URLSession|FileManager|SFSpeechURLRecognitionRequest/);
    expect(appConfig).toContain('"./plugins/with-on-device-speech"');
    expect(appConfig).toContain("Audio is processed on this iPhone and is not saved.");
    expect(appConfig).toContain("Context requires on-device recognition and never uploads the recording.");
    expect(appConfig).toContain('"android.permission.RECORD_AUDIO"');
  });

  it("keeps React Native in control of status-bar appearance", () => {
    const appConfig = readFileSync(resolve(process.cwd(), "app.json"), "utf8");
    expect(appConfig).toContain('"UIViewControllerBasedStatusBarAppearance": false');
  });
});
