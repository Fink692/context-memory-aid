@preconcurrency import AVFoundation
import Foundation
import React
import Speech
import UIKit

private let speechEventName = "ContextSpeechToTextEvent"

private enum SpeechPhase: String {
  case idle
  case preparing
  case downloadingAssets = "downloading-assets"
  case recording
  case finalizing
  case unavailable
  case error
}

private enum SpeechEngineName: String {
  case speechTranscriber = "speech-transcriber"
  case legacyOnDevice = "legacy-on-device"
}

private enum ContextSpeechFailure: LocalizedError {
  case busy
  case invalidInput(String)
  case microphoneDenied
  case speechDenied
  case speechRestricted
  case localeUnavailable
  case assetDownload
  case audioSession
  case audioInput
  case interrupted
  case cancelled
  case transcription

  var code: String {
    switch self {
    case .busy: return "E_SPEECH_BUSY"
    case .invalidInput: return "E_SPEECH_INPUT"
    case .microphoneDenied: return "E_MIC_DENIED"
    case .speechDenied, .speechRestricted: return "E_SPEECH_DENIED"
    case .localeUnavailable: return "E_LOCALE_UNAVAILABLE"
    case .assetDownload: return "E_ASSET_DOWNLOAD"
    case .audioSession: return "E_AUDIO_SESSION"
    case .audioInput: return "E_AUDIO_INPUT"
    case .interrupted: return "E_INTERRUPTED"
    case .cancelled: return "E_SPEECH_CANCELLED"
    case .transcription: return "E_TRANSCRIPTION"
    }
  }

  var errorDescription: String? {
    switch self {
    case .busy:
      return "Another dictation is already active."
    case .invalidInput(let message):
      return message
    case .microphoneDenied:
      return "Microphone access is off. You can keep typing or enable Context in iOS Settings."
    case .speechDenied:
      return "Speech recognition access is off. You can keep typing or enable Context in iOS Settings."
    case .speechRestricted:
      return "Speech recognition is restricted. You can keep typing instead."
    case .localeUnavailable:
      return "Dictation is not available for this language. You can keep typing instead."
    case .assetDownload:
      return "Dictation could not be prepared. Check the connection and try again."
    case .audioSession:
      return "The microphone session could not start."
    case .audioInput:
      return "The microphone audio stream became unavailable. Nothing was saved."
    case .interrupted:
      return "Dictation stopped because the app or microphone session was interrupted."
    case .cancelled:
      return "Dictation was cancelled."
    case .transcription:
      return "Transcription stopped unexpectedly. You can review the partial text or keep typing."
    }
  }
}

private struct SpeechSnapshot {
  var finalizedText = ""
  var volatileText = ""
  var elapsedMs = 0

  var text: String {
    joinSpeechText(finalizedText, volatileText)
  }
}

private enum SpeechSessionSignal {
  case transcript(SpeechSnapshot)
  case failed(ContextSpeechFailure)
  case limitReached(String, SpeechSnapshot)
}

private func cleanSpeechText(_ value: String) -> String {
  value
    .split(whereSeparator: { $0.isWhitespace })
    .map(String.init)
    .joined(separator: " ")
    .trimmingCharacters(in: .whitespacesAndNewlines)
}

private func joinSpeechText(_ finalized: String, _ volatile: String) -> String {
  [cleanSpeechText(finalized), cleanSpeechText(volatile)]
    .filter { !$0.isEmpty }
    .joined(separator: " ")
}

private func appendSpeechText(_ current: String, _ next: String) -> String {
  joinSpeechText(current, next)
}

private func boundedSpeechText(_ value: String, maximum: Int) -> String {
  String(value.prefix(maximum))
}

private func requestedLocale(_ localeTag: String) -> Locale {
  let clean = localeTag.trimmingCharacters(in: .whitespacesAndNewlines)
  return clean.isEmpty ? Locale.current : Locale(identifier: clean)
}

private func microphonePermissionName() -> String {
  if #available(iOS 17.0, *) {
    switch AVAudioApplication.shared.recordPermission {
    case .undetermined: return "not-determined"
    case .denied: return "denied"
    case .granted: return "granted"
    @unknown default: return "restricted"
    }
  }
  switch AVAudioSession.sharedInstance().recordPermission {
  case .undetermined: return "not-determined"
  case .denied: return "denied"
  case .granted: return "granted"
  @unknown default: return "restricted"
  }
}

