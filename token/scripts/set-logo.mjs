// Gives CMN its logo in wallets and explorers. Token-2022 metadata points to a
// JSON file (name, symbol, description, image) that must be publicly hosted;
// the website is the natural place.
//
//   1. node scripts/set-logo.mjs https://<your-site>          writes cmn.json into the website
//   2. deploy the website (cmn.json and cmn-logo.png in public/)
//   3. node scripts/set-logo.mjs https://<your-site> --apply  points the token at it
import { writeFileSync, existsSync } from 'node:fs'
const [base, flag] = process.argv.slice(2)
if (!base?.startsWith('https://')) throw new Error('usage: node scripts/set-logo.mjs https://<your-site> [--apply]')
const site = base.replace(/\/$/, '')
const pub = new URL('../../commons-website/public/', import.meta.url)

if (flag !== '--apply') {
  if (!existsSync(new URL('cmn-logo.png', pub))) throw new Error('commons-website/public/cmn-logo.png is missing')
  const meta = {
    name: 'Commons',
    symbol: 'CMN',
    description: 'Money measured in work: CMN is issued for useful compute and funds the people who build on Commons.',
    image: `${site}/cmn-logo.png`,
    external_url: site,
  }
  writeFileSync(new URL('cmn.json', pub), JSON.stringify(meta, null, 2) + '\n')
  console.log('wrote commons-website/public/cmn.json')
  console.log(`deploy the website, check ${site}/cmn.json opens, then run with --apply`)
} else {
  const { program, wallet, CONFIG, MINT, SystemProgram, TOKEN_2022_PROGRAM_ID, explorer } = await import('./common.mjs')
  const res = await fetch(`${site}/cmn.json`)
  if (!res.ok) throw new Error(`${site}/cmn.json is not reachable yet (${res.status})`)
  const sig = await program.methods
    .updateMetadataUri(`${site}/cmn.json`)
    .accountsPartial({ admin: wallet.publicKey, config: CONFIG, mint: MINT, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId })
    .rpc()
  console.log('logo set', explorer('tx', sig))
  console.log('token   ', explorer('address', MINT.toBase58()))
}
