# Vendored LiteRT-LM Swift wrapper

This directory contains the unmodified Swift wrapper sources from Google AI Edge's
LiteRT-LM `v0.14.0` release. The local Swift package avoids cloning the unusually
large upstream Git history during every clean Expo/Xcode build.

`Package.swift` downloads Google's official iOS XCFramework release asset and pins
its Swift Package Manager checksum. The asset was replaced by the upstream release
owner on 2026-07-10; the pinned digest is the SHA-256 published by GitHub's release
API for that current asset. Upstream source and releases:

- https://github.com/google-ai-edge/LiteRT-LM/tree/v0.14.0/swift
- https://github.com/google-ai-edge/LiteRT-LM/releases/tag/v0.14.0

The wrapper and binary are licensed under Apache License 2.0; see `LICENSE`.
