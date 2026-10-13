import { useEffect, useRef, useState } from 'react'
import { animate, motion, useReducedMotion } from 'motion/react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import { tokens } from '../theme'
import { PROGRAM_ID, explorer } from '../data/token'

// Read straight from the program's Config account on devnet; no server in between.
const RPC = 'https://api.devnet.solana.com'
const CONFIG = 'D66ZbtjrLwEhRXanQM4vqs5HMo14h36DCfmZemt4r2M4'
const MINT_ADDR = 'C3QHKobcRskEnKJNjFjkLqvGrJmmbgT364VmyeRK4nQu'
// Config: discriminator 8 · bumps 3 · mint, vault, oracle, admin 4×32 · metadata_set 1 ·
// day_secs 8 · genesis_ts 8 · merkle_root 32 · genesis_claimed 8 · econ (170 bytes) · ledger…
const ECON = 8 + 3 + 128 + 1 + 8 + 8 + 32 + 8
const LEDGER = ECON + 170 // treasury, genesis_left, escrow, bonds, bank_funds, bank_deposits, rewards, …
const NEXT_JOB = LEDGER + 8 * 13 + 24 + 8 // after spend/fee fields, fee_buckets and epoch
const PROVIDERS = NEXT_JOB + 8 + 8 + 4

type Chain = {
  supply: number
  mined: number
  index: number
  target: number
  price: number
  treasury?: number
  bonds?: number
  jobs?: number
  providers?: number
  lastTx?: number
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  return j.result as T
}

async function read(): Promise<Chain> {
  const [supply, cfg, sigs] = await Promise.all([
    rpc<{ value: { amount: string } }>('getTokenSupply', [MINT_ADDR]),
    rpc<{ value: { data: [string, string] } }>('getAccountInfo', [CONFIG, { encoding: 'base64' }]),
    rpc<{ blockTime: number | null }[]>('getSignaturesForAddress', [PROGRAM_ID, { limit: 1 }]),
  ])
  const bytes = Uint8Array.from(atob(cfg.value.data[0]), (c) => c.charCodeAt(0))
  const dv = new DataView(bytes.buffer)
  const i64 = (at: number) => Number(dv.getBigInt64(at, true))
  const u32 = (at: number) => (at + 4 <= bytes.length ? dv.getUint32(at, true) : -1)
  const total = Number(supply.value.amount)
  const within = (v: number, max: number) => (v >= 0 && v <= max ? v : undefined)
  return {
    supply: total / 1e6,
    mined: i64(ECON + 16) / 1e6,
    index: i64(ECON + 32) / 1e6,
    target: i64(ECON + 40) / 1e6,
    price: i64(ECON + 48) / 1e6,
    treasury: within(i64(LEDGER), total) !== undefined ? i64(LEDGER) / 1e6 : undefined,
    bonds: within(i64(LEDGER + 24), total) !== undefined ? i64(LEDGER + 24) / 1e6 : undefined,
    jobs: bytes.length >= NEXT_JOB + 8 ? within(i64(NEXT_JOB), 10_000_000) : undefined,
    providers: within(u32(PROVIDERS), 100_000),
    lastTx: sigs[0]?.blockTime ?? undefined,
  }
}

const num = (v: number, dp = 2) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

function ago(t: number) {
  const s = Math.max(0, Math.round(Date.now() / 1000 - t))
  if (s < 90) return `${s} s ago`
  if (s < 90 * 60) return `${Math.round(s / 60)} min ago`
  if (s < 36 * 3600) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}

/** Counts from the previous value to the new one. */
function Ticker({ value, dp }: { value: number; dp: number }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduce) {
      setShown(value)
      return
    }
    const c = animate(from.current, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: setShown })
    from.current = value
    return () => c.stop()
  }, [value, reduce])
  return <>{num(shown, dp)}</>
}

export function Live() {
  const [chain, setChain] = useState<Chain | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () =>
      read()
        .then((c) => alive && (setChain(c), setFailed(false)))
        .catch(() => alive && setFailed(true))
    load()
    const t = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  type Cell = [string, number, number, string]
  const cells: Cell[] = chain
    ? [
        ['Work price index', chain.index, 4, `target ${num(chain.target, 4)}; the rule steers it back`],
        ['Last clearing price', chain.price, 3, 'CMN per work unit, the highest drawn ask'],
        ['Mined by verified work', chain.mined, 2, 'CMN, only from settled compute jobs'],
        ['Supply', chain.supply, 2, 'CMN; the program is the only mint authority'],
        ...(chain.jobs !== undefined ? [['Compute jobs posted', chain.jobs, 0, 'each drawn to at least three bonded providers'] as Cell] : []),
        ...(chain.treasury !== undefined ? [['Treasury', chain.treasury, 2, 'CMN collected as protocol fees'] as Cell] : []),
      ]
    : []

  return (
    <Box component="section" id="live" sx={{ bgcolor: tokens.ink, color: tokens.paper, py: { xs: 7, md: 9 } }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 1.5, md: 6 }, alignItems: 'end', mb: 4 }}>
          <Typography variant="h2" sx={{ maxWidth: '18ch', color: 'inherit' }}>
            Running on Solana devnet now.
          </Typography>
          <Typography sx={{ color: tokens.codeDim, maxWidth: '60ch' }}>
            These numbers are read from the Commons program as this page loads. Every job, payment, mined coin and index step is a transaction anyone can check on Solana Explorer.
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, borderTop: `3px solid ${tokens.signal}`, overflow: 'hidden', minHeight: 120 }}>
          {chain
            ? cells.map(([k, v, dp, note], i) => (
                <Box key={k} component={motion.div} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: i * 0.08 }} sx={{ py: { xs: 2.5, md: 3.5 }, pr: 2, borderBottom: `1px solid ${tokens.ink2}` }}>
                  <Typography variant="body2" sx={{ color: tokens.codeDim, fontWeight: 600 }}>
                    {k}
                  </Typography>
                  <Typography sx={{ fontWeight: 800, fontStretch: '80%', fontSize: { xs: 34, md: 56 }, lineHeight: 1.05, my: 0.5, fontVariantNumeric: 'tabular-nums', color: k === 'Work price index' ? tokens.signal : 'inherit' }}>
                    <Ticker value={v} dp={dp} />
                  </Typography>
                  <Typography variant="body2" sx={{ color: tokens.codeDim }}>
                    {note}
                  </Typography>
                </Box>
              ))
            : (
                <Typography sx={{ p: 3, color: tokens.codeDim, gridColumn: '1 / -1' }}>
                  {failed ? 'Could not reach Solana devnet just now. The program and its transactions are on Explorer below.' : 'Reading the chain…'}
                </Typography>
              )}
        </Box>

        <Typography variant="body2" sx={{ mt: 2.5, color: tokens.codeDim, '& a': { color: tokens.paper } }}>
          <Box component={motion.span} aria-hidden animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.8, repeat: Infinity }} sx={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', bgcolor: failed ? tokens.codeDim : '#4ade80', mr: 1, verticalAlign: 'middle' }} />
          {chain?.lastTx ? `Last program transaction ${ago(chain.lastTx)}. ` : ''}
          <Link href={explorer('address', PROGRAM_ID)} target="_blank" rel="noopener">
            Program on Explorer
          </Link>
          <Box component="span" sx={{ mx: 1.5 }} />
          <Link href={explorer('address', MINT_ADDR)} target="_blank" rel="noopener">
            CMN mint
          </Link>
          <Box component="span" sx={{ mx: 1.5 }} />
          Devnet CMN has no value.
        </Typography>
      </Container>
    </Box>
  )
}
