// Builds the genesis claim list: 1,000,000 CMN to the people who ran and
// published real jobs on the test network, by verified CPU-seconds, with the
// same 80/20 split as mining and at most 1% (10,000 CMN) per address.
//
//   node scripts/genesis-merkle.mjs work.csv > genesis.json
//
// work.csv rows:  address,role,cpu_seconds   (role = provider | developer)
// Output: { root, total, claims: { address: { amount, proof[] } } }
// The leaf and pair hashing match `claim_genesis` in the program.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const GENESIS = 1_000_000_000_000n // µCMN
const MAX_CLAIM = GENESIS / 100n
const PROVIDER_SHARE = 800_000n // ppm

const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export function b58decode(s) {
  let n = 0n
  for (const ch of s) {
    const i = A.indexOf(ch)
    if (i < 0) throw new Error(`bad base58: ${s}`)
    n = n * 58n + BigInt(i)
  }
  const bytes = []
  while (n > 0n) {
    bytes.unshift(Number(n & 255n))
    n >>= 8n
  }
  for (const ch of s) {
    if (ch === '1') bytes.unshift(0)
    else break
  }
  if (bytes.length !== 32) throw new Error(`not a 32-byte address: ${s}`)
  return Buffer.from(bytes)
}

const sha = (...parts) => createHash('sha256').update(Buffer.concat(parts)).digest()
const u64le = (v) => {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(v)
  return b
}
export const leaf = (addr, amount) => sha(Buffer.from('commons-genesis'), b58decode(addr), u64le(amount))
export const pair = (a, b) => (Buffer.compare(a, b) <= 0 ? sha(a, b) : sha(b, a))

/** Amounts per address from verified CPU-seconds. */
export function allocate(rows) {
  const prov = new Map(), dev = new Map()
  let provTotal = 0n, devTotal = 0n
  for (const { address, role, cpu } of rows) {
    const m = role === 'developer' ? dev : prov
    m.set(address, (m.get(address) ?? 0n) + cpu)
    if (role === 'developer') devTotal += cpu
    else provTotal += cpu
  }
  const provPool = (GENESIS * PROVIDER_SHARE) / 1_000_000n
  const devPool = GENESIS - provPool
  const out = new Map()
  const add = (m, total, pool) => {
    if (total === 0n) return
    for (const [a, cpu] of m) out.set(a, (out.get(a) ?? 0n) + (pool * cpu) / total)
  }
  add(prov, provTotal, provPool)
  add(dev, devTotal, devPool)
  // Cap at 1% per address; what the cap removes stays unclaimed in the vault.
  for (const [a, v] of out) if (v > MAX_CLAIM) out.set(a, MAX_CLAIM)
  return out
}

export function build(amounts) {
  const entries = [...amounts].filter(([, v]) => v > 0n).sort(([a], [b]) => (a < b ? -1 : 1))
  let level = entries.map(([a, v]) => leaf(a, v))
  if (level.length === 0) throw new Error('empty list')
  const layers = [level]
  while (level.length > 1) {
    const next = []
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? pair(level[i], level[i + 1]) : level[i])
    layers.push(next)
    level = next
  }
  const claims = {}
  entries.forEach(([a, v], idx) => {
    const proof = []
    let i = idx
    for (const layer of layers.slice(0, -1)) {
      const sib = i ^ 1
      if (sib < layer.length) proof.push(layer[sib].toString('hex'))
      i >>= 1
    }
    claims[a] = { amount: v.toString(), proof }
  })
  return { root: layers.at(-1)[0].toString('hex'), total: entries.reduce((s, [, v]) => s + v, 0n).toString(), claims }
}

export function verify(addr, amount, proofHex, rootHex) {
  let node = leaf(addr, BigInt(amount))
  for (const h of proofHex) node = pair(node, Buffer.from(h, 'hex'))
  return node.toString('hex') === rootHex
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node scripts/genesis-merkle.mjs work.csv > genesis.json')
    process.exit(1)
  }
  const rows = readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('address'))
    .map((l) => {
      const [address, role, cpu] = l.split(',').map((x) => x.trim())
      return { address, role, cpu: BigInt(cpu) }
    })
  const out = build(allocate(rows))
  for (const [a, c] of Object.entries(out.claims)) if (!verify(a, c.amount, c.proof, out.root)) throw new Error(`proof failed for ${a}`)
  console.log(JSON.stringify(out, null, 2))
}
