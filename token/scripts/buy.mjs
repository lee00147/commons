// Buys an app from the Commons Store: the license is recorded on chain, the
// developer gets the price less the protocol fee. Used by the Commons app.
//
//   node scripts/buy.mjs "<app name>"
import { program, wallet, pda, ata, ensureAta, userStats, sponsorshipPda, maybe, CONFIG, MINT, VAULT, SystemProgram, TOKEN_2022_PROGRAM_ID, explorer } from './common.mjs'

const name = process.argv[2]
if (!name) throw new Error('usage: node scripts/buy.mjs "<app name>"')
const app = pda('app', Buffer.from(name))
const a = await program.account.app.fetch(app)
const me = wallet.publicKey
await ensureAta(me)
await ensureAta(a.developer)
const sig = await program.methods
  .buyApp()
  .accountsPartial({
    buyer: me, config: CONFIG, app, license: pda('license', app.toBuffer(), me.toBuffer()), stats: userStats(me), sponsorship: await maybe(sponsorshipPda(a.developer)),
    mint: MINT, vault: VAULT, from: ata(me), developerToken: ata(a.developer), tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
  })
  .rpc()
console.log(`bought ${name}`, explorer('tx', sig))
