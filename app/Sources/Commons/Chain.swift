import Foundation
import CryptoKit

// Everything the app needs to sign and send its own Solana transactions:
// program-derived addresses, a keypair, the legacy message format, and the
// Store's buy_app instruction. No Node, no SDK.

// MARK: - Ed25519 curve check (for program-derived addresses)

/// Whether 32 bytes decode to a point on the Ed25519 curve. A program-derived
/// address must NOT be one. Arithmetic is mod p = 2^255 − 19 on 8 × 32-bit limbs.
enum Ed25519Point {
    private typealias L = [UInt32]
    private static let mask: UInt64 = 0xffff_ffff
    private static let zero: L = [0, 0, 0, 0, 0, 0, 0, 0]
    private static let one: L = [1, 0, 0, 0, 0, 0, 0, 0]
    private static let p: L = [0xffffffed, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0x7fffffff]
    private static let pMinus2: L = [0xffffffeb, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0x7fffffff]
    private static let half: L = [0xfffffff6, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0x3fffffff] // (p − 1) / 2
    private static let d: L = [0x135978a3, 0x75eb4dca, 0x4141d8ab, 0x00700a4d, 0x7779e898, 0x8cc74079, 0x2b6ffe73, 0x52036cee] // −121665/121666

    private static func geq(_ a: L, _ b: L) -> Bool {
        for i in stride(from: 7, through: 0, by: -1) where a[i] != b[i] { return a[i] > b[i] }
        return true
    }

    private static func subRaw(_ a: L, _ b: L) -> L {
        var out = zero
        var borrow: Int64 = 0
        for i in 0..<8 {
            var t = Int64(a[i]) - Int64(b[i]) - borrow
            if t < 0 { t += 1 << 32; borrow = 1 } else { borrow = 0 }
            out[i] = UInt32(t)
        }
        return out
    }

    private static func addRaw(_ a: L, _ b: L) -> (L, UInt64) {
        var out = zero
        var c: UInt64 = 0
        for i in 0..<8 {
            let t = UInt64(a[i]) + UInt64(b[i]) + c
            out[i] = UInt32(t & mask)
            c = t >> 32
        }
        return (out, c)
    }

    private static func addSmall(_ a: L, _ s: UInt64) -> (L, UInt64) {
        var out = a
        var c = s
        var i = 0
        while c != 0 && i < 8 {
            let t = UInt64(out[i]) + c
            out[i] = UInt32(t & mask)
            c = t >> 32
            i += 1
        }
        return (out, c)
    }

    private static func reduce(_ x: L) -> L {
        var x = x
        while geq(x, p) { x = subRaw(x, p) }
        return x
    }

    private static func add(_ a: L, _ b: L) -> L {
        var (s, c) = addRaw(a, b)
        while c != 0 { (s, c) = addSmall(s, 38 * c) } // 2^256 ≡ 38 (mod p)
        return reduce(s)
    }

    private static func sub(_ a: L, _ b: L) -> L {
        geq(a, b) ? subRaw(a, b) : subRaw(addRaw(a, p).0, b)
    }

    private static func mul(_ a: L, _ b: L) -> L {
        var r = [UInt32](repeating: 0, count: 16)
        for i in 0..<8 {
            var carry: UInt64 = 0
            for j in 0..<8 {
                let t = UInt64(a[i]) * UInt64(b[j]) + UInt64(r[i + j]) + carry
                r[i + j] = UInt32(t & mask)
                carry = t >> 32
            }
            r[i + 8] = UInt32(carry)
        }
        var out = zero
        var carry: UInt64 = 0
        for i in 0..<8 {
            let acc = UInt64(r[i]) + UInt64(r[i + 8]) * 38 + carry
            out[i] = UInt32(acc & mask)
            carry = acc >> 32
        }
        while carry != 0 { (out, carry) = addSmall(out, carry * 38) }
        return reduce(out)
    }

    private static func pow(_ b: L, _ e: L) -> L {
        var res = one
        for i in stride(from: 255, through: 0, by: -1) {
            res = mul(res, res)
            if (e[i / 32] >> UInt32(i % 32)) & 1 == 1 { res = mul(res, b) }
        }
        return res
    }

    static func isOnCurve(_ bytes: [UInt8]) -> Bool {
        guard bytes.count == 32 else { return false }
        var b = bytes
        b[31] &= 0x7f
        var y = zero
        for i in 0..<8 {
            y[i] = UInt32(b[4 * i]) | UInt32(b[4 * i + 1]) << 8 | UInt32(b[4 * i + 2]) << 16 | UInt32(b[4 * i + 3]) << 24
        }
        y = reduce(y)
        let y2 = mul(y, y)
        let u = sub(y2, one)          // y² − 1
        let v = add(mul(d, y2), one)  // d·y² + 1
        if u == zero { return true }
        if v == zero { return false }
        let w = mul(u, pow(v, pMinus2)) // x² = u / v
        if w == zero { return true }
        return pow(w, half) == one      // a square mod p?
    }
}