private func legacySpeechPermissionName() -> String {
  switch SFSpeechRecognizer.authorizationStatus() {
  case .notDetermined: return "not-determined"
  case .denied: return "denied"
  case .restricted: return "restricted"
  case .authorized: return "granted"
  @unknown default: return "restricted"
  }
}

private func requestMicrophonePermission() async -> Bool {
  if #available(iOS 17.0, *) {
    switch AVAudioApplication.shared.recordPermission {
    case .granted: return true
    case .denied: return false
    case .undetermined:
      return await withCheckedContinuation { continuation in
        AVAudioApplication.requestRecordPermission { granted in
          continuation.resume(returning: granted)
        }
      }
    @unknown default: return false
    }
  }
  let session = AVAudioSession.sharedInstance()
  switch session.recordPermission {
  case .granted: return true
  case .denied: return false
  case .undetermined:
    return await withCheckedContinuation { continuation in
      session.requestRecordPermission { granted in
        continuation.resume(returning: granted)
      }
    }
  @unknown default: return false
  }
}

private func requestLegacySpeechPermission() async throws {
  let status = SFSpeechRecognizer.authorizationStatus()
  if status == .authorized { return }
  if status == .denied { throw ContextSpeechFailure.speechDenied }
  if status == .restricted { throw ContextSpeechFailure.speechRestricted }
  let requested = await withCheckedContinuation { continuation in
    SFSpeechRecognizer.requestAuthorization { nextStatus in
      continuation.resume(returning: nextStatus)
    }
  }
  if requested == .denied { throw ContextSpeechFailure.speechDenied }
  if requested != .authorized { throw ContextSpeechFailure.speechRestricted }
}

@MainActor
private protocol ContextSpeechSession: AnyObject {
  var engineName: SpeechEngineName { get }
  var localeIdentifier: String { get }
  var snapshot: SpeechSnapshot { get }
  func start() async throws
  func stop() async -> SpeechSnapshot
  func cancel() async
}

@objc(ContextSpeechToText)
final class ContextSpeechToText: RCTEventEmitter {
  private var phase: SpeechPhase = .idle
  private var activeSessionId: String?
  private var activeSession: (any ContextSpeechSession)?
  private var startTask: Task<Void, Never>?
  private var sessionStartedAt: Date?
  private var hasObservers = false
  private var backgroundObserver: NSObjectProtocol?
  private var interruptionObserver: NSObjectProtocol?
  private var routeObserver: NSObjectProtocol?

