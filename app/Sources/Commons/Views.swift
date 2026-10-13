import SwiftUI
import AppKit
import UniformTypeIdentifiers

/// Run from `swift run`, the app has no bundle; make it a regular, focused app.
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

@main
struct CommonsApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = CommonsModel()

    var body: some Scene {
        WindowGroup("Commons") {
            ContentView()
                .environment(model)
                .frame(minWidth: 860, minHeight: 560)
                .task { await model.refresh() }
        }
        .windowToolbarStyle(.unified)
        .commands {
            CommandGroup(after: .toolbar) {
                Button("Refresh") { Task { await model.refresh() } }
                    .keyboardShortcut("r")
            }
        }

        // Installed web apps open in their own Commons window.
        WindowGroup("App", id: "app", for: URL.self) { $url in
            if let url { AppWindow(url: url) }
        }

        Settings {
            SettingsView()
                .environment(model)
        }
    }
}

enum Pane: String, CaseIterable, Identifiable {
    case discover = "Discover", library = "Library", wallet = "Wallet"
    var id: Self { self }
    var symbol: String {
        switch self {
        case .discover: "sparkles"
        case .library: "square.stack.3d.up"
        case .wallet: "creditcard"
        }
    }
}

struct ContentView: View {
    @Environment(CommonsModel.self) private var model
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismissWindow) private var dismissWindow
    @State private var pane: Pane? = .discover
    @State private var search = ""
    @State private var selected: StoreApp?

    var body: some View {
        NavigationSplitView {
            List(Pane.allCases, selection: $pane) { p in
                Label(p.rawValue, systemImage: p.symbol).tag(p)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 200)
            .safeAreaInset(edge: .bottom) { WalletBadge().padding(12) }
        } detail: {
            Group {
                switch pane ?? .discover {
                case .discover: AppGrid(apps: filtered(model.apps), empty: "No apps yet", emptyDetail: "Apps published to the Commons program on Solana appear here.", selected: $selected)
                case .library: AppGrid(apps: filtered(model.ownedApps), empty: "Nothing in your library", emptyDetail: "Apps you buy are licensed to your wallet on chain and show up here.", selected: $selected)
                case .wallet: WalletView()
                }
            }
            .navigationTitle((pane ?? .discover).rawValue)
            .searchable(text: $search, placement: .toolbar, prompt: "Search apps")
            .toolbar {
                ToolbarItem {
                    Button { Task { await model.refresh() } } label: {
                        if model.loading { ProgressView().controlSize(.small) } else { Label("Refresh", systemImage: "arrow.clockwise") }
                    }
                    .help("Refresh from Solana")
                }
            }
        }
        .sheet(item: $selected) { app in AppDetail(app: app) }
        .overlay(alignment: .bottom) { Banner() }
        .overlay(alignment: .top) { DemoCaption() }
        .task { if model.demo != nil { await runDemo() } }
    }

    // MARK: Self-driving demo (--demo)

    private func pause(_ s: Double) async { try? await Task.sleep(nanoseconds: UInt64(s * 1_000_000_000)) }

    private func say(_ text: String, hold: Double) async {
        withAnimation(.easeOut(duration: 0.25)) { model.caption = text }
        await pause(hold)
    }

    /// Buys a paid app, installs it with hash verification, then gets, installs and
    /// opens a free one, and ends on the wallet. Quits when done.
    private func runDemo() async {
        guard let demo = model.demo else { return }
        var stage = NSScreen.main?.visibleFrame ?? .zero
        if let w = NSApp.windows.first(where: { $0.isVisible }), let screen = NSScreen.screens.first {
            if let f = demo.frame {   // top-left coordinates to AppKit's bottom-left ones
                stage = CGRect(x: f.minX, y: screen.frame.maxY - f.maxY, width: f.width, height: f.height)
            } else {
                stage = screen.visibleFrame
            }
            w.setFrame(stage, display: true, animate: false)
            NSApp.activate(ignoringOtherApps: true)
            w.orderFrontRegardless()
        }
        await model.refresh()
        await say("The Commons app reads its Store straight from Solana devnet.", hold: 4)

        if let paid = model.apps.first(where: { $0.name == demo.paidApp }) {
            selected = paid
            await say("\(paid.name) costs \(paid.priceText). Its build hash is registered on chain.", hold: 3.5)
            if !model.owns(paid) {
                model.caption = "Buying: the app builds and signs the Solana transaction itself."
                await model.buy(paid)
                await pause(1)
            }
            await say("Bought. The license now lives on Solana, in this wallet.", hold: 3)
            model.caption = "Install downloads the build and checks its SHA-256 against the chain."
            await model.install(paid)
            await say("Verified and installed.", hold: 2.5)
            selected = nil
            await pause(0.8)
        }

        if let free = model.apps.first(where: { $0.name == demo.freeApp }) {
            selected = free
            await say("\(free.name) is free: getting it records a license on chain too.", hold: 3)
            if !model.owns(free) { await model.buy(free) }
            await model.install(free)
            selected = nil
            await pause(0.6)
            if let url = model.installedURL(free) {
                await say("Installed apps open in their own Commons window.", hold: 1.2)
                openWindow(id: "app", value: url)
                await pause(1.5)
                if let w = NSApp.windows.last(where: { $0.isVisible && $0.title == free.name }) {
                    w.setFrame(stage.insetBy(dx: 80, dy: 50), display: true, animate: true)
                }
                await pause(7)
                dismissWindow(id: "app", value: url)
                await pause(0.8)
            }
        }

        pane = .wallet
        await say("CMN balance, SOL for fees and licenses, all read from the chain.", hold: 5)
        model.caption = nil
        await pause(0.8)
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { exit(0) }   // in case quitting is held up
        NSApp.terminate(nil)
    }

    private func filtered(_ list: [StoreApp]) -> [StoreApp] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? list : list.filter { $0.name.lowercased().contains(q) || $0.description.lowercased().contains(q) }
    }
}

