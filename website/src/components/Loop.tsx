import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { tokens } from '../theme'

/** Steps through 0…n-1 while `ref` is on screen; stays at 0 when motion is reduced. */
export function useCycle(n: number, ms: number) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.4 })
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (!inView || reduce || paused) return
    const t = setInterval(() => setStep((s) => (s + 1) % n), ms)
    return () => clearInterval(t)
  }, [inView, reduce, paused, n, ms])
  return { ref, step, setStep, setPaused, animated: !reduce }
}

export const LOOP_NODES: [string, string][] = [
  ['People and agents', 'pay CMN for work and apps'],
  ['The monetary rule', 'reads the price of work'],
  ['Mining, then treasury', 'releases new money'],
  ['Banks and builders', 'fund and ship programs'],
]

const ARROWS = ['clearing prices', 'new money when short', 'grants, by users’ vote', 'more programs, more use']

const W = 250
const H = 66
const POS = [
  { x: 30, y: 26 },
  { x: 440, y: 26 },
  { x: 440, y: 206 },
  { x: 30, y: 206 },
]
const centre = (i: number) => ({ x: POS[i].x + W / 2, y: POS[i].y + H / 2 })

/** The Commons growth loop, with a marker that travels from stage to stage. */
export function LoopDiagram() {
  const { ref, step } = useCycle(4, 2400)
  const c = centre(step)
  const ink = 'var(--mui-palette-text-primary)'
  const dim = 'var(--mui-palette-text-secondary)'
  return (
    <Box ref={ref} sx={{ my: 4, p: { xs: 1.5, md: 2.5 }, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', overflowX: 'auto' }}>
      <Box
        component="svg"
        viewBox="0 0 720 300"
        role="img"
        aria-label="The Commons loop: people pay CMN for work and apps; the monetary rule reads the price of work; mining and then the treasury release new money; banks fund builders, whose programs bring more use."
        sx={{ display: 'block', width: '100%', minWidth: 560, height: 'auto', fontFamily: 'inherit' }}
      >
        <defs>
          <marker id="loop-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={dim} />
          </marker>
        </defs>
        {/* edges */}
        <line x1={POS[0].x + W + 4} y1={centre(0).y} x2={POS[1].x - 6} y2={centre(1).y} stroke={dim} strokeWidth={1.5} markerEnd="url(#loop-arrow)" />
        <line x1={centre(1).x} y1={POS[1].y + H + 4} x2={centre(2).x} y2={POS[2].y - 6} stroke={dim} strokeWidth={1.5} markerEnd="url(#loop-arrow)" />
        <line x1={POS[2].x - 4} y1={centre(2).y} x2={POS[3].x + W + 6} y2={centre(3).y} stroke={dim} strokeWidth={1.5} markerEnd="url(#loop-arrow)" />
        <line x1={centre(3).x} y1={POS[3].y - 4} x2={centre(0).x} y2={POS[0].y + H + 6} stroke={dim} strokeWidth={1.5} markerEnd="url(#loop-arrow)" />
        <text x={360} y={centre(0).y - 10} textAnchor="middle" fontSize={12.5} fill={dim}>{ARROWS[0]}</text>
        <text x={centre(1).x + 12} y={152} fontSize={12.5} fill={dim}>{ARROWS[1]}</text>
        <text x={360} y={centre(2).y - 10} textAnchor="middle" fontSize={12.5} fill={dim}>{ARROWS[2]}</text>
        <text x={centre(3).x - 12} y={152} textAnchor="end" fontSize={12.5} fill={dim}>{ARROWS[3]}</text>
        {/* nodes */}
        {LOOP_NODES.map(([t, s], i) => {
          const on = i === step
          return (
            <g key={t}>
              <motion.rect
                x={POS[i].x}
                y={POS[i].y}
                width={W}
                height={H}
                rx={12}
                stroke={ink}
                strokeWidth={1.5}
                initial={false}
                animate={{ fill: on ? tokens.signal : 'rgba(0,0,0,0)' }}
                transition={{ duration: 0.45 }}
              />
              <text x={POS[i].x + W / 2} y={POS[i].y + 29} textAnchor="middle" fontWeight={700} fontSize={15.5} fill={on ? tokens.signalInk : ink}>
                {t}
              </text>
              <text x={POS[i].x + W / 2} y={POS[i].y + 48} textAnchor="middle" fontSize={12.5} fill={on ? tokens.signalInk : dim}>
                {s}
              </text>
            </g>
          )
        })}
        {/* the coin travelling round the loop */}
        <motion.circle r={7} fill={tokens.signalInk} stroke={tokens.signal} strokeWidth={3} initial={false} animate={{ cx: c.x, cy: POS[step].y }} transition={{ type: 'spring', stiffness: 70, damping: 16 }} />
      </Box>
    </Box>
  )
}
