// Registers real builds for Store apps: the SHA-256 of each file and the URL it
// is served from. The Commons app installs a download only if its hash matches.
// Run after deploying the website (the files live in commons-website/public/apps).
//
//   node scripts/attach-builds.mjs
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { program, wallet, pda, ata, userStats, CONFIG, MINT, VAULT, SystemProgram, TOKEN_2022_PROGRAM_ID, explorer } from './common.mjs'

const SITE = process.env.SITE ?? 'https://interactiveapps.net'
const BUILDS = [
  ['Ledger Lens', 'ledger-lens.html', 'A free explorer for CMN: supply, the work price index and the latest program transactions, live from devnet.', '1.2.0'],
  ['Commons Notes', 'commons-notes.html', 'Notes that stay on your computer. Bought with CMN, licensed on Solana.', '1.0.0'],
  ['Pixel Forge', 'pixel-forge.html', 'Adjust photos on your computer: brightness, contrast, saturation, warmth, black and white, fade. Exports PNG; nothing leaves your machine.', '1.0.0'],
]
const sha = (buf) => createHash('sha256').update(buf).digest()
const me = wallet.publicKey

for (const [name, file, description, version] of BUILDS) {
  const local = readFileSync(new URL(`../../commons-website/public/apps/${file}`, import.meta.url))
  const uri = `${SITE}/apps/${file}`
  const res = await fetch(uri)
  if (!res.ok) throw new Error(`${uri} is not reachable yet (${res.status}). Deploy the website first.`)
  const served = Buffer.from(await res.arrayBuffer())
  if (!sha(served).equals(sha(local))) throw new Error(`${uri} differs from the local file. Rebuild and redeploy the website.`)
  const app = pda('app', Buffer.from(name))
  const a = await program.account.app.fetch(app)
  const sig = await program.methods
    .updateApp(description, version, a.price, [...sha(local)], uri)
    .accountsPartial({ developer: me, config: CONFIG, app, stats: userStats(me), mint: MINT, vault: VAULT, from: ata(me), tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId })
    .rpc()
  console.log(`${name}: build ${sha(local).toString('hex').slice(0, 16)}… at ${uri}  ${explorer('tx', sig)}`)
}
