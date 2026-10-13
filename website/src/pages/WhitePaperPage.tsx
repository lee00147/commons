import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Button from '@mui/material/Button'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import { motion, useScroll, useSpring } from 'motion/react'
import md from '../content/whitepaper.md?raw'
import { Blocks, parse } from '../components/Markdown'
import { LoopDiagram } from '../components/Loop'
import { Header, Footer } from '../sections/Site'
import { tokens } from '../theme'

const BLOCKS = parse(md)
const CHAPTERS = BLOCKS.flatMap((b) => (b.t === 'h' && b.level === 2 ? [{ id: b.id, text: b.text }] : []))

/** Which chapter heading the reader has most recently scrolled past. */
function useActiveChapter(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(
      () => {
        const passed = els.filter((e) => e.getBoundingClientRect().top < 140)
        setActive((passed.at(-1) ?? els[0])?.id)
      },
      { rootMargin: '-120px 0px -60% 0px', threshold: [0, 1] },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [ids])
  return active
}

export default function WhitePaperPage() {
  const ids = useMemo(() => CHAPTERS.map((c) => c.id), [])
  const active = useActiveChapter(ids)
  // The article renders after the browser looked for #anchor, so jump to it once it exists.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'instant' })
  }, [])
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 })

  return (
    <>
      <motion.div aria-hidden style={{ scaleX: progress, transformOrigin: '0 50%', position: 'fixed', top: 0, left: 0, right: 0, height: 4, background: tokens.signal, zIndex: 1200 }} />
      <Header />
      <Box component="main" sx={{ pb: 10 }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '230px minmax(0, 1fr)' }, gap: { xs: 0, md: 8 } }}>
            <Box component="nav" aria-label="Chapters" sx={{ display: { xs: 'none', md: 'block' } }}>
              <Box sx={{ position: 'sticky', top: 92, pt: 7, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Contents
                </Typography>
                <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.25 }}>
                  {CHAPTERS.map((c) => {
                    const on = c.id === active
                    return (
                      <li key={c.id}>
                        <Link
                          href={`#${c.id}`}
                          underline="none"
                          aria-current={on ? 'location' : undefined}
                          sx={{ position: 'relative', display: 'block', py: 0.6, pl: 1.75, fontSize: 14, lineHeight: 1.35, color: on ? 'text.primary' : 'text.secondary', fontWeight: on ? 700 : 400, '&:hover': { color: 'text.primary' } }}
                        >
                          {on && <motion.span layoutId="toc-mark" style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: 2, background: tokens.signal }} transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
                          {c.text}
                        </Link>
                      </li>
                    )
                  })}
                </Box>
              </Box>
            </Box>

            <Box component="article" sx={{ maxWidth: '70ch', pt: { xs: 5, md: 7 }, '& p, & li': { fontSize: '1.05rem', lineHeight: 1.72 }, '& strong': { fontWeight: 700 }, '& code': { fontFamily: 'var(--mono)', fontSize: '0.88em' }, '& > h2:first-of-type': { mt: 6 } }}>
              <Button href="/" size="small" startIcon={<ArrowBackRounded />} sx={{ ml: -1.5, mb: 3, color: 'text.secondary' }}>
                Commons
              </Button>
              <Typography variant="h1" component="h1" sx={{ fontSize: 'clamp(2.4rem, 5.5vw, 3.9rem)' }}>
                Commons White Paper
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 2, mb: 1 }}>
                CMN, a currency measured in work. Version 1, October 2026.
              </Typography>
              <Blocks blocks={BLOCKS} slots={{ DIAGRAM: <LoopDiagram /> }} />
            </Box>
          </Box>
        </Container>
      </Box>
      <Footer />
    </>
  )
}
