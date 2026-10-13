import Foundation
import CryptoKit

// MARK: - Base58

enum Base58 {
    private static let alphabet = Array("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".utf8)

    static func encode(_ bytes: [UInt8]) -> String {
        var digits: [UInt8] = []
        for b in bytes {
            var carry = Int(b)
            for i in 0..<digits.count {
                carry += Int(digits[i]) << 8
                digits[i] = UInt8(carry % 58)
                carry /= 58
            }
            while carry > 0 {
                digits.append(UInt8(carry % 58))
                carry /= 58
            }
        }
        let zeros = bytes.prefix { $0 == 0 }.count
        return String(repeating: "1", count: zeros) + String(bytes: digits.reversed().map { alphabet[Int($0)] }, encoding: .ascii)!
    }

    static func decode(_ s: String) -> [UInt8]? {
        var bytes: [UInt8] = []
        for c in s.utf8 {
            guard let v = alphabet.firstIndex(of: c) else { return nil }
            var carry = v
            for i in 0..<bytes.count {
                carry += Int(bytes[i]) * 58
                bytes[i] = UInt8(carry & 0xff)
                carry >>= 8
            }
            while carry > 0 {
                bytes.append(UInt8(carry & 0xff))
                carry >>= 8
            }
        }
        let zeros = s.utf8.prefix { $0 == UInt8(ascii: "1") }.count
        return [UInt8](repeating: 0, count: zeros) + bytes.reversed()
    }
}

// MARK: - Borsh reader for Anchor accounts

struct BorshReader {
    let data: [UInt8]
    var offset = 8 // skip the Anchor account discriminator

    mutating func bytes(_ n: Int) throws -> [UInt8] {
        guard offset + n <= data.count else { throw SolanaError.decode }
        defer { offset += n }
        return Array(data[offset..<offset + n])
    }
    mutating func u8() throws -> UInt8 { try bytes(1)[0] }
    mutating func bool() throws -> Bool { try u8() != 0 }
    mutating func u32() throws -> UInt32 { try bytes(4).enumerated().reduce(0) { $0 | UInt32($1.element) << (8 * UInt32($1.offset)) } }
    mutating func u64() throws -> UInt64 { try bytes(8).enumerated().reduce(0) { $0 | UInt64($1.element) << (8 * UInt64($1.offset)) } }
    mutating func i64() throws -> Int64 { Int64(bitPattern: try u64()) }
    mutating func pubkey() throws -> String { Base58.encode(try bytes(32)) }
    mutating func string() throws -> String {
        let n = Int(try u32())
        return String(decoding: try bytes(n), as: UTF8.self)
    }
}

enum SolanaError: LocalizedError {
    case decode, rpc(String), noWallet, helper(String)
    var errorDescription: String? {
        switch self {
        case .decode: "Could not read an account from the chain."
        case .rpc(let m): m
        case .noWallet: "No wallet yet. Create one in Wallet, or choose a Solana keypair file in Settings (⌘,)."
        case .helper(let m): m
        }
    }
}

/// First 8 bytes of sha256("account:<Name>"): how Anchor tags each account type.
func anchorDiscriminator(_ name: String) -> [UInt8] {
    Array(SHA256.hash(data: Data("account:\(name)".utf8)).prefix(8))
}

// MARK: - On-chain records

struct StoreApp: Identifiable, Hashable {
    let id: String // account address
    let developer: String
    let name: String
    let description: String
    let version: String
    let price: UInt64 // µCMN
    let artifactHash: [UInt8]
    let uri: String
    let sales: UInt64
    let published: Date
    let updated: Date

    init(address: String, data: [UInt8]) throws {
        var r = BorshReader(data: data)
        id = address
        developer = try r.pubkey()
        name = try r.string()
        description = try r.string()
        version = try r.string()
        price = try r.u64()
        artifactHash = try r.bytes(32)
        uri = try r.string()
        sales = try r.u64()
        published = Date(timeIntervalSince1970: TimeInterval(try r.i64()))
        updated = Date(timeIntervalSince1970: TimeInterval(try r.i64()))
    }

