import CryptoKit
import Foundation
@preconcurrency import LiteRTLM
import React
import UIKit

private let modelName = "Gemma 4 E2B IT"
private let modelVersion = "gemma-4-E2B-it-litertlm-2026-07"
private let modelFilename = "gemma-4-E2B-it.litertlm"
private let modelSize: Int64 = 2_588_147_712
private let modelSHA256 = "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c"
private let modelDownloadURL = URL(string: "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm?download=true")!
private let progressEvent = "ContextLocalLLMDownloadProgress"

private enum ModelPhase: String {
  case notInstalled = "not-installed"
  case downloading
  case verifying
  case ready
  case loading
  case loaded
  case error
}

private struct ModelMetadata: Codable {
  let version: String
  let size: Int64
  let sha256: String
}

@objc(ContextLocalLLM)
final class ContextLocalLLM: RCTEventEmitter, URLSessionDownloadDelegate {
  private let workQueue = DispatchQueue(label: "com.fink692.contextmemory.local-llm", qos: .userInitiated)
  private lazy var downloadDelegateQueue: OperationQueue = {
    let queue = OperationQueue()
    queue.name = "com.fink692.contextmemory.local-llm-download"
    queue.maxConcurrentOperationCount = 1
    queue.underlyingQueue = workQueue
    return queue
  }()
  private lazy var downloadSession: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.allowsCellularAccess = false
    configuration.allowsConstrainedNetworkAccess = false
    configuration.allowsExpensiveNetworkAccess = false
    configuration.timeoutIntervalForRequest = 120
    configuration.timeoutIntervalForResource = 6 * 60 * 60
    configuration.waitsForConnectivity = true
    return URLSession(configuration: configuration, delegate: self, delegateQueue: downloadDelegateQueue)
  }()

  private var phase: ModelPhase = .notInstalled
  private var lastError: String?
  private var downloadedBytes: Int64 = 0
  private var expectedBytes: Int64 = modelSize
  private var downloadTask: URLSessionDownloadTask?
  private var engine: Engine?
  private var backend: String?
  private var engineLoading = false
  private var inferenceBusy = false
  private var unloadRequested = false
  private var activeConversation: Conversation?
  private var hasObservers = false
  private var memoryObserver: NSObjectProtocol?
  private var backgroundObserver: NSObjectProtocol?

  override init() {
    super.init()
    do {
      try prepareStorage()
      phase = hasVerifiedModel() ? .ready : .notInstalled
    } catch {
      phase = .error
      lastError = error.localizedDescription
    }
    memoryObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didReceiveMemoryWarningNotification,
      object: nil,
      queue: nil
    ) { [weak self] _ in
      self?.scheduleUnloadAfterCurrentRequest()
    }
    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: nil
    ) { [weak self] _ in
      self?.scheduleUnloadAfterCurrentRequest()
    }
  }

  deinit {
    if let memoryObserver { NotificationCenter.default.removeObserver(memoryObserver) }
    if let backgroundObserver { NotificationCenter.default.removeObserver(backgroundObserver) }
    setIdleTimerDisabled(false)
    downloadSession.invalidateAndCancel()
  }

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! { [progressEvent] }

  override func startObserving() {
    hasObservers = true
  }

  override func stopObserving() {
    hasObservers = false
  }

  @objc(getStatus:rejecter:)
  func getStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    workQueue.async { resolve(self.statusDictionary()) }
  }

  @objc(startDownload:rejecter:)
  func startDownload(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    workQueue.async {
      do {
        if self.hasVerifiedModel() {
          self.phase = self.engine == nil ? .ready : .loaded
          resolve(self.statusDictionary())
          return
        }
        guard self.downloadTask == nil else {
          resolve(self.statusDictionary())
          return
        }
        try self.ensureEnoughStorage()
        try self.prepareStorage()
        try? FileManager.default.removeItem(at: self.modelURL)
        try? FileManager.default.removeItem(at: self.metadataURL)
        self.lastError = nil
        self.downloadedBytes = 0
        self.expectedBytes = modelSize
        self.phase = .downloading
        let task = self.downloadSession.downloadTask(with: modelDownloadURL)
        self.downloadTask = task
        self.setIdleTimerDisabled(true)
        task.resume()
        self.emitStatus()
        resolve(self.statusDictionary())
      } catch {
        self.fail(error)
        reject("E_MODEL_DOWNLOAD", error.localizedDescription, error)
      }
    }
  }

  @objc(cancelDownload:rejecter:)
  func cancelDownload(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    workQueue.async {
      self.downloadTask?.cancel()
      self.downloadTask = nil
      self.setIdleTimerDisabled(false)
      self.downloadedBytes = 0
      self.phase = self.hasVerifiedModel() ? .ready : .notInstalled
      self.lastError = nil
      self.emitStatus()
      resolve(self.statusDictionary())
    }
  }

  @objc(deleteModel:rejecter:)
  func deleteModel(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    workQueue.async {
      guard !self.engineLoading, !self.inferenceBusy else {
        reject("E_MODEL_BUSY", "Wait for the current Smart Assist operation to finish before deleting the model.", nil)
        return
      }
      do {
        self.downloadTask?.cancel()
        self.downloadTask = nil
        self.setIdleTimerDisabled(false)
        self.activeConversation = nil
        self.engine = nil
        self.backend = nil
        self.engineLoading = false
        self.unloadRequested = false
        try? FileManager.default.removeItem(at: self.storageDirectory)
        try self.prepareStorage()
        self.phase = .notInstalled
        self.lastError = nil
        self.downloadedBytes = 0
        self.emitStatus()
        resolve(self.statusDictionary())
      } catch {
        self.fail(error)
        reject("E_MODEL_DELETE", error.localizedDescription, error)
      }
    }
  }

  @objc(loadModel:rejecter:)
  func loadModel(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    workQueue.async {
      guard !self.engineLoading, !self.inferenceBusy else {
        reject("E_MODEL_BUSY", "Wait for the current Smart Assist operation to finish.", nil)
        return
      }
      if self.engine != nil {
        self.phase = .loaded
        resolve(self.statusDictionary())
        return
      }
      guard self.hasVerifiedModel() else {
        self.phase = .notInstalled
        let error = NSError(
          domain: "ContextLocalLLM",
          code: 21,
          userInfo: [NSLocalizedDescriptionKey: "Gemma 4 is not downloaded. Open Settings and download the Smart Assist model first."]
        )
        reject("E_MODEL_LOAD", error.localizedDescription, error)
        return
      }

      self.engineLoading = true
      self.phase = .loading
      self.lastError = nil
      self.emitStatus()
      Task { [weak self] in
        guard let self else { return }
        do {
          let (nextEngine, nextBackend) = try await self.makeEngine()
          self.workQueue.async {
            self.engineLoading = false
            if self.unloadRequested {
              self.unloadRequested = false
              self.activeConversation = nil
              self.engine = nil
              self.backend = nil
              self.phase = .ready
            } else {
              self.engine = nextEngine
              self.backend = nextBackend
              self.phase = .loaded
            }
            self.lastError = nil
            self.emitStatus()
            resolve(self.statusDictionary())
          }
        } catch {
          self.workQueue.async {
            self.engineLoading = false
            self.unloadRequested = false
            self.fail(error)
            reject("E_MODEL_LOAD", error.localizedDescription, error)
          }
        }
      }
    }
  }

  @objc(unloadModel:rejecter:)
  func unloadModel(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    workQueue.async {
      guard !self.engineLoading, !self.inferenceBusy else {
        reject("E_MODEL_BUSY", "Wait for the current Smart Assist draft to finish before unloading the model.", nil)
        return
      }
      self.activeConversation = nil
      self.engine = nil
      self.backend = nil
      self.unloadRequested = false
      self.phase = self.hasVerifiedModel() ? .ready : .notInstalled
      self.lastError = nil
      self.emitStatus()
      resolve(self.statusDictionary())
    }
  }

  @objc(generate:prompt:resolver:rejecter:)
  func generate(
    _ systemPrompt: String,
    prompt: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    workQueue.async {
      guard !self.engineLoading, !self.inferenceBusy else {
        reject("E_MODEL_BUSY", "The Smart Assist model is already completing another request.", nil)
        return
      }
      guard !systemPrompt.isEmpty, systemPrompt.count <= 6_000, !prompt.isEmpty, prompt.count <= 24_000 else {
        reject("E_MODEL_INPUT", "The Smart Assist request exceeded its safety limit.", nil)
        return
      }
      guard self.hasVerifiedModel() else {
        self.phase = .notInstalled
        let error = NSError(
          domain: "ContextLocalLLM",
          code: 21,
          userInfo: [NSLocalizedDescriptionKey: "Gemma 4 is not downloaded. Open Settings and download the Smart Assist model first."]
        )
        reject("E_MODEL_INFERENCE", error.localizedDescription, error)
        return
      }

      let existingEngine = self.engine
      let existingBackend = self.backend
      self.inferenceBusy = true
      self.phase = existingEngine == nil ? .loading : .loaded
      self.lastError = nil
      self.emitStatus()

      Task { [weak self] in
        guard let self else { return }
        do {
          let currentEngine: Engine
          let currentBackend: String
          if let existingEngine {
            currentEngine = existingEngine
            currentBackend = existingBackend ?? "unknown"
          } else {
            (currentEngine, currentBackend) = try await self.makeEngine()
          }

          let sampler = try SamplerConfig(topK: 32, topP: 0.9, temperature: 0.15, seed: 42)
          let config = ConversationConfig(
            systemMessage: Message(systemPrompt, role: .system),
            samplerConfig: sampler
          )
          let conversation = try await currentEngine.createConversation(with: config)
          await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            self.workQueue.async {
              self.engine = currentEngine
              self.backend = currentBackend
              self.activeConversation = conversation
              self.phase = .loaded
              self.emitStatus()
              continuation.resume()
            }
          }

          let response = try await conversation.sendMessage(Message(prompt))
          let text = response.toString.trimmingCharacters(in: .whitespacesAndNewlines)
          guard !text.isEmpty else {
            throw NSError(domain: "ContextLocalLLM", code: 11, userInfo: [NSLocalizedDescriptionKey: "Gemma returned an empty response."])
          }
          self.workQueue.async {
            self.inferenceBusy = false
            self.activeConversation = nil
            self.phase = .loaded
            self.lastError = nil
            self.emitStatus()
            resolve([
              "text": text,
              "model": modelName,
              "backend": currentBackend,
            ])
            self.finishDeferredUnloadIfNeeded()
          }
        } catch {
          self.workQueue.async {
            self.inferenceBusy = false
            self.activeConversation = nil
            self.phase = self.engine == nil ? .ready : .loaded
            self.lastError = error.localizedDescription
            self.emitStatus()
            reject("E_MODEL_INFERENCE", error.localizedDescription, error)
            self.finishDeferredUnloadIfNeeded()
          }
        }
      }
    }
  }

  private var storageDirectory: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("ContextLocalAI", isDirectory: true)
  }

  private var modelURL: URL { storageDirectory.appendingPathComponent(modelFilename) }
  private var metadataURL: URL { storageDirectory.appendingPathComponent("model.json") }
  private var cacheDirectory: URL { storageDirectory.appendingPathComponent("cache", isDirectory: true) }

  private func prepareStorage() throws {
    try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var directory = storageDirectory
    try directory.setResourceValues(values)
  }

  private func hasVerifiedModel() -> Bool {
    guard
      let metadataData = try? Data(contentsOf: metadataURL),
      let metadata = try? JSONDecoder().decode(ModelMetadata.self, from: metadataData),
      metadata.version == modelVersion,
      metadata.size == modelSize,
      metadata.sha256 == modelSHA256,
      let attributes = try? FileManager.default.attributesOfItem(atPath: modelURL.path),
      (attributes[.size] as? NSNumber)?.int64Value == modelSize
    else { return false }
    return true
  }

  private func ensureEnoughStorage() throws {
    let values = try storageDirectory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
    let required = modelSize + 2_000_000_000
    if let available = values.volumeAvailableCapacityForImportantUsage, available < required {
      throw NSError(
        domain: "ContextLocalLLM",
        code: 20,
        userInfo: [NSLocalizedDescriptionKey: "Gemma 4 needs about 4.6 GB of free space for the model and its optimized cache."]
      )
    }
  }

  private func makeEngine() async throws -> (Engine, String) {
    do {
      let config = try EngineConfig(
        modelPath: modelURL.path,
        backend: .gpu,
        maxNumTokens: 2_048,
        cacheDir: cacheDirectory.path
      )
      let nextEngine = Engine(engineConfig: config)
      try await nextEngine.initialize()
      return (nextEngine, "Metal GPU")
    } catch {
      let config = try EngineConfig(
        modelPath: modelURL.path,
        backend: .cpu(),
        maxNumTokens: 2_048,
        cacheDir: cacheDirectory.path
      )
      let nextEngine = Engine(engineConfig: config)
      try await nextEngine.initialize()
      return (nextEngine, "CPU")
    }
  }

  private func scheduleUnloadAfterCurrentRequest() {
    workQueue.async {
      guard !self.inferenceBusy, !self.engineLoading else {
        self.unloadRequested = true
        return
      }
      self.activeConversation = nil
      self.engine = nil
      self.backend = nil
      self.unloadRequested = false
      self.phase = self.hasVerifiedModel() ? .ready : .notInstalled
      self.emitStatus()
    }
  }

  private func finishDeferredUnloadIfNeeded() {
    guard unloadRequested else { return }
    workQueue.asyncAfter(deadline: .now() + 0.25) {
      guard !self.inferenceBusy, !self.engineLoading, self.unloadRequested else { return }
      self.activeConversation = nil
      self.engine = nil
      self.backend = nil
      self.unloadRequested = false
      self.phase = self.hasVerifiedModel() ? .ready : .notInstalled
      self.emitStatus()
    }
  }

  private func statusDictionary() -> [String: Any] {
    let progress = expectedBytes > 0 ? min(1, Double(downloadedBytes) / Double(expectedBytes)) : 0
    var result: [String: Any] = [
      "model": modelName,
      "version": modelVersion,
      "status": phase.rawValue,
      "installed": hasVerifiedModel(),
      "loaded": engine != nil,
      "busy": inferenceBusy || engineLoading,
      "downloadedBytes": downloadedBytes,
      "totalBytes": expectedBytes,
      "progress": progress,
    ]
    if let backend { result["backend"] = backend }
    if let lastError { result["message"] = lastError }
    return result
  }

  private func emitStatus() {
    let status = statusDictionary()
    DispatchQueue.main.async { [weak self] in
      guard let self, self.hasObservers else { return }
      self.sendEvent(withName: progressEvent, body: status)
    }
  }

  private func setIdleTimerDisabled(_ disabled: Bool) {
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = disabled
    }
  }

  private func fail(_ error: Error) {
    phase = .error
    lastError = error.localizedDescription
    emitStatus()
  }

  private func sha256(of url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var hasher = SHA256()
    while true {
      let data = try handle.read(upToCount: 4 * 1_024 * 1_024) ?? Data()
      if data.isEmpty { break }
      hasher.update(data: data)
    }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64
  ) {
    guard self.downloadTask?.taskIdentifier == downloadTask.taskIdentifier else { return }
    downloadedBytes = totalBytesWritten
    expectedBytes = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : modelSize
    phase = .downloading
    emitStatus()
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    guard self.downloadTask?.taskIdentifier == downloadTask.taskIdentifier else { return }
    do {
      phase = .verifying
      downloadedBytes = modelSize
      expectedBytes = modelSize
      emitStatus()
      let attributes = try FileManager.default.attributesOfItem(atPath: location.path)
      guard (attributes[.size] as? NSNumber)?.int64Value == modelSize else {
        throw NSError(domain: "ContextLocalLLM", code: 30, userInfo: [NSLocalizedDescriptionKey: "The Gemma 4 download had an unexpected size."])
      }
      guard try sha256(of: location) == modelSHA256 else {
        throw NSError(domain: "ContextLocalLLM", code: 31, userInfo: [NSLocalizedDescriptionKey: "The Gemma 4 download failed its integrity check."])
      }
      try? FileManager.default.removeItem(at: modelURL)
      try FileManager.default.moveItem(at: location, to: modelURL)
      try FileManager.default.setAttributes(
        [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
        ofItemAtPath: modelURL.path
      )
      let metadata = ModelMetadata(version: modelVersion, size: modelSize, sha256: modelSHA256)
      try JSONEncoder().encode(metadata).write(to: metadataURL, options: .atomic)
      setIdleTimerDisabled(false)
      phase = .ready
      lastError = nil
      emitStatus()
    } catch {
      try? FileManager.default.removeItem(at: modelURL)
      try? FileManager.default.removeItem(at: metadataURL)
      setIdleTimerDisabled(false)
      fail(error)
    }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    guard downloadTask?.taskIdentifier == task.taskIdentifier else { return }
    downloadTask = nil
    setIdleTimerDisabled(false)
    guard let error else { return }
    let nsError = error as NSError
    if nsError.domain == NSURLErrorDomain, nsError.code == NSURLErrorCancelled {
      phase = hasVerifiedModel() ? .ready : .notInstalled
      lastError = nil
    } else {
      fail(error)
    }
    emitStatus()
  }
}
