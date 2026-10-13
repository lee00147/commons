// Puts narration clips on the pitch video at their start times and exports an MP4.
//   swift mux.swift <video.mp4> <timeline.txt: "<seconds> <audio file>" per line> <out.mp4>
import AVFoundation

let args = CommandLine.arguments
guard args.count == 4 else { print("usage: swift mux.swift video.mp4 timeline.txt out.mp4"); exit(2) }
let video = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let comp = AVMutableComposition()
guard let vSource = try await video.loadTracks(withMediaType: .video).first,
      let vTrack = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let aTrack = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
    print("could not read the video"); exit(1)
}
let duration = try await video.load(.duration)
try vTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: vSource, at: .zero)

var end = CMTime.zero
for line in try String(contentsOfFile: args[2], encoding: .utf8).split(separator: "\n") {
    let parts = line.split(separator: " ", maxSplits: 1).map(String.init)
    guard parts.count == 2, let seconds = Double(parts[0]) else { continue }
    let clip = AVURLAsset(url: URL(fileURLWithPath: parts[1]))
    guard let source = try await clip.loadTracks(withMediaType: .audio).first else { continue }
    let length = try await clip.load(.duration)
    var at = CMTime(seconds: seconds, preferredTimescale: 600)
    if at < end { at = end } // never overlap the previous line
    if at > end { aTrack.insertEmptyTimeRange(CMTimeRange(start: end, end: at)) }
    try aTrack.insertTimeRange(CMTimeRange(start: .zero, duration: length), of: source, at: at)
    end = at + length
}
if end < duration { aTrack.insertEmptyTimeRange(CMTimeRange(start: end, end: duration)) }

let out = URL(fileURLWithPath: args[3])
try? FileManager.default.removeItem(at: out)
guard let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality) else { print("no exporter"); exit(1) }
export.outputURL = out
export.outputFileType = .mp4
await export.export()
guard export.status == .completed else { print("export failed: \(export.error?.localizedDescription ?? "unknown")"); exit(1) }
print("saved \(out.path)")