    var priceText: String { price == 0 ? "Free" : "\(CMN.format(price)) CMN" }
    var hashHex: String { artifactHash.map { String(format: "%02x", $0) }.joined() }
}

struct License: Hashable {
    let app: String
    let owner: String
    let paid: UInt64
    let date: Date

    init(data: [UInt8]) throws {
        var r = BorshReader(data: data)
        app = try r.pubkey()
        owner = try r.pubkey()
        paid = try r.u64()
        date = Date(timeIntervalSince1970: TimeInterval(try r.i64()))
    }
}

/// The parts of the program's config the app shows.
struct Economy {
    let mint: String
    let daySeconds: Int64
    let supply: Int64
    let mined: Int64
    let indexPpm: Int64
    let targetPpm: Int64

    init(data: [UInt8]) throws {
        var r = BorshReader(data: data)
        _ = try r.bytes(3) // bumps
        mint = try r.pubkey()
        _ = try r.pubkey() // vault
        _ = try r.pubkey() // oracle
        _ = try r.pubkey() // admin
        _ = try r.bool() // metadata set
        daySeconds = try r.i64()
        _ = try r.i64() // genesis time
        _ = try r.bytes(32) // merkle root
        _ = try r.u64() // genesis claimed
        supply = try r.i64()
        _ = try r.i64() // issued
        mined = try r.i64()
        _ = try r.i64() // released
        indexPpm = try r.i64()
        targetPpm = try r.i64()
    }
}

enum CMN {
    static func format(_ micro: UInt64) -> String {
        let v = Double(micro) / 1_000_000
        return v.formatted(.number.precision(.fractionLength(0...2)))
    }
}

// MARK: - JSON-RPC

struct SolanaRPC {
    var url: URL

