import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface PrivacyShieldPlugin {
  NATIVE_FILES: string[];
  patchAppDelegate(contents: string): string;
}

const require = createRequire(import.meta.url);
const plugin = require("./with-privacy-shield.js") as PrivacyShieldPlugin;
const fixtureRoot = dirname(fileURLToPath(import.meta.url));

const stockExpoAppDelegate = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
}
`;

describe("with-privacy-shield AppDelegate integration", () => {
  it("installs the complete epoch handoff and is idempotent", () => {
    const patched = plugin.patchAppDelegate(stockExpoAppDelegate);
    const resignStart = patched.indexOf("public override func applicationWillResignActive");
    const resignInstall = patched.indexOf("installPrivacyShield()", resignStart);
    const resignSuper = patched.indexOf("super.applicationWillResignActive(application)", resignStart);
    const activeStart = patched.indexOf("public override func applicationDidBecomeActive");
    const activeEnd = patched.indexOf("// Linking API", activeStart);

    expect(plugin.NATIVE_FILES).toEqual([
      "ContextPrivacyShield.swift",
      "ContextPrivacyShieldBridge.m",
    ]);
    expect(patched).toContain("struct ContextPrivacyShieldSnapshot");
    expect(patched).toContain("privacyShieldApplicationState = applicationStateName(application.applicationState)");
    expect(resignStart).toBeGreaterThan(-1);
    expect(resignInstall).toBeGreaterThan(resignStart);
    expect(resignSuper).toBeGreaterThan(resignInstall);
    expect(patched.slice(activeStart, activeEnd)).not.toContain("removePrivacyShield()");
    expect(patched).toContain("epoch == privacyShieldEpoch");
    expect(patched).toContain('privacyShieldApplicationState == "active"');
    expect(patched).toContain("UIApplication.shared.applicationState == .active");
    expect(plugin.patchAppDelegate(patched)).toBe(patched);
  });

  it("accepts the checked-in AppDelegate as the same complete integration", () => {
    const appDelegatePath = resolve(fixtureRoot, "..", "ios", "Context", "AppDelegate.swift");
    const current = readFileSync(appDelegatePath, "utf8");
    expect(plugin.patchAppDelegate(current)).toBe(current);
  });

  it("fails closed instead of silently accepting a partial integration", () => {
    expect(() => plugin.patchAppDelegate(
      stockExpoAppDelegate.replace("  var window: UIWindow?", "  var window: UIWindow?\n  private var privacyShieldCycleOpen = false"),
    )).toThrow(/partial privacy-shield integration/i);
  });

  it("fails clearly for an unsupported AppDelegate shape", () => {
    expect(() => plugin.patchAppDelegate("final class AppDelegate: NSObject {}"))
      .toThrow(/not an Expo Swift app delegate/i);
  });
});
