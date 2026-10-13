// Runs Commons phase 1 on devnet, end to end, with real transactions:
//
//   1. the wallet claims its genesis CMN (test-network work list)
//   2. three providers join with a bond and a binding ask per work unit
//   3. a compute program is listed and a job is posted with a price limit;
//      the chain draws three providers from a slot hash that did not exist
//      when the job was posted, the job clears at the highest drawn ask, the
//      providers post matching results and instruction counts, and it settles
//   4. days close (run_day): the index follows what the job cleared at, the
//      rule runs, and the verified job is paid its mining reward
//   5. an app is published in the Store and bought by five users
//   6. a bank with two operators is proposed, endorsed by five users (weight
//      = protocol fees paid), opens, and gets a vote
//   7. a status summary
//
//   node scripts/demo.mjs genesis.json
//
// Uses about 1 devnet SOL. Demo keys are kept in .demo/ so reruns reuse them.
import { readFileSync } from 'node:fs'
import {
  program, wallet, connection, pda, le64, config, today, ata, ensureAta, balance, sendCmn, sendSol, demoKey, sleep, explorer, fmt, CMN, BN,
  CONFIG, MINT, VAULT, SystemProgram, TOKEN_2022_PROGRAM_ID, LAMPORTS_PER_SOL, userStats, providerPda, sponsorshipPda, writable, maybe, assignJob,
} from './common.mjs'
import { crank } from './crank.mjs'

const genesis = JSON.parse(readFileSync(process.argv[2] ?? 'genesis.json', 'utf8'))
const me = wallet.publicKey
const step = (s) => console.log(`\n● ${s}`)
const ok = (s) => console.log(`  ${s}`)
const short = (k) => `${k.toBase58().slice(0, 8)}…`
const common = { config: CONFIG, mint: MINT, vault: VAULT, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId }

async function exists(pk) {
  return (await connection.getAccountInfo(pk)) !== null
}

async function fund(k, sol, cmn) {
  if ((await connection.getBalance(k.publicKey)) < sol * 0.6 * LAMPORTS_PER_SOL) await sendSol(k.publicKey, sol)
  if ((await balance(k.publicKey)) < BigInt(CMN(cmn * 0.8).toString())) await sendCmn(k.publicKey, CMN(cmn))
}

// 1. Genesis claim ------------------------------------------------------------
step('Genesis: claim CMN for test-network work')
await ensureAta(me)
const claim = genesis.claims[me.toBase58()]
if (!claim) throw new Error('this wallet is not in genesis.json')
if (await exists(pda('genesis', me.toBuffer()))) {
  ok('already claimed')
} else {
  const sig = await program.methods
    .claimGenesis(new BN(claim.amount), claim.proof.map((h) => [...Buffer.from(h, 'hex')]))
    .accountsPartial({ claimer: me, claim: pda('genesis', me.toBuffer()), to: ata(me), ...common })
    .rpc()
  ok(`claimed ${fmt(claim.amount)} CMN  ${explorer('tx', sig)}`)
}

// 2. Providers ----------------------------------------------------------------
// An ask below the genesis price (0.05 CMN per WU) means work got cheaper: CMN
// gained value, so once jobs clear there the rule sees money is short and
// releases some, which mines.
const ASK = 40_000 // µCMN per WU
step(`Compute providers join (bond 100 CMN, binding ask ${ASK / 1e6} CMN per work unit)`)
const providers = ['provider-a', 'provider-b', 'provider-c'].map(demoKey)
for (const p of providers) {
  await fund(p, 0.08, 150)
  if (await exists(providerPda(p.publicKey))) {
    ok(`${short(p.publicKey)} already a provider`)
    continue
  }
  await program.methods
    .registerProvider(new BN(ASK), CMN(100))
    .accountsPartial({ provider: p.publicKey, providerAccount: providerPda(p.publicKey), from: ata(p.publicKey), ...common })
    .signers([p])
    .rpc()
  ok(`${short(p.publicKey)} registered`)
}