    private func call(_ method: String, _ params: [Any]) async throws -> Any {
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["jsonrpc": "2.0", "id": 1, "method": method, "params": params])
        let (data, _) = try await URLSession.shared.data(for: req)
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw SolanaError.rpc("Bad response from \(url.host() ?? "RPC")") }
        if let err = obj["error"] as? [String: Any] { throw SolanaError.rpc(Self.explain(err)) }
        return obj["result"] ?? NSNull()
    }

    /// A readable reason from an RPC error, using the program's logs when a transaction failed.
    private static func explain(_ err: [String: Any]) -> String {
        let message = err["message"] as? String ?? "RPC error"
        let logs = (err["data"] as? [String: Any])?["logs"] as? [String] ?? []
        if message.contains("no record of a prior credit") {
            return "This wallet has no devnet SOL for the network fee. Get some at faucet.solana.com."
        }
        if let line = logs.first(where: { $0.contains("Error Message:") }), let r = line.range(of: "Error Message:") {
            return String(line[r.upperBound...]).trimmingCharacters(in: .whitespaces)
        }
        if logs.contains(where: { $0.contains("insufficient funds") }) {
            return "Not enough CMN in this wallet."
        }
        if let line = logs.last(where: { $0.contains("failed") || $0.contains("Error") }) { return line }
        return message
    }

    func exists(_ address: String) async throws -> Bool {
        let res = try await call("getAccountInfo", [address, ["encoding": "base64", "dataSlice": ["offset": 0, "length": 0]]])
        return ((res as? [String: Any])?["value"] as? [String: Any]) != nil
    }

    func latestBlockhash() async throws -> [UInt8] {
        let res = try await call("getLatestBlockhash", [["commitment": "confirmed"]])
        guard let s = ((res as? [String: Any])?["value"] as? [String: Any])?["blockhash"] as? String, let b = Base58.decode(s) else {
            throw SolanaError.rpc("Could not get a recent blockhash.")
        }
        return b
    }

    /// Sends a signed transaction; the node simulates it first and reports why it would fail.
    func send(_ tx: [UInt8]) async throws -> String {
        let res = try await call("sendTransaction", [Data(tx).base64EncodedString(), ["encoding": "base64", "preflightCommitment": "confirmed"]])
        guard let sig = res as? String else { throw SolanaError.rpc("The transaction was not accepted.") }
        return sig
    }

    func waitConfirmed(_ signature: String) async throws {
        for _ in 0..<40 {
            let res = try await call("getSignatureStatuses", [[signature]])
            if let st = ((res as? [String: Any])?["value"] as? [Any])?.first as? [String: Any] {
                if let e = st["err"], !(e is NSNull) { throw SolanaError.rpc("The transaction failed on chain: \(e)") }
                if let c = st["confirmationStatus"] as? String, c == "confirmed" || c == "finalized" { return }
            }
            try await Task.sleep(nanoseconds: 750_000_000)
        }
        throw SolanaError.rpc("The transaction was sent but not confirmed in time. Refresh in a minute.")
    }

    /// Accounts of one Anchor type owned by the program, optionally filtered by a pubkey at an offset.
    func accounts(program: String, type: String, match: (offset: Int, pubkey: String)? = nil) async throws -> [(String, [UInt8])] {
        var filters: [[String: Any]] = [["memcmp": ["offset": 0, "bytes": Base58.encode(anchorDiscriminator(type))]]]
        if let m = match { filters.append(["memcmp": ["offset": m.offset, "bytes": m.pubkey]]) }
        let res = try await call("getProgramAccounts", [program, ["encoding": "base64", "filters": filters]])
        guard let list = res as? [[String: Any]] else { return [] }
        return list.compactMap { item in
            guard let key = item["pubkey"] as? String,
                  let acct = item["account"] as? [String: Any],
                  let d = acct["data"] as? [Any], let b64 = d.first as? String,
                  let raw = Data(base64Encoded: b64) else { return nil }
            return (key, [UInt8](raw))
        }
    }

    /// CMN held by `owner` across its token accounts for `mint`.
    func tokenBalance(owner: String, mint: String) async throws -> UInt64 {
        let res = try await call("getTokenAccountsByOwner", [owner, ["mint": mint], ["encoding": "jsonParsed"]])
        guard let r = res as? [String: Any], let list = r["value"] as? [[String: Any]] else { return 0 }
        return list.reduce(0) { sum, item in
            let amount = (((((item["account"] as? [String: Any])?["data"] as? [String: Any])?["parsed"] as? [String: Any])?["info"] as? [String: Any])?["tokenAmount"] as? [String: Any])?["amount"] as? String
            return sum + (UInt64(amount ?? "0") ?? 0)
        }
    }

    func solBalance(_ owner: String) async throws -> Double {
        let res = try await call("getBalance", [owner])
        let lamports = (res as? [String: Any])?["value"] as? Double ?? 0
        return lamports / 1_000_000_000
    }
}

// MARK: - Wallet

/// A Solana CLI keypair file: 64 bytes, the public key is the last 32.
func walletAddress(at path: String) throws -> String {
    let data = try Data(contentsOf: URL(fileURLWithPath: (path as NSString).expandingTildeInPath))
    guard let bytes = try JSONSerialization.jsonObject(with: data) as? [Int], bytes.count == 64 else { throw SolanaError.noWallet }
    return Base58.encode(bytes[32..<64].map { UInt8($0) })
}

/// The devnet program id from commons-token's Anchor.toml, if it is where we expect.
func programIdFromAnchorToml(projectPath: String) -> String? {
    let path = ((projectPath as NSString).expandingTildeInPath as NSString).appendingPathComponent("Anchor.toml")
    guard let text = try? String(contentsOfFile: path, encoding: .utf8) else { return nil }
    var inDevnet = false
    for line in text.split(separator: "\n") {
        let l = line.trimmingCharacters(in: .whitespaces)
        if l.hasPrefix("[") { inDevnet = l == "[programs.devnet]" }
        if inDevnet, l.hasPrefix("commons"), let q = l.split(separator: "\"").dropFirst().first { return String(q) }
    }
    return nil
}
