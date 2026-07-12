import Foundation
import PDFKit
import React

private let maximumPDFBytes: Int64 = 20 * 1_024 * 1_024
private let maximumPDFPages = 100
private let maximumPDFTextCharacters = 18_000

private enum PDFTextExtractionFailure: LocalizedError {
  case invalidURI
  case inaccessibleFile
  case fileTooLarge
  case unreadablePDF
  case protectedPDF
  case emptyPDF
  case noSelectableText

  var code: String {
    switch self {
    case .invalidURI: return "E_PDF_URI"
    case .inaccessibleFile: return "E_PDF_FILE"
    case .fileTooLarge: return "E_PDF_SIZE"
    case .unreadablePDF: return "E_PDF_FORMAT"
    case .protectedPDF: return "E_PDF_PROTECTED"
    case .emptyPDF: return "E_PDF_EMPTY"
    case .noSelectableText: return "E_PDF_NO_TEXT"
    }
  }

  var errorDescription: String? {
    switch self {
    case .invalidURI:
      return "Context can read only a PDF selected from Files on this iPhone."
    case .inaccessibleFile:
      return "Context could not access that PDF. Choose it again from Files."
    case .fileTooLarge:
      return "PDFs must be 20 MB or smaller."
    case .unreadablePDF:
      return "That file is not a readable PDF. Try exporting it again."
    case .protectedPDF:
      return "Password-protected or encrypted PDFs cannot be imported."
    case .emptyPDF:
      return "That PDF does not contain any pages."
    case .noSelectableText:
      return "Context could not find selectable text in that PDF. Scanned-image PDFs need text recognition before import."
    }
  }
}

@objc(ContextPDFTextExtractor)
final class ContextPDFTextExtractor: NSObject {
  private let workQueue = DispatchQueue(
    label: "com.fink692.contextmemory.pdf-text",
    qos: .userInitiated
  )

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(extractText:resolver:rejecter:)
  func extractText(
    _ uri: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    workQueue.async {
      do {
        resolve(try self.extractLocalPDF(uri: uri))
      } catch let failure as PDFTextExtractionFailure {
        reject(failure.code, failure.localizedDescription, failure)
      } catch {
        reject("E_PDF_READ", "Context could not read that PDF.", error)
      }
    }
  }

  private func extractLocalPDF(uri: String) throws -> [String: Any] {
    guard let sourceURL = URL(string: uri), sourceURL.isFileURL else {
      throw PDFTextExtractionFailure.invalidURI
    }
    let fileURL = sourceURL.standardizedFileURL
    let hasSecurityScope = fileURL.startAccessingSecurityScopedResource()
    defer {
      if hasSecurityScope { fileURL.stopAccessingSecurityScopedResource() }
    }

    let values: URLResourceValues
    do {
      values = try fileURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    } catch {
      throw PDFTextExtractionFailure.inaccessibleFile
    }
    guard values.isRegularFile == true else {
      throw PDFTextExtractionFailure.inaccessibleFile
    }
    guard Int64(values.fileSize ?? 0) <= maximumPDFBytes else {
      throw PDFTextExtractionFailure.fileTooLarge
    }
    guard let document = PDFDocument(url: fileURL) else {
      throw PDFTextExtractionFailure.unreadablePDF
    }
    guard !document.isEncrypted, !document.isLocked else {
      throw PDFTextExtractionFailure.protectedPDF
    }
    guard document.pageCount > 0 else {
      throw PDFTextExtractionFailure.emptyPDF
    }

    let pageLimit = min(document.pageCount, maximumPDFPages)
    var text = ""
    var processedPages = 0
    var truncated = document.pageCount > pageLimit

    for pageIndex in 0..<pageLimit {
      processedPages = pageIndex + 1
      guard let pageText = document.page(at: pageIndex)?.string else { continue }
      let cleaned = pageText
        .replacingOccurrences(of: "\u{0000}", with: "")
        .replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
        .trimmingCharacters(in: .whitespacesAndNewlines)
      guard !cleaned.isEmpty else { continue }

      let separator = text.isEmpty ? "" : "\n\n"
      let available = maximumPDFTextCharacters - text.count
      guard available > separator.count else {
        truncated = true
        break
      }
      let allowedPageCharacters = available - separator.count
      text.append(separator)
      if cleaned.count > allowedPageCharacters {
        text.append(contentsOf: cleaned.prefix(allowedPageCharacters))
        truncated = true
        break
      }
      text.append(cleaned)
    }

    text = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else {
      throw PDFTextExtractionFailure.noSelectableText
    }

    return [
      "text": text,
      "pageCount": document.pageCount,
      "processedPages": processedPages,
      "characterCount": text.count,
      "truncated": truncated,
    ]
  }
}
