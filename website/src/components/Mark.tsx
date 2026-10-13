import Box from '@mui/material/Box'

/** The Commons mark: a circled plus. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" sx={{ width: size, height: size, flex: 'none' }} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M7 12h10M12 7v10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </Box>
  )
}
