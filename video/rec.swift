// Records only chosen windows into a 1920×1080 H.264 movie. Everything else on
// the screen (other apps, the desktop, the menu bar, the Dock, the pointer) is
// left out, even when it sits on top of the recorded windows.
//
//   rec --bounds                  where to put the demo windows: "left, top, right, bottom"
//   rec OUT.mp4 ALLOW [--max S]   record until SIGINT or SIGTERM (or S seconds)
//
// ALLOW is a text file listing what to record, one entry per line: a window id
// ("8123") or every window of a process ("pid 4567"). It is re-read while
// recording, so windows can be added as the demo opens them. The tool prints
// "recording" once frames are flowing, and finishes the movie when stopped.
//
// Build: swiftc -O -swift-version 5 rec.swift -o rec

import AppKit
import AVFoundation
import CoreMedia
import ScreenCaptureKit

enum K {
    static let width = 1920
    static let height = 1080
    static let fps: Int32 = 30
    /// Space between the windows and the edge of the frame, in points.
    static let margin: CGFloat = 22
    /// Shown wherever no recorded window is (Commons ink, #101a2b).
    static let backdrop = CGColor(srgbRed: 16.0 / 255, green: 26.0 / 255, blue: 43.0 / 255, alpha: 1)
}

func note(_ message: String) {
    FileHandle.standardError.write(Data(("rec: " + message + "\n").utf8))
}

/// The 16:9 area of the main display that is recorded, in points from its top left.
func stage() -> CGRect {
    _ = NSApplication.shared
    guard let screen = NSScreen.screens.first else { return CGRect(x: 0, y: 0, width: 1280, height: 720) }
    let full = screen.frame, visible = screen.visibleFrame
    let w = min(visible.width, visible.height * 16 / 9).rounded(.down)
    let h = (w * 9 / 16).rounded()
    let x = (visible.minX + (visible.width - w) / 2).rounded(.down)
    let y = (full.maxY - visible.maxY).rounded(.up)
    return CGRect(x: x, y: y, width: w, height: h)
}

struct Failure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate {
    let allowPath: String
    let source: CGRect
    let writer: AVAssetWriter
    let input: AVAssetWriterInput
    let adaptor: AVAssetWriterInputPixelBufferAdaptor
    let frames = DispatchQueue(label: "rec.frames")

    var capture: SCStream?
    var display: SCDisplay?
    var shown: Set<CGWindowID> = []
    var latest: CVPixelBuffer?
    var announced = false
    var begun = false
    var startTime: TimeInterval = 0
    var written = -1
    var ticker: DispatchSourceTimer?
    var stopping = false

    init(out: URL, allowPath: String, source: CGRect) throws {
        self.allowPath = allowPath
        self.source = source
        try? FileManager.default.removeItem(at: out)
        let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)