  override init() {
    super.init()
    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      Task { @MainActor in self?.forceCancel(reason: "background") }
    }
    interruptionObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      guard let rawValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            AVAudioSession.InterruptionType(rawValue: rawValue) == .began else { return }
      Task { @MainActor in self?.forceCancel(reason: "audio-interruption") }
    }
    routeObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      guard let rawValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
            AVAudioSession.RouteChangeReason(rawValue: rawValue) == .oldDeviceUnavailable else { return }
      Task { @MainActor in self?.forceCancel(reason: "audio-route-changed") }
    }
  }

  deinit {
    if let backgroundObserver { NotificationCenter.default.removeObserver(backgroundObserver) }
    if let interruptionObserver { NotificationCenter.default.removeObserver(interruptionObserver) }
    if let routeObserver { NotificationCenter.default.removeObserver(routeObserver) }
    startTask?.cancel()
    if let activeSession {
      Task { @MainActor in await activeSession.cancel() }
    }
  }

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! { [speechEventName] }

  override func startObserving() {
    DispatchQueue.main.async { self.hasObservers = true }
  }

  override func stopObserving() {
    DispatchQueue.main.async { self.hasObservers = false }
  }

  @objc(getStatus:resolver:rejecter:)
  func getStatus(
    _ localeTag: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor [weak self] in
      guard let self else { return }
      let locale = requestedLocale(localeTag)
      let availability = await self.availability(for: locale)
      resolve(self.statusDictionary(
        available: availability.available,
        engine: availability.engine,
        locale: availability.locale?.identifier,
        speechPermission: availability.engine == .speechTranscriber ? "not-required" : legacySpeechPermissionName()
      ))
    }
  }

  @objc(start:localeTag:maxDurationSeconds:maxCharacters:contextualStrings:resolver:rejecter:)
  func start(
    _ sessionId: String,
    localeTag: String,
    maxDurationSeconds: NSNumber,
    maxCharacters: NSNumber,
    contextualStrings: [String],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor [weak self] in
      self?.beginStart(
        sessionId: sessionId,
        localeTag: localeTag,
        maxDurationSeconds: maxDurationSeconds.intValue,
        maxCharacters: maxCharacters.intValue,
        contextualStrings: contextualStrings,
        resolve: resolve,
        reject: reject
      )
    }
  }

  @objc(stop:resolver:rejecter:)
  func stop(
    _ sessionId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor [weak self] in
      guard let self else { return }
      guard self.activeSessionId == sessionId, let session = self.activeSession, self.phase == .recording else {
        let error = ContextSpeechFailure.invalidInput("There is no active dictation to stop.")
        reject(error.code, error.localizedDescription, error)
        return
      }
      self.phase = .finalizing
      self.emit(sessionId: sessionId, phase: .finalizing, snapshot: session.snapshot)
      let final = await session.stop()
      let result = self.resultDictionary(sessionId: sessionId, session: session, snapshot: final)
      self.clearActiveSession()
      self.emit(sessionId: sessionId, phase: .idle, snapshot: final, isFinal: true)
      resolve(result)
    }
  }

  @objc(cancel:resolver:rejecter:)
  func cancel(
    _ sessionId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor [weak self] in
      guard let self else { return }
      guard self.activeSessionId == sessionId else {
        resolve(self.statusDictionary(available: true))
        return
      }
      self.startTask?.cancel()
      self.startTask = nil
      let session = self.activeSession
      self.clearActiveSession()
      if let session { await session.cancel() }
      self.emit(sessionId: sessionId, phase: .idle, reason: "cancelled")
      resolve(self.statusDictionary(available: true))
    }
  }

  @MainActor
  private func beginStart(
    sessionId: String,
    localeTag: String,
    maxDurationSeconds: Int,
    maxCharacters: Int,
    contextualStrings: [String],
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard activeSession == nil, startTask == nil, phase == .idle || phase == .error || phase == .unavailable else {
      reject(ContextSpeechFailure.busy.code, ContextSpeechFailure.busy.localizedDescription, ContextSpeechFailure.busy)
      return
    }
    guard UIApplication.shared.applicationState == .active else {
      let error = ContextSpeechFailure.invalidInput("Open Context before starting dictation.")
      reject(error.code, error.localizedDescription, error)
      return
    }
    let cleanSessionId = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    let allowedSessionCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
    guard !cleanSessionId.isEmpty, cleanSessionId.count <= 80,
          cleanSessionId.unicodeScalars.allSatisfy({ allowedSessionCharacters.contains($0) }) else {
      let error = ContextSpeechFailure.invalidInput("The dictation session identifier is invalid.")
      reject(error.code, error.localizedDescription, error)
      return
    }

    let duration = min(60, max(5, maxDurationSeconds))
    let characterLimit = min(4_000, max(1, maxCharacters))
    let context = contextualStrings
      .map { cleanSpeechText($0) }
      .filter { !$0.isEmpty }
      .prefix(32)
      .map { String($0.prefix(80)) }
    let locale = requestedLocale(String(localeTag.prefix(35)))

    activeSessionId = cleanSessionId
    phase = .preparing
    emit(sessionId: cleanSessionId, phase: .preparing)

    startTask = Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        let signalHandler: (SpeechSessionSignal) -> Void = { [weak self] signal in
          Task { @MainActor in self?.handle(signal: signal, sessionId: cleanSessionId) }
        }
        let prepared: any ContextSpeechSession
        if #available(iOS 26.0, *), let modern = try await AnalyzerSpeechSession.prepare(
          locale: locale,
          maxDurationSeconds: duration,
          maxCharacters: characterLimit,
          contextualStrings: Array(context),
          progress: { [weak self] value in
            guard let self, self.activeSessionId == cleanSessionId else { return }
            self.phase = .downloadingAssets
            self.emit(sessionId: cleanSessionId, phase: .downloadingAssets, assetProgress: value)
          },
          signal: signalHandler
        ) {
          prepared = modern
        } else {
          prepared = try await LegacyOnDeviceSpeechSession.prepare(
            locale: locale,
            maxDurationSeconds: duration,
            maxCharacters: characterLimit,
            contextualStrings: Array(context),
            signal: signalHandler
          )
        }

        try Task.checkCancellation()
        guard self.activeSessionId == cleanSessionId else { throw ContextSpeechFailure.cancelled }
        guard await requestMicrophonePermission() else { throw ContextSpeechFailure.microphoneDenied }
        try Task.checkCancellation()
        guard self.activeSessionId == cleanSessionId else { throw ContextSpeechFailure.cancelled }

        self.activeSession = prepared
        try await prepared.start()
        try Task.checkCancellation()
        guard self.activeSessionId == cleanSessionId else {
          await prepared.cancel()
          throw ContextSpeechFailure.cancelled
        }
        self.startTask = nil
        self.phase = .recording
        self.sessionStartedAt = Date()
        self.emit(sessionId: cleanSessionId, phase: .recording, snapshot: prepared.snapshot)
        resolve(self.statusDictionary(
          available: true,
          engine: prepared.engineName,
          locale: prepared.localeIdentifier,
          speechPermission: prepared.engineName == .speechTranscriber ? "not-required" : legacySpeechPermissionName()
        ))
      } catch is CancellationError {
        self.rejectCancelledStart(sessionId: cleanSessionId, reject: reject)
      } catch let failure as ContextSpeechFailure {
        self.failStart(sessionId: cleanSessionId, failure: failure, reject: reject)
      } catch {
        self.failStart(sessionId: cleanSessionId, failure: .transcription, reject: reject)
      }
    }
  }

  @MainActor
  private func rejectCancelledStart(sessionId: String, reject: @escaping RCTPromiseRejectBlock) {
    if activeSessionId == sessionId { clearActiveSession() }
    let failure = ContextSpeechFailure.cancelled
    reject(failure.code, failure.localizedDescription, failure)
  }

  @MainActor
  private func failStart(
    sessionId: String,
    failure: ContextSpeechFailure,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard activeSessionId == sessionId else {
      reject(ContextSpeechFailure.cancelled.code, ContextSpeechFailure.cancelled.localizedDescription, ContextSpeechFailure.cancelled)
      return
    }
    let session = activeSession
    let failurePhase: SpeechPhase
    if case .localeUnavailable = failure {
      failurePhase = .unavailable
    } else {
      failurePhase = .error
    }
    clearActiveSession(phase: failurePhase)
    if let session { Task { @MainActor in await session.cancel() } }
    emit(
      sessionId: sessionId,
      phase: failurePhase,
      message: failure.localizedDescription,
      reason: failure.code
    )
    reject(failure.code, failure.localizedDescription, failure)
  }

  @MainActor
  private func handle(signal: SpeechSessionSignal, sessionId: String) {
    guard activeSessionId == sessionId else { return }
    switch signal {
    case .transcript(let snapshot):
      if phase == .recording {
        emit(sessionId: sessionId, phase: .recording, snapshot: snapshot)
      }
    case .failed(let failure):
      let session = activeSession
      clearActiveSession(phase: .error)
      if let session { Task { @MainActor in await session.cancel() } }
      emit(
        sessionId: sessionId,
        phase: .error,
        snapshot: session?.snapshot,
        message: failure.localizedDescription,
        reason: failure.code
      )
    case .limitReached(let reason, let snapshot):
      guard phase == .recording, let session = activeSession else { return }
      phase = .finalizing
      emit(sessionId: sessionId, phase: .finalizing, snapshot: snapshot, reason: reason)
      Task { @MainActor [weak self] in
        let final = await session.stop()
        guard let self, self.activeSessionId == sessionId else { return }
        self.clearActiveSession()
        self.emit(sessionId: sessionId, phase: .idle, snapshot: final, isFinal: true, reason: reason)
      }
    }
  }

  @MainActor
  private func forceCancel(reason: String) {
    guard let sessionId = activeSessionId else { return }
    startTask?.cancel()
    startTask = nil
    let session = activeSession
    let partial = session?.snapshot
    clearActiveSession(phase: .error)
    if let session { Task { @MainActor in await session.cancel() } }
    emit(
      sessionId: sessionId,
      phase: .error,
      snapshot: partial,
      message: ContextSpeechFailure.interrupted.localizedDescription,
      reason: reason
    )
  }

  @MainActor
  private func clearActiveSession(phase nextPhase: SpeechPhase = .idle) {
    activeSession = nil
    activeSessionId = nil
    startTask = nil
    sessionStartedAt = nil
    phase = nextPhase
  }

  @MainActor
  private func availability(for locale: Locale) async -> (available: Bool, engine: SpeechEngineName?, locale: Locale?) {
    if #available(iOS 26.0, *),
       SpeechTranscriber.isAvailable,
       let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale) {
      return (true, .speechTranscriber, supported)
    }
    guard let recognizer = SFSpeechRecognizer(locale: locale),
          recognizer.isAvailable,
          recognizer.supportsOnDeviceRecognition else {
      return (false, nil, nil)
    }
    return (true, .legacyOnDevice, recognizer.locale)
  }

  @MainActor
  private func statusDictionary(
    available: Bool,
    engine: SpeechEngineName? = nil,
    locale: String? = nil,
    speechPermission: String? = nil
  ) -> [String: Any] {
    var result: [String: Any] = [
      "available": available,
      "phase": phase.rawValue,
      "microphonePermission": microphonePermissionName(),
      "speechPermission": speechPermission ?? legacySpeechPermissionName(),
    ]
    if let activeSessionId { result["sessionId"] = activeSessionId }
    if let engine { result["engine"] = engine.rawValue }
    if let locale { result["locale"] = locale }
    return result
  }

  @MainActor
  private func resultDictionary(
    sessionId: String,
    session: any ContextSpeechSession,
    snapshot: SpeechSnapshot,
    reason: String? = nil
  ) -> [String: Any] {
    var result: [String: Any] = [
      "sessionId": sessionId,
      "text": snapshot.text,
      "engine": session.engineName.rawValue,
      "locale": session.localeIdentifier,
    ]
    if let reason { result["reason"] = reason }
    return result
  }

  @MainActor
  private func emit(
    sessionId: String,
    phase eventPhase: SpeechPhase,
    snapshot: SpeechSnapshot? = nil,
    isFinal: Bool = false,
    assetProgress: Double? = nil,
    message: String? = nil,
    reason: String? = nil
  ) {
    guard hasObservers else { return }
    let current = snapshot ?? SpeechSnapshot()
    let session = activeSession
    var payload: [String: Any] = [
      "available": eventPhase != .unavailable,
      "phase": eventPhase.rawValue,
      "microphonePermission": microphonePermissionName(),
      "speechPermission": session?.engineName == .speechTranscriber ? "not-required" : legacySpeechPermissionName(),
      "sessionId": sessionId,
      "finalizedText": current.finalizedText,
      "volatileText": current.volatileText,
      "text": current.text,
      "elapsedMs": current.elapsedMs,
      "isFinal": isFinal,
    ]
    if let session {
      payload["engine"] = session.engineName.rawValue
      payload["locale"] = session.localeIdentifier
    }
    if let assetProgress { payload["assetProgress"] = min(1, max(0, assetProgress)) }
    if let message { payload["message"] = message }
    if let reason { payload["reason"] = reason }
    sendEvent(withName: speechEventName, body: payload)
  }
}

