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
      "https://github.com/Fink692/context-memory-aid",
      "https://github.com/${encodeURIComponent(handle)}",
      "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm",
      "https://www.apache.org/licenses/LICENSE-2.0",
      "https://bsky.app/profile/${encodeURIComponent(handle)}",
      "https://www.facebook.com/${encodeURIComponent(handle)}",
      "https://www.facebook.com/${encoded}",
      "https://www.instagram.com/${encodeURIComponent(handle)}/",
      "https://www.instagram.com/${encoded}",
      "https://www.linkedin.com/in/${encodeURIComponent(handle)}",
      "https://www.linkedin.com/in/${encoded}",
      "https://www.snapchat.com/add/${encodeURIComponent(handle)}",
      "https://www.threads.net/@${encodeURIComponent(handle)}",
      "https://www.threads.net/@${encoded}",
      "https://www.tiktok.com/@${encodeURIComponent(handle)}",
      "https://www.tiktok.com/@${encoded}",
      "https://www.youtube.com/@${encodeURIComponent(handle)}",
      "https://x.com/${encodeURIComponent(handle)}",
      "https://x.com/${encoded}",
    ]));

    const networkFiles = files.filter((file) => /\bfetch\s*\(/.test(file.source)).map((file) => file.path);
    expect(networkFiles.every((path) => path.endsWith("/app/import.tsx") || path.endsWith("/app/(tabs)/settings/index.tsx") || path.endsWith("/lib/device-update-watcher.ts") || path.endsWith("/lib/update-watcher.ts") || path.endsWith("/lib/local-model.ts"))).toBe(true);
    const deviceWatcher = files.find((file) => file.path.endsWith("/lib/device-update-watcher.ts"))?.source ?? "";
    expect(deviceWatcher).toContain("Only public HTTPS URLs without embedded credentials are supported.");
    expect(deviceWatcher).toContain("robots.txt");
    expect(deviceWatcher).toContain("2 MB safety limit");
    expect(source).not.toMatch(/api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/i);

    const contactShare = readFileSync(resolve(process.cwd(), "lib", "contact-share.ts"), "utf8");
    expect(contactShare).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
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
    expect(deviceContacts).not.toMatch(/ContactField\.(NOTE|IMAGE|THUMBNAIL|BIRTHDAY|ADDRESSES)/);
    expect(mapper).toContain("system-contact:${platform}");
    expect(appConfig).toContain('"expo-contacts"');
    expect(appConfig).toContain("Context does not modify Contacts.");
    expect(appConfig).toContain('"android.permission.WRITE_CONTACTS"');
  });

  it("keeps iPhone dictation on device and never creates an audio file", () => {
    const nativeSpeech = readFileSync(resolve(process.cwd(), "native", "ContextSpeechToText.swift"), "utf8");
    const appConfig = readFileSync(resolve(process.cwd(), "app.json"), "utf8");
    const speechPlugin = readFileSync(resolve(process.cwd(), "plugins", "with-on-device-speech.js"), "utf8");
    const nativeInfo = readFileSync(resolve(process.cwd(), "ios", "Context", "Info.plist"), "utf8");

    expect(nativeSpeech).toContain("SpeechTranscriber");
    expect(nativeSpeech).toContain("AssetInventory.assetInstallationRequest");
    expect(nativeSpeech).toContain("supportsOnDeviceRecognition");
    expect(nativeSpeech).toContain("request.requiresOnDeviceRecognition = true");
    expect(nativeSpeech).not.toMatch(/URLSession|FileManager|SFSpeechURLRecognitionRequest/);
    expect(appConfig).toContain('"./plugins/with-on-device-speech"');
    expect(speechPlugin).toContain("Audio is not saved.");
    expect(nativeInfo).toContain("Audio is not saved.");
    expect(appConfig).toContain("Allow Context to turn dictation into editable text.");
    expect(appConfig).toContain('"android.permission.RECORD_AUDIO"');
  });

  it("keeps React Native in control of status-bar appearance", () => {
    const appConfig = readFileSync(resolve(process.cwd(), "app.json"), "utf8");
    expect(appConfig).toContain('"UIViewControllerBasedStatusBarAppearance": false');
  });

  it("bounds native photo decoding and serializes saves, pruning, and wipes in both mirrored source trees", () => {
    const nativePicker = readFileSync(resolve(process.cwd(), "native", "ContextProfilePhotoPicker.swift"), "utf8");
    const generatedPicker = readFileSync(resolve(process.cwd(), "ios", "Context", "ContextProfilePhotoPicker.swift"), "utf8");
    const nativeBridge = readFileSync(resolve(process.cwd(), "native", "ContextProfilePhotoPickerBridge.m"), "utf8");
    const generatedBridge = readFileSync(resolve(process.cwd(), "ios", "Context", "ContextProfilePhotoPickerBridge.m"), "utf8");

    expect(generatedPicker).toBe(nativePicker);
    expect(generatedBridge).toBe(nativeBridge);
    expect(nativePicker).toContain("CGImageSourceGetType");
    expect(nativePicker).toContain("CGImageSourceCopyPropertiesAtIndex");
    expect(nativePicker).toContain("CGImageSourceCreateThumbnailAtIndex");
    expect(nativePicker).toContain("maximumPixelCount");
    expect(nativePicker).toContain("self.workQueue.sync");
    expect(nativePicker).toContain("self.clearEpoch &+= 1");
    expect(nativePicker).not.toContain("UIImage(contentsOfFile:");
    expect(nativePicker).not.toContain("loadObject(ofClass: UIImage.self)");
    expect(nativePicker).toContain("FileManager.default.fileExists(atPath: directory.path)");
    expect(nativePicker).toContain("try FileManager.default.removeItem(at: directory)");
    expect(nativeBridge).toContain("RCT_EXTERN_METHOD(prune:");
    expect(nativeBridge).toContain("RCT_EXTERN_METHOD(clear:");
  });

  it("keeps an opaque native iOS shield until React commits a matching covered epoch", () => {
    const appDelegate = readFileSync(resolve(process.cwd(), "ios", "Context", "AppDelegate.swift"), "utf8");
    const nativeShield = readFileSync(resolve(process.cwd(), "native", "ContextPrivacyShield.swift"), "utf8");
    const generatedShield = readFileSync(resolve(process.cwd(), "ios", "Context", "ContextPrivacyShield.swift"), "utf8");
    const nativeBridge = readFileSync(resolve(process.cwd(), "native", "ContextPrivacyShieldBridge.m"), "utf8");
    const generatedBridge = readFileSync(resolve(process.cwd(), "ios", "Context", "ContextPrivacyShieldBridge.m"), "utf8");
    const rootLayout = readFileSync(resolve(process.cwd(), "app", "_layout.tsx"), "utf8");
    const appConfig = readFileSync(resolve(process.cwd(), "app.json"), "utf8");
    const resignStart = appDelegate.indexOf("public override func applicationWillResignActive");
    const install = appDelegate.indexOf("installPrivacyShield()", resignStart);
    const expoCallback = appDelegate.indexOf("super.applicationWillResignActive(application)", resignStart);
    const activeStart = appDelegate.indexOf("public override func applicationDidBecomeActive");
    const activeEnd = appDelegate.indexOf("// Linking API", activeStart);
    const activeBlock = appDelegate.slice(activeStart, activeEnd);

    expect(resignStart).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(resignStart);
    expect(expoCallback).toBeGreaterThan(install);
    expect(appDelegate).toContain("shieldWindow.isOpaque = true");
    expect(appDelegate).toContain("shieldView.isOpaque = true");
    expect(activeBlock).not.toContain("removePrivacyShield()");
    expect(appDelegate).toContain("func releasePrivacyShield(epoch: UInt64)");
    expect(appDelegate).toContain("epoch == privacyShieldEpoch");
    expect(appDelegate).toContain("privacyShieldApplicationState == \"active\"");
    expect(generatedShield).toBe(nativeShield);
    expect(generatedBridge).toBe(nativeBridge);
    expect(nativeShield).toContain("ContextPrivacyShieldChanged");
    expect(nativeShield).toContain("delegate.releasePrivacyShield(epoch: requestedEpoch)");
    expect(rootLayout).toContain("onLayout={onLayout}");
    expect(rootLayout).toContain('type: "NATIVE_BACKGROUND_REENTRY"');
    expect(appConfig).toContain('"./plugins/with-privacy-shield"');
  });
});
