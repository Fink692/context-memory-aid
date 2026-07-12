import Foundation
import PhotosUI
import React
import UIKit

private enum ProfilePhotoPickerError: LocalizedError {
  case busy
  case unavailable
  case unreadable

  var errorDescription: String? {
    switch self {
    case .busy:
      return "Finish choosing the current photo before opening the photo library again."
    case .unavailable:
      return "The iPhone photo picker is unavailable right now."
    case .unreadable:
      return "Context could not create a private copy of that photo. Choose another image."
    }
  }
}

@objc(ContextProfilePhotoPicker)
final class ContextProfilePhotoPicker: NSObject, PHPickerViewControllerDelegate {
  private let workQueue = DispatchQueue(label: "com.fink692.contextmemory.profile-photo", qos: .userInitiated)
  private var resolver: RCTPromiseResolveBlock?
  private var rejecter: RCTPromiseRejectBlock?
  private weak var presentedPicker: PHPickerViewController?

  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc(pick:rejecter:)
  func pick(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard self.resolver == nil else {
        reject("E_PHOTO_BUSY", ProfilePhotoPickerError.busy.localizedDescription, ProfilePhotoPickerError.busy)
        return
      }
      guard let presenter = self.topViewController() else {
        reject("E_PHOTO_UNAVAILABLE", ProfilePhotoPickerError.unavailable.localizedDescription, ProfilePhotoPickerError.unavailable)
        return
      }

      self.resolver = resolve
      self.rejecter = reject
      var configuration = PHPickerConfiguration(photoLibrary: .shared())
      configuration.filter = .images
      configuration.selectionLimit = 1
      configuration.preferredAssetRepresentationMode = .current
      let picker = PHPickerViewController(configuration: configuration)
      picker.delegate = self
      self.presentedPicker = picker
      presenter.present(picker, animated: true)
    }
  }

  @objc(persist:resolver:rejecter:)
  func persist(
    _ uri: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    workQueue.async {
      do {
        guard let sourceURL = URL(string: uri), sourceURL.isFileURL else {
          throw ProfilePhotoPickerError.unreadable
        }
        let hasSecurityScope = sourceURL.startAccessingSecurityScopedResource()
        defer {
          if hasSecurityScope { sourceURL.stopAccessingSecurityScopedResource() }
        }
        guard let image = UIImage(contentsOfFile: sourceURL.path) else {
          throw ProfilePhotoPickerError.unreadable
        }
        resolve(["uri": try self.savePrivateCopy(of: image)])
      } catch {
        reject("E_PHOTO_READ", error.localizedDescription, error)
      }
    }
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    guard let result = results.first else {
      finish(with: NSNull())
      return
    }
    guard result.itemProvider.canLoadObject(ofClass: UIImage.self) else {
      fail(ProfilePhotoPickerError.unreadable)
      return
    }

    result.itemProvider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
      guard let self, let image = object as? UIImage else {
        self?.fail(ProfilePhotoPickerError.unreadable)
        return
      }
      do {
        let uri = try self.savePrivateCopy(of: image)
        self.finish(with: ["uri": uri])
      } catch {
        self.fail(error)
      }
    }
  }

  private func savePrivateCopy(of source: UIImage) throws -> String {
    let maximumDimension: CGFloat = 1_200
    let sourceSize = source.size
    let largestDimension = max(sourceSize.width, sourceSize.height)
    let scale = largestDimension > maximumDimension ? maximumDimension / largestDimension : 1
    let targetSize = CGSize(
      width: max(1, floor(sourceSize.width * scale)),
      height: max(1, floor(sourceSize.height * scale))
    )
    let renderer = UIGraphicsImageRenderer(size: targetSize)
    let normalized = renderer.image { _ in
      source.draw(in: CGRect(origin: .zero, size: targetSize))
    }
    guard let data = normalized.jpegData(compressionQuality: 0.84) else {
      throw ProfilePhotoPickerError.unreadable
    }

    let applicationSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let directory = applicationSupport.appendingPathComponent("ContextProfilePhotos", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let destination = directory.appendingPathComponent("\(UUID().uuidString).jpg")
    try data.write(to: destination, options: [.atomic, .completeFileProtection])
    return destination.absoluteString
  }

  private func finish(with value: Any) {
    DispatchQueue.main.async {
      let resolve = self.resolver
      self.clearCallbacks()
      resolve?(value)
    }
  }

  private func fail(_ error: Error) {
    DispatchQueue.main.async {
      let reject = self.rejecter
      self.clearCallbacks()
      reject?("E_PHOTO_READ", error.localizedDescription, error)
    }
  }

  private func clearCallbacks() {
    resolver = nil
    rejecter = nil
    presentedPicker = nil
  }

  private func topViewController() -> UIViewController? {
    let root = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }?
      .windows
      .first { $0.isKeyWindow }?
      .rootViewController
    return topViewController(from: root)
  }

  private func topViewController(from controller: UIViewController?) -> UIViewController? {
    if let navigation = controller as? UINavigationController {
      return topViewController(from: navigation.visibleViewController)
    }
    if let tab = controller as? UITabBarController {
      return topViewController(from: tab.selectedViewController)
    }
    if let presented = controller?.presentedViewController {
      return topViewController(from: presented)
    }
    return controller
  }
}
