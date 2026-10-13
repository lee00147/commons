// Creates CMN: the Token-2022 mint (metadata pointer = the program), the
// vault, the config and the 1,000,000 CMN genesis amount in the vault, then
// writes the token's name, symbol and logo link (CMN_METADATA_URI, default
// https://interactiveapps.net/cmn.json).
//
//   node scripts/initialize.mjs genesis.json [day-seconds] [oracle-pubkey]
//
// day-seconds: length of a "day" for the rule. 86400 on mainnet; on devnet use
// something short (default 120) so the daily rule, mining and banks can be
// watched in minutes.
import { readFileSync } from 'node:fs'
import { program, wallet, CONFIG, MINT, VAULT, SystemProgram, TOKEN_2022_PROGRAM_ID, PublicKey, BN, explorer } from './common.mjs'

const [file, dayArg, oracleArg] = process.argv.slice(2)
if (!file) throw new Error('usage: node scripts/initialize.mjs genesis.json [day-seconds] [oracle-pubkey]')
const { root } = JSON.parse(readFileSync(file, 'utf8'))
const daySecs = Number(dayArg ?? 120)
const oracle = oracleArg ? new PublicKey(oracleArg) : wallet.publicKey

const sig = await program.methods
  .initialize([...Buffer.from(root, 'hex')], oracle, new BN(daySecs))
  .accountsPartial({ payer: wallet.publicKey, config: CONFIG, mint: MINT, vault: VAULT, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId })
  .rpc()
console.log('initialized ', explorer('tx', sig))

const meta = await program.methods
  .setMetadata('Commons', 'CMN', process.env.CMN_METADATA_URI ?? 'https://interactiveapps.net/cmn.json')
  .accountsPartial({ admin: wallet.publicKey, config: CONFIG, mint: MINT, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId })
  .rpc()
console.log('named CMN   ', explorer('tx', meta))
console.log('CMN mint    ', explorer('address', MINT.toBase58()))
console.log('vault       ', VAULT.toBase58())
console.log(`one day = ${daySecs} seconds`)
