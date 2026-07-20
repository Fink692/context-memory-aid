# Third-party notices

Context's optional native iOS model path uses the following third-party components. These notices describe the versions pinned by this repository; release owners must recheck upstream licenses and notices whenever either dependency changes.

## LiteRT-LM 0.14.0

- Project: [Google AI Edge LiteRT-LM](https://github.com/google-ai-edge/LiteRT-LM/tree/v0.14.0)
- Package product: `LiteRTLM`, including its distributed native runtime
- Vendored wrapper path: `apps/mobile/native/LiteRTLM/Sources/LiteRTLM`
- Official iOS XCFramework SHA-256: `dddac2f6713ed65eaf01c18e115d9fec22184adf575cc7856a21387e8ba937e1`
- License: [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- Copyright: the respective Google and upstream contributors

The repository vendors the unmodified Swift wrapper sources from the exact `v0.14.0` tag, with their original copyright headers and a copy of Apache License 2.0. The Expo config plugin attaches that local package so Swift Package Manager does not clone the upstream repository's large history. The local manifest downloads Google's official `v0.14.0` iOS XCFramework and pins the SHA-256 currently published by GitHub's release API. The upstream owner replaced that release asset on July 10, 2026; the repository therefore records the current asset digest rather than the stale checksum still present in the upstream source manifest at the time of integration.

LiteRT-LM is linked only into a native iOS build; it is not used by the web Ollama path.

## Gemma 4 E2B IT LiteRT-LM artifact

- Model card: [`litert-community/gemma-4-E2B-it-litert-lm`](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- File: `gemma-4-E2B-it.litertlm`
- Size: 2,588,147,712 bytes
- SHA-256: `181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c`
- License declared by the model repository: [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- Copyright: the respective Google and upstream contributors

The model is not committed to this repository or bundled in the initial app download. A user may deliberately download it from Hugging Face over Wi-Fi inside the iOS app. Context verifies the exact size and SHA-256 digest before moving the file into app-managed storage. The artifact and generated cache are excluded from device backup.

Apache-2.0 attribution does not replace review of the model card, acceptable-use guidance, export rules, App Store requirements, or laws that apply to a particular release and jurisdiction.
