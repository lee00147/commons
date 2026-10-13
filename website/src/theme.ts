import { createTheme } from '@mui/material/styles'

// Public-works signage: fog paper, slate ink, signal yellow for posted rates.
export const tokens = {
  paper: '#edf0f2',
  surface: '#ffffff',
  ink: '#101a2b',
  ink2: '#4b5667',
  rule: '#c9d0d8',
  signal: '#f2c230',
  signalInk: '#1a1405',
  cobalt: '#2346d9',
  code: '#101a2b',
  codeInk: '#e3e8ef',
  codeDim: '#8796ab',
  codeKey: '#f2c230',
  codeStr: '#9fd8b5',
  codeNum: '#a9b8ff',
}

const display = '"Archivo", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

export const theme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: {
      palette: {
        primary: { main: tokens.ink, contrastText: tokens.paper },
        secondary: { main: tokens.signal, contrastText: tokens.signalInk },
        info: { main: tokens.cobalt },
        background: { default: tokens.paper, paper: tokens.surface },
        text: { primary: tokens.ink, secondary: tokens.ink2 },
        divider: tokens.rule,
      },
    },
    dark: {
      palette: {
        primary: { main: '#e7ecf2', contrastText: '#0f1622' },
        secondary: { main: tokens.signal, contrastText: tokens.signalInk },
        info: { main: '#8aa2ff' },
        background: { default: '#0f1622', paper: '#162030' },
        text: { primary: '#e7ecf2', secondary: '#9aa6b5' },
        divider: '#263245',
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: display,
    h1: { fontWeight: 800, fontStretch: '118%', fontSize: 'clamp(2.5rem, 6.2vw, 4.75rem)', lineHeight: 0.98, letterSpacing: '-0.025em' },
    h2: { fontWeight: 800, fontStretch: '112%', fontSize: 'clamp(1.75rem, 3.3vw, 2.5rem)', lineHeight: 1.08, letterSpacing: '-0.015em' },
    h3: { fontWeight: 700, fontSize: '1.2rem', lineHeight: 1.3 },
    h4: { fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.35 },
    body1: { fontSize: '1rem', lineHeight: 1.6 },
    body2: { fontSize: '0.92rem', lineHeight: 1.6 },
    button: { textTransform: 'none', fontWeight: 700, letterSpacing: 0 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 8, paddingInline: 18, minHeight: 44 }, outlined: { borderWidth: 2, '&:hover': { borderWidth: 2 } } },
    },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { outlined: { borderColor: 'var(--mui-palette-divider)' } } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 600, color: 'var(--mui-palette-text-secondary)', whiteSpace: 'nowrap' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 40 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
  },
})
