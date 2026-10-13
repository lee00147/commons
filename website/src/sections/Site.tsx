import { useState } from 'react'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import MenuRounded from '@mui/icons-material/MenuRounded'
import ArticleRounded from '@mui/icons-material/ArticleRounded'
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import DownloadRounded from '@mui/icons-material/DownloadRounded'
import { motion, type Variants } from 'motion/react'
import { Section, Prose } from '../components/Section'
import { useCycle } from '../components/Loop'
import { Code } from '../components/Code'
import { Mark } from '../components/Mark'
import { tokens } from '../theme'
import { MINT, PROGRAM_ID, REPO, WHITE_PAPER, explorer, short } from '../data/token'
import appRelease from '../data/app-release.json'

// ---------------------------------------------------------------- header

const NAV: [string, string][] = [
  ['White paper', '/#whitepaper'],
  ['CMN', '/#cmn'],
  ['How it works', '/#how'],
  ['Developers', '/#developers'],
  ['Commons app', '/#app'],
  ['Roadmap', '/#roadmap'],
]

export function Header() {
  const [open, setOpen] = useState(false)
  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ bgcolor: 'color-mix(in srgb, var(--mui-palette-background-default) 88%, transparent)', backdropFilter: 'blur(10px)', borderBottom: 1, borderColor: 'divider' }}>
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ gap: 3, minHeight: 62 }}>
          <Link href="/" underline="none" color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 1.2, fontWeight: 800, fontStretch: '115%', whiteSpace: 'nowrap' }}>
            <Mark /> Commons
          </Link>
          <Stack direction="row" spacing={2.5} sx={{ ml: 'auto', display: { xs: 'none', md: 'flex' } }}>
            {NAV.map(([label, to]) => (
              <Link key={to} href={to} underline="none" color="text.secondary" sx={{ fontSize: 15, '&:hover': { color: 'text.primary' } }}>
                {label}
              </Link>
            ))}
          </Stack>
          <Button href={WHITE_PAPER} variant="contained" size="small" startIcon={<ArticleRounded />} sx={{ display: { xs: 'none', sm: 'inline-flex' }, minHeight: 36 }}>
            White paper
          </Button>
          <IconButton aria-label="Open menu" onClick={() => setOpen(true)} sx={{ display: { md: 'none' }, ml: 'auto' }}>
            <MenuRounded />
          </IconButton>
        </Toolbar>
      </Container>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <List sx={{ width: 260, pt: 2 }}>
          {NAV.map(([label, to]) => (
            <ListItemButton key={to} component="a" href={to} onClick={() => setOpen(false)}>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
    </AppBar>
  )
}

// ---------------------------------------------------------------- hero

const FACTS: [string, string][] = [
  ['Unit', '1 CMN buys 20 work units: 20 billion metered instructions'],
  ['First CMN', 'mined by verified compute jobs, not puzzles'],
  ['After the bootstrap', 'new CMN reaches builders through banks users found and can close'],
  ['Value', 'rises with the network’s real output, at most 25% a year'],
  ['Chain', 'Solana (devnet today), Token-2022'],
]

const heroSeq: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } }
const rise: Variants = { hidden: { opacity: 0, y: 18 }, shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } } }
const rowSeq: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.07, delayChildren: 0.45 } } }
const row: Variants = { hidden: { opacity: 0, x: 10 }, shown: { opacity: 1, x: 0, transition: { duration: 0.4, ease: 'easeOut' } } }

