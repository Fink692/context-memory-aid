# iOS release checklist

Use one copy of this checklist for every TestFlight or App Store candidate. Record evidence links or build IDs beside completed items.

## 1. Release ownership and identity

- [ ] The release owner controls the Apple Developer, App Store Connect, and Expo accounts.
- [ ] Production/TestFlight signing uses the intended paid Apple Developer Program team, not a free Personal Team.
- [ ] Apple agreements, tax, banking, and developer-program status are current.
- [ ] The release owner has confirmed and registered `com.fink692.contextmemory` as the permanent bundle identifier before first distribution.
- [ ] `eas init` linked the repository to the intended Expo project; the resulting owner and project ID were reviewed rather than invented.
- [ ] The App Store Connect record uses the same bundle identifier.
- [ ] Signing certificates, provisioning profiles, and App Store Connect API keys are stored in EAS Credentials or CI secrets only.

## 2. Source and dependency gates

- [ ] Working tree scope is reviewed and the release commit is immutable.
- [ ] `npm ci` succeeds on Linux and macOS from an empty `node_modules` directory.
- [ ] `npm run verify` passes.
- [ ] `cd apps/mobile && npx expo-doctor` passes.
- [ ] `cd apps/mobile && npx expo install --check` reports no incompatible package.
- [ ] `npm audit --omit=dev` is reviewed; no high or critical runtime issue is accepted without a written decision.
- [ ] Expo SDK, React Native, Node, minimum iOS, and Xcode versions still meet Expo and App Store requirements.
- [ ] The Gemma 4 model card, Apache-2.0 declaration, vendored LiteRT-LM 0.14.0 wrapper, pinned official XCFramework digest, and `THIRD_PARTY_NOTICES.md` were reviewed for this release.

## 3. Generated native configuration

The checked-in reason set mirrors the manifests shipped by React Native 0.86, Expo FileSystem/Constants, and AsyncStorage 2.2: file timestamps for app-managed files and storage (`0A2A.1`, `3B52.1`, `C617.1`), system boot time used by the React Native timing runtime (`35F9.1`), disk-space checks used by Expo FileSystem (`85F4.1`, `E174.1`), and app-scoped preferences (`CA92.1`). These are dependency-version-specific declarations, not permanent blanket approvals; compare them with the final Pods and archive on every upgrade.

- [ ] `CI=1 npx expo prebuild --platform ios --clean --no-install` succeeds.
- [ ] The generated project contains the `ContextLocalLLM` bridge and a `LiteRTLM` product reference to `../native/LiteRTLM`; the local manifest pins the reviewed official XCFramework digest.
- [ ] The generated project contains the reviewed local PDFKit text-extractor and system profile-photo-picker bridges, with no cloud document/photo SDK or broad photo-library permission.
- [ ] No personal `DEVELOPMENT_TEAM` is committed as generated source; after a clean prebuild, the tester reselects the intended Team in Xcode before a signed device build.
- [ ] Generated `Info.plist` has the intended name, bundle ID, semantic version, and build number.
- [ ] `NSCameraUsageDescription` says camera access is for deliberate contact QR scanning while the scanner is open and that video is not saved.
- [ ] `NSContactsUsageDescription` says Context can copy user-chosen names, companies, roles, and available phone, email, social-profile, and profile-thumbnail details into its private People directory and never modifies Contacts.
- [ ] `NSFaceIDUsageDescription` says Face ID unlocks the private app workspace.
- [ ] `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` say dictation is deliberate, on-device, not saved, and never uploaded.
- [ ] No location, broad photo-library, Bluetooth, background-audio, or tracking permission appears; profile-photo selection uses the system picker.
- [ ] `ITSAppUsesNonExemptEncryption` matches the export-compliance answer.
- [ ] Generated entitlements contain only approved capabilities.
- [ ] The app-level `PrivacyInfo.xcprivacy` is present and valid.
- [ ] Required-reason categories and codes match actual calls in React Native, Expo modules, AsyncStorage, and every other linked SDK.
- [ ] The processed TestFlight build produces no Apple privacy-manifest warning.

## 4. Build progression

