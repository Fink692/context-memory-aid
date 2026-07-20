const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withAppDelegate,
  withXcodeProject,
} = require("expo/config-plugins");

const NATIVE_FILES = ["ContextPrivacyShield.swift", "ContextPrivacyShieldBridge.m"];

const SNAPSHOT_TYPES = `struct ContextPrivacyShieldSnapshot {
  let applicationState: String
  let enteredBackground: Bool
  let epoch: UInt64
  let shieldVisible: Bool

  func bridgeValue(released: Bool? = nil) -> [String: Any] {
    var value: [String: Any] = [
      "applicationState": applicationState,
      "enteredBackground": enteredBackground,
      "epoch": NSNumber(value: epoch),
      "shieldVisible": shieldVisible,
    ]
    if let released { value["released"] = released }
    return value
  }
}

extension Notification.Name {
  static let contextPrivacyShieldChanged = Notification.Name("ContextPrivacyShieldChanged")
}

`;

const STATE_FIELDS = `  private var privacyShieldApplicationState = "unknown"
  private var privacyShieldCycleOpen = false
  private var privacyShieldEnteredBackground = false
  private var privacyShieldEpoch: UInt64 = 0
  private var privacyShieldWindow: UIWindow?
  private weak var privacyShieldView: UIView?
`;

const LAUNCH_HANDOFF = `    let didFinish = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    // The first React frame is private until JS has hydrated App Lock and
    // committed its own cover. The same overlap handshake is used on every
    // later foreground transition.
    privacyShieldApplicationState = applicationStateName(application.applicationState)
    openPrivacyShieldCycleIfNeeded()
    installPrivacyShield()
    postPrivacyShieldSnapshot()
    return didFinish`;

const LIFECYCLE_HANDOFF = `
  // Install the native shield synchronously before Expo/React Native receives
  // the inactive event. The JS cover remains useful in-app, but iOS can capture
  // an app-switcher snapshot before React has rendered its state update.
  public override func applicationWillResignActive(_ application: UIApplication) {
    privacyShieldApplicationState = "inactive"
    openPrivacyShieldCycleIfNeeded()
    installPrivacyShield()
    postPrivacyShieldSnapshot()
    super.applicationWillResignActive(application)
  }

  public override func applicationDidEnterBackground(_ application: UIApplication) {
    privacyShieldApplicationState = "background"
    openPrivacyShieldCycleIfNeeded()
    installPrivacyShield()
    privacyShieldEnteredBackground = true
    postPrivacyShieldSnapshot()
    super.applicationDidEnterBackground(application)
  }

  public override func applicationWillEnterForeground(_ application: UIApplication) {
    privacyShieldApplicationState = "inactive"
    openPrivacyShieldCycleIfNeeded()
    installPrivacyShield()
    postPrivacyShieldSnapshot()
    super.applicationWillEnterForeground(application)
  }

  public override func applicationDidBecomeActive(_ application: UIApplication) {
    super.applicationDidBecomeActive(application)
    privacyShieldApplicationState = "active"
    // Never remove the native cover here. React may still be suspended or
    // processing a delayed lifecycle event. ContextPrivacyShield releases the
    // current epoch only after a JS cover has actually laid out.
    postPrivacyShieldSnapshot()
  }
`;

