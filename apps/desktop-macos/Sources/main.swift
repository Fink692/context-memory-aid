import AppKit
import Network
import WebKit

private let desktopPort = NWEndpoint.Port(rawValue: 43_127)!
private let desktopHost = "127.0.0.1"

final class StaticHTTPServer {
  private let rootURL: URL
  private let queue = DispatchQueue(label: "com.fink692.contextmemory.desktop.http")
  private var listener: NWListener?
  private var completionDelivered = false

  init(rootURL: URL) {
    self.rootURL = rootURL.standardizedFileURL
  }

  func start(completion: @escaping (Result<Void, Error>) -> Void) {
    do {
      let parameters = NWParameters.tcp
      parameters.allowLocalEndpointReuse = true
      if let loopback = IPv4Address(desktopHost) {
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(loopback), port: desktopPort)
      }

      let listener = try NWListener(using: parameters)
      self.listener = listener
      listener.stateUpdateHandler = { [weak self] state in
        guard let self, !self.completionDelivered else { return }
        switch state {
        case .ready:
          self.completionDelivered = true
          completion(.success(()))
        case .failed(let error):
          self.completionDelivered = true
          completion(.failure(error))
        default:
          break
        }
      }
      listener.newConnectionHandler = { [weak self] connection in
        self?.handle(connection)
      }
      listener.start(queue: queue)
    } catch {
      completion(.failure(error))
    }
  }

  func stop() {
    listener?.cancel()
    listener = nil
  }

  private func handle(_ connection: NWConnection) {
    connection.start(queue: queue)
    connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, _, _ in
      guard let self, let data, !data.isEmpty else {
        connection.cancel()
        return
      }
      self.respond(to: data, on: connection)
    }
  }

  private func respond(to requestData: Data, on connection: NWConnection) {
    guard let request = String(data: requestData, encoding: .utf8),
          let requestLine = request.components(separatedBy: "\r\n").first else {
      send(status: "400 Bad Request", body: Data("Bad Request".utf8), mimeType: "text/plain; charset=utf-8", on: connection)
      return
    }

    let parts = requestLine.split(separator: " ", maxSplits: 2).map(String.init)
    guard parts.count >= 2, parts[0] == "GET" || parts[0] == "HEAD" else {
      send(status: "405 Method Not Allowed", body: Data("Method Not Allowed".utf8), mimeType: "text/plain; charset=utf-8", on: connection)
      return
    }

    let headOnly = parts[0] == "HEAD"
    let target = parts[1]
    guard let fileURL = fileURL(for: target) else {
      send(status: "403 Forbidden", body: Data("Forbidden".utf8), mimeType: "text/plain; charset=utf-8", headOnly: headOnly, on: connection)
      return
    }

    var isDirectory: ObjCBool = false
    if FileManager.default.fileExists(atPath: fileURL.path, isDirectory: &isDirectory), !isDirectory.boolValue,
       let data = try? Data(contentsOf: fileURL, options: .mappedIfSafe) {
      send(status: "200 OK", body: data, mimeType: mimeType(for: fileURL), headOnly: headOnly, on: connection)
      return
    }

    if fileURL.pathExtension.isEmpty,
       let indexData = try? Data(contentsOf: rootURL.appendingPathComponent("index.html"), options: .mappedIfSafe) {
      send(status: "200 OK", body: indexData, mimeType: "text/html; charset=utf-8", headOnly: headOnly, on: connection)
      return
    }

    send(status: "404 Not Found", body: Data("Not Found".utf8), mimeType: "text/plain; charset=utf-8", headOnly: headOnly, on: connection)
  }

  private func fileURL(for requestTarget: String) -> URL? {
    let rawPath = requestTarget.split(separator: "?", maxSplits: 1).first.map(String.init) ?? "/"
    let decodedPath = rawPath.removingPercentEncoding ?? rawPath
    var relativePath = decodedPath
    while relativePath.hasPrefix("/") {
      relativePath.removeFirst()
    }
    if relativePath.isEmpty {
      relativePath = "index.html"
    }
    let components = NSString(string: relativePath).pathComponents
    guard !components.contains("..") else { return nil }

    let candidate = rootURL.appendingPathComponent(relativePath).standardizedFileURL
    let rootPath = rootURL.path.hasSuffix("/") ? rootURL.path : rootURL.path + "/"
    guard candidate.path == rootURL.path || candidate.path.hasPrefix(rootPath) else { return nil }
    return candidate
  }

  private func mimeType(for url: URL) -> String {
    switch url.pathExtension.lowercased() {
    case "html": return "text/html; charset=utf-8"
    case "js", "mjs": return "text/javascript; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "json": return "application/json; charset=utf-8"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "gif": return "image/gif"
    case "svg": return "image/svg+xml"
    case "ico": return "image/x-icon"
    case "ttf": return "font/ttf"
    case "woff": return "font/woff"
    case "woff2": return "font/woff2"
    case "map": return "application/json"
    default: return "application/octet-stream"
    }
  }

  private func send(
    status: String,
    body: Data,
    mimeType: String,
    headOnly: Bool = false,
    on connection: NWConnection
  ) {
    let cacheControl = mimeType.hasPrefix("text/html") ? "no-cache" : "public, max-age=31536000, immutable"
    let header = [
      "HTTP/1.1 \(status)",
      "Content-Type: \(mimeType)",
      "Content-Length: \(body.count)",
      "Cache-Control: \(cacheControl)",
      "X-Content-Type-Options: nosniff",
      "Connection: close",
      "",
      "",
    ].joined(separator: "\r\n")
    var response = Data(header.utf8)
    if !headOnly {
      response.append(body)
    }
    connection.send(content: response, completion: .contentProcessed { _ in
      connection.cancel()
    })
  }
}

