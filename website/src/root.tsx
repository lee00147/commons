import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import GlobalStyles from '@mui/material/GlobalStyles'
import { ThemeProvider } from '@mui/material/styles'
import { MotionConfig } from 'motion/react'
import { theme } from './theme'
import './index.css'

/** Mounts a page with the site's theme. Motion follows the visitor's reduced-motion setting. */
export function mount(page: ReactNode) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider theme={theme} defaultMode="system">
        <CssBaseline enableColorScheme />
        <GlobalStyles
          styles={{
            ':root': { '--mono': '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
            html: { scrollBehavior: 'smooth' },
            code: { fontFamily: 'var(--mono)', fontSize: '0.9em' },
            '@media (prefers-reduced-motion: reduce)': { html: { scrollBehavior: 'auto' } },
          }}
        />
        <MotionConfig reducedMotion="user">{page}</MotionConfig>
      </ThemeProvider>
    </StrictMode>,
  )
}