// MARK: - Grid

struct AppGrid: View {
    @Environment(CommonsModel.self) private var model
    let apps: [StoreApp]
    let empty: String
    let emptyDetail: String
    @Binding var selected: StoreApp?

    var body: some View {
        if apps.isEmpty {
            ContentUnavailableView(empty, systemImage: "shippingbox", description: Text(emptyDetail))
        } else {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 250, maximum: 340), spacing: 16)], spacing: 16) {
                    ForEach(apps) { app in
                        AppCard(app: app).onTapGesture { selected = app }
                    }
                }
                .padding(20)
            }
        }
    }
}

struct AppIcon: View {
    let name: String
    var size: CGFloat = 52

    private var hue: Double {
        Double(name.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xffff } % 360) / 360
    }

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.225, style: .continuous)
            .fill(LinearGradient(colors: [Color(hue: hue, saturation: 0.55, brightness: 0.95), Color(hue: hue, saturation: 0.75, brightness: 0.7)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: size, height: size)
            .overlay(Text(String(name.prefix(1)).uppercased()).font(.system(size: size * 0.46, weight: .semibold, design: .rounded)).foregroundStyle(.white))
            .shadow(color: .black.opacity(0.12), radius: 2, y: 1)
    }
}

struct AppCard: View {
    @Environment(CommonsModel.self) private var model
    let app: StoreApp

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            AppIcon(name: app.name)
            VStack(alignment: .leading, spacing: 4) {
                Text(app.name).font(.headline).lineLimit(1)
                Text(app.description).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                Spacer(minLength: 6)
                HStack {
                    Text("v\(app.version)").font(.caption).foregroundStyle(.tertiary)
                    Spacer()
                    ActionButton(app: app, compact: true)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.separator.opacity(0.6)))
        .contentShape(Rectangle())
    }
}

