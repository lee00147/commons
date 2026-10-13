import { useMemo, useState, type ComponentType } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { Section, Prose } from '../components/Section'
import { useCycle } from '../components/Loop'
import { tokens } from '../theme'

const ease = [0.22, 1, 0.36, 1] as const
const fmt = (v: number, dp = 0) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

// ================================================================ the monetary rule

/** Step visuals: each one plays when its step becomes active. */
function Histogram() {
  const bars = [2, 4, 7, 12, 18, 24, 28, 25, 19, 13, 8, 5, 3, 2, 1]
  return (
    <Box sx={{ position: 'relative', height: 150, display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
      {bars.map((h, i) => (
        <motion.div
          key={i}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.5, delay: i * 0.035, ease }}
          style={{ flex: 1, height: `${(h / 28) * 100}%`, transformOrigin: 'bottom', background: i === 6 ? tokens.signal : 'rgba(75,86,103,0.35)' }}
        />
      ))}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} style={{ position: 'absolute', left: `${(6.5 / 15) * 100}%`, top: -6, transform: 'translateX(-50%)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
        median 0.0495
      </motion.div>
    </Box>
  )
}

function Formula() {
  return (
    <Box>
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease }}>
        <Typography sx={{ fontWeight: 800, fontStretch: '80%', fontSize: { xs: 40, md: 52 }, lineHeight: 1.1 }}>
          M<sup style={{ fontSize: '0.5em' }}>*</sup> = M · P<sup style={{ fontSize: '0.5em' }}>*</sup> ⁄ P
        </Typography>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.45 }}>
        <Typography sx={{ fontFamily: 'var(--mono)', fontSize: 14, mt: 2 }}>1,000,000 × 1.000 ÷ 0.990 = 1,010,101 CMN</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Work cost 1% fewer CMN than the target, so the economy is 10,101 CMN short.
        </Typography>
      </motion.div>
    </Box>
  )
}

function Release() {
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>
          Short by 10,101 CMN
        </Typography>
        <Box sx={{ position: 'relative', height: 26, bgcolor: 'rgba(75,86,103,0.15)', overflow: 'hidden' }}>
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 0.1 }} transition={{ duration: 0.9, delay: 0.2, ease }} style={{ position: 'absolute', inset: 0, transformOrigin: 'left', background: tokens.signal }} />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          Today: 10% of the gap, 1,010 CMN of new money (never more than 2% of circulating money).
        </Typography>
      </Box>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>
          Too much money instead
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Nothing is released. Protocol fees, which climb toward 30% while work is expensive, stay in the treasury and leave circulation.
        </Typography>
      </Box>
    </Box>
  )
}

