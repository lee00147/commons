import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { motion, type Variants } from 'motion/react'

const reveal: Variants = {
  hidden: { opacity: 0, y: 28 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
}
const group: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.12 } } }
const draw: Variants = { hidden: { scaleX: 0 }, shown: { scaleX: 1, transition: { duration: 0.8, ease: [0.65, 0, 0.35, 1] } } }

/** A page section: a large heading, the intro set off to the right, then the body. Each part rises into place the first time it scrolls into view. */
export function Section({ id, title, intro, children, tone = 'plain' }: { id: string; title: string; intro?: ReactNode; children: ReactNode; tone?: 'plain' | 'surface' }) {
  return (
    <Box component="section" id={id} sx={{ py: { xs: 9, md: 14 }, bgcolor: tone === 'surface' ? 'background.paper' : 'transparent', scrollMarginTop: 64 }}>
      <Container maxWidth="lg">
        <Box component={motion.div} variants={group} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.3 }} sx={{ mb: { xs: 5, md: 8 } }}>
          <Box component={motion.div} variants={draw} aria-hidden sx={{ height: 3, bgcolor: 'text.primary', transformOrigin: 'left', mb: { xs: 4, md: 5 } }} />
          <Typography component={motion.h2} variants={reveal} variant="h2" sx={{ maxWidth: '15ch' }}>
            {title}
          </Typography>
          {intro && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mt: { xs: 2.5, md: 3.5 } }}>
              <Typography component={motion.p} variants={reveal} color="text.secondary" sx={{ gridColumn: { md: 2 }, fontSize: { md: 19 }, maxWidth: '52ch', m: 0 }}>
                {intro}
              </Typography>
            </Box>
          )}
        </Box>
        <motion.div variants={reveal} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.12 }}>
          {children}
        </motion.div>
      </Container>
    </Box>
  )
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <Typography color="text.secondary" sx={{ maxWidth: '64ch', '& strong': { color: 'text.primary' }, '& code': { fontFamily: 'var(--mono)', fontSize: '0.88em' } }}>
      {children}
    </Typography>
  )
}
