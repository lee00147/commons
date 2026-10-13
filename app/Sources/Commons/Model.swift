import Foundation
import CryptoKit
import AppKit
import Observation

@MainActor
@Observable
final class CommonsModel {
    // Settings, kept between launches.
    var rpcURL: String { didSet { save() } }
    var programId: String { didSet { save() } }
    var walletPath: String { didSet { save() } }

    // Chain data.
    var apps: [StoreApp] = []
    var licenses: [License] = []
    var economy: Economy?
    var wallet: String?
    var cmnBalance: UInt64 = 0
    var solBalance: Double = 0

    var loading = false
    var busyApp: String?
    var error: String?
    var notice: String?
    /// Large on-screen caption while the recorded demo runs (`--demo`).
    var caption: String?
    /// `--demo --wallet <file>`: the app drives itself for a screen recording,
    /// with a separate wallet and without touching saved settings.
    let demo: Demo? = Demo.fromArguments()
    /// Address derivation checked against Solana's own results at launch; buying needs it.
    let signingReady = PDA.selfTestPasses

    static let devnetRPC = "https://api.devnet.solana.com"
    static let commonsProgram = "t5V6zr4BQhVRReaKDWiKF98ER8FMEL2cZeQdacsKMfa"
    /// Where a wallet made in the app lives.
    static let appWalletPath = "~/Library/Application Support/Commons/wallet.json"

    private let defaults = UserDefaults.standard

    init() {
        rpcURL = defaults.string(forKey: "rpcURL") ?? Self.devnetRPC
        walletPath = defaults.string(forKey: "walletPath") ?? Self.appWalletPath
        programId = defaults.string(forKey: "programId") ?? Self.commonsProgram
        if let demo {
            rpcURL = Self.devnetRPC
            programId = Self.commonsProgram
            walletPath = demo.wallet
        }
    }

    private func save() {
        guard demo == nil else { return }
        defaults.set(rpcURL, forKey: "rpcURL")
        defaults.set(programId, forKey: "programId")
        defaults.set(walletPath, forKey: "walletPath")
    }

    func resetNetworkSettings() {
        rpcURL = Self.devnetRPC
        programId = Self.commonsProgram
    }

    private var rpc: SolanaRPC? { URL(string: rpcURL).map { SolanaRPC(url: $0) } }

    func owns(_ app: StoreApp) -> Bool { licenses.contains { $0.app == app.id } }
    var ownedApps: [StoreApp] { apps.filter(owns) }

    // MARK: Refresh

