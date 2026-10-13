import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
const mode = process.argv[2] ?? 'preview'
const FPS = 30
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
p.on('pageerror', (e) => console.log('pageerror', e.message))
await p.goto('http://localhost:4174/pitch.html')
await p.waitForFunction(() => window.READY === true)
const tl = await p.evaluate(() => window.TIMELINE)
console.log('total', tl.total.toFixed(1), 's')
writeFileSync('narration.tsv', tl.narration.map((n) => `${n.start}\t${n.speak}`).join('\n') + '\n')
if (mode === 'preview') {
  const times = process.argv.slice(3).map(Number)
  for (const t of times) {
    await p.evaluate((t) => window.seek(t), t)
    await p.screenshot({ path: `prev-${String(t).padStart(5, '0')}.png` })
  }
} else {
  rmSync('frames', { recursive: true, force: true }); mkdirSync('frames')
  const n = Math.ceil(tl.total * FPS)
  for (let f = 0; f < n; f++) {
    await p.evaluate((t) => window.seek(t), f / FPS)
    await p.screenshot({ path: `frames/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 })
    if (f % 300 === 0) console.log(`frame ${f}/${n}`)
  }
}
await b.close()
