import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'

export function Section({ id, title, intro, children, tone = 'plain' }: { id: string; title: string; intro?: ReactNode; children: ReactNode; tone?: 'plain' | 'surface' }) {
  return (
    <Box component="section" id={id} sx={{ py: { xs: 8, md: 11 }, borderTop: 1, borderColor: 'divider', bgcolor: tone === 'surface' ? 'background.paper' : 'transparent', scrollMarginTop: 64 }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 1.5, md: 6 }, alignItems: 'end', mb: { xs: 4, md: 5 } }}>
          <Typography variant="h2" sx={{ maxWidth: '20ch' }}>
            {title}
          </Typography>
          {intro && (
            <Typography color="text.secondary" sx={{ maxWidth: '62ch' }}>
              {intro}
            </Typography>
          )}
        </Box>
        {children}
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
