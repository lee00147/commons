import { useEffect, useRef, useState } from 'react'
import { animate, useInView, useReducedMotion } from 'motion/react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { tokens } from '../theme'

// ---------------------------------------------------------------- posted rates

const RATES: { n: number; dp: number; pre?: string; unit: string; what: string; why: string }[] = [
  { n: 20, dp: 0, unit: ' work units', what: 'of metered computation: 20 billion WebAssembly instructions', why: 'Providers drawn by the chain run each job; it settles only when their results and instruction counts agree.' },
  { n: 0.2, dp: 1, unit: ' listings', what: 'of an app in the Store', why: 'Publishing a version costs 5 CMN at the starting price, paid to the treasury.' },
  { n: 10, dp: 0, unit: '% of a charter', what: 'for a new bank', why: 'Founding a bank costs a 10 CMN fee plus a 100 CMN deposit returned unless users vote it out.' },
]

/** Counts up to `to` the first time it scrolls into view. */
function Count({ to, dp }: { to: number; dp: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()
  const [v, setV] = useState(reduce ? to : 0)
  useEffect(() => {
    if (!inView || reduce) return
    const c = animate(0, to, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: setV })
    return () => c.stop()
  }, [inView, reduce, to])
  return <span ref={ref}>{(reduce ? to : v).toFixed(dp)}</span>
}

export function Rates() {
  return (
    <Box component="section" id="rates" sx={{ bgcolor: tokens.signal, color: tokens.signalInk, py: { xs: 8, md: 10 } }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 2, md: 6 }, alignItems: 'end' }}>
          <Typography variant="h2" sx={{ maxWidth: '18ch' }}>
            CMN is measured in work.
          </Typography>
          <Typography sx={{ opacity: 0.8, maxWidth: '60ch' }}>
            Prices on the network are set by one work price index, measured from what compute jobs actually clear at. The rule keeps that index at 1.000, so what 1 CMN buys stays the same as
            the network grows, slumps or attracts speculators, apart from a rise with real output of at most 25% a year.
          </Typography>
        </Box>
        <Box sx={{ mt: 5, border: `3px solid ${tokens.signalInk}`, borderRadius: 0, bgcolor: 'color-mix(in srgb, #f2c230 70%, #fff)', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, px: 3, py: 1.75, borderBottom: `3px solid ${tokens.signalInk}`, fontWeight: 700, fontStretch: '112%' }}>
            <span>Posted rates at index 1.000 — 1 CMN buys</span>
            <span>set by the protocol, not by any operator</span>
          </Box>
          {RATES.map((r, i) => (
            <Box key={i} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1.4fr 1fr' }, gap: { xs: 0.5, md: 2.5 }, alignItems: 'baseline', px: 3, py: 2.25, borderBottom: i < RATES.length - 1 ? '1.5px solid rgba(26,20,5,0.3)' : 0 }}>
              <Typography sx={{ fontWeight: 800, fontStretch: '75%', fontSize: 'clamp(30px, 4vw, 46px)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                <Count to={r.n} dp={r.dp} />
                {r.unit}
              </Typography>
              <Typography sx={{ fontWeight: 600, fontSize: 17 }}>{r.what}</Typography>
              <Typography variant="body2" sx={{ opacity: 0.75 }}>
                {r.why}
              </Typography>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  )
}
