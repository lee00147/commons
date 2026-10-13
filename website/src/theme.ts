import { createTheme } from '@mui/material/styles'

// Public-works signage: fog paper, slate ink, signal yellow for posted rates.
export const tokens = {
  paper: '#edf0f2',
  surface: '#ffffff',
  ink: '#16233b',
  ink2: '#4b5667',
  rule: '#cfd5dd',
  signal: '#f2c230',
  signalInk: '#1a1405',
  cobalt: '#2346d9',
  code: '#16233b',
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
        primary: { main: tokens.ink, contrastText: '#ffffff' },
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
  shape: { borderRadius: 2 },
  typography: {
    fontFamily: display,
    h1: { fontWeight: 800, fontStretch: '125%', fontSize: 'clamp(3.1rem, 9.4vw, 8.75rem)', lineHeight: 0.86, letterSpacing: '-0.045em' },
    h2: { fontWeight: 800, fontStretch: '122%', fontSize: 'clamp(2.25rem, 5.4vw, 4.6rem)', lineHeight: 0.92, letterSpacing: '-0.035em' },
    h3: { fontWeight: 800, fontStretch: '112%', fontSize: '1.3rem', lineHeight: 1.25, letterSpacing: '-0.01em' },
    h4: { fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.35 },
    body1: { fontSize: '1.0625rem', lineHeight: 1.6 },
    body2: { fontSize: '0.92rem', lineHeight: 1.6 },
    button: { textTransform: 'none', fontWeight: 800, letterSpacing: 0 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 0, paddingInline: 22, minHeight: 50, fontSize: 16 },
        sizeSmall: { minHeight: 38, paddingInline: 14, fontSize: 14 },
        outlined: { borderWidth: 2, borderColor: 'currentColor', '&:hover': { borderWidth: 2 } },
      },
    },
    // Panels are plates: square, no shadow, marked by a heavy rule along the top.
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        outlined: { borderRadius: 0, border: 'none', borderTop: '3px solid var(--mui-palette-text-primary)', backgroundColor: 'var(--mui-palette-background-paper)' },
      },
    },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 800, color: 'var(--mui-palette-text-primary)', whiteSpace: 'nowrap' } } },
    MuiToggleButton: { styleOverrides: { root: { borderRadius: 0, fontWeight: 700 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 40 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
  },
})