- [ ] `npm run export:ios -- --clear` succeeds.
- [ ] `npm run build:preview-simulator:ios` installs and launches on supported iPhone and iPad simulators.
- [ ] A registered-device `npm run build:preview:ios` installs and launches on at least one physical iPhone.
- [ ] Any Personal Team build is treated as short-lived local testing only; TestFlight/App Store artifacts use paid-program distribution credentials.
- [ ] Xcode resolves the local LiteRT-LM package and archives the checksummed native runtime without an unreviewed source, binary, or digest change.
- [ ] `npm run build:production:ios` completes with store distribution.
- [ ] The resolved marketing version and auto-incremented build number are unique and correct.
- [ ] The exact production artifact is uploaded to TestFlight; no untested rebuild is substituted.

## 5. Functional physical-device matrix

- [ ] Clean install and first launch route correctly to onboarding.
- [ ] Upgrade from the previous production version preserves and migrates valid local data.
- [ ] Airplane-mode launch, People, Events, memories, deterministic fallback assistance, contact QR creation/review, and manual lookup work without a companion service.
- [ ] Gemma 4 download is opt-in and Wi-Fi-only, discloses its 2.59 GB size and about 4.6 GB free-space requirement, supports cancel/retry, and fails safely when storage or network access is insufficient.
- [ ] The downloaded `gemma-4-E2B-it.litertlm` file is rejected unless its size is 2,588,147,712 bytes and SHA-256 is `181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c`.
- [ ] After download and load, Gemma-created person fields, PDF people-list extraction, memory drafts, and conversation prompts work in airplane mode, remain bounded to the selected input/context, and require review before persistence.
- [ ] Missing, disabled, unloaded, deleted, corrupt, memory-pressured, and failed model states fall back to deterministic assistance without modifying relationship data.
- [ ] Deleting Gemma removes its artifact/cache without deleting contacts or memories, and a reinstall/download path restores model functionality.
- [ ] Face ID/device lock enables, unlocks, cancels, retries, handles lockout, and falls back according to product policy.
- [ ] Returning from background and relaunching requires authentication at the intended times.
- [ ] Camera permission allow, deny, permanent deny, Settings recovery, interruption, and backgrounding behave safely.
- [ ] Dictation permission allow, deny, permanent deny, Settings recovery, language-asset preparation, silence, stop, cancel, duration/character limits, interruption, route changes, backgrounding, and App Lock behave safely.
- [ ] Dictation works in airplane mode after any Apple-managed language asset is ready, and container inspection confirms no audio recording is written.
- [ ] Contacts import explains its data boundary before the system prompt; not-determined, selected/limited, full, denied, restricted, cancel, Settings recovery, and choose-more states behave without repeated prompts.
- [ ] Contacts preview reads only name, company, role, and available phone, email, social-profile, and profile-thumbnail fields; it never reads Contacts notes, birthdays, or postal addresses. Global import works without an event, same-name native records remain distinct, repeat import is idempotent, and imported people start with quick matching off.
- [ ] Contacts permission changes never silently delete copied Context records; deleting a copied person clears its private device-source link, and exported JSON contains no device contact identifier.
- [ ] Adding a person works without an event; one dictation channel can fill editable name/contact/context fields with local Gemma without filling a photo or saving before confirmation.
- [ ] Profile-photo choose, replace, remove, upgrade persistence, app-lock, backup/export behavior, and missing-file fallback pass without broad photo-library permission.
- [ ] Contact sharing includes only the fields selected in review; the QR and shared `.vcf` decode in Apple Contacts, and memories, relationship notes, events, photos, follow-ups, and internal identifiers are absent.
- [ ] Contact QR scanning handles malformed, oversized, multi-card, Unicode, and unsupported-version payloads; nothing saves before review.
- [ ] Duplicate receive review covers exact email/phone matches, same-name candidates, conflicting identifiers, update-vs-new choice, field conflicts, persistence failure, and preservation of private Context data.
- [ ] The iOS share sheet, cancellation, Messages/Files, AirDrop between nearby devices, and temporary-file cleanup pass on physical devices.
- [ ] CSV import handles Files/iCloud providers, UTF-8 data, duplicates, malformed rows, size limits, and both global and event-scoped destinations.
- [ ] PDF people-list import handles Files/iCloud providers, selectable text, scanned/image-only files, password protection, page/character/file-size limits, local-Gemma failure, duplicates, global/event destinations, review, cancel, and offline extraction without upload.
- [ ] JSON export, cancel, share, restore preview, invalid restore, and successful restore pass.
- [ ] Native Update Watch sends no request before source confirmation or outside an explicit foreground check.
- [ ] Public-source redirects, timeouts, oversized responses, malformed feeds/pages, offline state, and cancellation produce bounded errors without altering memories.
- [ ] Person deletion, individual-memory deletion, event removal, and delete-all work while offline and survive immediate force-quit/relaunch.
- [ ] No private relationship data appears in logs, crash text, analytics, pasteboard, screenshots generated by the app, or unexpected network traffic.