// 3. A compute job ------------------------------------------------------------
step('A compute program is listed; a job is drawn to three providers and settles')
const progName = 'commons-render'
const listing = pda('program', Buffer.from(progName))
if (!(await exists(listing))) {
  const moduleHash = [...Buffer.alloc(32, 3)] // SHA-256 of the WebAssembly module
  await program.methods
    .listProgram(progName, moduleHash, CMN(1))
    .accountsPartial({ developer: me, listing, stats: userStats(me), from: ata(me), ...common })
    .rpc()
  ok(`listed ${progName} (royalty 1 CMN per job)`)
}
// The rule acts only after 3 days of data; the job must settle on such a day
// to mine. Close days until then.
let c = await config()
const daySecs = c.daySecs.toNumber()
async function waitDayEnd() {
  const g = (await config()).genesisTs.toNumber()
  const wait = daySecs - ((Date.now() / 1000 - g) % daySecs) + 2
  ok(`waiting ${Math.ceil(wait)} s for day ${await today()} to end…`)
  await sleep(wait * 1000)
  await crank((s) => ok(s))
}
await crank((s) => ok(s))
while ((await config()).econ.days.toNumber() < 2) await waitDayEnd()

const MAX_MWU = 20_000 // 20 WU per replica at most
const LIMIT = 50_000 // the buyer pays at most 0.05 CMN per WU
c = await config()
const jobId = c.nextJob.toNumber()
const job = pda('job', le64(jobId))
await program.methods
  .postJob(new BN(MAX_MWU), new BN(LIMIT), 3, [...Buffer.alloc(32, 7)])
  .accountsPartial({ buyer: me, listing, job, stats: userStats(me), from: ata(me), ...common })
  .rpc()
ok(`job #${jobId}: up to 20 WU × 3 replicas at ≤ ${LIMIT / 1e6} CMN/WU; ${fmt((LIMIT * MAX_MWU / 1000) * 3 + 1e6)} CMN into escrow`)
const drawSig = await assignJob(job)
let j = await program.account.job.fetch(job)
const assigned = j.assigned.slice(0, 3)
ok(`drawn: ${assigned.map(short).join(', ')}; clears at ${j.clearingPrice.toNumber() / 1e6} CMN/WU  ${explorer('tx', drawSig)}`)

const result = [...Buffer.alloc(32, 42)]
const INSTRUCTIONS = new BN('12000000000') // 12 WU, metered
for (const key of assigned) {
  const p = providers.find((x) => x.publicKey.equals(key))
  await program.methods.submitResult(result, INSTRUCTIONS).accountsPartial({ provider: key, job }).signers([p]).rpc()
  ok(`${short(key)} posted its result (12 billion instructions)`)
}
for (const key of assigned) await ensureAta(key)
const settleRemaining = [...assigned.map((k) => writable(providerPda(k))), ...assigned.map((k) => writable(ata(k))), writable(ata(me))]
let settled = false
for (let attempt = 0; attempt < 3 && !settled; attempt++) {
  const d = await today()
  try {
    const sig = await program.methods
      .settleJob(new BN(d))
      .accountsPartial({ caller: me, job, dayWork: pda('day', le64(d)), buyerStats: userStats(me), sponsorship: await maybe(sponsorshipPda(me)), buyerToken: ata(me), ...common })
      .remainingAccounts(settleRemaining)
      .rpc()
    j = await program.account.job.fetch(job)
    ok(`settled on day ${d}: ${j.mwu.toNumber() / 1000} WU agreed, each provider paid ${fmt(j.paidCompute.toNumber() / 3)} CMN, unused escrow refunded  ${explorer('tx', sig)}`)
    settled = true
  } catch (e) {
    if (!String(e).includes('WrongDay')) throw e
  }
}
const jobDay = (await program.account.job.fetch(job)).settledDay.toNumber()

// 4. Days close and the job mines ---------------------------------------------
step('Days close: the index follows clearing prices, the rule runs, verified work mines')
while ((await today()) <= jobDay) await waitDayEnd()
await crank((s) => ok(s))
const before = await Promise.all(assigned.map(balance))
try {
  const sig = await program.methods
    .claimMining()
    .accountsPartial({ config: CONFIG, job, dayWork: pda('day', le64(jobDay)), mint: MINT, tokenProgram: TOKEN_2022_PROGRAM_ID })
    .remainingAccounts([...assigned.map((k) => writable(ata(k))), writable(ata(me))])
    .rpc()
  const after = await Promise.all(assigned.map(balance))
  ok(`mining reward minted: each provider +${fmt(after[0] - before[0])} CMN  ${explorer('tx', sig)}`)
  ok('(zero means the rule saw no money shortage that day: nothing new was needed, so nothing was mined)')
  await program.methods.closeJob().accountsPartial({ buyer: me, job }).rpc()
  ok('job closed, its rent returned to the buyer')
} catch (e) {
  ok(`mining claim: ${String(e).split('\n')[0]}`)
}