const PRIVACY_HELPERS = `
  private func installPrivacyShield() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard privacyShieldWindow == nil, privacyShieldView == nil else { return }

    if let scene = window?.windowScene {
      let shieldWindow = UIWindow(windowScene: scene)
      shieldWindow.frame = scene.coordinateSpace.bounds
      shieldWindow.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue + 1)
      shieldWindow.backgroundColor = .systemBackground
      shieldWindow.isOpaque = true

      let controller = UIViewController()
      controller.view.backgroundColor = .systemBackground
      controller.view.isOpaque = true
      controller.view.accessibilityElementsHidden = true
      shieldWindow.rootViewController = controller
      shieldWindow.isHidden = false
      shieldWindow.layoutIfNeeded()
      privacyShieldWindow = shieldWindow
      return
    }

    // The window scene can briefly be unavailable during cold launch. Cover
    // the Expo window directly in that case, without waiting for React.
    if let window {
      let shieldView = UIView(frame: window.bounds)
      shieldView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      shieldView.backgroundColor = .systemBackground
      shieldView.isOpaque = true
      shieldView.accessibilityElementsHidden = true
      window.addSubview(shieldView)
      window.bringSubviewToFront(shieldView)
      window.layoutIfNeeded()
      privacyShieldView = shieldView
    }
  }

  private func openPrivacyShieldCycleIfNeeded() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard !privacyShieldCycleOpen else { return }
    privacyShieldEpoch &+= 1
    privacyShieldCycleOpen = true
    privacyShieldEnteredBackground = false
  }

  private func applicationStateName(_ state: UIApplication.State) -> String {
    switch state {
    case .active: return "active"
    case .inactive: return "inactive"
    case .background: return "background"
    @unknown default: return "unknown"
    }
  }

  func privacyShieldSnapshot() -> ContextPrivacyShieldSnapshot {
    dispatchPrecondition(condition: .onQueue(.main))
    return ContextPrivacyShieldSnapshot(
      applicationState: privacyShieldApplicationState,
      enteredBackground: privacyShieldEnteredBackground,
      epoch: privacyShieldEpoch,
      shieldVisible: privacyShieldWindow != nil || privacyShieldView != nil
    )
  }

  func releasePrivacyShield(epoch: UInt64) -> ContextPrivacyShieldSnapshot {
    dispatchPrecondition(condition: .onQueue(.main))
    guard
      privacyShieldCycleOpen,
      epoch == privacyShieldEpoch,
      privacyShieldApplicationState == "active",
      UIApplication.shared.applicationState == .active
    else {
      return privacyShieldSnapshot()
    }
    removePrivacyShield()
    privacyShieldCycleOpen = false
    privacyShieldEnteredBackground = false
    return privacyShieldSnapshot()
  }

  private func postPrivacyShieldSnapshot() {
    dispatchPrecondition(condition: .onQueue(.main))
    NotificationCenter.default.post(name: .contextPrivacyShieldChanged, object: self)
  }

  private func removePrivacyShield() {
    dispatchPrecondition(condition: .onQueue(.main))
    privacyShieldView?.removeFromSuperview()
    privacyShieldView = nil
    privacyShieldWindow?.isHidden = true
    privacyShieldWindow?.rootViewController = nil
    privacyShieldWindow = nil
  }
`;

const COMPLETE_INTEGRATION_SENTINELS = [
  "struct ContextPrivacyShieldSnapshot",
  "static let contextPrivacyShieldChanged",
  "private var privacyShieldApplicationState",
  "public override func applicationWillResignActive",
  "public override func applicationDidEnterBackground",
  "public override func applicationWillEnterForeground",
  "public override func applicationDidBecomeActive",
  "privacyShieldApplicationState = applicationStateName(application.applicationState)",
  "func privacyShieldSnapshot() -> ContextPrivacyShieldSnapshot",
  "func releasePrivacyShield(epoch: UInt64) -> ContextPrivacyShieldSnapshot",
  "privacyShieldApplicationState == \"active\"",
];

const UNIQUE_INTEGRATION_SENTINELS = [
  "ContextPrivacyShieldSnapshot",
  "contextPrivacyShieldChanged",
  "privacyShieldApplicationState",
  "privacyShieldCycleOpen",
  "openPrivacyShieldCycleIfNeeded",
  "releasePrivacyShield(epoch:",
];