function Split() {
  const years = [100, 50, 25, 12.5, 6.25, 3.13, 0]
  return (
    <Box sx={{ display: 'grid', gap: 0.9 }}>
      {years.map((m, i) => (
        <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '52px 1fr', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Year {i + 1}
          </Typography>
          <Box sx={{ display: 'flex', height: 14, overflow: 'hidden', bgcolor: tokens.ink }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${m}%` }} transition={{ duration: 0.6, delay: i * 0.07, ease }} style={{ background: tokens.signal }} />
          </Box>
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 2.5, mt: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2">
          <Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, bgcolor: tokens.signal, mr: 1, borderRadius: 0.5 }} />
          Mined by verified work
        </Typography>
        <Typography variant="body2">
          <Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, bgcolor: tokens.ink, mr: 1, borderRadius: 0.5 }} />
          To the treasury, then banks
        </Typography>
      </Box>
    </Box>
  )
}

const STEPS: { title: string; when: string; body: string; visual: ComponentType }[] = [
  {
    title: 'Measure',
    when: 'every settled job',
    body: 'Each job clears at the highest ask among its drawn providers. The day’s price of work is the work-weighted median of those clearing prices, kept in a 61-bucket histogram on chain. The index follows it by at most 1% a day, and the rule reads it within ±30% of the index, so one strange day cannot swing it.',
    visual: Histogram,
  },
  {
    title: 'Compare',
    when: 'once a day',
    body: 'If work costs more CMN than the target, there is too much money; if it costs fewer, too little. The rule computes the money stock that would bring the price back. An integral term removes a drift that lasts for days, instead of only shrinking it.',
    visual: Formula,
  },
  {
    title: 'Act',
    when: 'the same transaction',
    body: 'Short of money, the rule creates 10% of the gap that day, capped at 2% of circulating money. Long, it creates nothing and lets fees pile up in the treasury. It also pauses issuance while money is being hoarded, so parked coins cannot trigger new ones.',
    visual: Release,
  },
  {
    title: 'Release',
    when: 'daily, then each epoch',
    body: 'During the bootstrap, a share of new money is mined by that day’s verified work: 80% to the providers whose results agreed, 20% to the program’s developer, never more than 75% of what the buyer paid. The share halves every year; the rest goes to the treasury and out through banks.',
    visual: Split,
  },
]

// ---------------------------------------------------------------- simulator

type Scenario = 'surge' | 'slump' | 'cheaper'
const SCENARIOS: { id: Scenario; label: string; story: string }[] = [
  { id: 'surge', label: 'Demand doubles', story: 'Twice as much work is bought with the same money. With a fixed supply the price of work halves: CMN doubles in value overnight, a windfall for whoever holds it.' },
  { id: 'slump', label: 'Demand falls 40%', story: 'Buyers leave. With a fixed supply the same money chases less work and the price of work jumps two-thirds.' },
  { id: 'cheaper', label: 'Hardware gets 30% cheaper', story: 'Providers can do the same work for fewer CMN. A fixed supply lets CMN appreciate; the rule holds the price and turns the saving into new money for builders.' },
]

const DAYS = 240
const SHOCK = 30
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/** A simplified economy (prices move with the money stock, velocity fixed, target held at 1.000)
 *  run through the program's daily rule. */
function simulate(s: Scenario) {
  const rule: number[] = []
  const fixed: number[] = []
  let M = 1
  let I = 1
  let integral = 0
  let mult = 1
  let issued = 0
  let withheld = 0
  for (let d = 0; d < DAYS; d++) {
    const k = clamp((d - SHOCK) / 10, 0, 1)
    const Y = s === 'surge' ? 1 + k : s === 'slump' ? 1 - 0.4 * k : 1
    const c = s === 'cheaper' ? 1 - 0.3 * clamp((d - SHOCK) / 90, 0, 1) : 1
    const P = (c * M) / Y
    rule.push(P)
    fixed.push(c / Y)
    I = clamp(I + 0.1 * (P - I), I * 0.99, I * 1.01) // the index: at most 1% a day
    const read = clamp(P, I * 0.7, I * 1.3) // the rule reads within ±30% of the index
    integral = clamp(integral + (read - 1), -1, 1)
    let target = M / read // M* = M · P*/P
    target -= target * integral * 0.02
    if (read > 1.02) mult = Math.min(2, mult + 0.1)
    else if (read < 0.98) mult = Math.max(1 / 3, mult - 0.1)
    const gap = target - M
    if (gap > 0) {
      const add = Math.min(0.1 * gap, 0.02 * M)
      M += add
      issued += add
    } else {
      const fee = 0.15 * mult * M * (10 / 365) // fees stay in the treasury
      M -= fee
      withheld += fee
    }
  }
  let settled = DAYS - 1
  while (settled > SHOCK && Math.abs(rule[settled - 1] - 1) < 0.02) settled--
  const worst = Math.max(...rule.map((p) => Math.abs(p - 1)))
  return { rule, fixed, money: M, issued, withheld, settled, worst }
}

const CW = 760
const CH = 300
const Y_MIN = 0.4
const Y_MAX = 1.8
const x = (d: number) => (d / (DAYS - 1)) * CW
const y = (v: number) => CH - ((clamp(v, Y_MIN, Y_MAX) - Y_MIN) / (Y_MAX - Y_MIN)) * CH
const line = (vals: number[]) => vals.map((v, d) => `${d ? 'L' : 'M'}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

function Simulator() {
  const [s, setS] = useState<Scenario>('surge')
  const sim = useMemo(() => simulate(s), [s])
  const story = SCENARIOS.find((o) => o.id === s)!
  const stats: [string, string][] = [
    ['Back within 2% of target', s === 'cheaper' && sim.worst < 0.03 ? `never more than ${fmt(sim.worst * 100, 1)}% off` : `${sim.settled - SHOCK} days after the shock`],
    ['Money supply at the end', `×${fmt(sim.money, 2)}`],
    sim.issued > sim.withheld ? ['New CMN created', `+${fmt(sim.issued * 100)}% of starting supply`] : ['Held back in the treasury', `${fmt(sim.withheld * 100)}% of starting supply`],
  ]
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, mt: 8 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
        <Typography variant="h3">Watch the rule respond</Typography>
        <ToggleButtonGroup exclusive size="small" value={s} onChange={(_, v: Scenario | null) => v && setS(v)} sx={{ flexWrap: 'wrap' }}>
          {SCENARIOS.map((o) => (
            <ToggleButton key={o.id} value={o.id} sx={{ textTransform: 'none', fontWeight: 700, px: 1.75 }}>
              {o.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 260px' }, gap: { xs: 3, md: 4 } }}>
        <Box>
          <Box component="svg" viewBox={`-44 -10 ${CW + 54} ${CH + 40}`} role="img" aria-label={`Price of work over ${DAYS} days: ${story.label}`} sx={{ width: '100%', height: 'auto', display: 'block', color: 'text.secondary', overflow: 'visible' }}>
            {[0.5, 1, 1.5].map((v) => (
              <g key={v}>
                <line x1={0} x2={CW} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={v === 1 ? 0.5 : 0.15} strokeDasharray={v === 1 ? '5 6' : undefined} />
                <text x={-10} y={y(v) + 4} textAnchor="end" fontSize={13} fill="currentColor">
                  {v.toFixed(1)}
                </text>
              </g>
            ))}
            <line x1={x(SHOCK)} x2={x(SHOCK)} y1={0} y2={CH} stroke="currentColor" strokeOpacity={0.35} />
            <text x={x(SHOCK) + 6} y={14} fontSize={13} fill="currentColor">
              shock
            </text>
            {[0, 60, 120, 180, 239].map((d) => (
              <text key={d} x={x(d)} y={CH + 24} textAnchor="middle" fontSize={13} fill="currentColor">
                day {d + 1}
              </text>
            ))}
            <motion.path key={`f-${s}`} d={line(sim.fixed)} fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={2.5} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.2, ease: 'easeInOut' }} />
            <motion.path key={`r-${s}`} d={line(sim.rule)} fill="none" stroke={tokens.signal} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.2, ease: 'easeInOut' }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mt: 1.5 }}>
            <Typography variant="body2">
              <Box component="span" sx={{ display: 'inline-block', width: 18, height: 4, borderRadius: 2, bgcolor: tokens.signal, mr: 1, verticalAlign: 'middle' }} />
              Price of work with the rule
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <Box component="span" sx={{ display: 'inline-block', width: 18, borderTop: '2px solid currentColor', opacity: 0.7, mr: 1, verticalAlign: 'middle' }} />
              With a fixed supply
            </Typography>
          </Box>
        </Box>
        <Box>
          <AnimatePresence mode="wait">
            <motion.div key={s} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                {story.story}
              </Typography>
              <Box component="dl" sx={{ m: 0, display: 'grid', gap: 2 }}>
                {stats.map(([k, v]) => (
                  <Box key={k}>
                    <Typography component="dt" variant="body2" color="text.secondary">
                      {k}
                    </Typography>
                    <Typography component="dd" sx={{ m: 0, fontWeight: 800, fontSize: 20, lineHeight: 1.25, fontStretch: '85%' }}>
                      {v}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </motion.div>
          </AnimatePresence>
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3, maxWidth: '100ch' }}>
        A simplified model: prices move with the money stock, money changes hands ten times a year and the target is held at 1.000. The rule is the program’s: the index moves at most 1% a day,
        M* = M·P*/P with an integral term, 10% of the gap a day capped at 2% of money, and fees held in the treasury when money is long. The white paper’s simulations cover growth, crashes and
        market pumps over five and ten years.
      </Typography>
    </Paper>
  )
}

const BAND: [string, string, string][] = [
  ['Market price far above internal value', 'A speculative run-up', 'Releases more CMN, up to an extra 0.5% of circulating money a day'],
  ['Market price far below internal value', 'Undervalued outside', 'Halves releases and keeps CMN in the treasury'],
  ['Within ±10%', 'Normal', 'Follows internal value and real growth'],
]

export function MonetaryRule() {
  const { ref, step, setStep, setPaused, animated } = useCycle(STEPS.length, 6000)
  const active = STEPS[step]
  const Visual = active.visual
  return (
    <Section id="rule" tone="surface" title="The monetary rule." intro="Once a day the program reads what work actually cost and decides how much money should exist. No committee and no reserve: one formula, run on chain, that anyone can check.">
      <Box ref={ref} onMouseLeave={() => setPaused(false)} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, gap: { xs: 3, md: 5 }, alignItems: 'stretch' }}>
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1.25 }}>
          {STEPS.map((st, i) => (
            <Box
              component="li"
              key={st.title}
              onMouseEnter={() => {
                setPaused(true)
                setStep(i)
              }}
              onClick={() => {
                setPaused(true)
                setStep(i)
              }}
              sx={{ position: 'relative', cursor: 'pointer', py: 2, pl: 3, pr: 2, borderTop: 2, borderColor: 'text.primary', display: 'grid', gridTemplateColumns: '56px 1fr', gap: 1.5, alignItems: 'center' }}
            >
              {animated && i === step && (
                <motion.div layoutId="rule-active" aria-hidden style={{ position: 'absolute', left: 0, top: -2, bottom: 0, width: 8, background: tokens.signal, pointerEvents: 'none' }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} />
              )}
              <Typography sx={{ fontWeight: 800, fontStretch: '62%', fontSize: 52, lineHeight: 1, color: i === step ? 'text.primary' : 'text.disabled', transition: 'color .3s' }}>{i + 1}</Typography>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 18 }}>{st.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {st.when}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, minHeight: 330, overflow: 'hidden' }}>
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35, ease }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 3, md: 4 }, alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" sx={{ mb: 1.5 }}>
                    {active.title}
                  </Typography>
                  <Typography color="text.secondary">{active.body}</Typography>
                </Box>
                <Visual />
              </Box>
            </motion.div>
          </AnimatePresence>
        </Paper>
      </Box>

      <Simulator />

      <Box sx={{ mt: 8, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr' }, gap: { xs: 3, md: 6 }, alignItems: 'start' }}>
        <Box>
          <Typography variant="h3" sx={{ mb: 1.5 }}>
            Outside value: a band, not a peg
          </Typography>
          <Prose>
            The rule steers a composite of two measures: <Box component="strong" sx={{ whiteSpace: 'nowrap' }}>I = w · I<sub>work</sub> + (1 − w) · I<sub>market</sub></Box>. The market weight starts at 10% and grows to at most 25% as
            CMN’s own pools deepen; the market price is their seven-day average, so a short burst of trading cannot move it. In simulation, a 50% weight made internal value up to three times
            less steady for almost no gain.
          </Prose>
        </Box>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>What it means</TableCell>
                <TableCell>What the rule does</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {BAND.map(([a, b, c]) => (
                <TableRow key={a}>
                  <TableCell sx={{ fontWeight: 600 }}>{a}</TableCell>
                  <TableCell>{b}</TableCell>
                  <TableCell>{c}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Section>
  )
}

// ================================================================ banks

const LIFE: { title: string; body: string; fact: string }[] = [
  { title: 'Propose', body: 'Anyone who has used the network names one to five operators and how many must sign each grant.', fact: '10 CMN fee, 100 CMN deposit' },
  { title: 'Open', body: 'At least five users endorse it, together holding 10% of active weight, within two epochs. Otherwise it expires and the deposit comes back.', fact: 'at most 12 banks open' },
  { title: 'Receive', body: 'Each epoch users vote how the treasury’s release is split between banks. A new bank gets at most 20% for its first four epochs.', fact: 'release split by vote' },
  { title: 'Sponsor', body: 'Builders apply; a grant needs the operators’ threshold, is paid at once and recorded on chain with its purpose. Operators cannot grant to themselves.', fact: '≤30% of funds per grant' },
  { title: 'Earn', body: 'Operators get 3% of what the bank receives, vesting over four epochs, and 1% of the fees each sponsored project generates for two years.', fact: '3% vesting + 1% success' },
  { title: 'Keep or close', body: 'Once a year users vote on every bank. If more weight votes to close, its funds, deposit and unvested rewards return to the treasury.', fact: 'yearly continuity vote' },
]

const card: Variants = { hidden: { opacity: 0, y: 24 }, shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }
const cards: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.1 } } }

/** Treasury → banks → builders → apps and jobs → fees → treasury, with money moving round. */
function FlowDiagram() {
  const reduce = useReducedMotion()
  const nodes: [string, string, number, number][] = [
    ['Treasury', 'fees, listings, bank charters', 90, 70],
    ['Banks', 'chosen and kept by users’ votes', 470, 70],
    ['Builders', 'paid grants, on chain', 470, 250],
    ['Apps and jobs', 'used and paid for in CMN', 90, 250],
  ]
  const loop = 'M 200 70 L 360 70 M 470 112 L 470 208 M 360 250 L 200 250 M 90 208 L 90 112'
  const ring = 'M 200 70 L 360 70 Q 470 70 470 112 L 470 208 Q 470 250 360 250 L 200 250 Q 90 250 90 208 L 90 112 Q 90 70 200 70 Z'
  return (
    <Box component="svg" viewBox="-30 20 620 290" role="img" aria-label="Money flows from the treasury to banks, to builders, to apps and jobs, and back to the treasury as fees" sx={{ width: '100%', height: 'auto', display: 'block', color: 'text.primary' }}>
      <path d={loop} stroke="currentColor" strokeOpacity={0.25} strokeWidth={2} fill="none" />
      {!reduce &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <circle key={i} r={6} fill={tokens.signal}>
            <animateMotion dur="9s" repeatCount="indefinite" begin={`${-i * 1.5}s`} path={ring} />
          </circle>
        ))}
      {nodes.map(([t, sub, cx, cy]) => (
        <g key={t}>
          <rect x={cx - 105} y={cy - 38} width={210} height={76} rx={0} style={{ fill: 'var(--mui-palette-background-paper)' }} stroke="currentColor" strokeOpacity={0.9} strokeWidth={2} />
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize={17} fontWeight={800} fill="currentColor">
            {t}
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize={12.5} fill="currentColor" fillOpacity={0.65}>
            {sub}
          </text>
        </g>
      ))}
      {(
        [
          ['epoch release', 280, 58],
          ['grants', 492, 164],
          ['programs and apps', 280, 274],
          ['5–30% protocol fee', 112, 164],
        ] as [string, number, number][]
      ).map(([t, tx, ty]) => (
        <text key={t} x={tx} y={ty} textAnchor={tx === 492 || tx === 112 ? 'start' : 'middle'} fontSize={12.5} fontWeight={600} fill="currentColor" fillOpacity={0.75}>
          {t}
        </text>
      ))}
    </Box>
  )
}

