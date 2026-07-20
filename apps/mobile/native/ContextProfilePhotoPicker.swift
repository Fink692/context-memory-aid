import Foundation
import ImageIO
import PhotosUI
import React
import UIKit
import UniformTypeIdentifiers

private enum ProfilePhotoPickerError: LocalizedError {
  case busy
  case cleared
  case unavailable
  case unreadable

  var errorDescription: String? {
    switch self {
    case .busy:
      return "Finish choosing the current photo before opening the photo library again."
    case .cleared:
      return "That photo request was cancelled because Context's private photos were cleared."
    case .unavailable:
      return "The iPhone photo picker is unavailable right now."
    case .unreadable:
      return "Context could not add that photo. Choose a JPEG, PNG, HEIC, or TIFF image."
    }
  }
}

@objc(ContextProfilePhotoPicker)
final class ContextProfilePhotoPicker: NSObject, PHPickerViewControllerDelegate {
  private let workQueue = DispatchQueue(label: "com.fink692.contextmemory.profile-photo", qos: .userInitiated)
  private let maximumInputBytes = 50 * 1_024 * 1_024
  private let maximumOutputBytes = 6 * 1_024 * 1_024
  private let maximumPixelCount: UInt64 = 80_000_000
  private let maximumSourceDimension: UInt64 = 20_000
  private let maximumThumbnailDimension = 1_200
  private let acceptedImageTypes: Set<String> = [
    "public.heic",
    "public.heif",
    "public.jpeg",
    "public.png",
    "public.tiff",
  ]

