import SwiftUI
import WebKit
import AppKit

/// An installed web app, run in its own Commons window rather than a browser.
struct AppWindow: View {
    let url: URL

    var body: some View {
        WebAppView(url: url)
            .frame(minWidth: 860, minHeight: 580)
            .navigationTitle(url.deletingLastPathComponent().lastPathComponent)
    }
}

/// WKWebView for a local app file: links open in the browser, file pickers use
/// the Open panel, and downloads (an app's "Export") go to ~/Downloads.
struct WebAppView: NSViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // keeps an app's saved data (localStorage) between launches
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
        private var destinations: [ObjectIdentifier: URL] = [:]

        // Links to the web open in the default browser; the app itself stays here.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if action.shouldPerformDownload {
                decisionHandler(.download)
            } else if let u = action.request.url, ["http", "https"].contains(u.scheme ?? ""), action.navigationType == .linkActivated {
                NSWorkspace.shared.open(u)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
        }

        // target="_blank" links.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let u = action.request.url { NSWorkspace.shared.open(u) }
            return nil
        }

        // <input type="file">
        func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = parameters.allowsMultipleSelection
            panel.canChooseDirectories = false
            panel.begin { response in completionHandler(response == .OK ? panel.urls : nil) }
        }

        // Downloads.
        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
            let folder = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
            let base = (suggestedFilename as NSString).deletingPathExtension
            let ext = (suggestedFilename as NSString).pathExtension
            var dest = folder.appendingPathComponent(suggestedFilename)
            var n = 2
            while FileManager.default.fileExists(atPath: dest.path) {
                dest = folder.appendingPathComponent(ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)")
                n += 1
            }
            destinations[ObjectIdentifier(download)] = dest
            completionHandler(dest)
        }

        func downloadDidFinish(_ download: WKDownload) {
            if let dest = destinations.removeValue(forKey: ObjectIdentifier(download)) {
                NSWorkspace.shared.activateFileViewerSelecting([dest])
            }
        }
    }
}
