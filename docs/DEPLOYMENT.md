# Native build and distribution runbook

Context is native-first. The iOS release keeps relationship data in the app sandbox, can run optional Gemma 4 assistance in the app process, preserves deterministic on-device fallback assistance, and performs optional public-source checks only while the app is in the foreground. It has no required application backend, PC companion, API key, or cloud-model account.

The PC web helper and Ollama path are optional enhancements described at the end of this document.

## Toolchain

Expo SDK 57 targets React Native 0.86, iOS 16.4 or newer, and Xcode 26.4 or newer. The native model config plugin attaches the repository's local `LiteRTLM` Swift package, which vendors Google's unmodified LiteRT-LM 0.14.0 wrapper and pins the official iOS XCFramework by checksum. Install Node.js 22.13 or newer and full Xcode, then select it:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -version
xcrun simctl list devices available
```

Install and validate JavaScript dependencies from the repository root:

```bash
npm ci
npm run verify
cd apps/mobile
npx expo-doctor
npx expo install --check
```

## Local iOS development

Generate the native project and launch a simulator:

```bash
cd apps/mobile
npm run ios:native
```

Select a physical device when camera, Contacts limited/full permission, Face ID/device authentication, sharing, or real lifecycle behavior must be tested:

```bash
cd apps/mobile
npx expo run:ios --device
```

Expo Continuous Native Generation treats `app.json` and config plugins as source of truth. Do not hand-edit a generated `ios` directory unless the project intentionally moves to a bare workflow. Regenerate after changing permissions, privacy declarations, icons, native dependencies, or the bundle identifier.

### Physical-device signing with a Personal Team

A free Apple Account can create a Personal Team development build for a connected iPhone. In Xcode, open `apps/mobile/ios/ContextRelationshipMemory.xcworkspace`, select the `ContextRelationshipMemory` app target, open **Signing & Capabilities**, enable automatic signing, and choose the intended Team.

The repository deliberately does not commit a developer-specific `DEVELOPMENT_TEAM`. A clean `expo prebuild` regenerates the Xcode project and removes a manually selected Team, so reselect it before the next signed build. Keep the iPhone connected, unlocked, trusted, and in Developer Mode.

Personal Team signing is for local development only. Its provisioning is normally short-lived (commonly seven days), supported capabilities and registered devices are limited, and it cannot distribute through TestFlight or the App Store. Use a paid Apple Developer Program team for durable beta or store distribution.

Create an unsigned production-style JavaScript bundle and inspect the generated native configuration without signing:

```bash
cd apps/mobile
npm run export:ios -- --clear --output-dir /tmp/context-ios-export
CI=1 npx expo prebuild --platform ios --clean --no-install
find ios -name Info.plist -o -name PrivacyInfo.xcprivacy
```

## Optional Gemma 4 model

The iOS app integrates [Gemma 4 E2B IT](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm) with the exact [LiteRT-LM 0.14.0](https://github.com/google-ai-edge/LiteRT-LM/tree/v0.14.0) Swift wrapper. `apps/mobile/native/LiteRTLM/Package.swift` pins Google's official iOS XCFramework to SHA-256 `dddac2f6713ed65eaf01c18e115d9fec22184adf575cc7856a21387e8ba937e1`. The model is not committed to the repository or bundled into the initial application artifact.

The user starts the download from **Privacy & data**. The app restricts it to Wi-Fi, requires about 4.6 GB of free space, and downloads `gemma-4-E2B-it.litertlm` (2,588,147,712 bytes) from the public Hugging Face model repository. Before activation, it verifies:

```text
SHA-256 181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c
```

The model and generated cache live in app-managed Application Support storage and are excluded from Finder/iCloud device backups and relationship JSON exports. Prompts and output stay on device. The download request contains no contact, note, event, prompt, or generated text; other native network boundaries remain the explicitly initiated public search and foreground Update Watch requests described in `PRIVACY.md`. If the model is absent, disabled, or unable to run, deterministic on-device assistance remains available.

When changing the model URL, size, digest, runtime version, or license, update the native constants, tests, in-app disclosure, `THIRD_PARTY_NOTICES.md`, privacy materials, and App Store review notes in the same release. Do not declare the model path production-ready until a signed physical-device build has completed the model tests in the release checklist.

## Initialize EAS once

The repository deliberately does not contain another developer's Expo owner, EAS project ID, Apple team, or App Store Connect app ID. The release owner must create or link those records:

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init
npx eas-cli project:info
npx eas-cli credentials --platform ios
```

