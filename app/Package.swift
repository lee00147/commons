// swift-tools-version:5.9
// Commons for macOS: the Store and launcher for programs whose licenses and
// builds live on Solana. Build and run:  swift run   (or open Package.swift in Xcode)
import PackageDescription

let package = Package(
    name: "Commons",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "Commons", path: "Sources/Commons")
    ]
)