// MARK: - Addresses

enum PDA {
    /// Solana's find_program_address: the first bump from 255 down whose hash is off the curve.
    static func find(_ seeds: [[UInt8]], program: [UInt8]) -> [UInt8]? {
        for bump in stride(from: 255, through: 0, by: -1) {
            var data = Data()
            for s in seeds { data.append(contentsOf: s) }
            data.append(UInt8(bump))
            data.append(contentsOf: program)
            data.append(contentsOf: Array("ProgramDerivedAddress".utf8))
            let h = Array(SHA256.hash(data: data))
            if !Ed25519Point.isOnCurve(h) { return h }
        }
        return nil
    }

    /// Checked at launch against addresses computed by Solana's own tools.
    static var selfTestPasses: Bool {
        guard let program = Base58.decode("t5V6zr4BQhVRReaKDWiKF98ER8FMEL2cZeQdacsKMfa"),
              let viewer = Base58.decode("FV1fHa5sjAPVrsHm8X4Arfku6j4JgWcWrR4Z6MFubqoB"),
              let mint = Base58.decode("C3QHKobcRskEnKJNjFjkLqvGrJmmbgT364VmyeRK4nQu") else { return false }
        let checks: [([[UInt8]], [UInt8], String)] = [
            ([Array("config".utf8)], program, "D66ZbtjrLwEhRXanQM4vqs5HMo14h36DCfmZemt4r2M4"),
            ([Array("user".utf8), viewer], program, "7qNQ6bihaRzaKbNVNHr1U2nvhQbtG8rxpcYoLHW9gLMQ"), // bump 251
            ([viewer, Solana.token2022, mint], Solana.ataProgram, "4KQ6bvdj6MeR8r9dC9nBvSw9PxnPqzicSLadg6gBrUnM"),
        ]
        return checks.allSatisfy { c in PDA.find(c.0, program: c.1).map { Base58.encode($0) } == c.2 }
    }
}

enum Solana {
    static let system = [UInt8](repeating: 0, count: 32)
    static let token2022 = Base58.decode("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")!
    static let ataProgram = Base58.decode("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")!

    static func ata(owner: [UInt8], mint: [UInt8]) -> [UInt8]? {
        PDA.find([owner, token2022, mint], program: ataProgram)
    }
}

// MARK: - Keypair

/// A Solana CLI keypair file: a JSON array of 64 bytes, seed then public key.
struct Keypair {
    let key: Curve25519.Signing.PrivateKey
    var publicKey: [UInt8] { Array(key.publicKey.rawRepresentation) }

    init(file path: String) throws {
        let url = URL(fileURLWithPath: (path as NSString).expandingTildeInPath)
        guard let data = try? Data(contentsOf: url) else { throw SolanaError.noWallet }
        guard let ints = try JSONSerialization.jsonObject(with: data) as? [Int], ints.count == 64 else { throw SolanaError.noWallet }
        let bytes = ints.map { UInt8(truncatingIfNeeded: $0) }
        key = try Curve25519.Signing.PrivateKey(rawRepresentation: Data(bytes[0..<32]))
        guard Array(key.publicKey.rawRepresentation) == Array(bytes[32..<64]) else { throw SolanaError.noWallet }
    }

    /// Makes a new wallet file, readable only by this user.
    @discardableResult
    static func create(at path: String) throws -> String {
        let url = URL(fileURLWithPath: (path as NSString).expandingTildeInPath)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard !FileManager.default.fileExists(atPath: url.path) else { throw SolanaError.rpc("A wallet file already exists at \(url.path).") }
        let k = Curve25519.Signing.PrivateKey()
        let bytes = Array(k.rawRepresentation) + Array(k.publicKey.rawRepresentation)
        try JSONSerialization.data(withJSONObject: bytes.map(Int.init)).write(to: url)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        return Base58.encode(Array(k.publicKey.rawRepresentation))
    }

    func sign(_ message: [UInt8]) throws -> [UInt8] {
        Array(try key.signature(for: Data(message)))
    }
}

// MARK: - Transactions (legacy message format)

struct AccountMeta {
    let key: [UInt8]
    let signer: Bool
    let writable: Bool
    init(_ key: [UInt8], signer: Bool = false, writable: Bool = false) {
        self.key = key
        self.signer = signer
        self.writable = writable
    }
}

struct Instruction {
    let program: [UInt8]
    let accounts: [AccountMeta]
    let data: [UInt8]
}

enum Tx {
    static func compactU16(_ n: Int) -> [UInt8] {
        var v = n
        var out: [UInt8] = []
        while v >= 0x80 {
            out.append(UInt8(v & 0x7f) | 0x80)
            v >>= 7
        }
        out.append(UInt8(v))
        return out
    }

