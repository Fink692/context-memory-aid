internal import Expo
import React
import ReactAppDependencyProvider

struct ContextPrivacyShieldSnapshot {
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

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  private var privacyShieldApplicationState = "unknown"
  private var privacyShieldCycleOpen = false
  private var privacyShieldEnteredBackground = false
  private var privacyShieldEpoch: UInt64 = 0
  private var privacyShieldWindow: UIWindow?
  private weak var privacyShieldView: UIView?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    let didFinish = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    // The first React frame is private until JS has hydrated App Lock and
    // committed its own cover. The same overlap handshake is used on every
    // later foreground transition.
    privacyShieldApplicationState = applicationStateName(application.applicationState)
    openPrivacyShieldCycleIfNeeded()
    installPrivacyShield()
    postPrivacyShieldSnapshot()
    return didFinish
  }

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

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
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

}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
