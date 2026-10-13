// Gets the Store ready to show: two more apps from the wallet, and a buyer
// wallet (.demo/viewer.json) with SOL and CMN that has bought nothing yet, for
// buying in the Commons app.
//
//   node scripts/store-setup.mjs
import { existsSync } from 'node:fs'
import { program, wallet, connection, pda, ata, ensureAta, balance, sendCmn, sendSol, demoKey, userStats, fmt, CMN, CONFIG, MINT, VAULT, SystemProgram, TOKEN_2022_PROGRAM_ID, LAMPORTS_PER_SOL } from './common.mjs'

const me = wallet.publicKey
const common = { config: CONFIG, mint: MINT, vault: VAULT, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId }
const APPS = [
  ['Pixel Forge', 'Adjust photos on your computer: brightness, contrast, saturation, warmth, black and white, fade.', '0.9.2', 3, 2],
  ['Ledger Lens', 'A free explorer for CMN: supply, the work price index, banks and grants.', '1.2.0', 0, 3],
]
for (const [name, description, version, price, fill] of APPS) {
  const app = pda('app', Buffer.from(name))
  if (await connection.getAccountInfo(app)) {
    console.log(`"${name}" already in the Store`)
    continue
  }
  await program.methods
    .publishApp(name, description, version, CMN(price), [...Buffer.alloc(32, fill)], '')
    .accountsPartial({ developer: me, app, stats: userStats(me), from: ata(me), ...common })
    .rpc()
  console.log(`published "${name}" (${price === 0 ? 'free' : `${price} CMN`})`)
}

const viewer = demoKey('viewer')
if ((await connection.getBalance(viewer.publicKey)) < 0.05 * LAMPORTS_PER_SOL) await sendSol(viewer.publicKey, 0.1)
await ensureAta(viewer.publicKey)
if ((await balance(viewer.publicKey)) < 20_000_000n) await sendCmn(viewer.publicKey, CMN(30))
console.log(`buyer wallet ${viewer.publicKey.toBase58()}: ${fmt(await balance(viewer.publicKey))} CMN`)
console.log(`In the Commons app, Settings (⌘,) → Wallet keypair file: ${process.cwd()}/.demo/viewer.json`)