  // Accessed only on workQueue. Incrementing this invalidates any picker whose
  // file-provider callback has not reached the serialized save step yet.
  private var clearEpoch: UInt64 = 0
  private var filesCreatedThisProcess: Set<String> = []
  private var pickerEpoch: UInt64?
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
      self.pickerEpoch = self.workQueue.sync { self.clearEpoch }
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
        resolve(["uri": try self.savePrivateCopy(from: sourceURL)])
      } catch {
        reject("E_PHOTO_READ", error.localizedDescription, error)
      }
    }
  }

  @objc(prune:resolver:rejecter:)
  func prune(
    _ referencedUris: [String],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    workQueue.async {
      do {
        resolve(try self.prunePrivateCopies(referencedUris: referencedUris))
      } catch {
        reject("E_PHOTO_PRUNE", "Context could not finish cleaning up unreferenced private photos.", error)
      }
    }
  }

  @objc(clear:rejecter:)
  func clear(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    workQueue.async {
      // Invalidate file-provider callbacks before attempting the wipe. Whether
      // this block runs before or after a save, the serial queue leaves no file
      // write racing the directory removal.
      self.clearEpoch &+= 1
      self.filesCreatedThisProcess.removeAll()
      do {
        let directory = self.privatePhotoDirectory()
        if FileManager.default.fileExists(atPath: directory.path) {
          try FileManager.default.removeItem(at: directory)
        }
        resolve(NSNull())
      } catch {
        reject("E_PHOTO_CLEAR", "Context could not clear its private profile photos.", error)
      }
    }
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    guard let result = results.first else {
      finish(with: NSNull())
      return
    }
    let imageType = UTType.image.identifier
    guard result.itemProvider.hasItemConformingToTypeIdentifier(imageType),
          let selectionEpoch = pickerEpoch else {
      fail(ProfilePhotoPickerError.unreadable)
      return
    }

    result.itemProvider.loadFileRepresentation(forTypeIdentifier: imageType) { [weak self] sourceURL, _ in
      guard let self, let sourceURL else {
        self?.fail(ProfilePhotoPickerError.unreadable)
        return
      }

      // NSItemProvider owns this temporary URL only for the duration of its
      // completion callback, so synchronously enter the same serial queue used
      // by persist(), prune(), and clear(). The decoded thumbnail is bounded.
      let saveResult: Result<String, Error> = self.workQueue.sync {
        Result {
          guard self.clearEpoch == selectionEpoch else {
            throw ProfilePhotoPickerError.cleared
          }
          return try self.savePrivateCopy(from: sourceURL)
        }
      }
      switch saveResult {
      case .success(let uri):
        self.finish(with: ["uri": uri])
      case .failure(let error):
        self.fail(error)
      }
    }
  }

  private func savePrivateCopy(from sourceURL: URL) throws -> String {
    let hasSecurityScope = sourceURL.startAccessingSecurityScopedResource()
    defer {
      if hasSecurityScope { sourceURL.stopAccessingSecurityScopedResource() }
    }

    let resourceValues = try sourceURL.resourceValues(forKeys: [
      .fileSizeKey,
      .isRegularFileKey,
      .isSymbolicLinkKey,
    ])
    guard resourceValues.isRegularFile == true,
          resourceValues.isSymbolicLink != true,
          let fileSize = resourceValues.fileSize,
          fileSize > 0,
          fileSize <= maximumInputBytes else {
      throw ProfilePhotoPickerError.unreadable
    }

    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let imageSource = CGImageSourceCreateWithURL(sourceURL as CFURL, sourceOptions),
          CGImageSourceGetCount(imageSource) == 1,
          let detectedType = CGImageSourceGetType(imageSource) as String?,
          acceptedImageTypes.contains(detectedType),
          UTType(detectedType)?.conforms(to: .image) == true,
          let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any],
          let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.uint64Value,
          let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.uint64Value,
          width > 0,
          height > 0,
          width <= maximumSourceDimension,
          height <= maximumSourceDimension,
          width <= maximumPixelCount / height else {
      throw ProfilePhotoPickerError.unreadable
    }

    let thumbnailOptions: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: maximumThumbnailDimension,
    ]
    guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(
      imageSource,
      0,
      thumbnailOptions as CFDictionary
    ),
      thumbnail.width > 0,
      thumbnail.height > 0,
      thumbnail.width <= maximumThumbnailDimension,
      thumbnail.height <= maximumThumbnailDimension,
      let data = UIImage(cgImage: thumbnail).jpegData(compressionQuality: 0.84),
      !data.isEmpty,
      data.count <= maximumOutputBytes else {
      throw ProfilePhotoPickerError.unreadable
    }

    let directory = privatePhotoDirectory()
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try FileManager.default.setAttributes(
      [.protectionKey: FileProtectionType.complete],
      ofItemAtPath: directory.path
    )
    let destination = directory.appendingPathComponent("\(UUID().uuidString).jpg")
    try data.write(to: destination, options: [.atomic, .completeFileProtection])
    filesCreatedThisProcess.insert(destination.lastPathComponent)
    return destination.absoluteString
  }

  private func prunePrivateCopies(referencedUris: [String]) throws -> [String: Int] {
    let directory = privatePhotoDirectory().standardizedFileURL
    guard FileManager.default.fileExists(atPath: directory.path) else {
      return ["removed": 0, "retained": 0]
    }

    let referencedNames = Set(referencedUris.compactMap { managedPhotoFilename(from: $0, in: directory) })
    let candidates = try FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey],
      options: [.skipsHiddenFiles]
    )
    var removed = 0
    var retained = 0
    for candidate in candidates where isManagedPhotoFilename(candidate.lastPathComponent) {
      // Startup pruning targets files orphaned by a previous process. Never
      // delete a staged save created in this process, even if the picker and
      // the post-hydration cleanup are scheduled unusually close together.
      if referencedNames.contains(candidate.lastPathComponent)
        || filesCreatedThisProcess.contains(candidate.lastPathComponent) {
        retained += 1
        continue
      }
      let values = try candidate.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
      guard values.isRegularFile == true, values.isSymbolicLink != true else { continue }
      try FileManager.default.removeItem(at: candidate)
      removed += 1
    }
    return ["removed": removed, "retained": retained]
  }

  private func managedPhotoFilename(from uri: String, in directory: URL) -> String? {
    guard let url = URL(string: uri), url.isFileURL else { return nil }
    let standardized = url.standardizedFileURL
    guard standardized.deletingLastPathComponent() == directory,
          isManagedPhotoFilename(standardized.lastPathComponent) else { return nil }
    return standardized.lastPathComponent
  }

  private func isManagedPhotoFilename(_ filename: String) -> Bool {
    let url = URL(fileURLWithPath: filename)
    return url.pathExtension.lowercased() == "jpg"
      && UUID(uuidString: url.deletingPathExtension().lastPathComponent) != nil
  }

  private func privatePhotoDirectory() -> URL {
    let applicationSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return applicationSupport.appendingPathComponent("ContextProfilePhotos", isDirectory: true)
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
    pickerEpoch = nil
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