@available(iOS 26.0, *)
@MainActor
private final class AnalyzerSpeechSession: ContextSpeechSession {
  let engineName = SpeechEngineName.speechTranscriber
  let localeIdentifier: String
  private(set) var snapshot = SpeechSnapshot()

  private let transcriber: SpeechTranscriber
  private let analyzer: SpeechAnalyzer
  private let analyzerFormat: AVAudioFormat
  private let maxDurationSeconds: Int
  private let maxCharacters: Int
  private let signal: (SpeechSessionSignal) -> Void
  private let audioEngine = AVAudioEngine()
  private var inputContinuation: AsyncStream<AnalyzerInput>.Continuation?
  private var resultTask: Task<Void, Never>?
  private var limitTask: Task<Void, Never>?
  private var pendingEmission: Task<Void, Never>?
  private var lastEmission = Date.distantPast
  private var tapInstalled = false
  private var stopping = false
  private var startedAt: Date?

  private init(
    locale: Locale,
    transcriber: SpeechTranscriber,
    analyzer: SpeechAnalyzer,
    analyzerFormat: AVAudioFormat,
    maxDurationSeconds: Int,
    maxCharacters: Int,
    signal: @escaping (SpeechSessionSignal) -> Void
  ) {
    localeIdentifier = locale.identifier
    self.transcriber = transcriber
    self.analyzer = analyzer
    self.analyzerFormat = analyzerFormat
    self.maxDurationSeconds = maxDurationSeconds
    self.maxCharacters = maxCharacters
    self.signal = signal
  }

