import { useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import { tokens } from '../theme'

const RUST_KW = new Set(['use', 'fn', 'let', 'mut', 'pub', 'mod', 'impl', 'struct', 'enum', 'match', 'if', 'else', 'return', 'Ok', 'Err', 'Some', 'None', 'for', 'in', 'while', 'loop', 'true', 'false', 'self', 'crate', 'extern', 'const', 'static'])

function highlightRust(src: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|(\b\d[\d_]*\b)|([A-Za-z_][A-Za-z0-9_]*!?)|([\s\S])/g
  let m: RegExpExecArray | null
  let plain = ''
  let k = 0
  const flush = () => {
    if (plain) out.push(plain)
    plain = ''
  }
  while ((m = re.exec(src))) {
    if (m[1]) {
      flush()
      out.push(<span key={k++} style={{ color: tokens.codeDim, fontStyle: 'italic' }}>{m[1]}</span>)
    } else if (m[2]) {
      flush()
      out.push(<span key={k++} style={{ color: tokens.codeStr }}>{m[2]}</span>)
    } else if (m[3]) {
      flush()
      out.push(<span key={k++} style={{ color: tokens.codeNum }}>{m[3]}</span>)
    } else if (m[4] && (RUST_KW.has(m[4]) || m[4].endsWith('!'))) {
      flush()
      out.push(<span key={k++} style={{ color: tokens.codeKey }}>{m[4]}</span>)
    } else {
      plain += m[0]
    }
  }
  flush()
  return out
}

function highlightShell(src: string): ReactNode[] {
  return src.split('\n').map((line, i) => {
    let node: ReactNode = line
    if (line.startsWith('$ ')) {
      node = (
        <>
          <span style={{ color: tokens.codeDim }}>$ </span>
          <span style={{ color: '#fff', fontWeight: 600 }}>{line.slice(2)}</span>
        </>
      )
    } else if (line.trimStart().startsWith('#')) {
      node = <span style={{ color: tokens.codeDim, fontStyle: 'italic' }}>{line}</span>
    } else if (line.trimStart().startsWith('✓')) {
      node = <span style={{ color: '#7fe0a8' }}>{line}</span>
    }
    return (
      <span key={i}>
        {node}
        {'\n'}
      </span>
    )
  })
}

export function Code({ children, lang = 'sh', title, copy = true }: { children: string; lang?: 'sh' | 'rust' | 'text'; title?: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false)
  const body = lang === 'rust' ? highlightRust(children) : lang === 'sh' ? highlightShell(children) : children
  const copyText = lang === 'sh' ? children.split('\n').filter((l) => l.startsWith('$ ')).map((l) => l.slice(2)).join('\n') || children : children
  return (
    <Box sx={{ position: 'relative', bgcolor: tokens.code, color: tokens.codeInk, borderRadius: 3, overflow: 'hidden', minWidth: 0 }}>
      {title && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.1, borderBottom: '1px solid rgba(255,255,255,0.08)', color: tokens.codeDim, fontFamily: 'var(--mono)', fontSize: 12 }}>
          {[0, 1, 2].map((i) => (
            <Box key={i} sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#2a3546' }} />
          ))}
          <Box component="span" sx={{ ml: 1 }}>
            {title}
          </Box>
        </Box>
      )}
      {copy && (
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton
            size="small"
            aria-label="Copy code"
            onClick={() => {
              navigator.clipboard?.writeText(copyText)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            sx={{ position: 'absolute', top: title ? 4 : 8, right: 8, color: tokens.codeDim, '&:hover': { color: '#fff' } }}
          >
            {copied ? <CheckRounded fontSize="small" /> : <ContentCopyRounded fontSize="small" />}
          </IconButton>
        </Tooltip>
      )}
      <Box component="pre" sx={{ m: 0, p: 2, pr: 6, overflowX: 'auto', fontFamily: 'var(--mono)', fontSize: 13, lineHeight: 1.65 }}>
        <code>{body}</code>
      </Box>
    </Box>
  )
}