// 5. Store --------------------------------------------------------------------
step('Store: an app is published and bought by five users')
const users = [...providers, ...['user-d', 'user-e'].map(demoKey)]
for (const u of users.slice(3)) await fund(u, 0.05, 20)
const appName = 'Commons Notes'
const app = pda('app', Buffer.from(appName))
if (!(await exists(app))) {
  await program.methods
    .publishApp(appName, 'Notes that sync over Commons.', '1.0.0', CMN(5), [...Buffer.alloc(32, 1)], '')
    .accountsPartial({ developer: me, app, stats: userStats(me), from: ata(me), ...common })
    .rpc()
  ok(`published "${appName}" for 5 CMN`)
}
for (const u of users) {
  const license = pda('license', app.toBuffer(), u.publicKey.toBuffer())
  if (await exists(license)) continue
  await program.methods
    .buyApp()
    .accountsPartial({ buyer: u.publicKey, app, license, stats: userStats(u.publicKey), sponsorship: await maybe(sponsorshipPda(me)), from: ata(u.publicKey), developerToken: ata(me), ...common })
    .signers([u])
    .rpc()
  ok(`${short(u.publicKey)} bought it (license on chain; its 0.75 CMN protocol fee is now its vote weight)`)
}

// 6. A bank -------------------------------------------------------------------
step('A bank with two operators is proposed, endorsed by five users, and voted for')
const operatorB = demoKey('operator-b')
c = await config()
const banks = await program.account.bank.all()
let bank = banks.find((b) => b.account.founder.equals(me) && b.account.status <= 1)?.publicKey
if (!bank) {
  bank = pda('bank', le64(c.nextBank.toNumber()))
  await program.methods
    .proposeBank('Builders Bank', [me, operatorB.publicKey], 2)
    .accountsPartial({ founder: me, bank, stats: userStats(me), from: ata(me), ...common })
    .rpc()
  ok('proposed "Builders Bank": operators 2, both must sign each grant (10 CMN fee, 100 CMN deposit)')
}
for (const u of users) {
  const marker = pda('endorse', bank.toBuffer(), u.publicKey.toBuffer())
  if (await exists(marker)) continue
  try {
    await program.methods.endorseBank().accountsPartial({ user: u.publicKey, config: CONFIG, bank, stats: userStats(u.publicKey), marker, systemProgram: SystemProgram.programId }).signers([u]).rpc()
    ok(`${short(u.publicKey)} endorsed`)
  } catch (e) {
    ok(`endorse: ${String(e).split('\n')[0]}`)
  }
}
let b = await program.account.bank.fetch(bank)
ok(`bank status: ${['proposed', 'active', 'closed', 'expired'][b.status]} (${b.endorsers} endorsers)`)
if (b.status === 1) {
  c = await config()
  const marker = pda('vote', me.toBuffer(), le64(c.epoch.toNumber()))
  if (!(await exists(marker))) {
    try {
      await program.methods.voteRelease().accountsPartial({ user: me, config: CONFIG, bank, stats: userStats(me), marker, systemProgram: SystemProgram.programId }).rpc()
      ok("voted for it in this epoch's release")
    } catch (e) {
      ok(`vote: ${String(e).split('\n')[0]}`)
    }
  }
  ok('its first funds arrive when the epoch ends (run_epoch); 3% of them vest to the two operators over four epochs')
}

// 7. Status -------------------------------------------------------------------
step('Status')
c = await config()
const e = c.econ
const supply = (await connection.getTokenSupply(MINT)).value.amount
const vault = (await connection.getTokenAccountBalance(VAULT)).value.amount
ok(`supply ${fmt(supply)} CMN, circulating ${fmt(BigInt(supply) - BigInt(vault))} CMN`)
ok(`treasury ${fmt(c.treasury)}, escrow ${fmt(c.escrow)}, bonds ${fmt(c.bonds)}, bank funds ${fmt(c.bankFunds)}, operator rewards ${fmt(c.rewards)}, genesis left ${fmt(c.genesisLeft)}`)
ok(`work price index ${(e.indexPpm.toNumber() / 1e6).toFixed(4)} (last median clearing price ${e.workPrice.toNumber() / 1e6} CMN/WU), target ${(e.targetPpm.toNumber() / 1e6).toFixed(4)}`)
ok(`mined ${fmt(e.mined)} CMN, days processed ${c.processedDay.toNumber() + 1}, protocol fee ${((150_000 * e.feeMultPpm.toNumber()) / 1e12 * 100).toFixed(1)}%, providers ${c.providers}`)
ok(`program  ${explorer('address', program.programId.toBase58())}`)
ok(`CMN mint ${explorer('address', MINT.toBase58())}`)