        let compression: [String: Any] = [
            AVVideoAverageBitRateKey: 12_000_000,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            AVVideoMaxKeyFrameIntervalKey: 60,
            AVVideoAllowFrameReorderingKey: false,
            AVVideoExpectedSourceFrameRateKey: Int(K.fps),
        ]
        let color: [String: Any] = [
            AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
            AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
        ]
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: K.width,
            AVVideoHeightKey: K.height,
            AVVideoColorPropertiesKey: color,
            AVVideoCompressionPropertiesKey: compression,
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = true
        guard writer.canAdd(input) else { throw Failure("cannot write H.264 video to \(out.path)") }
        writer.add(input)
        self.writer = writer
        self.input = input
        self.adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
        super.init()
    }

    // MARK: Which windows

    func allowed() -> (ids: Set<CGWindowID>, pids: Set<pid_t>) {
        guard let text = try? String(contentsOfFile: allowPath, encoding: .utf8) else { return ([], []) }
        var ids = Set<CGWindowID>(), pids = Set<pid_t>()
        for line in text.split(whereSeparator: \.isNewline) {
            let parts = line.split(separator: " ")
            if parts.count == 2, parts[0] == "pid", let pid = pid_t(parts[1]) {
                pids.insert(pid)
            } else if parts.count == 1, let id = CGWindowID(parts[0]) {
                ids.insert(id)
            }
        }
        return (ids, pids)
    }

    func pick(_ content: SCShareableContent) -> [SCWindow] {
        let allow = allowed()
        return content.windows.filter { window in
            guard window.windowLayer < 24 else { return false } // no menus or menu bar
            if allow.ids.contains(window.windowID) { return true }
            if let pid = window.owningApplication?.processID, allow.pids.contains(pid) { return true }
            return false
        }
    }

    func describe(_ windows: [SCWindow]) -> String {
        if windows.isEmpty { return "no windows yet" }
        return windows.map { "\($0.owningApplication?.applicationName ?? "?") #\($0.windowID)" }.joined(separator: ", ")
    }

    // MARK: Capture

    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() }) ?? content.displays.first else {
            throw Failure("no display to record")
        }
        self.display = display

        let config = SCStreamConfiguration()
        config.width = K.width
        config.height = K.height
        config.sourceRect = source
        config.minimumFrameInterval = CMTime(value: 1, timescale: K.fps)
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.colorSpaceName = CGColorSpace.sRGB
        config.backgroundColor = K.backdrop
        config.showsCursor = false
        config.queueDepth = 8

        let windows = pick(content)
        shown = Set(windows.map(\.windowID))
        let stream = SCStream(filter: SCContentFilter(display: display, including: windows), configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: frames)
        try await stream.startCapture()
        self.capture = stream
        note("recording \(describe(windows))")

        let timer = DispatchSource.makeTimerSource(queue: frames)
        timer.schedule(deadline: .now(), repeating: .milliseconds(8))
        timer.setEventHandler { [weak self] in self?.tick() }
        timer.resume()
        ticker = timer

        Task { await self.follow() }
    }

    /// Keeps the filter in step with the allow list as windows open and close.
    func follow() async {
        while !stopping {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !stopping, let display = display, let capture = capture,
                  let content = try? await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
            else { continue }
            let windows = pick(content)
            let ids = Set(windows.map(\.windowID))
            guard ids != shown else { continue }
            do {
                try await capture.updateContentFilter(SCContentFilter(display: display, including: windows))
                shown = ids
                note("recording \(describe(windows))")
            } catch {
                note("could not change windows: \(error.localizedDescription)")
            }
        }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sample.isValid,
              let info = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = info.first?[.status] as? Int,
              SCFrameStatus(rawValue: raw) == .complete,
              let buffer = sample.imageBuffer
        else { return }
        latest = buffer
        if !announced {
            announced = true
            print("recording")
            fflush(stdout)
        }
    }

    /// Writes the newest frame at a steady 30 fps, repeating it while the screen is still.
    func tick() {
        guard !stopping, let buffer = latest else { return }
        let now = ProcessInfo.processInfo.systemUptime
        if !begun {
            guard writer.startWriting() else {
                note("cannot write the movie: \(writer.error?.localizedDescription ?? "unknown error")")
                stop()
                return
            }
            writer.startSession(atSourceTime: .zero)
            startTime = now
            begun = true
        }
        let n = Int((now - startTime) * Double(K.fps))
        guard n > written, input.isReadyForMoreMediaData else { return }
        if adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: K.fps)) {
            written = n
        } else if writer.status == .failed {
            note("writing failed: \(writer.error?.localizedDescription ?? "unknown error")")
            stop()
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        note("capture stopped: \(error.localizedDescription)")
        stop()
    }

    func stop() {
        frames.async { [self] in
            guard !stopping else { return }
            stopping = true
            ticker?.cancel()
            let last = written
            Task {
                try? await self.capture?.stopCapture()
                self.frames.async {
                    guard self.begun, last >= 0 else {
                        note("nothing was recorded")
                        exit(1)
                    }
                    self.input.markAsFinished()
                    self.writer.endSession(atSourceTime: CMTime(value: CMTimeValue(last + 1), timescale: K.fps))
                    self.writer.finishWriting {
                        if self.writer.status == .completed {
                            note(String(format: "saved %.1f s", Double(last + 1) / Double(K.fps)))
                            exit(0)
                        }
                        note("could not finish the movie: \(self.writer.error?.localizedDescription ?? "unknown error")")
                        exit(1)
                    }
                }
            }
        }
    }
}

// MARK: - Main

let arguments = Array(CommandLine.arguments.dropFirst())

if arguments.first == "--bounds" {
    let r = stage().insetBy(dx: K.margin, dy: K.margin)
    print("\(Int(r.minX)), \(Int(r.minY)), \(Int(r.maxX)), \(Int(r.maxY))")
    exit(0)
}

guard arguments.count >= 2 else {
    note("usage: rec --bounds | rec OUT.mp4 ALLOW [--max SECONDS]")
    exit(2)
}

var maxSeconds = 600.0
if let i = arguments.firstIndex(of: "--max"), i + 1 < arguments.count, let s = Double(arguments[i + 1]) {
    maxSeconds = s
}

func makeRecorder() -> Recorder {
    do {
        return try Recorder(out: URL(fileURLWithPath: arguments[0]), allowPath: arguments[1], source: stage())
    } catch {
        note("could not create the movie: \(error)")
        exit(1)
    }
}
let recorder = makeRecorder()

signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)
let stopSignals: [DispatchSourceSignal] = [SIGINT, SIGTERM].map { sig in
    let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    source.setEventHandler { recorder.stop() }
    source.resume()
    return source
}
DispatchQueue.main.asyncAfter(deadline: .now() + maxSeconds) {
    note("reached the \(Int(maxSeconds)) s limit")
    recorder.stop()
}

Task {
    do {
        try await recorder.start()
    } catch {
        note("could not start recording: \(error.localizedDescription)")
        note("check System Settings → Privacy & Security → Screen & System Audio Recording → Terminal")
        exit(1)
    }
}

dispatchMain()
