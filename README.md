# Commons

**Money measured in work.** CMN is a currency on Solana that is worth the computing it buys. New CMN is
created only when the economy needs it: first paid to providers whose compute results are verified, then,
year by year, to builders through banks that users found and can close. An open rule, run on chain, keeps
the price of work steady.

- Website: https://interactiveapps.net
- White paper: https://interactiveapps.net/whitepaper/
- Program (Solana devnet): [`t5V6zr4BQhVRReaKDWiKF98ER8FMEL2cZeQdacsKMfa`](https://explorer.solana.com/address/t5V6zr4BQhVRReaKDWiKF98ER8FMEL2cZeQdacsKMfa?cluster=devnet)
- CMN mint (Token-2022): [`C3QHKobcRskEnKJNjFjkLqvGrJmmbgT364VmyeRK4nQu`](https://explorer.solana.com/address/C3QHKobcRskEnKJNjFjkLqvGrJmmbgT364VmyeRK4nQu?cluster=devnet)

Devnet software. CMN on devnet has no value.

## What is in this repository

| Folder | What it is |
|---|---|
| [`token/`](token) | The Anchor program (`programs/commons`), the monetary rule as a dependency-free Rust crate with unit tests (`crates/commons-econ`), and scripts that deploy, initialize and run the economy on devnet |
| [`website/`](website) | interactiveapps.net: Vite, React and MUI, with the white paper and live numbers read from the program |
| [`app/`](app) | Commons for Mac (SwiftUI): a Store and launcher whose licenses and builds are recorded on Solana; it builds and signs its own transactions |
| [`video/`](video) | Scripts that record the demo video and narrate the pitch video |

## How it works

1. **Work.** A buyer posts a compute job with a limit price. The program draws at least three bonded
   providers from a slot hash that did not exist when the job was posted, weighted by bond. Providers post
   binding asks per work unit, and the job clears at the highest ask among those drawn. Results must
   agree, or the providers who disagree lose bond.
2. **The price of work.** Every settled job adds to a 61-bucket daily histogram of clearing prices. The
   work-weighted median moves the work price index, at most 1% a day.
3. **The rule.** Once a day the program computes the money stock that holds the index at target,
   M* = M · P*/P, and creates at most 10% of the gap (and at most 2% of circulating money). CMN's value
   may rise with real output, at most 25% a year.
4. **Mining, then banks.** New money first goes to verified work (80% to the agreeing providers, 20% to
   the program's developer, never more than 75% of what the buyer paid). The mined share halves every
   year; the rest goes to banks, which users found and keep or close with votes weighted by the protocol
   fees they paid over 90 days (capped at 5% per voter). Banks sponsor builders; their operators earn
   a 3% share that vests over four epochs, plus 1% of the fees their sponsored projects generate for two
   years.
5. **Store.** Apps are published with a price and the SHA-256 of their build. Buying one records a
   license on chain; the Commons app installs a build only if its hash matches.

The white paper explains each choice and the simulations behind the parameters.

## Status

| Part | State |
|---|---|
| Monetary rule library (`commons-econ`), 19 unit tests | Built and tested |
| Solana program: CMN, genesis claims, compute market with work units and clearing prices, daily and epoch steps, mining, banks with operator rewards, Store | Deployed on devnet |
| Metered WebAssembly runner (until then, providers report instruction counts and replicas must agree) | Next |
| Commons for Mac | Working build, not yet notarized |
| Commons chain (phase 2) | Development network, not in this repository |

## Run it

```sh
cd token
anchor build && anchor deploy --provider.cluster devnet
node scripts/genesis-merkle.mjs work.csv > genesis.json
node scripts/initialize.mjs genesis.json 120   # a "day" is 120 s on devnet
node scripts/demo.mjs genesis.json             # claim, providers, a job, mining, Store, a bank
node scripts/crank.mjs --watch                 # anyone can keep the daily rule running
cargo test -p commons-econ                     # the rule's tests
```

```sh
cd website && npm install && npm run dev
```

```sh
cd app && swift run Commons                    # macOS 14 or later
```

Each folder has its own README with details.