  static func prepare(
    locale: Locale,
    maxDurationSeconds: Int,
    maxCharacters: Int,
    contextualStrings: [String],
    progress: @escaping (Double) -> Void,
    signal: @escaping (SpeechSessionSignal) -> Void
  ) async throws -> AnalyzerSpeechSession? {
    guard SpeechTranscriber.isAvailable,
          let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else { return nil }
    let transcriber = SpeechTranscriber(locale: supported, preset: .progressiveTranscription)
    if let installation = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      let progressTask = Task { @MainActor in
        while !Task.isCancelled {
          progress(installation.progress.fractionCompleted)
          try? await Task.sleep(nanoseconds: 125_000_000)
        }
      }
      do {
        try await installation.downloadAndInstall()
        progressTask.cancel()
        progress(1)
      } catch is CancellationError {
        progressTask.cancel()
        throw ContextSpeechFailure.cancelled
      } catch {
        progressTask.cancel()
        throw ContextSpeechFailure.assetDownload
      }
    }
    try Task.checkCancellation()
    guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
      throw ContextSpeechFailure.audioInput
    }
    let context = AnalysisContext()
    if !contextualStrings.isEmpty { context.contextualStrings[.general] = contextualStrings }
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    try await analyzer.setContext(context)
    return AnalyzerSpeechSession(
      locale: supported,
      transcriber: transcriber,
      analyzer: analyzer,
      analyzerFormat: analyzerFormat,
      maxDurationSeconds: maxDurationSeconds,
      maxCharacters: maxCharacters,
      signal: signal
    )
  }

  func start() async throws {
    let (inputSequence, continuation) = AsyncStream<AnalyzerInput>.makeStream(
      bufferingPolicy: .bufferingOldest(48)
    )
    inputContinuation = continuation
    resultTask = Task { @MainActor [weak self, transcriber] in
      do {
        for try await result in transcriber.results {
          guard let self else { continue }
          self.accept(text: String(result.text.characters), isFinal: result.isFinal)
        }
      } catch is CancellationError {
        // Expected during explicit cancellation and teardown.
      } catch {
        guard let self, !self.stopping else { return }
        self.signal(.failed(.transcription))
      }
    }
    try await analyzer.start(inputSequence: inputSequence)
    do {
      try configureAndStartAudio()
    } catch {
      inputContinuation?.finish()
      await analyzer.cancelAndFinishNow()
      resultTask?.cancel()
      throw error
    }
    startedAt = Date()
    limitTask = Task { @MainActor [weak self] in
      guard let self else { return }
      try? await Task.sleep(nanoseconds: UInt64(self.maxDurationSeconds) * 1_000_000_000)
      guard !Task.isCancelled, !self.stopping else { return }
      self.updateElapsed()
      self.signal(.limitReached("duration-limit", self.snapshot))
    }
  }

  func stop() async -> SpeechSnapshot {
    guard !stopping else { return snapshot }
    stopping = true
    stopCapture()
    do {
      try await analyzer.finalizeAndFinishThroughEndOfInput()
    } catch {
      await analyzer.cancelAndFinishNow()
    }
    await resultTask?.value
    updateElapsed()
    let finalText = snapshot.text
    snapshot.volatileText = ""
    snapshot.finalizedText = boundedSpeechText(finalText, maximum: maxCharacters)
    deactivateAudioSession()
    return snapshot
  }

  func cancel() async {
    stopping = true
    stopCapture()
    await analyzer.cancelAndFinishNow()
    resultTask?.cancel()
    pendingEmission?.cancel()
    deactivateAudioSession()
  }

  private func configureAndStartAudio() throws {
    let audioSession = AVAudioSession.sharedInstance()
    do {
      try audioSession.setCategory(.playAndRecord, mode: .spokenAudio, options: [.allowBluetoothHFP])
      try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
    } catch {
      throw ContextSpeechFailure.audioSession
    }

    let input = audioEngine.inputNode
    let inputFormat = input.outputFormat(forBus: 0)
    guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
      throw ContextSpeechFailure.audioInput
    }
    guard let converter = AVAudioConverter(from: inputFormat, to: analyzerFormat) else {
      throw ContextSpeechFailure.audioInput
    }
    guard let continuation = inputContinuation else { throw ContextSpeechFailure.audioInput }

    input.installTap(onBus: 0, bufferSize: 4_096, format: inputFormat) { [weak self] buffer, _ in
      guard let self else { return }
      guard let converted = Self.convert(buffer, with: converter, to: self.analyzerFormat) else {
        Task { @MainActor [weak self] in self?.signal(.failed(.audioInput)) }
        return
      }
      switch continuation.yield(AnalyzerInput(buffer: converted)) {
      case .enqueued:
        break
      case .dropped:
        Task { @MainActor [weak self] in self?.signal(.failed(.audioInput)) }
      case .terminated:
        break
      @unknown default:
        break
      }
    }
    tapInstalled = true
    audioEngine.prepare()
    do {
      try audioEngine.start()
    } catch {
      input.removeTap(onBus: 0)
      tapInstalled = false
      throw ContextSpeechFailure.audioInput
    }
  }

  nonisolated private static func convert(
    _ buffer: AVAudioPCMBuffer,
    with converter: AVAudioConverter,
    to targetFormat: AVAudioFormat
  ) -> AVAudioPCMBuffer? {
    let ratio = targetFormat.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(max(1, ceil(Double(buffer.frameLength) * ratio) + 1))
    guard let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity) else { return nil }
    var conversionError: NSError?
    var supplied = false
    let status = converter.convert(to: output, error: &conversionError) { _, outputStatus in
      if supplied {
        outputStatus.pointee = .noDataNow
        return nil
      }
      supplied = true
      outputStatus.pointee = .haveData
      return buffer
    }
    guard conversionError == nil, status != .error else { return nil }
    return output
  }

  private func accept(text: String, isFinal: Bool) {
    let clean = cleanSpeechText(text)
    guard !clean.isEmpty else {
      if !isFinal { snapshot.volatileText = "" }
      publishTranscript()
      return
    }
    if isFinal {
      snapshot.finalizedText = appendSpeechText(snapshot.finalizedText, clean)
      snapshot.volatileText = ""
    } else {
      snapshot.volatileText = clean
    }
    updateElapsed()
    if snapshot.text.count >= maxCharacters {
      snapshot.finalizedText = boundedSpeechText(snapshot.text, maximum: maxCharacters)
      snapshot.volatileText = ""
      publishTranscript(force: true)
      signal(.limitReached("character-limit", snapshot))
    } else {
      publishTranscript(force: isFinal)
    }
  }

  private func publishTranscript(force: Bool = false) {
    let delay = 0.1 - Date().timeIntervalSince(lastEmission)
    if force || delay <= 0 {
      pendingEmission?.cancel()
      pendingEmission = nil
      lastEmission = Date()
      signal(.transcript(snapshot))
      return
    }
    pendingEmission?.cancel()
    pendingEmission = Task { @MainActor [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(max(0, delay) * 1_000_000_000))
      guard let self, !Task.isCancelled, !self.stopping else { return }
      self.lastEmission = Date()
      self.signal(.transcript(self.snapshot))
    }
  }

  private func updateElapsed() {
    guard let startedAt else { return }
    snapshot.elapsedMs = max(0, Int(Date().timeIntervalSince(startedAt) * 1_000))
  }

  private func stopCapture() {
    limitTask?.cancel()
    pendingEmission?.cancel()
    if audioEngine.isRunning { audioEngine.stop() }
    if tapInstalled {
      audioEngine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    inputContinuation?.finish()
    inputContinuation = nil
  }

  private func deactivateAudioSession() {
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}

@MainActor
private final class LegacyOnDeviceSpeechSession: ContextSpeechSession {
  let engineName = SpeechEngineName.legacyOnDevice
  let localeIdentifier: String
  private(set) var snapshot = SpeechSnapshot()

  private let recognizer: SFSpeechRecognizer
  private let maxDurationSeconds: Int
  private let maxCharacters: Int
  private let contextualStrings: [String]
  private let signal: (SpeechSessionSignal) -> Void
  private let audioEngine = AVAudioEngine()
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var limitTask: Task<Void, Never>?
  private var tapInstalled = false
  private var stopping = false
  private var recognitionCompleted = false
  private var startedAt: Date?

  private init(
    recognizer: SFSpeechRecognizer,
    maxDurationSeconds: Int,
    maxCharacters: Int,
    contextualStrings: [String],
    signal: @escaping (SpeechSessionSignal) -> Void
  ) {
    self.recognizer = recognizer
    localeIdentifier = recognizer.locale.identifier
    self.maxDurationSeconds = maxDurationSeconds
    self.maxCharacters = maxCharacters
    self.contextualStrings = contextualStrings
    self.signal = signal
  }

  static func prepare(
    locale: Locale,
    maxDurationSeconds: Int,
    maxCharacters: Int,
    contextualStrings: [String],
    signal: @escaping (SpeechSessionSignal) -> Void
  ) async throws -> LegacyOnDeviceSpeechSession {
    try await requestLegacySpeechPermission()
    guard let recognizer = SFSpeechRecognizer(locale: locale),
          recognizer.isAvailable,
          recognizer.supportsOnDeviceRecognition else {
      throw ContextSpeechFailure.localeUnavailable
    }
    return LegacyOnDeviceSpeechSession(
      recognizer: recognizer,
      maxDurationSeconds: maxDurationSeconds,
      maxCharacters: maxCharacters,
      contextualStrings: contextualStrings,
      signal: signal
    )
  }

  func start() async throws {
    let audioSession = AVAudioSession.sharedInstance()
    do {
      try audioSession.setCategory(.playAndRecord, mode: .spokenAudio, options: [.allowBluetoothHFP])
      try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
    } catch {
      throw ContextSpeechFailure.audioSession
    }

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = true
    request.taskHint = .dictation
    request.addsPunctuation = true
    request.contextualStrings = contextualStrings
    self.request = request

    recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
      Task { @MainActor [weak self] in
        guard let self else { return }
        if let result { self.accept(result: result) }
        if error != nil {
          self.recognitionCompleted = true
          if !self.stopping { self.signal(.failed(.transcription)) }
        }
      }
    }

    let input = audioEngine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      recognitionTask?.cancel()
      throw ContextSpeechFailure.audioInput
    }
    input.installTap(onBus: 0, bufferSize: 4_096, format: format) { [weak request] buffer, _ in
      request?.append(buffer)
    }
    tapInstalled = true
    audioEngine.prepare()
    do {
      try audioEngine.start()
    } catch {
      input.removeTap(onBus: 0)
      tapInstalled = false
      recognitionTask?.cancel()
      throw ContextSpeechFailure.audioInput
    }
    startedAt = Date()
    limitTask = Task { @MainActor [weak self] in
      guard let self else { return }
      try? await Task.sleep(nanoseconds: UInt64(self.maxDurationSeconds) * 1_000_000_000)
      guard !Task.isCancelled, !self.stopping else { return }
      self.updateElapsed()
      self.signal(.limitReached("duration-limit", self.snapshot))
    }
  }

  func stop() async -> SpeechSnapshot {
    guard !stopping else { return snapshot }
    stopping = true
    stopCapture()
    request?.endAudio()
    recognitionTask?.finish()
    for _ in 0..<20 where !recognitionCompleted {
      try? await Task.sleep(nanoseconds: 100_000_000)
    }
    recognitionTask?.cancel()
    updateElapsed()
    if !snapshot.volatileText.isEmpty {
      snapshot.finalizedText = boundedSpeechText(snapshot.volatileText, maximum: maxCharacters)
      snapshot.volatileText = ""
    }
    deactivateAudioSession()
    return snapshot
  }

  func cancel() async {
    stopping = true
    stopCapture()
    request?.endAudio()
    recognitionTask?.cancel()
    deactivateAudioSession()
  }

  private func accept(result: SFSpeechRecognitionResult) {
    let text = cleanSpeechText(result.bestTranscription.formattedString)
    let limited = boundedSpeechText(text, maximum: maxCharacters)
    updateElapsed()
    if result.isFinal {
      recognitionCompleted = true
      snapshot.finalizedText = limited
      snapshot.volatileText = ""
    } else {
      snapshot.volatileText = limited
    }
    signal(.transcript(snapshot))
    if text.count >= maxCharacters {
      snapshot.finalizedText = limited
      snapshot.volatileText = ""
      signal(.limitReached("character-limit", snapshot))
    }
  }

  private func updateElapsed() {
    guard let startedAt else { return }
    snapshot.elapsedMs = max(0, Int(Date().timeIntervalSince(startedAt) * 1_000))
  }

  private func stopCapture() {
    limitTask?.cancel()
    if audioEngine.isRunning { audioEngine.stop() }
    if tapInstalled {
      audioEngine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
  }

  private func deactivateAudioSession() {
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