function replaceUnique(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first < 0) {
    throw new Error(`Could not install the iOS privacy shield: missing ${label} in AppDelegate.swift.`);
  }
  if (source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`Could not install the iOS privacy shield: ambiguous ${label} in AppDelegate.swift.`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + anchor.length)}`;
}

function patchAppDelegate(contents) {
  if (COMPLETE_INTEGRATION_SENTINELS.every((sentinel) => contents.includes(sentinel))) {
    return contents;
  }
  if (UNIQUE_INTEGRATION_SENTINELS.some((sentinel) => contents.includes(sentinel))) {
    throw new Error("Could not install the iOS privacy shield: AppDelegate.swift contains a partial privacy-shield integration.");
  }
  if (!contents.includes("class AppDelegate: ExpoAppDelegate")) {
    throw new Error("Could not install the iOS privacy shield: AppDelegate.swift is not an Expo Swift app delegate.");
  }
  const conflictingLifecycleMethod = [
    "applicationWillResignActive",
    "applicationDidEnterBackground",
    "applicationWillEnterForeground",
    "applicationDidBecomeActive",
  ].find((method) => contents.includes(`func ${method}`));
  if (conflictingLifecycleMethod) {
    throw new Error(`Could not install the iOS privacy shield: AppDelegate.swift already overrides ${conflictingLifecycleMethod}.`);
  }

  let patched = replaceUnique(
    contents,
    "@main\nclass AppDelegate: ExpoAppDelegate {",
    `${SNAPSHOT_TYPES}@main\nclass AppDelegate: ExpoAppDelegate {`,
    "AppDelegate declaration",
  );
  patched = replaceUnique(
    patched,
    "  var window: UIWindow?\n",
    `  var window: UIWindow?\n${STATE_FIELDS}`,
    "window declaration",
  );
  patched = replaceUnique(
    patched,
    "    return super.application(application, didFinishLaunchingWithOptions: launchOptions)",
    LAUNCH_HANDOFF,
    "launch return",
  );
  patched = replaceUnique(
    patched,
    "\n  // Linking API",
    `${LIFECYCLE_HANDOFF}\n  // Linking API`,
    "Linking API marker",
  );
  patched = replaceUnique(
    patched,
    "\n}\n\nclass ReactNativeDelegate: ExpoReactNativeFactoryDelegate",
    `${PRIVACY_HELPERS}\n}\n\nclass ReactNativeDelegate: ExpoReactNativeFactoryDelegate`,
    "ReactNativeDelegate declaration",
  );
  if (!COMPLETE_INTEGRATION_SENTINELS.every((sentinel) => patched.includes(sentinel))) {
    throw new Error("Could not install the iOS privacy shield: generated AppDelegate integration was incomplete.");
  }
  return patched;
}

function withPrivacyShieldAppDelegate(config) {
  return withAppDelegate(config, (modConfig) => {
    if (modConfig.modResults.language !== "swift") {
      throw new Error("The iOS privacy shield requires a Swift AppDelegate.");
    }
    modConfig.modResults.contents = patchAppDelegate(modConfig.modResults.contents);
    return modConfig;
  });
}

function withPrivacyShieldSources(config) {
  return withXcodeProject(config, (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const iosRoot = modConfig.modRequest.platformProjectRoot;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const sourceRoot = path.join(projectRoot, "native");
    const destinationRoot = path.join(iosRoot, projectName);
    fs.mkdirSync(destinationRoot, { recursive: true });

    for (const filename of NATIVE_FILES) {
      const source = path.join(sourceRoot, filename);
      if (!fs.existsSync(source)) throw new Error(`Missing privacy shield source: ${source}`);
      fs.copyFileSync(source, path.join(destinationRoot, filename));
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: `${projectName}/${filename}`,
        groupName: projectName,
        project: modConfig.modResults,
      });
    }
    return modConfig;
  });
}

module.exports = function withPrivacyShield(config) {
  return withPrivacyShieldSources(withPrivacyShieldAppDelegate(config));
};

module.exports.NATIVE_FILES = NATIVE_FILES;
module.exports.patchAppDelegate = patchAppDelegate;