Review and commit the project linkage created by `eas init`. Keep Apple private keys and tokens in EAS Credentials or CI secrets, never in the repository.

The project currently uses `com.fink692.contextmemory`. Before creating the App Store Connect record, the release owner must confirm that this is the permanent identifier registered to their organization. Bundle identifiers cannot be casually changed after distribution.

## Simulator and signed previews

Build an installable simulator archive without Apple device registration:

```bash
cd apps/mobile
npm run build:preview-simulator:ios
```

Build an internal preview for registered iPhones:

```bash
cd apps/mobile
npx eas-cli device:create
npm run build:preview:ios
```

The simulator cannot validate camera scanning, a real personal Contacts library, or real Face ID. Run those cases on a signed physical-device build.

## Production and TestFlight

Create the store-distribution build:

```bash
cd apps/mobile
npm run build:production:ios
```

Once the release owner has created the App Store Connect app, add its real `ascAppId` to a local or committed EAS submit profile and submit the selected build:

```bash
cd apps/mobile
npx eas-cli submit --platform ios --profile production
```

Do not add placeholder owner, project, team, or App Store identifiers. The production profile auto-increments the build number; confirm the resolved version and build number before every upload.

Apple processing is also the final privacy-manifest check. Review any required-reason API email immediately and compare the processed build's privacy report with `app.json` and the manifests bundled by every native dependency.

## App Store Connect work

Code signing is only part of the release. The owner must also provide:

- A stable HTTPS privacy-policy URL containing the substance of `PRIVACY.md`, plus an in-app link to it.
- A support URL and monitored support contact.
- Accurate App Privacy answers for the exact binary and every integrated SDK.
- Age-rating responses that account for user-entered notes, deterministic assistance, and optional on-device model-generated drafts.
- iPhone and, while `supportsTablet` remains enabled, iPad screenshots from the released UI.
- App description, subtitle, keywords, categories, copyright, review contact, and review notes.
- Review instructions and a sample contact QR that let Apple exercise camera, selected-field sharing, app-lock, import/export, and deletion flows.

Use [`IOS_RELEASE_CHECKLIST.md`](IOS_RELEASE_CHECKLIST.md) as the go/no-go record.

## Optional PC web enhancement

The web experience may use a same-PC Node helper and Ollama. Native iOS never calls this loopback service.

```powershell
npm ci
ollama pull qwen3:4b
npm run dev:watcher
```

In a second terminal:

```powershell
npm --workspace @context/mobile run web
```

The helper binds to `127.0.0.1:8789`; Ollama remains on `127.0.0.1:11434`. Register the optional Windows monthly task with:

```powershell
npm run install:update-task
```

Verify it with `schtasks.exe /Query /TN "Context Monthly Update Watch" /V /FO LIST`. This scheduled PC behavior is not part of the iOS runtime or App Store capability declaration.

## Minimum release gates

- Clean `npm ci`, typecheck, tests, Expo Doctor, and Expo dependency check pass on macOS.
- iOS export and clean prebuild pass; the generated privacy and permission files match the intended behavior.
- Signed simulator and physical-device builds complete with the release bundle identifier and credentials.
- App launch, lock, foreground/background transitions, QR scanning, document import, backup export/restore, and complete deletion pass on a physical iPhone.
- A first-run Gemma download is clearly user initiated, restricted to Wi-Fi, verifies the exact size and SHA-256, reports insufficient space safely, and can be cancelled and retried.
- After one successful download, Gemma drafts and prompts work in airplane mode; model output remains editable and requires confirmation before persistence.
- Disabling, unloading, deleting, corrupting, or failing the model activates deterministic assistance without data loss; model deletion leaves relationship records untouched.
- Device backup inspection confirms the Gemma artifact and generated cache are excluded while documented relationship-record backup behavior remains unchanged.
- Native Update Watch makes no request until the user confirms a public HTTPS source and starts a foreground check.
- VoiceOver, maximum Dynamic Type, Reduce Motion, increased contrast, keyboard navigation, and device rotation are exercised.
- The App Store privacy policy, privacy answers, screenshots, support details, age rating, and review notes match the submitted binary.