/// Get / Buy → Install → Open, from the app's state.
struct ActionButton: View {
    @Environment(CommonsModel.self) private var model
    @Environment(\.openWindow) private var openWindow
    let app: StoreApp
    var compact = false

    var body: some View {
        let busy = model.busyApp == app.id
        Group {
            if busy {
                ProgressView().controlSize(.small)
            } else if !model.owns(app) {
                Button(app.price == 0 ? "Get" : app.priceText) { Task { await model.buy(app) } }
                    .buttonStyle(.borderedProminent)
            } else if let local = model.installedURL(app) {
                Button("Open") {
                    if local.pathExtension.lowercased() == "html" {
                        openWindow(id: "app", value: local)
                    } else {
                        model.open(app)
                    }
                }
                .buttonStyle(.bordered)
            } else if app.uri.hasPrefix("https://") {
                Button("Install") { Task { await model.install(app) } }
                    .buttonStyle(.bordered)
            } else {
                Button("No build yet") {}
                    .buttonStyle(.bordered)
                    .disabled(true)
                    .help("The developer has not registered a download for this app.")
            }
        }
        .controlSize(compact ? .small : .large)
        .buttonBorderShape(.capsule)
        .disabled(model.wallet == nil)
    }
}

// MARK: - Detail

struct AppDetail: View {
    @Environment(CommonsModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let app: StoreApp

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 18) {
                AppIcon(name: app.name, size: 88)
                VStack(alignment: .leading, spacing: 6) {
                    Text(app.name).font(.largeTitle.weight(.semibold))
                    Text(app.description).foregroundStyle(.secondary)
                    HStack(spacing: 12) {
                        ActionButton(app: app)
                        if model.owns(app) { Label("Licensed to your wallet", systemImage: "checkmark.seal.fill").foregroundStyle(.green).font(.callout) }
                    }
                    .padding(.top, 8)
                }
                Spacer()
            }
            .padding(24)

            Divider()

            Form {
                LabeledContent("Price", value: app.priceText)
                LabeledContent("Version", value: app.version)
                LabeledContent("Owners", value: "\(app.sales)")
                LabeledContent("Updated", value: app.updated.formatted(date: .abbreviated, time: .omitted))
                LabeledContent("Developer") { Text(app.developer).font(.callout.monospaced()).textSelection(.enabled).lineLimit(1).truncationMode(.middle) }
                LabeledContent("Build hash") { Text(app.hashHex).font(.callout.monospaced()).textSelection(.enabled).lineLimit(1).truncationMode(.middle) }
            }
            .formStyle(.grouped)
            .scrollDisabled(true)

            HStack {
                Text("Downloads are installed only if they match the build hash registered on Solana.").font(.footnote).foregroundStyle(.secondary)
                Spacer()
                Button("Done") { dismiss() }.keyboardShortcut(.defaultAction)
            }
            .padding(20)
        }
        .frame(width: 560)
    }
}

// MARK: - Wallet