const bar: Variants = {
  hidden: { scaleX: 0 },
  shown: (w: number) => ({ scaleX: w, transition: { duration: 0.9, ease } }),
}
const bars: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.18, delayChildren: 0.2 } } }

function Weight() {
  return (
    <Box component={motion.div} variants={bars} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.4 }} sx={{ display: 'grid', gap: 2 }}>
      {(
        [
          ['Holds 1,000,000 CMN, pays no fees', 0, 'no say'],
          ['Paid 40 CMN in fees this quarter', 40, '40'],
          ['Paid 100 CMN, split across 10 wallets', 100, '100, same as one wallet'],
        ] as [string, number, string][]
      ).map(([who, w, label]) => (
        <Box key={who}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2">{who}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
              {label}
            </Typography>
          </Box>
          <Box sx={{ height: 10, mt: 0.75, bgcolor: 'rgba(75,86,103,0.15)', overflow: 'hidden' }}>
            <motion.div variants={bar} custom={w / 100} style={{ height: '100%', background: tokens.signal, transformOrigin: 'left' }} />
          </Box>
        </Box>
      ))}
    </Box>
  )
}

export function Banks() {
  return (
    <Section
      id="banks"
      title="Banks that fund builders, and never lend."
      intro="The rule decides how much money there is; banks decide where it goes. None exists at genesis. Users found them, steer them with votes and can close them, and their operators earn the most by funding what people actually use."
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, gap: { xs: 4, md: 6 }, alignItems: 'center' }}>
        <FlowDiagram />
        <Box>
          <Typography variant="h3" sx={{ mb: 1.5 }}>
            Who has a say
          </Typography>
          <Prose>
            A user’s weight is the protocol fees they paid into the treasury over the last 90 days. It is linear, so splitting activity across wallets gains nothing, and buying weight costs exactly
            what it buys: CMN paid to the treasury, which funds builders. No address holds more than 5% of the total. Holding coins gives no influence.
          </Prose>
          <Box sx={{ mt: 3 }}>
            <Weight />
          </Box>
        </Box>
      </Box>

      <Typography variant="h3" sx={{ mt: 8, mb: 3 }}>
        A bank’s life, all on chain
      </Typography>
      <Box component={motion.ol} variants={cards} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.15 }} sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
        {LIFE.map((l, i) => (
          <Paper component={motion.li} variants={card} key={l.title} variant="outlined" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
              <Typography sx={{ fontWeight: 800, fontStretch: '62%', fontSize: 48, lineHeight: 1 }}>{i + 1}</Typography>
              <Typography variant="h3">{l.title}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {l.body}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 800, pt: 1, borderTop: 1, borderColor: 'divider' }}>
              {l.fact}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Section>
  )
}
