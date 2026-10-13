// Makes a new wallet that has bought nothing yet and funds it from your wallet
// (0.05 SOL, 10 CMN), for recording a purchase in the Commons app. Prints its path.
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { Keypair, ensureAta, sendCmn, sendSol, CMN } from './common.mjs'

mkdirSync('.demo', { recursive: true })
const k = Keypair.generate()
const file = resolve(`.demo/buyer-${Date.now()}.json`)
writeFileSync(file, JSON.stringify([...k.secretKey]))
await sendSol(k.publicKey, 0.05)
await ensureAta(k.publicKey)
await sendCmn(k.publicKey, CMN(10))
console.error(`buyer ${k.publicKey.toBase58()} funded with 0.05 SOL and 10 CMN`)
console.log(file)
