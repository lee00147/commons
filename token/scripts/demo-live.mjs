// The compute-market part of the recorded demo: one real job on devnet, paced
// for the screen. Writes the settlement signature to .demo/last-settle.txt and
// touches .demo/live-done when finished.
import { writeFileSync } from 'node:fs'
import {
  program, wallet, connection, pda, le64, config, today, ata, ensureAta, demoKey, sleep, fmt, BN,
  CONFIG, MINT, VAULT, SystemProgram, TOKEN_2022_PROGRAM_ID, userStats, providerPda, sponsorshipPda, writable, maybe, assignJob,
} from './common.mjs'

const B = '\x1b[1m', D = '\x1b[2m', Y = '\x1b[33m', G = '\x1b[32m', R = '\x1b[0m'
const short = (s) => `${s.slice(0, 8)}…${s.slice(-4)}`
const step = async (n, title) => { console.log(`\n${Y}${B}${n}  ${title}${R}`); await sleep(900) }
const line = async (s, wait = 700) => { console.log(`   ${s}`); await sleep(wait) }
const common = { config: CONFIG, mint: MINT, vault: VAULT, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId }
const me = wallet.publicKey

console.clear()
console.log(`${B}Commons on Solana devnet${R}  ${D}program ${short(program.programId.toBase58())} · CMN ${short(MINT.toBase58())}${R}`)
await sleep(1500)

const providers = ['provider-a', 'provider-b', 'provider-c'].map(demoKey)
await step('1', 'Three providers, each with a bond and a binding ask')
for (const p of providers) {
  const a = await program.account.provider.fetch(providerPda(p.publicKey))
  await line(`${short(p.publicKey.toBase58())}  ask ${a.ask.toNumber() / 1e6} CMN per work unit · bond ${fmt(a.bond)} CMN`, 500)
}

await step('2', 'A buyer posts a job with a price limit')
const listing = pda('program', Buffer.from('commons-render'))
const c = await config()
const job = pda('job', le64(c.nextJob.toNumber()))
await program.methods
  .postJob(new BN(20_000), new BN(50_000), 3, [...Buffer.alloc(32, Date.now() % 251)])
  .accountsPartial({ buyer: me, listing, job, stats: userStats(me), from: ata(me), ...common })
  .rpc()
await line('up to 20 work units per replica · at most 0.05 CMN per work unit · 3 replicas')
await line(`${G}4 CMN in escrow${R} ${D}(the limit for every replica, plus a 1 CMN royalty)${R}`)

await step('3', 'The chain draws the providers from a slot hash nobody knew at posting')
await assignJob(job)
let j = await program.account.job.fetch(job)
const assigned = j.assigned.slice(0, 3)
await line(`drawn by bond: ${assigned.map((k) => short(k.toBase58())).join(', ')}`)
await line(`${G}clears at ${j.clearingPrice.toNumber() / 1e6} CMN per work unit${R} ${D}(the highest ask drawn)${R}`)

await step('4', 'Each provider runs the job and reports its result and instruction count')
for (const key of assigned) {
  const p = providers.find((x) => x.publicKey.equals(key))
  await program.methods.submitResult([...Buffer.alloc(32, 42)], new BN('12000000000')).accountsPartial({ provider: key, job }).signers([p]).rpc()
  await line(`${short(key.toBase58())}  result 2a2a…2a · 12,000,000,000 instructions`, 400)
}

await step('5', 'Settlement: a majority must agree on both')
for (const key of assigned) await ensureAta(key)
let sig
for (let attempt = 0; attempt < 3 && !sig; attempt++) {
  const d = await today()
  try {
    sig = await program.methods
      .settleJob(new BN(d))
      .accountsPartial({ caller: me, job, dayWork: pda('day', le64(d)), buyerStats: userStats(me), sponsorship: await maybe(sponsorshipPda(me)), buyerToken: ata(me), ...common })
      .remainingAccounts([...assigned.map((k) => writable(providerPda(k))), ...assigned.map((k) => writable(ata(k))), writable(ata(me))])
      .rpc()
  } catch (e) {
    if (!String(e).includes('WrongDay')) throw e
  }
}
j = await program.account.job.fetch(job)
await line(`${G}3 of 3 agree${R} on 12 work units`)
await line(`each provider paid ${fmt(j.paidCompute.toNumber() / 3)} CMN · developer paid the royalty · protocol fee to the treasury`)
await line(`${G}unused escrow refunded${R} to the buyer`)
await line(`${D}tx ${short(sig)}${R}`, 1200)

await step('6', 'The economy, read from the chain')
const cf = await config()
const e = cf.econ
const supply = (await connection.getTokenSupply(MINT)).value.amount
await line(`supply ${fmt(supply)} CMN · mined by useful work ${fmt(e.mined)} CMN`, 500)
await line(`work price index ${(e.indexPpm.toNumber() / 1e6).toFixed(4)} · last clearing price ${e.workPrice.toNumber() / 1e6} CMN/WU`, 500)
await line(`treasury ${fmt(cf.treasury)} CMN · providers ${cf.providers} · protocol fee ${((150_000 * e.feeMultPpm.toNumber()) / 1e12 * 100).toFixed(1)}%`, 2500)

writeFileSync('.demo/last-settle.txt', sig)
writeFileSync('.demo/live-done', '')
