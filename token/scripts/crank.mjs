// Closes every finished day (run_day) and, when an epoch has ended, releases
// the bank budget (run_epoch). Anyone can run it; it only pays transaction fees.
//
//   node scripts/crank.mjs           once
//   node scripts/crank.mjs --watch   keep running
import { program, wallet, pda, le64, config, today, sleep, CONFIG, MINT, VAULT, SystemProgram, TOKEN_2022_PROGRAM_ID, BN } from './common.mjs'

const EPOCH_DAYS = 91

export async function crank(log = console.log) {
  const c = await config()
  const t = await today()
  for (let day = c.processedDay.toNumber() + 1; day < t; day++) {
    await program.methods
      .runDay(new BN(day))
      .accountsPartial({ caller: wallet.publicKey, config: CONFIG, dayWork: pda('day', le64(day)), mint: MINT, vault: VAULT, systemProgram: SystemProgram.programId })
      .rpc()
    const w = await program.account.dayWork.fetch(pda('day', le64(day)))
    log(`day ${day} closed: ${(w.deliveredMwu.toNumber() / 1000).toFixed(3)} WU delivered, mining budget ${(w.toMining.toNumber() / 1e6).toFixed(6)} CMN`)
  }
  const c2 = await config()
  if (Math.floor(t / EPOCH_DAYS) > c2.epoch.toNumber()) {
    const banks = (await program.account.bank.all()).filter((b) => b.account.status === 1)
    await program.methods
      .runEpoch()
      .accountsPartial({ config: CONFIG, mint: MINT, vault: VAULT, tokenProgram: TOKEN_2022_PROGRAM_ID })
      .remainingAccounts(banks.map((b) => ({ pubkey: b.publicKey, isWritable: true, isSigner: false })))
      .rpc()
    log(`epoch ${c2.epoch.toNumber()} closed, ${banks.length} active bank(s)`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  do {
    await crank()
    if (process.argv.includes('--watch')) await sleep(15_000)
  } while (process.argv.includes('--watch'))
}
