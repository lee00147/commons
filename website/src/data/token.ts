// CMN on Solana (phase 1). Fill in the addresses after `anchor deploy` and
// `node scripts/initialize.mjs` (commons-token); the site shows them once set.
export const CLUSTER = 'devnet'
export const PROGRAM_ID = 't5V6zr4BQhVRReaKDWiKF98ER8FMEL2cZeQdacsKMfa'
export const MINT = 'C3QHKobcRskEnKJNjFjkLqvGrJmmbgT364VmyeRK4nQu'

// The white paper, published with the site from src/content/whitepaper.md.
export const WHITE_PAPER = '/whitepaper/'

// Public source code (program, website, app). Empty hides the links.
export const REPO = 'https://github.com/lee00147/commons'

export const explorer = (kind: 'address' | 'tx', id: string) => `https://explorer.solana.com/${kind}/${id}?cluster=${CLUSTER}`
export const short = (a: string) => (a.length > 16 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a)
