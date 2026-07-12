# Context Privacy Policy

Effective: July 11, 2026

Context is designed to help you remember people you meet through work, school, your neighborhood, shops, travel, community life, and events while keeping relationship information under your control. This policy describes the native Context app and the optional PC web enhancement in this repository.

## Information you choose to store

Context can process the following information when you enter or import it:

- Names, companies, roles, phone numbers, email addresses, social links, profile photos, where you met, conversation topics, and relationship notes.
- Events and the saved people you associate with each event.
- Timeline memories, follow-up ideas, and approved public-source updates.
- Public HTTPS source URLs that you manually confirm belong to a saved person.
- Preferences such as app-lock and smart-assistance settings.

## Optional Contacts import

Context requests Contacts access only after you choose **Import from Contacts**. Before the operating-system prompt, the app explains the purpose and the fields it can copy. On iOS 18 or newer, you can grant access to selected contacts rather than the complete address book. Context treats limited access as a complete, supported choice and offers a system picker if you later want to choose more people.

For each person you select, the import can read the name, company, job title, and available phone number, email address, social profiles, and profile thumbnail. It shows a review list before anything is saved. It does not request or copy Contacts notes, birthdays, postal addresses, or relations. Context does not create, edit, or delete records in the operating-system Contacts app. Imported people are copied into Context's private People directory with quick badge matching off and are not silently synchronized afterward.

Context keeps a local mapping between the operating system's contact identifier and the copied Context profile so a deliberate repeat import does not create duplicates. That device-specific mapping remains inside app storage, is omitted from JSON exports, and is not included in Gemma prompts. Revoking Contacts permission does not silently delete previously copied Context records; you can delete those records inside Context.

This information is stored in the app's platform sandbox. Context has no developer-operated account or hosted application database and does not transmit your relationship records to the developer.

## On-device assistance

On iPhone, smart drafts, person field filling, people-list PDF extraction, and conversation prompts can optionally use the Gemma 4 E2B IT model through Google's LiteRT-LM runtime. Prompts and generated text stay in the app process and are not sent to a cloud model. Context limits model input to the relationship details or user-selected document text needed for the selected task. Suggestions and extracted people remain editable and do not enter the People directory or a person's timeline until you approve them.

The model is optional. If it is disabled, has not been downloaded, fails its integrity check, or cannot run, Context uses deterministic on-device assistance where available. No model is needed for QR matching, app lock, search, manual entry, Contacts/CSV/JSON import or export, or Update Watch; Gemma-powered person field filling and PDF extraction require the downloaded model.

If you choose **Download Gemma 4**, Context downloads a 2.59 GB model file over Wi-Fi from [Hugging Face](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm). This is the only app-managed AI-model network request: no relationship record, note, event, prompt, or model output is attached. Hugging Face receives ordinary request information such as your IP address and time under its own privacy policy. Context verifies the file's published SHA-256 digest before use, stores it in the app sandbox, and excludes the model and its generated cache from iOS device backups.

The optional PC web enhancement can send bounded relationship context to an Ollama model running on the same PC through loopback addresses. That service is optional, is not contacted by the native iOS app, and does not write model prompts or responses to its watcher data file.

## On-device dictation

On iPhone, Context requests microphone access only after you tap a visible **Dictate** control in a person or memory form. Live microphone buffers are passed directly to Apple's on-device Speech framework. Context does not create an audio recording, write audio to storage, send audio or transcripts to the developer, or allow server-based speech recognition. The editable transcript enters the form only while that dictation session is active and is saved only if you confirm the surrounding person or memory form.

On iOS 26 or newer, Apple may need to download or update a language-specific SpeechTranscriber asset after you initiate dictation. Apple manages that asset in system storage outside Context's app sandbox. Older supported iOS versions use speech recognition only when the device reports that the selected language supports on-device recognition; otherwise Context leaves typed input available rather than using a server fallback.

You can stop or cancel dictation at any time. Leaving the screen, locking the phone, or moving Context into the background stops microphone capture. Cancelling restores the field to its pre-dictation text.

