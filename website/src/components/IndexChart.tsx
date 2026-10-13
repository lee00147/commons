import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { motion } from 'motion/react'
import { tokens } from '../theme'

// An illustration of the idea, not market data: a token priced by attention swings,
// while CMN's work price index is steered back to 1.000 every day.
function series(N: number, seed: number, vol: number, pull: number) {
  let s = seed
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5
  const out: number[] = []
  let v = 1
  for (let i = 0; i < N; i++) {
    v += rnd() * vol - (v - 1) * pull
    out.push(v)
  }
  const drift = (out[N - 1] - out[0]) / (N - 1)
  return out.map((y, i) => y - drift * i) // ends where it starts, so the scroll loops seamlessly
}

type Scale = (v: number) => number

function path(values: number[], y: Scale, W: number) {
  const N = values.length
  return [...values, ...values].map((v, i) => `${i ? 'L' : 'M'}${((i * W) / N).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
}

/** `onSignal`: drawn in ink on the yellow hero, wide and short. */
export function IndexChart({ onSignal = false }: { onSignal?: boolean }) {
  const W = onSignal ? 1100 : 520
  const H = onSignal ? 210 : 190
  const N = onSignal ? 120 : 60
  const lineColor = onSignal ? tokens.ink : tokens.signal
  const { hype, cmn, one } = useMemo(() => {
    const h = series(N, 7, 0.24, 0.04)
    const c = series(N, 11, 0.014, 0.3)
    const lo = Math.min(...h, ...c, 1)
    const hi = Math.max(...h, ...c, 1)
    const y: Scale = (v) => 14 + ((hi - v) / (hi - lo)) * (H - 28) // fill the height
    return { hype: path(h, y, W), cmn: path(c, y, W), one: y(1) }
  }, [N, W, H])
  return (
    <Box>
      <Box component="svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Illustration: a speculative token's price swings while CMN's work price index stays near 1.000" sx={{ width: '100%', height: 'auto', display: 'block', color: onSignal ? tokens.ink : 'text.secondary' }}>
        <defs>
          <clipPath id="index-chart-clip">
            <motion.rect x={0} y={0} width={W} height={H} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }} transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }} />
          </clipPath>
        </defs>
        <line x1={0} x2={W} y1={one} y2={one} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="4 6" />
        <text x={W - 4} y={one - 8} textAnchor="end" fontSize={onSignal ? 15 : 12} fontWeight={700} fill="currentColor">
          1.000
        </text>
        <g clipPath="url(#index-chart-clip)">
          <motion.g animate={{ x: [0, -W] }} transition={{ duration: onSignal ? 34 : 16, ease: 'linear', repeat: Infinity }}>
            <path d={hype} fill="none" stroke="currentColor" strokeOpacity={onSignal ? 0.4 : 0.5} strokeWidth={2} strokeLinejoin="round" />
            <path d={cmn} fill="none" stroke={lineColor} strokeWidth={onSignal ? 5 : 4} strokeLinecap="round" strokeLinejoin="round" />
          </motion.g>
        </g>
      </Box>
      <Stack direction="row" spacing={2.5} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 22, height: 5, bgcolor: lineColor }} />
          <Typography variant="body2">CMN’s work price index, steered to 1.000</Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 22, height: 2, bgcolor: onSignal ? tokens.ink : 'text.secondary', opacity: 0.5 }} />
          <Typography variant="body2" sx={{ opacity: onSignal ? 0.75 : 1 }} color={onSignal ? 'inherit' : 'text.secondary'}>
            A token priced by attention
          </Typography>
        </Stack>
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.7 }}>
        Illustration, not market data.
      </Typography>
    </Box>
  )
}
