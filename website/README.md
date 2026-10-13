# Commons website

interactiveapps.net: the white paper, CMN on Solana, and the Commons app.
React 19, MUI 7 and Motion, built with Vite into a static site served by a
Cloudflare Worker.

## Layout

```
commons-website/
├── index.html                  the site
├── whitepaper/index.html       the white paper page (/whitepaper/)
├── src/
│   ├── root.tsx                theme, global styles, reduced-motion setting
│   ├── App.tsx                 the site's sections in order
│   ├── pages/WhitePaperPage.tsx
│   ├── sections/Site.tsx       header, hero, white paper, CMN, how it works, app, developers, roadmap, footer
│   ├── sections/Rates.tsx      the posted-rates panel
│   ├── components/             Section, Code, Mark, Markdown (white paper renderer), Loop (diagram)
│   ├── content/whitepaper.md   the white paper; edit here and redeploy
│   └── data/                   token.ts (program and mint), app-release.json (written by the app's package script)
└── public/
    ├── apps/                   Store app builds (their SHA-256s are registered on chain)
    ├── downloads/              the Commons app for macOS
    ├── cmn.json, cmn-logo.png  token metadata and logo
    └── favicons
```

## Build and deploy

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
npx wrangler deploy --assets dist --name spring-sun-d670 --compatibility-date 2026-10-01
```

A new Commons app build: run `commons-app/macos/Packaging/package.sh`, then build and deploy.
A changed Store app file in `public/apps`: deploy, then `node scripts/attach-builds.mjs` in commons-token.