struct WalletBadge: View {
    @Environment(CommonsModel.self) private var model
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: model.wallet == nil ? "wallet.pass" : "circle.fill").foregroundStyle(model.wallet == nil ? Color.secondary : Color.green).font(.caption)
            VStack(alignment: .leading, spacing: 0) {
                Text(model.wallet == nil ? "No wallet" : "\(CMN.format(model.cmnBalance)) CMN").font(.callout.weight(.medium))
                Text("Solana devnet").font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(10)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

struct WalletView: View {
    @Environment(CommonsModel.self) private var model

    var body: some View {
        Form {
            Section("Wallet") {
                if let w = model.wallet {
                    LabeledContent("Address") {
                        HStack(spacing: 6) {
                            Text(w).font(.callout.monospaced()).textSelection(.enabled).lineLimit(1).truncationMode(.middle)
                            Button {
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(w, forType: .string)
                                model.notice = "Address copied."
                            } label: { Image(systemName: "doc.on.doc") }
                            .buttonStyle(.borderless)
                            .help("Copy address")
                        }
                    }
                    LabeledContent("CMN", value: CMN.format(model.cmnBalance))
                    LabeledContent("SOL (for network fees)", value: model.solBalance.formatted(.number.precision(.fractionLength(0...4))))
                    LabeledContent("Licenses", value: "\(model.licenses.count)")
                    if model.solBalance < 0.01 {
                        HStack {
                            Text("This wallet needs a little devnet SOL to pay network fees.").foregroundStyle(.secondary)
                            Spacer()
                            Link("Get devnet SOL", destination: URL(string: "https://faucet.solana.com")!)
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("No wallet yet").font(.headline)
                        Text("A wallet holds your CMN and the licenses for apps you get. Create one here, or use an existing Solana keypair file in Settings (⌘,).")
                            .foregroundStyle(.secondary)
                        Button("Create wallet") { model.createWallet() }
                            .buttonStyle(.borderedProminent)
                            .disabled(model.walletFileExists)
                    }
                    .padding(.vertical, 4)
                }
            }
            if let e = model.economy {
                Section("CMN today") {
                    LabeledContent("Supply", value: CMN.format(UInt64(max(e.supply, 0))))
                    LabeledContent("Mined by useful work", value: CMN.format(UInt64(max(e.mined, 0))))
                    LabeledContent("Work price index", value: (Double(e.indexPpm) / 1e6).formatted(.number.precision(.fractionLength(4))))
                    LabeledContent("Target", value: (Double(e.targetPpm) / 1e6).formatted(.number.precision(.fractionLength(4))))
                    LabeledContent("Mint") { Text(e.mint).font(.callout.monospaced()).textSelection(.enabled).lineLimit(1).truncationMode(.middle) }
                }
            }
            Section {
                Text("Commons runs on Solana devnet. Devnet CMN and SOL have no value. Free apps need only a little SOL for fees.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Messages and settings

struct DemoCaption: View {
    @Environment(CommonsModel.self) private var model
    var body: some View {
        if let text = model.caption {
            Text(text)
                .font(.system(size: 22, weight: .semibold))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 22).padding(.vertical, 12)
                .background(Color(red: 0.95, green: 0.76, blue: 0.19), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .foregroundStyle(Color(red: 0.10, green: 0.08, blue: 0.02))
                .padding(.top, 14)
                .transition(.move(edge: .top).combined(with: .opacity))
                .id(text)
        }
    }
}

struct Banner: View {
    @Environment(CommonsModel.self) private var model
    var body: some View {
        if let text = model.error ?? model.notice {
            HStack(spacing: 10) {
                Image(systemName: model.error != nil ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .foregroundStyle(model.error != nil ? .orange : .green)
                Text(text).lineLimit(2)
                Button { model.error = nil; model.notice = nil } label: { Image(systemName: "xmark") }.buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(.regularMaterial, in: Capsule())
            .padding(.bottom, 18)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}

struct SettingsView: View {
    @Environment(CommonsModel.self) private var model

    var body: some View {
        @Bindable var m = model
        Form {
            Section("Wallet") {
                LabeledContent("Keypair file") {
                    HStack {
                        Text(m.walletPath).font(.callout.monospaced()).lineLimit(1).truncationMode(.middle)
                        Button("Choose…") { chooseWallet() }
                    }
                }
                Text("A Solana keypair file (a JSON array of 64 numbers), such as one made by the Solana CLI or by Create wallet.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Network") {
                TextField("Solana RPC", text: $m.rpcURL)
                TextField("Commons program", text: $m.programId)
                Button("Use devnet defaults") { model.resetNetworkSettings() }
            }
        }
        .formStyle(.grouped)
        .frame(width: 540)
        .onDisappear { Task { await model.refresh() } }
    }

    private func chooseWallet() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.canChooseDirectories = false
        panel.message = "Choose a Solana keypair file"
        if panel.runModal() == .OK, let url = panel.url { model.walletPath = url.path }
    }
}
