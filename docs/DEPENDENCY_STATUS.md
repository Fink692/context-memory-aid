# Dependency status - 12 October 2026

Compatible dependency updates were applied within Expo SDK 57. React Native was aligned to 0.86.3 and the native modules to the SDK's expected ranges. `react-native-screens` is constrained to one SDK-compatible version to avoid duplicate native modules. The sharing config plugin is declared explicitly.

## Verified locally

- Type checks and all 273 tests passed: 230 mobile, 34 shared, and 9 helper tests.
- The production web export completed.
- Expo Doctor passed all 20 checks; the SDK dependency check passed.

These checks do not establish signed-device behavior, macOS packaging, or iOS release readiness. Hosted CI and physical-device checks retain their own results.

## Remaining advisories

The recorded audit after compatible updates reported 23 affected package entries: 20 high, 3 moderate, and no critical. Most entries are transitive dependency chains, not distinct root advisories.

| Root package | Remaining issue | Upgrade boundary |
| --- | --- | --- |
| `braces` | Deep-pattern recursion can exhaust the stack. [Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | The advisory lists no patched release. |
| `node-forge` | Nested digest-algorithm elements can bypass signature validation. [Advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | The advisory lists no patched release. |
| `image-size` | Malformed JXL/HEIF or ICNS inputs can loop. [JXL/HEIF advisory](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), [ICNS advisory](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) | Patched 2.x has a different file-input API; a blanket override would break the legacy Metro caller. |
| `decode-uri-component` | Malformed percent-encoded input can consume excessive CPU. [Advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | The proposed router upgrade crosses Expo SDK versions and needs a separate native migration. |

The audit now runs as an independent blocking CI job so application and native-build diagnostics can run even when an upstream advisory is unresolved. No audit exceptions or severity thresholds were added. `npm audit --audit-level=high` remains blocking. An automatic force-fix proposing Expo 44 is not an acceptable upgrade from SDK 57.

Reproduce from a clean checkout with `npm ci`, `npm run verify`, and `npm audit --audit-level=high`. Run `npx expo-doctor` from `apps/mobile`; a command run at the monorepo root does not validate that app's dependency composition.