    func refresh() async {
        // Pasted values often carry spaces or a newline; a program id that is not
        // an address falls back to the one in commons-token's Anchor.toml.
        let id = programId.trimmingCharacters(in: .whitespacesAndNewlines)
        if id != programId { programId = id }
        let path = walletPath.trimmingCharacters(in: .whitespacesAndNewlines)
        if path != walletPath { walletPath = path }
        if Base58.decode(programId)?.count != 32 { programId = Self.commonsProgram }
        guard let rpc else {
            error = "The Solana RPC address in Settings is not a valid URL."
            return
        }
        loading = true
        defer { loading = false }
        do {
            wallet = try? walletAddress(at: walletPath)
            async let appRows = rpc.accounts(program: programId, type: "App")
            async let configRows = rpc.accounts(program: programId, type: "Config")
            let appList = try await appRows
            let configList = try await configRows
            apps = appList.compactMap { try? StoreApp(address: $0.0, data: $0.1) }.sorted { $0.updated > $1.updated }
            economy = configList.first.flatMap { try? Economy(data: $0.1) }
            if let wallet {
                // License layout: discriminator (8) · app (32) · owner (32)
                let licenseRows = try await rpc.accounts(program: programId, type: "License", match: (40, wallet))
                licenses = licenseRows.compactMap { try? License(data: $0.1) }
                solBalance = try await rpc.solBalance(wallet)
                if let mint = economy?.mint { cmnBalance = try await rpc.tokenBalance(owner: wallet, mint: mint) }
                error = nil
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: Buy (through the commons-token client until signing lives in the app)

    func buy(_ app: StoreApp) async {
        guard signingReady else {
            error = "This copy of Commons failed its address self-check, so it will not sign purchases."
            return
        }
        guard let rpc else { return }
        busyApp = app.id
        defer { busyApp = nil }
        do {
            let keypair = try Keypair(file: walletPath)
            _ = try await StoreTx.buy(app, keypair: keypair, programId: programId, rpc: rpc)
            notice = app.price == 0 ? "\(app.name) is yours. The license is on Solana." : "Bought \(app.name) for \(app.priceText). The license is on Solana."
            await refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: Wallet

    /// Makes a new devnet wallet inside the app and switches to it.
    func createWallet() {
        do {
            let address = try Keypair.create(at: Self.appWalletPath)
            walletPath = Self.appWalletPath
            notice = "New wallet \(address.prefix(6))…\(address.suffix(4)). Add devnet SOL to use it."
            Task { await refresh() }
        } catch {
            self.error = error.localizedDescription
        }
    }

    var walletFileExists: Bool {
        FileManager.default.fileExists(atPath: (walletPath as NSString).expandingTildeInPath)
    }

    // MARK: Install and open

    static var installRoot: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications/Commons", isDirectory: true)
    }

    func installedURL(_ app: StoreApp) -> URL? {
        let dir = Self.installRoot.appendingPathComponent(app.name, isDirectory: true)
        let items = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil, options: .skipsHiddenFiles)) ?? []
        return items.first { $0.pathExtension == "app" } ?? items.first
    }

    /// Downloads the build, refuses it unless its SHA-256 matches the hash the
    /// developer registered on chain, and unpacks it into ~/Applications/Commons.
    func install(_ app: StoreApp) async {
        guard let url = URL(string: app.uri), url.scheme == "https" else {
            error = "\(app.name) has no downloadable build yet."
            return
        }
        busyApp = app.id
        defer { busyApp = nil }
        do {
            let (file, _) = try await URLSession.shared.download(from: url)
            let data = try Data(contentsOf: file)
            let digest = Array(SHA256.hash(data: data))
            guard digest == app.artifactHash else {
                error = "The download does not match the build registered on chain, so it was not installed."
                return
            }
            let dir = Self.installRoot.appendingPathComponent(app.name, isDirectory: true)
            try? FileManager.default.removeItem(at: dir)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            if url.pathExtension == "zip" {
                let p = Process()
                p.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
                p.arguments = ["-x", "-k", file.path, dir.path]
                try p.run()
                p.waitUntilExit()
            } else {
                try FileManager.default.copyItem(at: file, to: dir.appendingPathComponent(url.lastPathComponent))
            }
            notice = "\(app.name) installed and verified."
        } catch {
            self.error = error.localizedDescription
        }
    }

    func open(_ app: StoreApp) {
        if let local = installedURL(app) {
            NSWorkspace.shared.open(local)
        } else if let url = URL(string: app.uri), url.scheme == "https" {
            NSWorkspace.shared.open(url)
        }
    }
}

/// Options for the self-driving demo recording.
struct Demo: Equatable {
    var wallet: String
    var paidApp = "Pixel Forge"
    var freeApp = "Ledger Lens"
    /// Where to put the window, in points from the top left of the main display.
    var frame: CGRect?

    static func fromArguments() -> Demo? {
        let args = CommandLine.arguments
        guard args.contains("--demo") else { return nil }
        func value(_ flag: String) -> String? {
            guard let i = args.firstIndex(of: flag), i + 1 < args.count else { return nil }
            return args[i + 1]
        }
        var d = Demo(wallet: value("--wallet") ?? "~/Library/Application Support/Commons/wallet.json")
        if let p = value("--paid") { d.paidApp = p }
        if let f = value("--free") { d.freeApp = f }
        if let f = value("--frame") {   // "left,top,right,bottom", as AppleScript window bounds
            let n = f.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            if n.count == 4, n[2] > n[0], n[3] > n[1] {
                d.frame = CGRect(x: n[0], y: n[1], width: n[2] - n[0], height: n[3] - n[1])
            }
        }
        return d
    }
}