## 6. Accessibility and layout

- [ ] VoiceOver can complete onboarding, app unlock, Contacts selection/review, contact sharing and scanning, person dictation and field review, profile-photo selection, event selection, People search, manual lookup, CSV/PDF import, memory creation, export, and deletion.
- [ ] Focus enters and leaves confirmation modals predictably; accessibility escape cancels safely.
- [ ] Controls expose accurate labels, roles, values, selected states, disabled states, and errors.
- [ ] The UI remains usable at every Dynamic Type size, including accessibility sizes.
- [ ] Reduce Motion, Bold Text, increased contrast, button shapes, and color filters do not hide state or meaning.
- [ ] Keyboard appearance, dismissal, autofill, hardware keyboard, and Voice Control do not obscure form actions.
- [ ] Light/dark appearance behavior matches the declared product support.
- [ ] Because `supportsTablet` is enabled, portrait, landscape, split-screen, Stage Manager, and keyboard use pass on supported iPads.

## 7. Privacy and security evidence

- [ ] The in-app privacy screen, hosted policy, `PRIVACY.md`, App Store privacy answers, and actual network behavior agree.
- [ ] The hosted privacy and support URLs are stable HTTPS pages available without login.
- [ ] App Privacy answers include every SDK and distinguish on-device processing from developer collection correctly.
- [ ] App-lock limitations, device backup behavior, and unencrypted exported JSON are described accurately.
- [ ] Finder/iCloud backup inspection confirms the downloaded Gemma model and generated cache are excluded; JSON exports contain neither artifact nor cache.
- [ ] A proxy/device privacy report confirms no cloud-model inference, tracking, analytics, audio/transcript upload, or unintended background traffic.
- [ ] A proxy/device privacy report confirms profile photos and selected CSV/PDF contents are not uploaded by Context.
- [ ] The proxy/device report confirms the only app-managed AI-model request is the deliberate Hugging Face model download and that it contains no contacts, notes, events, prompts, or generated text; any Apple-managed speech-language asset request occurs only after Dictate is tapped.
- [ ] Public-source requests contain no notes, events, cookies, credentials, camera data, or unrelated contact fields.
- [ ] Secrets and Apple/Expo credentials are absent from the repository, JavaScript bundle, source maps, app archive, and logs.
- [ ] Deletion is tested without any PC service or network dependency.

## 8. App Store Connect

- [ ] App name, subtitle, description, keywords, categories, copyright, age rating, and availability are final.
- [ ] Privacy Policy URL, optional Privacy Choices URL, and Support URL are entered.
- [ ] Current iPhone screenshots are uploaded for every required size.
- [ ] Current iPad screenshots are uploaded while tablet support remains enabled.
- [ ] App Review contact information is monitored during review.
- [ ] Review notes explain the local-only model boundary, optional review-first Contacts import, selected-field contact sharing, foreground public-source checks, Face ID app lock, camera use, and how to exercise a sample contact QR.
- [ ] Reviewers have sample data and instructions that do not require access to private accounts or the developer's PC.
- [ ] Export-compliance, content-rights, encryption, and regional compliance questions are answered for this exact build.
- [ ] TestFlight internal testing, external beta review if used, crash review, and tester feedback are complete.

## 9. Go/no-go

- [ ] No P0 or P1 defect remains open.
- [ ] Known lower-priority issues have an owner, impact statement, and release decision.
- [ ] Rollback/support instructions and the previous accepted build remain available.
- [ ] The release owner approves the exact build ID and phased/manual release setting.
