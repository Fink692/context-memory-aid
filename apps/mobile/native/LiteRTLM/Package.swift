// swift-tools-version: 5.9
// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// https://www.apache.org/licenses/LICENSE-2.0

import PackageDescription

let package = Package(
  name: "LiteRTLM",
  platforms: [.iOS(.v15)],
  products: [
    .library(name: "LiteRTLM", targets: ["LiteRTLM"]),
  ],
  targets: [
    .binaryTarget(
      name: "CLiteRTLM",
      url: "https://github.com/google-ai-edge/LiteRT-LM/releases/download/v0.14.0/CLiteRTLM.xcframework.zip",
      checksum: "dddac2f6713ed65eaf01c18e115d9fec22184adf575cc7856a21387e8ba937e1"
    ),
    .target(
      name: "LiteRTLM",
      dependencies: ["CLiteRTLM"],
      path: "Sources/LiteRTLM",
      linkerSettings: [.unsafeFlags(["-Xlinker", "-all_load"])]
    ),
  ]
)
