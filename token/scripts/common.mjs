// Shared setup for the Commons scripts: provider from ANCHOR_PROVIDER_URL and
// ANCHOR_WALLET (defaults: devnet and ~/.config/solana/id.json), the program
// from the built IDL, PDAs and small helpers.
import * as anchor from '@anchor-lang/core'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
} from '@solana/spl-token'

process.env.ANCHOR_PROVIDER_URL ??= 'https://api.devnet.solana.com'
process.env.ANCHOR_WALLET ??= `${homedir()}/.config/solana/id.json`

// Devnet's public RPC is a pool of nodes that are not always in step. Using
// 'confirmed' blockhashes (not the newest 'processed' ones) keeps a node that
// is slightly behind from rejecting them, and transient errors are retried.
const base = anchor.AnchorProvider.env()
const opts = { commitment: 'confirmed', preflightCommitment: 'confirmed' }
export const provider = new anchor.AnchorProvider(new anchor.web3.Connection(process.env.ANCHOR_PROVIDER_URL, 'confirmed'), base.wallet, opts)
const TRANSIENT = /Blockhash not found|block height exceeded|expired|429|Too Many Requests|fetch failed|ECONNRESET|socket hang up/i
const sendOnce = provider.sendAndConfirm.bind(provider)
provider.sendAndConfirm = async (tx, signers, o) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await sendOnce(tx, signers, { ...opts, ...o })
    } catch (e) {
      if (attempt >= 5 || !TRANSIENT.test(String(e?.message ?? e))) throw e
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
}
anchor.setProvider(provider)
export const connection = provider.connection
export const wallet = provider.wallet
const idl = JSON.parse(readFileSync(new URL('../target/idl/commons.json', import.meta.url)))
export const program = new anchor.Program(idl, provider)
export const BN = anchor.BN

export const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds.map((s) => (typeof s === 'string' ? Buffer.from(s) : s)), program.programId)[0]
export const le64 = (n) => new BN(n).toArrayLike(Buffer, 'le', 8)
export const CONFIG = pda('config')
export const MINT = pda('mint')
export const VAULT = pda('vault')
export const userStats = (owner) => pda('user', owner.toBuffer())
export const providerPda = (owner) => pda('provider', owner.toBuffer())
export const sponsorshipPda = (project) => pda('sponsored', project.toBuffer())
export const writable = (pubkey) => ({ pubkey, isWritable: true, isSigner: false })
export const ata = (owner) => getAssociatedTokenAddressSync(MINT, owner, true, TOKEN_2022_PROGRAM_ID)
export const CMN = (n) => new BN(Math.round(n * 1e6))
export const fmt = (micro) => (Number(micro) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 6 })
export const SLOT_HASHES = new PublicKey('SysvarS1otHashes111111111111111111111111111')
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export { anchor, Keypair, PublicKey, SystemProgram, TOKEN_2022_PROGRAM_ID, LAMPORTS_PER_SOL }

export async function config() {
  return program.account.config.fetch(CONFIG)
}

export async function today() {
  const c = await config()
  return Math.floor((Date.now() / 1000 - c.genesisTs.toNumber()) / c.daySecs.toNumber())
}

/** The account if it exists, else null (for optional accounts such as a sponsorship). */
export async function maybe(pk) {
  return (await connection.getAccountInfo(pk)) ? pk : null
}

/**
 * Draws a posted job's replicas. Every provider account must be passed; the
 * program checks the count. Waits for a slot after the job's.
 */
export async function assignJob(job) {
  const j = await program.account.job.fetch(job)
  while ((await connection.getSlot('confirmed')) <= j.createdSlot.toNumber()) await sleep(400)
  const all = await program.account.provider.all()
  return program.methods
    .assignJob()
    .accountsPartial({ config: CONFIG, job, slotHashes: SLOT_HASHES })
    .remainingAccounts(all.map((p) => writable(p.publicKey)))
    .rpc()
}

/** Token account for `owner`, created if missing (paid by the wallet). */
export async function ensureAta(owner) {
  const address = ata(owner)
  if (await connection.getAccountInfo(address, 'confirmed')) return address
  const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, address, owner, MINT, TOKEN_2022_PROGRAM_ID))
  await provider.sendAndConfirm(tx, [], { commitment: 'confirmed' }) // throws with the real error if it fails
  for (let i = 0; i < 20 && !(await connection.getAccountInfo(address, 'confirmed')); i++) await sleep(500)
  return address
}

export async function balance(owner) {
  try {
    return (await getAccount(connection, ata(owner), 'confirmed', TOKEN_2022_PROGRAM_ID)).amount
  } catch {
    return 0n
  }
}

export async function sendCmn(to, amountMicro) {
  const dest = await ensureAta(to)
  const tx = new Transaction().add(createTransferCheckedInstruction(ata(wallet.publicKey), MINT, dest, wallet.publicKey, BigInt(amountMicro.toString()), 6, [], TOKEN_2022_PROGRAM_ID))
  return provider.sendAndConfirm(tx, [], { commitment: 'confirmed' })
}

export async function sendSol(to, sol) {
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: to, lamports: Math.round(sol * LAMPORTS_PER_SOL) }))
  return provider.sendAndConfirm(tx)
}

/** Keypairs kept in .demo/ so a rerun reuses the same demo accounts. */
export function demoKey(name) {
  mkdirSync('.demo', { recursive: true })
  const f = `.demo/${name}.json`
  if (existsSync(f)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(f, 'utf8'))))
  const k = Keypair.generate()
  writeFileSync(f, JSON.stringify([...k.secretKey]))
  return k
}

export const explorer = (kind, id) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`
