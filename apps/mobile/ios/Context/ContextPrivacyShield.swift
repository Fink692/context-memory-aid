import Foundation
import React
import UIKit

@objc(ContextPrivacyShield)
final class ContextPrivacyShield: RCTEventEmitter {
  private var isObserving = false
  private var observer: NSObjectProtocol?

  override init() {
    super.init()
    observer = NotificationCenter.default.addObserver(
      forName: .contextPrivacyShieldChanged,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.emitSnapshotIfNeeded()
    }
  }

  deinit {
    if let observer { NotificationCenter.default.removeObserver(observer) }
  }

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! {
    ["ContextPrivacyShieldChanged"]
  }

  override func startObserving() {
    DispatchQueue.main.async {
      self.isObserving = true
      self.emitSnapshotIfNeeded()
    }
  }

  override func stopObserving() {
    DispatchQueue.main.async { self.isObserving = false }
  }

  @objc(getState:rejecter:)
  func getState(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let delegate = UIApplication.shared.delegate as? AppDelegate else {
        reject("E_PRIVACY_SHIELD_UNAVAILABLE", "The native privacy shield is unavailable.", nil)
        return
      }
      resolve(delegate.privacyShieldSnapshot().bridgeValue())
    }
  }

  @objc(release:resolver:rejecter:)
  func release(
    _ epoch: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let delegate = UIApplication.shared.delegate as? AppDelegate else {
        reject("E_PRIVACY_SHIELD_UNAVAILABLE", "The native privacy shield is unavailable.", nil)
        return
      }
      let requestedEpoch = epoch.uint64Value
      let before = delegate.privacyShieldSnapshot()
      let after = delegate.releasePrivacyShield(epoch: requestedEpoch)
      let released = before.shieldVisible
        && before.epoch == requestedEpoch
        && !after.shieldVisible
      resolve(after.bridgeValue(released: released))
    }
  }

  private func emitSnapshotIfNeeded() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard
      isObserving,
      let delegate = UIApplication.shared.delegate as? AppDelegate
    else { return }
    sendEvent(
      withName: "ContextPrivacyShieldChanged",
      body: delegate.privacyShieldSnapshot().bridgeValue()
    )
  }
}