## Camera, QR badges, and biometrics

Context requests camera access only when you choose to scan a Context QR badge. The scanner reads QR data in the live preview; the app does not take, retain, or upload camera images. Camera scanning does not use the microphone.

Context QR badges contain an app-scoped credential used to locate an eligible saved record. They are not face templates and do not enable stranger search.

If you enable app lock, iOS or Android performs Face ID, Touch ID, fingerprint, or device-credential authentication. Context receives only an authentication result. The app does not receive or store the operating system's biometric template.

Context does not infer identity from a face or other camera pixels.

## Public-source checks and external search

Native Update Watch runs only in the foreground. A due check can start when you open its screen or return to the app, and you can also tap **Check now**. It requests only public HTTPS URLs that you have confirmed. The destination website receives ordinary network information such as your IP address, the requested URL, and time. Context does not send your private notes, event list, camera data, cookies, or credentials to the source.

When you deliberately open a public web search, the search provider receives the query under its own privacy policy. Context does not silently search for people or bypass authentication, robots rules, CAPTCHAs, or access controls.

The optional PC watcher stores confirmed URLs and pending suggestions in the user's local PC profile. It may run a user-installed monthly task; this is separate from the native app.

## Files, backups, and sharing

Contacts, CSV, PDF, and JSON imports run only after you choose the relevant source. CSV/PDF imports and JSON restores are read only after you choose a document. A PDF is limited to locally available selectable text; that text is processed by Gemma on the iPhone and is never uploaded by Context. A profile photo is copied into Context's app storage only after you choose it with the system photo picker. A Contacts import can also retain an available thumbnail reference from a person you select. Native exports create a temporary JSON file and open the system share sheet. Any exported copy is unencrypted portable data controlled by you and by the destination you select. Device-specific Contacts link identifiers are not included in exported JSON.

App data is protected by the platform sandbox and device security. Context does not currently claim separate database-level encryption for all relationship records. Device and cloud backups of relationship records are governed by your operating-system and Apple or Google account settings. The separately downloaded Gemma model and its generated cache are marked as excluded from iOS backups. Use a device passcode, enable Context app lock, and protect exported backups appropriately.

## Retention and deletion

Relationship records remain until you edit, restore, reset, or delete them. You can delete individual memories, remove a person, or use **Delete all local data** in the app. Deletion removes the app-managed local records covered by that action. You can separately remove the downloaded Gemma model and cache from **Privacy & data** without deleting relationship records; uninstalling the app also removes its sandbox.

Files you exported, copies held in device or cloud backups, and information independently held by public websites are outside the app's control. Deleting the app follows the operating system's uninstall behavior; some Keychain or secure-storage entries can survive reinstall by platform design and are cleared when the corresponding in-app deletion flow runs.

## Sharing, selling, analytics, and advertising

Context does not sell personal information, run an advertising network, track you across other companies' apps or websites, or include product analytics. The developer does not receive the relationship data stored in the native app.

Public websites and a search provider receive information only when you initiate the relevant foreground action. Hugging Face receives an ordinary file-download request only if you deliberately download the optional Gemma model. Apple may receive an operating-system speech-language asset request after you deliberately start dictation, but Context does not attach audio, transcripts, or relationship data. Apple, Expo, npm, and an app store may process developer or distribution information while the app is built and delivered; that tooling does not receive your Context relationship workspace at runtime.

## Children and information about other people

Context is intended for personal relationship memory and is not directed to children. You are responsible for entering only information you have a lawful and respectful reason to keep, and for honoring another person's privacy and any applicable workplace or local requirements.

## Changes and contact

Material changes will update this file's effective date. Questions or privacy reports can be opened through the project's public issue tracker:

https://github.com/Fink692/context-memory-aid/issues

Before public App Store distribution, the release owner must publish this policy at a stable HTTPS URL, add that URL inside the app and App Store Connect, and verify that it still describes the exact submitted binary.
