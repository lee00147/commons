# Commons token (phase 1: CMN on Solana)

CMN as the [white paper](https://interactiveapps.net/whitepaper/) describes it, as one Solana program:

| White paper | Here |
|---|---|
| CMN, a Token-2022 token | Mint at PDA `mint`, 6 decimals, mint authority = the program's `config` account, name/symbol/logo in Token-2022 metadata |
| Work unit = 10⁹ metered WebAssembly instructions; 1 CMN = 20 WU at index 1 | prices in µCMN per WU; work counted in mWU (10⁶ instructions) |
| Providers post binding asks; buyers set a limit and ≥3 replicas; bond-weighted draw from a slot hash after posting; clears at the highest drawn ask; unused limit refunded | `register_provider`, `set_ask`, `post_job` → `assign_job` → `submit_result` → `settle_job` |
| Settlement needs a majority on both the result hash and the instruction count; bond at risk ≥ the job's value | `settle_job` (non-agreeing replicas lose what they backed the job with) |
| Work price index = work-weighted median of the day's clearing prices, at most 1%/day | 61-bucket histogram per day in `DayWork`, read by `run_day` |
| The daily rule (M\* = M·P\*/P, integral term, release caps); rise with delivered work, at most 25% a year | `run_day`, logic in `crates/commons-econ` |
| Composite index: 10% market weight rising to 25%; ±10% band | `post_market_price` + `run_day` |
| No holding tax; no issuance while money is hoarded (velocity 5% below trend) | `commons-econ` `daily` / `epoch_release` |
| Bootstrap mining: halving yearly, 6 halvings or 10B CMN, ≤75% of what the buyer paid, 80/20, ≥3 agreeing replicas | `settle_job` → `run_day` → `claim_mining` |
| 1,000,000 CMN at genesis to test-network work, ≤1% per address | `initialize` + `claim_genesis` (Merkle list from `scripts/genesis-merkle.mjs`) |
| Vote weight = protocol fees paid in the last 90 days, linear, ≤5% per address | `UserStats` rolling window; `endorse_bank`, `vote_release`, `continuity_vote` |
| Banks: 10 + 100 CMN charter, 1–5 operators with a signing threshold; 5 endorsers and 10% of weight within 2 epochs; ≤12 banks; 20% probation cap for 4 epochs; one grant ≤30%; never to an operator | `propose_bank`, `endorse_bank`, `expire_bank`, `sponsor` (operators sign the transaction) |
| Operators: 3% of what the bank receives, vesting over 4 epochs, forfeited if voted out; 1% of sponsored projects' protocol fees for 2 years | `run_epoch`, `Sponsorship`, `collect_success_share`, `claim_operator_rewards`, `close_bank` |
| Epoch issuance capped at 15% of supply; yearly continuity vote | `run_epoch`, `continuity_vote`, `close_bank` |
| Store: apps bought once, licenses on chain, 5 CMN × index listing fee, protocol fee on sales | `publish_app`, `update_app`, `buy_app` |

Rent, the gas split and the native token standard need a chain of their own; they come with phase 2 (the Commons chain).

## Layout

```
crates/commons-econ/   the rule in integer arithmetic, no dependencies, 19 tests
programs/commons/      the Anchor program
scripts/               genesis list, initialize, crank, demo, buy, set-logo
```

## Status, honestly

- `crates/commons-econ` is built and tested (`cargo test` in that folder).
- `programs/commons` builds with `anchor build` and is deployed on devnet: program `t5V6zr4BQhVRReaKDWiKF98ER8FMEL2cZeQdacsKMfa`, CMN mint `C3QHKobcRskEnKJNjFjkLqvGrJmmbgT364VmyeRK4nQu`. `scripts/demo.mjs` has run the whole flow there.
- `assign_job` reads every provider account, so the provider set is bounded by what fits in one transaction (about 30 accounts, ~250 with an address lookup table). A sampling tree replaces this before the set grows.
- Providers report instruction counts; the metered WebAssembly runner that produces them (in the Commons app's earn mode) is next.
- The market price is posted by an `oracle` key and upgrades are by the deployer on devnet. Before mainnet: pool TWAP, multisig with a 7-day delay, audit.
- Genesis CMN not claimed stays in the vault, out of circulation.

## Build and deploy (macOS, Anchor 1.1, Solana CLI 3.1)

To deploy your own copy, give it its own program id first.

```bash
# Test the rule
cd crates/commons-econ && cargo test && cd ../..

# New program key, build, deploy
solana-keygen new -o target/deploy/commons-keypair.json --no-bip39-passphrase --force
anchor keys sync
anchor build
anchor deploy --provider.cluster devnet

# Create CMN (named "Commons", symbol CMN, logo from interactiveapps.net). A devnet "day" is 120 s.
node scripts/initialize.mjs genesis.json 120

# Everything end to end: claim, providers, a drawn and settled job, mining, Store, a two-operator bank
node scripts/demo.mjs genesis.json

# Keep the daily rule running (anyone can)
node scripts/crank.mjs --watch
```

## Instruction flow

1. **Genesis.** `initialize` mints 1,000,000 CMN into the vault; test-network workers `claim_genesis` with their Merkle proof.
2. **Work.** Providers `register_provider` (bond ≥ 100 CMN, a binding ask per WU). Developers `list_program` (module hash, royalty; fee 5 CMN × index). A buyer `post_job`s with a work limit, a price limit and 3–5 replicas, paying the limit into escrow. In a later slot anyone `assign_job`s: replicas are drawn by bond from providers within the limit whose free bond covers the job, and the job clears at the highest drawn ask. Replicas `submit_result` (hash, instructions); anyone `settle_job`s. Unused escrow returns to the buyer; `close_job` returns the rent.
3. **Each day.** `run_day` moves the index toward the day's work-weighted median clearing price, runs the rule and fixes that day's mining rate. Then `claim_mining` mints each verified job's reward.
4. **Each epoch (91 days).** `run_epoch` vests operator rewards and releases the bank budget, issuing the shortfall up to 15% of supply, split by vote weight; 3% of each bank's share vests to its operators.
5. **Banks.** Operators `sponsor` projects (threshold signatures); the project's fees then accrue a 1% success share, moved by `collect_success_share` and paid by `claim_operator_rewards`.