export function Hero() {
  return (
    <Box component="header" sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 7, md: 9 } }}>
      <Container maxWidth="lg">
        <Box component={motion.div} variants={heroSeq} initial="hidden" animate="shown" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' }, gap: { xs: 5, md: 7 }, alignItems: 'center' }}>
          <Box>
            <Typography variant="h1" sx={{ maxWidth: '12ch' }}>
              {['Money', 'measured', 'in work.'].map((w) => (
                <motion.span key={w} variants={rise} style={{ display: 'inline-block', marginRight: '0.24em' }}>
                  {w}
                </motion.span>
              ))}
            </Typography>
            <Typography component={motion.p} variants={rise} color="text.secondary" sx={{ fontSize: 19, mt: 3, mb: 4, maxWidth: '56ch' }}>
              CMN is a currency that is worth the computing it buys. New CMN is created only when the economy needs it, paid first to people who do useful work and then to the people who build,
              through banks that users found and can close. An open rule, run on chain, keeps it steady.
            </Typography>
            <Stack component={motion.div} variants={rise} direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
              <Button href={WHITE_PAPER} variant="contained" size="large" startIcon={<ArticleRounded />}>
                Read the white paper
              </Button>
              {MINT ? (
                <Button href={explorer('address', MINT)} target="_blank" rel="noopener" variant="outlined" size="large" endIcon={<OpenInNewRounded />}>
                  CMN on Solana
                </Button>
              ) : (
                <Button href="#cmn" variant="outlined" size="large">
                  About CMN
                </Button>
              )}
              {REPO && (
                <Button href={REPO} target="_blank" rel="noopener" variant="outlined" size="large" endIcon={<OpenInNewRounded />}>
                  Source code
                </Button>
              )}
            </Stack>
            <Typography component={motion.p} variants={rise} variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Devnet software. CMN on devnet has no value.
            </Typography>
          </Box>
          <Paper component={motion.div} variants={rise} variant="outlined" sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
              <Box component="img" src="/cmn-logo.png" alt="" sx={{ width: 44, height: 44, borderRadius: '50%' }} />
              <Box>
                <Typography sx={{ fontWeight: 800, fontStretch: '112%' }}>Commons · CMN</Typography>
                <Typography variant="body2" color="text.secondary">
                  {MINT ? short(MINT) : 'Token-2022 mint on Solana devnet'}
                </Typography>
              </Box>
            </Box>
            <Box component={motion.dl} variants={rowSeq} sx={{ m: 0, display: 'grid', gap: 1.75 }}>
              {FACTS.map(([k, v]) => (
                <Box component={motion.div} variants={row} key={k} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '150px 1fr' }, gap: { xs: 0.25, sm: 2 } }}>
                  <Typography component="dt" variant="body2" sx={{ fontWeight: 700 }}>
                    {k}
                  </Typography>
                  <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>
                    {v}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Box>
      </Container>
    </Box>
  )
}

// ---------------------------------------------------------------- white paper

const CHAPTERS: [string, string][] = [
  ['The problem', 'Crypto is held to speculate, new coins go to whoever burns or holds the most, and real payments still run through companies.'],
  ['The unit: work', 'One CMN buys 20 work units. A work unit is a billion metered WebAssembly instructions, the same amount of work on every machine.'],
  ['Measuring the price', 'Providers are paid exactly what they ask, and the price index follows what jobs actually clear at, moving at most 1% a day.'],
  ['The monetary rule', 'Each day the rule computes the money stock that holds the price of work, M* = M · P*/P. CMN rises with delivered work, at most 25% a year; cheaper hardware becomes new money for builders.'],
  ['Outside value', 'A small market weight and a ±10% band keep CMN’s price outside in sight of its value inside, without importing every swing.'],
  ['Banks', 'Founded and voted by users in proportion to the fees they pay. Banks do not lend: they sponsor builders, and their operators earn when what they fund is used.'],
]

const EVIDENCE: [string, string, string][] = [
  ['Highest price of work over ten years, central case', '3.64 with a fixed mining schedule', '1.03 when the rule sets mining'],
  ['Self-dealing (posting jobs to your own providers)', 'loses money', 'unless one holds more than 55% of the bonded stake'],
  ['Market weight 50% instead of 10%', 'internal value 2.3× less steady', 'for almost no gain in staying close to the market'],
]