    /// Accounts ordered signer-writable (fee payer first), signer-readonly,
    /// writable, readonly; then the blockhash and the compiled instructions.
    static func message(payer: [UInt8], instructions: [Instruction], blockhash: [UInt8]) -> [UInt8] {
        var order: [[UInt8]] = [payer]
        var flags: [[UInt8]: (signer: Bool, writable: Bool)] = [payer: (true, true)]
        func note(_ k: [UInt8], _ s: Bool, _ w: Bool) {
            if let f = flags[k] {
                flags[k] = (f.signer || s, f.writable || w)
            } else {
                flags[k] = (s, w)
                order.append(k)
            }
        }
        for ix in instructions {
            for a in ix.accounts { note(a.key, a.signer, a.writable) }
            note(ix.program, false, false)
        }
        let sw = order.filter { flags[$0]!.signer && flags[$0]!.writable }
        let sr = order.filter { flags[$0]!.signer && !flags[$0]!.writable }
        let w = order.filter { !flags[$0]!.signer && flags[$0]!.writable }
        let r = order.filter { !flags[$0]!.signer && !flags[$0]!.writable }
        let keys = sw + sr + w + r
        var m: [UInt8] = [UInt8(sw.count + sr.count), UInt8(sr.count), UInt8(r.count)]
        m += compactU16(keys.count)
        for k in keys { m += k }
        m += blockhash
        m += compactU16(instructions.count)
        for ix in instructions {
            m.append(UInt8(keys.firstIndex(of: ix.program)!))
            m += compactU16(ix.accounts.count)
            for a in ix.accounts { m.append(UInt8(keys.firstIndex(of: a.key)!)) }
            m += compactU16(ix.data.count)
            m += ix.data
        }
        return m
    }

    static func signed(_ message: [UInt8], by keypair: Keypair) throws -> [UInt8] {
        try compactU16(1) + keypair.sign(message) + message
    }
}

// MARK: - The Store purchase

enum StoreTx {
    /// Anchor's discriminator for buy_app: sha256("global:buy_app")[0..8].
    static let buyApp: [UInt8] = [248, 101, 246, 128, 198, 130, 21, 134]

    static func createATA(payer: [UInt8], owner: [UInt8], mint: [UInt8]) throws -> Instruction {
        guard let ata = Solana.ata(owner: owner, mint: mint) else { throw SolanaError.decode }
        return Instruction(program: Solana.ataProgram, accounts: [
            AccountMeta(payer, signer: true, writable: true),
            AccountMeta(ata, writable: true),
            AccountMeta(owner),
            AccountMeta(mint),
            AccountMeta(Solana.system),
            AccountMeta(Solana.token2022),
        ], data: [1]) // CreateIdempotent
    }

    /// Buys an app: one transaction that makes sure both token accounts exist,
    /// then calls buy_app, signed by the wallet in this app.
    static func buy(_ app: StoreApp, keypair: Keypair, programId: String, rpc: SolanaRPC) async throws -> String {
        guard let program = Base58.decode(programId), program.count == 32,
              let appKey = Base58.decode(app.id), let dev = Base58.decode(app.developer) else { throw SolanaError.decode }
        let buyer = keypair.publicKey
        if buyer == dev { throw SolanaError.rpc("This wallet published \(app.name), so it cannot buy it.") }
        let seed = { (s: String) in Array(s.utf8) }
        guard let config = PDA.find([seed("config")], program: program),
              let mint = PDA.find([seed("mint")], program: program),
              let vault = PDA.find([seed("vault")], program: program),
              let license = PDA.find([seed("license"), appKey, buyer], program: program),
              let stats = PDA.find([seed("user"), buyer], program: program),
              let sponsorship = PDA.find([seed("sponsored"), dev], program: program),
              let buyerATA = Solana.ata(owner: buyer, mint: mint),
              let devATA = Solana.ata(owner: dev, mint: mint) else { throw SolanaError.decode }
        // An optional account Anchor does not get is passed as the program id.
        let sponsored = try await rpc.exists(Base58.encode(sponsorship))
        let buyIx = Instruction(program: program, accounts: [
            AccountMeta(buyer, signer: true, writable: true),
            AccountMeta(config, writable: true),
            AccountMeta(appKey, writable: true),
            AccountMeta(license, writable: true),
            AccountMeta(stats, writable: true),
            sponsored ? AccountMeta(sponsorship, writable: true) : AccountMeta(program),
            AccountMeta(mint),
            AccountMeta(vault, writable: true),
            AccountMeta(buyerATA, writable: true),
            AccountMeta(devATA, writable: true),
            AccountMeta(Solana.token2022),
            AccountMeta(Solana.system),
        ], data: buyApp)
        let ixs = try [createATA(payer: buyer, owner: buyer, mint: mint), createATA(payer: buyer, owner: dev, mint: mint), buyIx]
        let blockhash = try await rpc.latestBlockhash()
        let tx = try Tx.signed(Tx.message(payer: buyer, instructions: ixs, blockhash: blockhash), by: keypair)
        let sig = try await rpc.send(tx)
        try await rpc.waitConfirmed(sig)
        return sig
    }
}
