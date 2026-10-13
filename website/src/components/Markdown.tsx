import { Fragment, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Divider from '@mui/material/Divider'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'

// A small Markdown reader for the white paper: headings, paragraphs, lists,
// tables, rules, display math ($$…$$) and block placeholders ([[NAME]]).

export type Block =
  | { t: 'h'; level: number; text: string; id: string }
  | { t: 'p'; text: string }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'hr' }
  | { t: 'math'; tex: string }
  | { t: 'slot'; name: string }

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

export function parse(src: string): Block[] {
  const lines = src.replace(/\r/g, '').split('\n')
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const s = line.trim()
    if (!s) {
      i++
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = s.match(/^(#{1,4})\s+(.*)$/))) {
      out.push({ t: 'h', level: m[1].length, text: m[2], id: slug(m[2]) })
      i++
    } else if (/^(-{3,}|\*{3,})$/.test(s)) {
      out.push({ t: 'hr' })
      i++
    } else if ((m = s.match(/^\$\$(.+)\$\$$/))) {
      out.push({ t: 'math', tex: m[1] })
      i++
    } else if ((m = s.match(/^\[\[([A-Z_]+)\]\]$/))) {
      out.push({ t: 'slot', name: m[1] })
      i++
    } else if (s.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const r = lines[i].trim()
        if (!/^\|[\s:|-]+\|$/.test(r)) rows.push(cells(r))
        i++
      }
      out.push({ t: 'table', head: rows[0] ?? [], rows: rows.slice(1) })
    } else if (/^[-*]\s+/.test(s) || /^\d+\.\s+/.test(s)) {
      const ordered = /^\d+\./.test(s)
      const items: string[] = []
      const re = ordered ? /^\d+\.\s+/ : /^[-*]\s+/
      while (i < lines.length && re.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(re, ''))
        i++
      }
      out.push({ t: ordered ? 'ol' : 'ul', items })
    } else {
      const para: string[] = []
      while (i < lines.length && lines[i].trim() && !/^(#|\||[-*]\s|\d+\.\s|\$\$|\[\[|-{3,})/.test(lines[i].trim())) {
        para.push(lines[i].trim())
        i++
      }
      if (!para.length) {
        para.push(s)
        i++
      }
      out.push({ t: 'p', text: para.join(' ') })
    }
  }
  return out
}

// ------------------------------------------------------------------ inline

export function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g)
  return (
    <>
      {parts.map((p, k) => {
        if (!p) return null
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={k}><Inline text={p.slice(2, -2)} /></strong>
        if (p.startsWith('`')) return <code key={k}>{p.slice(1, -1)}</code>
        const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link) {
          const external = /^https?:/.test(link[2])
          return (
            <Link key={k} href={link[2]} {...(external ? { target: '_blank', rel: 'noopener' } : {})}>
              {link[1]}
            </Link>
          )
        }
        return <Fragment key={k}>{p.replace(/\\\*/g, '*')}</Fragment>
      })}
    </>
  )
}

// ------------------------------------------------------------------ math