export function WhitePaper() {
  return (
    <Section id="whitepaper" title="The white paper." intro="What CMN is, why it is designed this way, the numbers behind it, and what is still open. The parameters were set by calculation and tested in simulation.">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 4, md: '36px 56px' } }}>
        {CHAPTERS.map(([t, b]) => (
          <Box key={t}>
            <Typography variant="h3" sx={{ mb: 1 }}>
              {t}
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: '54ch' }}>
              {b}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="h3" sx={{ mt: 8, mb: 2 }}>
        Tested, not assumed
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Question</TableCell>
              <TableCell>Without the design</TableCell>
              <TableCell>With it</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {EVIDENCE.map(([q, a, b]) => (
              <TableRow key={q}>
                <TableCell sx={{ fontWeight: 600 }}>{q}</TableCell>
                <TableCell>{a}</TableCell>
                <TableCell>{b}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Button href={WHITE_PAPER} variant="contained" size="large" startIcon={<ArticleRounded />} sx={{ mt: 4 }}>
        Read the full white paper
      </Button>
    </Section>
  )
}

// ---------------------------------------------------------------- CMN

const TOKEN_ROWS: [string, string][] = [
  ['Name / symbol', 'Commons / CMN, 6 decimals'],
  ['Standard', 'Solana Token-2022. The Commons program is the mint authority, so only its rules can create CMN.'],
  ['Unit', '1 work unit = 1,000,000,000 metered WebAssembly instructions. At the starting price 1 CMN buys 20 work units.'],
  ['At genesis', '1,000,000 CMN, claimable by people who ran and published real jobs on the test network, at most 1% per address. No team or investor allocation.'],
  ['Mining', 'Each day the rule decides how much new money is needed; a share is paid to verified compute: 80% to the providers whose results agreed, 20% to the program’s developer, at most 75% of what the buyer paid.'],
  ['Handover', 'The mined share starts at 100% and halves every year; after six halvings, or 10 billion CMN, all new money goes through banks.'],
  ['Issuance', '10% of the money gap a day, at most 2% of circulating money; at most 15% of supply per epoch; none while money is being hoarded.'],
  ['Holding', 'Not taxed. The 25% yearly cap, paused issuance and treasury withholding keep hoarding in check.'],
  ['Protocol fee', '15% of platform payments at target (5–30%), to the treasury.'],
]

export function Cmn() {
  return (
    <Section id="cmn" tone="surface" title="CMN, by the numbers." intro="The rules from the white paper, all running in the devnet program today. One piece is still ahead: a metered WebAssembly runner. Until it ships, providers report each job’s instruction count and a job settles only when the drawn replicas agree on it.">
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableBody>
            {TOKEN_ROWS.map(([k, v]) => (
              <TableRow key={k}>
                <TableCell sx={{ fontWeight: 700, width: { md: 200 }, verticalAlign: 'top' }}>{k}</TableCell>
                <TableCell>{v}</TableCell>
              </TableRow>
            ))}
            {PROGRAM_ID && (
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Program</TableCell>
                <TableCell>
                  <Link href={explorer('address', PROGRAM_ID)} target="_blank" rel="noopener" sx={{ fontFamily: 'var(--mono)', fontSize: 14 }}>
                    {PROGRAM_ID}
                  </Link>
                </TableCell>
              </TableRow>
            )}
            {MINT && (
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Mint</TableCell>
                <TableCell>
                  <Link href={explorer('address', MINT)} target="_blank" rel="noopener" sx={{ fontFamily: 'var(--mono)', fontSize: 14 }}>
                    {MINT}
                  </Link>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ mt: 5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4 }}>
        <Prose>
          <strong>Not a stablecoin.</strong> CMN is not pegged to the dollar, backed by a reserve or redeemable for anything. Its anchor is what it buys: computing on the network, measured from what
          jobs actually clear at.
        </Prose>
        <Prose>
          <strong>Not a speculation coin.</strong> It rises with real use, at most 25% a year. People who want unlimited upside can find it in the tokens built on Commons; CMN is the money underneath
          them.
        </Prose>
      </Box>
    </Section>
  )
}

// ---------------------------------------------------------------- how it works

const LOOP: [string, string][] = [
  ['Work', 'Someone pays CMN for a compute job. The chain draws at least three bonded providers within the buyer’s limit; their results must agree, or the ones who disagree lose bond.'],
  ['Rule', 'Once a day the chain reads the price of work from what jobs cleared at and computes how much money the economy needs. Short of money, it creates some; long, it holds back.'],
  ['Mining, then banks', 'New money goes to the day’s verified work, and year by year more of it goes to banks instead. Banks are founded and kept or closed by users’ votes.'],
  ['Builders', 'Banks sponsor the people who build programs. Their programs bring users, users bring demand for CMN, and the rule answers with more for builders.'],
]

export function HowItWorks() {
  const { ref, step, setStep, setPaused, animated } = useCycle(LOOP.length, 2600)
  return (
    <Section id="how" title="How CMN moves." intro="One loop, run by code rather than by a company: useful work brings demand, the rule answers with money, the money reaches builders, builders bring more use.">
      <Box ref={ref} component="ol" onMouseLeave={() => setPaused(false)} sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: { xs: 3, md: 3 } }}>
        {LOOP.map(([t, b], i) => (
          <Paper
            component="li"
            key={t}
            variant="outlined"
            onMouseEnter={() => {
              setPaused(true)
              setStep(i)
            }}
            sx={{ position: 'relative', p: 3, borderRadius: 3, overflow: 'hidden' }}
          >
            {animated && i === step && (
              <motion.div layoutId="loop-active" aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 12, border: `2px solid ${tokens.signal}`, pointerEvents: 'none' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
            )}
            <Box sx={{ width: 34, height: 34, borderRadius: '50%', bgcolor: 'secondary.main', color: 'secondary.contrastText', display: 'grid', placeItems: 'center', fontWeight: 800, mb: 2 }}>{i + 1}</Box>
            <Typography variant="h3" sx={{ mb: 1 }}>
              {t}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {b}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Section>
  )
}

// ---------------------------------------------------------------- the app

const APP_PARTS: [string, string][] = [
  ['Store', 'Browse apps registered on Solana and get them with CMN. Your license is kept on chain, in your wallet.'],
  ['Verified installs', 'Every download is checked against the SHA-256 its developer registered on chain. A file that does not match is refused.'],
  ['Launcher and wallet', 'Installed apps open in their own Commons window. The app makes its own wallet and signs its own transactions.'],
]

const START: string[] = [
  'Open Commons and choose Wallet, then Create wallet.',
  'Add a little devnet SOL for network fees from faucet.solana.com.',
  'In Discover, get Ledger Lens (free), then Install and Open it.',
]

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

export function CommonsApp() {
  const ready = Boolean(appRelease.file)
  return (
    <Section id="app" tone="surface" title="Commons for Mac." intro="A native app that turns the chain into a place to get software: a Store and launcher for apps whose licenses and builds live on Solana.">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 4 }}>
        {APP_PARTS.map(([t, b]) => (
          <Box key={t}>
            <Typography variant="h3" sx={{ mb: 1 }}>
              {t}
            </Typography>
            <Typography color="text.secondary">{b}</Typography>
          </Box>
        ))}
      </Box>
      <Paper variant="outlined" sx={{ mt: 6, p: { xs: 2.5, md: 3.5 }, borderRadius: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 3, md: 5 } }}>
        <Box>
          <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
            {ready ? (
              <Button variant="contained" size="large" startIcon={<DownloadRounded />} href={`/downloads/${appRelease.file}`} download>
                Download for macOS
              </Button>
            ) : (
              <Button variant="contained" size="large" disabled>
                macOS build coming soon
              </Button>
            )}
            <Chip label="Windows in development" variant="outlined" />
          </Stack>
          {ready && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              Version {appRelease.version} · {mb(appRelease.bytes)} · macOS {appRelease.minMacOS} or later
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, maxWidth: '52ch' }}>
            Commons is not notarized by Apple yet. The first time, right-click Commons and choose Open. On macOS 15, use System Settings, Privacy &amp; Security, Open Anyway.
          </Typography>
          {ready && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontFamily: 'var(--mono)', fontSize: 12, wordBreak: 'break-all' }}>
              SHA-256 {appRelease.sha256}
            </Typography>
          )}
        </Box>
        <Box>
          <Typography variant="h4" sx={{ mb: 1.5 }}>
            Getting started
          </Typography>
          <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1 }}>
            {START.map((s) => (
              <Typography component="li" variant="body2" key={s}>
                {s}
              </Typography>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Commons runs on Solana devnet. Devnet CMN and SOL have no value.
          </Typography>
        </Box>
      </Paper>
    </Section>
  )
}

// ---------------------------------------------------------------- developers

const INSTRUCTIONS: [string, string][] = [
  ['Genesis', 'initialize · set_metadata · claim_genesis'],
  ['Compute market', 'register_provider · add_bond · set_ask · leave_provider · list_program · post_job · assign_job · submit_result · settle_job · close_job'],
  ['The rule', 'run_day · run_epoch · post_market_price · claim_mining'],
  ['Store', 'publish_app · update_app · buy_app'],
  ['Banks', 'propose_bank · endorse_bank · vote_release · sponsor · collect_success_share · claim_operator_rewards · continuity_vote · close_bank · expire_bank'],
]

const RUN = `$ anchor build && anchor deploy --provider.cluster devnet
$ node scripts/genesis-merkle.mjs work.csv > genesis.json
$ node scripts/initialize.mjs genesis.json 120   # a "day" is 120 s on devnet
$ node scripts/demo.mjs genesis.json             # claim, providers, a job, mining, Store, a bank
$ node scripts/crank.mjs --watch                 # anyone can keep the daily rule running`

export function Developers() {
  return (
    <Section id="developers" title="One Solana program." intro="An Anchor program holds the whole of phase 1. The arithmetic lives in a dependency-free Rust crate shared with the Commons chain, so both compute the rule bit for bit alike.">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.1fr' }, gap: { xs: 4, md: 6 }, alignItems: 'start' }}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Part</TableCell>
                <TableCell>Instructions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {INSTRUCTIONS.map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell sx={{ fontWeight: 700, verticalAlign: 'top' }}>{k}</TableCell>
                  <TableCell sx={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{v}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Code title="commons-token" lang="sh">
            {RUN}
          </Code>
          <Typography variant="body2" color="text.secondary">
            The rule’s crate has unit tests for every number in the white paper, including the 55% self-dealing threshold and the 25% yearly cap.
          </Typography>
          {REPO && (
            <Box>
              <Button href={REPO} target="_blank" rel="noopener" variant="contained" endIcon={<OpenInNewRounded />}>
                Source on GitHub
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Section>
  )
}

// ---------------------------------------------------------------- roadmap

const PHASES: { title: string; when: string; items: string[] }[] = [
  {
    title: 'Phase 1 — CMN on Solana',
    when: 'Now, on devnet',
    items: ['Token-2022 CMN with the monetary rule', 'Mining by verified compute jobs', 'Work units and the clearing-price index', 'Banks with operator rewards', 'Store with on-chain licenses and verified installs', 'Commons for Mac'],
  },
  {
    title: 'Before mainnet',
    when: 'Next',
    items: ['Read the market price from CMN’s own pools', 'Independent security audit', 'Upgrades through a multisig with a seven-day delay', 'Genesis claims from test-network work'],
  },
  {
    title: 'Phase 2 — the Commons chain',
    when: 'After BFT consensus, an audit and a user vote',
    items: ['CMN moves 1:1 through a bridge', 'Rent by computing load, paid in CMN', 'Native token standard and on-chain markets', 'Flat state committed with a lattice hash'],
  },
]

export function Roadmap() {
  return (
    <Section id="roadmap" tone="surface" title="Where it stands." intro="The currency goes first, on Solana, where wallets and markets already exist. The Commons chain follows once the currency has proved itself.">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
        {PHASES.map((p, i) => (
          <Paper key={p.title} variant="outlined" sx={{ p: 3, borderRadius: 3, borderColor: i === 0 ? tokens.signal : undefined, borderWidth: i === 0 ? 2 : 1 }}>
            <Typography variant="h3">{p.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {p.when}
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.75 }}>
              {p.items.map((it) => (
                <Typography component="li" variant="body2" key={it}>
                  {it}
                </Typography>
              ))}
            </Box>
          </Paper>
        ))}
      </Box>
    </Section>
  )
}

// ---------------------------------------------------------------- footer

export function Footer() {
  return (
    <Box component="footer" sx={{ borderTop: 1, borderColor: 'divider', py: 5 }}>
      <Container maxWidth="lg" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, fontWeight: 800 }}>
          <Mark /> Commons
        </Box>
        <Typography variant="body2" color="text.secondary">
          Built for the Colosseum Crypto World’s Fair ·{' '}
          <Link href={WHITE_PAPER} color="inherit">
            White paper
          </Link>
        </Typography>
      </Container>
    </Box>
  )
}