final class DesktopWebViewController: NSViewController, WKNavigationDelegate, WKUIDelegate {
  private(set) var webView: WKWebView!
  private let rootURL = URL(string: "http://\(desktopHost):\(desktopPort.rawValue)")!

  override func loadView() {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    configuration.mediaTypesRequiringUserActionForPlayback = []
    configuration.userContentController.addUserScript(
      WKUserScript(
        source: "window.__CONTEXT_DESKTOP__ = true;",
        injectionTime: .atDocumentStart,
        forMainFrameOnly: false
      )
    )

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = true
    webView.setValue(false, forKey: "drawsBackground")
    self.webView = webView
    view = webView
  }

  func open(path: String = "/") {
    var normalizedPath = path.hasPrefix("/") ? path : "/\(path)"
    if normalizedPath == "/" {
      normalizedPath = "/connections"
    }
    guard let url = URL(string: normalizedPath, relativeTo: rootURL)?.absoluteURL else { return }
    webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData))
  }

  func open(contextURL: URL) {
    let host = contextURL.host ?? ""
    let path = contextURL.path
    let destination = host.isEmpty ? path : "/\(host)\(path)"
    open(path: destination.isEmpty ? "/connections" : destination)
  }

  private func isInternal(_ url: URL) -> Bool {
    url.scheme == "http" && url.host == desktopHost && url.port == Int(desktopPort.rawValue)
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.cancel)
      return
    }
    if isInternal(url) {
      decisionHandler(.allow)
      return
    }
    if url.scheme == "context" {
      open(contextURL: url)
      decisionHandler(.cancel)
      return
    }
    if let scheme = url.scheme?.lowercased(), ["https", "http", "mailto", "tel"].contains(scheme) {
      NSWorkspace.shared.open(url)
    }
    decisionHandler(.cancel)
  }

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = navigationAction.request.url {
      if isInternal(url) {
        webView.load(URLRequest(url: url))
      } else {
        NSWorkspace.shared.open(url)
      }
    }
    return nil
  }

  @available(macOS 12.0, *)
  func webView(
    _ webView: WKWebView,
    requestMediaCapturePermissionFor origin: WKSecurityOrigin,
    initiatedByFrame frame: WKFrameInfo,
    type: WKMediaCaptureType,
    decisionHandler: @escaping (WKPermissionDecision) -> Void
  ) {
    let trusted = origin.protocol == "http" && origin.host == desktopHost && origin.port == Int(desktopPort.rawValue)
    decisionHandler(trusted ? .grant : .deny)
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  private var server: StaticHTTPServer?
  private var window: NSWindow?
  private var webController: DesktopWebViewController?

  func applicationWillFinishLaunching(_ notification: Notification) {
    installMainMenu()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    guard let resourceURL = Bundle.main.resourceURL else {
      showStartupError("The application resources could not be located.")
      return
    }
    let webRoot = resourceURL.appendingPathComponent("Web", isDirectory: true)
    let server = StaticHTTPServer(rootURL: webRoot)
    self.server = server
    server.start { [weak self] result in
      DispatchQueue.main.async {
        switch result {
        case .success:
          self?.showMainWindow()
        case .failure(let error):
          self?.showStartupError("Context could not start its private local web service. \(error.localizedDescription)")
        }
      }
    }
  }

  func applicationWillTerminate(_ notification: Notification) {
    server?.stop()
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  func application(_ application: NSApplication, open urls: [URL]) {
    for url in urls where url.scheme == "context" {
      webController?.open(contextURL: url)
    }
    window?.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  private func showMainWindow() {
    let controller = DesktopWebViewController()
    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1_280, height: 840),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "Context"
    window.minSize = NSSize(width: 860, height: 620)
    window.collectionBehavior = [.fullScreenPrimary]
    window.contentViewController = controller
    window.setFrameAutosaveName("ContextDesktopMainWindow")
    window.center()
    window.makeKeyAndOrderFront(nil)
    self.webController = controller
    self.window = window
    controller.open(path: "/connections")
    NSApp.activate(ignoringOtherApps: true)
  }

  private func showStartupError(_ message: String) {
    let alert = NSAlert()
    alert.alertStyle = .critical
    alert.messageText = "Context could not open"
    alert.informativeText = message
    alert.addButton(withTitle: "Quit")
    alert.runModal()
    NSApp.terminate(nil)
  }

  private func installMainMenu() {
    let mainMenu = NSMenu()
    NSApp.mainMenu = mainMenu

    let appMenuItem = NSMenuItem()
    mainMenu.addItem(appMenuItem)
    let appMenu = NSMenu()
    appMenuItem.submenu = appMenu
    appMenu.addItem(withTitle: "About Context", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    let servicesItem = NSMenuItem(title: "Services", action: nil, keyEquivalent: "")
    let servicesMenu = NSMenu()
    servicesItem.submenu = servicesMenu
    appMenu.addItem(servicesItem)
    NSApp.servicesMenu = servicesMenu
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Hide Context", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
    hideOthers.keyEquivalentModifierMask = [.command, .option]
    appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Quit Context", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

    let fileMenuItem = NSMenuItem()
    mainMenu.addItem(fileMenuItem)
    let fileMenu = NSMenu(title: "File")
    fileMenuItem.submenu = fileMenu
    fileMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

    let editMenuItem = NSMenuItem()
    mainMenu.addItem(editMenuItem)
    let editMenu = NSMenu(title: "Edit")
    editMenuItem.submenu = editMenu
    editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
    editMenu.addItem(.separator())
    editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

    let viewMenuItem = NSMenuItem()
    mainMenu.addItem(viewMenuItem)
    let viewMenu = NSMenu(title: "View")
    viewMenuItem.submenu = viewMenu
    let backItem = viewMenu.addItem(withTitle: "Back", action: #selector(goBack(_:)), keyEquivalent: "[")
    backItem.target = self
    let forwardItem = viewMenu.addItem(withTitle: "Forward", action: #selector(goForward(_:)), keyEquivalent: "]")
    forwardItem.target = self
    let reloadItem = viewMenu.addItem(withTitle: "Reload", action: #selector(reload(_:)), keyEquivalent: "r")
    reloadItem.target = self
    viewMenu.addItem(.separator())
    viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f").keyEquivalentModifierMask = [.command, .control]

    let windowMenuItem = NSMenuItem()
    mainMenu.addItem(windowMenuItem)
    let windowMenu = NSMenu(title: "Window")
    windowMenuItem.submenu = windowMenu
    windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
    windowMenu.addItem(.separator())
    windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
    NSApp.windowsMenu = windowMenu
  }

  @objc private func reload(_ sender: Any?) {
    webController?.webView.reload()
  }

  @objc private func goBack(_ sender: Any?) {
    if webController?.webView.canGoBack == true {
      webController?.webView.goBack()
    }
  }

  @objc private func goForward(_ sender: Any?) {
    if webController?.webView.canGoForward == true {
      webController?.webView.goForward()
    }
  }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