// Enough TeX for the paper's formulas: \frac, ^, _, \text, \cdot.
function tex(src: string): ReactNode[] {
  let i = 0
  let key = 0
  const group = (): string => {
    while (src[i] === ' ') i++
    if (src[i] !== '{') return src[i++] ?? ''
    let depth = 0
    const start = ++i
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') {
        if (depth === 0) break
        depth--
      }
    }
    return src.slice(start, i++)
  }
  const out: ReactNode[] = []
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      const cmd = src.slice(i + 1).match(/^[a-zA-Z]+/)?.[0] ?? ''
      i += cmd.length + 1
      if (cmd === 'frac') {
        const a = group()
        const b = group()
        out.push(
          <Box key={key++} component="span" sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', mx: 0.5, lineHeight: 1.15 }}>
            <Box component="span" sx={{ px: 0.5, borderBottom: '1.5px solid currentColor' }}>{tex(a)}</Box>
            <Box component="span" sx={{ px: 0.5 }}>{tex(b)}</Box>
          </Box>,
        )
      } else if (cmd === 'text') out.push(<Box key={key++} component="span" sx={{ fontStyle: 'normal' }}>{group()}</Box>)
      else if (cmd === 'cdot') out.push(<Fragment key={key++}>{' · '}</Fragment>)
      else out.push(<Fragment key={key++}>{cmd}</Fragment>)
    } else if (c === '^' || c === '_') {
      i++
      const g = group()
      out.push(c === '^' ? <sup key={key++}>{tex(g)}</sup> : <sub key={key++}>{tex(g)}</sub>)
    } else if (c === '=' || c === '+' || c === '-') {
      i++
      out.push(<Fragment key={key++}>{` ${c === '-' ? '−' : c} `}</Fragment>)
    } else if (c === ' ') i++
    else if (/[a-zA-Z]/.test(c)) {
      i++
      out.push(<i key={key++}>{c}</i>)
    } else {
      i++
      out.push(<Fragment key={key++}>{c}</Fragment>)
    }
  }
  return out
}

export function Formula({ src }: { src: string }) {
  return (
    <Box
      role="math"
      aria-label={src}
      sx={{ my: 3, py: 2.5, px: 2, textAlign: 'center', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', fontSize: 'clamp(1.15rem, 2.4vw, 1.45rem)', borderBlock: 1, borderColor: 'divider', overflowX: 'auto', '& sub, & sup': { fontSize: '0.62em' } }}
    >
      {tex(src)}
    </Box>
  )
}

// ------------------------------------------------------------------ blocks

export function Blocks({ blocks, slots = {} }: { blocks: Block[]; slots?: Record<string, ReactNode> }) {
  return (
    <>
      {blocks.map((b, k) => {
        switch (b.t) {
          case 'h':
            if (b.level === 1) return null
            return (
              <Typography
                key={k}
                id={b.id}
                component={b.level === 2 ? 'h2' : 'h3'}
                variant={b.level === 2 ? 'h2' : 'h3'}
                sx={b.level === 2 ? { fontSize: 'clamp(1.5rem, 2.6vw, 2rem)', mt: 9, mb: 2.5, scrollMarginTop: 88 } : { mt: 5, mb: 1.5, scrollMarginTop: 88 }}
              >
                {b.text}
              </Typography>
            )
          case 'p':
            return (
              <Typography key={k} sx={{ my: 2 }}>
                <Inline text={b.text} />
              </Typography>
            )
          case 'ul':
          case 'ol':
            return (
              <Box key={k} component={b.t} sx={{ my: 2, pl: 3, display: 'grid', gap: 1 }}>
                {b.items.map((it, j) => (
                  <Typography component="li" key={j} sx={{ pl: 0.5 }}>
                    <Inline text={it} />
                  </Typography>
                ))}
              </Box>
            )
          case 'table':
            return (
              <TableContainer key={k} component={Paper} variant="outlined" sx={{ my: 3 }}>
                <Table size="small">
                  {b.head.some(Boolean) && (
                    <TableHead>
                      <TableRow>
                        {b.head.map((h, j) => (
                          <TableCell key={j} sx={{ whiteSpace: 'normal', verticalAlign: 'bottom' }}>
                            <Inline text={h} />
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                  )}
                  <TableBody>
                    {b.rows.map((r, j) => (
                      <TableRow key={j}>
                        {r.map((c, n) => (
                          <TableCell key={n} sx={{ verticalAlign: 'top', fontWeight: n === 0 ? 600 : undefined, minWidth: n === 0 ? 140 : undefined }}>
                            <Inline text={c} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )
          case 'hr':
            return <Divider key={k} sx={{ my: 6 }} />
          case 'math':
            return <Formula key={k} src={b.tex} />
          case 'slot':
            return <Fragment key={k}>{slots[b.name] ?? null}</Fragment>
        }
      })}
    </>
  )
}
