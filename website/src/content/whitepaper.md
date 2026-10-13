# Commons White Paper

## Abstract

Commons is a next-generation blockchain and software ecosystem built around one idea: money should be worth the work it buys, and new money should go to the people who make the network useful.

Its currency, CMN, is pegged to nothing. It is measured in work: one CMN buys a fixed amount of metered computation on the network. An open monetary rule, run on chain, watches the price of that work and adjusts the money supply to hold it steady. CMN gains value only as fast as the network's real output grows, at most 25% a year.

New CMN is created only when the economy needs more money. At first it is mined by useful work: compute jobs that someone paid for, run and cross-checked by independent providers. Year by year, mining hands over to banks that users found, fund and can close. Banks do not lend. They sponsor the people who build programs on Commons, and their operators are rewarded when what they fund is used. The more the network is used, the more money the rule releases to builders, which brings more builders and more use.

CMN launches first as a token on Solana. The Commons chain, with its own rent and token standard, follows once the currency has proved itself.

## The problem

Most people hold crypto to make money, not to use it. Decentralization is the reason crypto exists, but it is rarely the reason anyone buys it.

1. **Demand is speculative.** Prices move on attention, not on use. A currency nobody spends cannot become the money of everyday trade.
2. **New coins go to the wrong people.** Proof of work pays whoever burns the most electricity on puzzles nobody needs. Proof of stake pays whoever already holds the most coins. Neither pays the people who make a network useful.
3. **Builders run out of money.** Most networks fund developers from a foundation budget set at launch. When it is spent, funding stops, however much the network has grown.
4. **Stable money has a gatekeeper.** Stablecoins are useful and widely used, but an issuer can freeze them and they stay tied to one government's currency.

What is missing is money whose value is anchored in something real, whose new supply pays for real work, and whose growth keeps funding the people who build.

## Commons at a glance

Commons has four parts: the currency CMN, the monetary rule that manages it, the banks that fund builders, and a platform where programs are published, bought and run. They form one loop.

[[DIAGRAM]]

People pay CMN for computation and software. The rule reads the price of that work and answers with new money when the economy is short of it. The money reaches people who do useful work and the builders, first through mining and then through the treasury and the banks. Builders bring more programs and more use.

## The unit: work

One CMN is defined by what it buys: a quantity of computation.

**A work unit is a billion metered instructions.** Compute programs on Commons are WebAssembly modules. A WebAssembly runtime can count every instruction it executes, and the count is the same on every machine that runs the same program on the same input. Commons uses that count as its unit of work:

- **1 work unit (WU) = 1,000,000,000 metered WebAssembly instructions.**
- At the starting price, **1 CMN buys 20 WU**, roughly twenty seconds of one modern processor core.

Measuring work this way removes the usual ambiguity of "CPU time". A second on a new laptop and a second on an old server are different amounts of work; a billion instructions are the same everywhere. Because the replicas that run a job must agree on its result and on its instruction count, the work behind every payment is verified, not reported.

Native programs and GPU work can join later through benchmark jobs that convert their time into work units at a measured rate. The unit itself does not change.

## Measuring the price of work

The value of CMN is the amount of work it buys, so the network has to measure the price of work honestly. Commons measures it from real trades, not from what anyone says.

**Providers post binding asks.** A compute provider posts the price per work unit it will work for. The ask is binding: it is what the provider is paid.

**Buyers set a limit.** A buyer posting a job sets the most it will pay per work unit and how many replicas should run the job (at least three).

**The chain assigns and prices the job.** Among providers whose ask is within the buyer's limit, the chain draws the replicas at random, weighted by the bond each provider has locked. The job clears at a single price: the highest ask among the drawn replicas. Every replica is paid that price for the agreed work; the buyer's unused limit is refunded. The random draw uses a slot hash from after the job was posted, so the buyer cannot choose a moment that favours particular providers.

**The price of work is what jobs actually cleared at.** Each day the network takes the work-weighted median of the clearing prices of all jobs settled that day. The work price index follows that median slowly, moving at most 1% a day.

This makes the measurement costly to bend. A provider that posts a low ask to make CMN look stronger is paid that low ask. One that posts a high ask is drawn only by buyers willing to pay it. To move the index, someone has to trade at the price they claim, in real volume.

## The monetary rule

The rule keeps the price of work at its target. If work starts costing more CMN, CMN has lost purchasing power: there is too much money. If work costs fewer CMN, CMN has gained: there is too little.

**Money follows the price of work.** Over a short horizon, real output and the speed at which money circulates are roughly given, so prices move with the money stock. Once a day the rule computes the money stock that would bring the price of work back to its target:

$$M^{*} = M \cdot \frac{P^{*}}{P}$$

M is CMN in circulation, P the measured price of work, P\* the target. An integral term corrects a drift that persists for days, so it is removed rather than only reduced. The price the rule reads is bounded to ±30% of the index, so a single unusual day cannot swing it.

**It rises with real output.** A coin that can never rise gives nobody a reason to join early. So the target is not fixed: it falls as the network's real output grows, measured as the work units delivered by settled jobs. When delivered work grows 20% in a year, one CMN buys about 20% more work. The rise is capped at **25% a year**, so early hypergrowth does not become a speculative run, and delivered work, which every buyer pays for at full price, is expensive to fake.

**Cheaper hardware becomes funding.** Computing gets cheaper over time. When providers can do the same work for fewer CMN, the rule does not let CMN appreciate beyond the growth of output; it holds the price of work at target and releases the difference as new money. That money goes to builders through the banks. The long-term strength of Commons is not a rising coin but a platform whose own growth keeps funding the people who build on it.

**What the rule never does.** CMN cannot be redeemed for anything. Nothing is burned. The protocol holds no reserve of other assets and never trades in outside markets.

## Linking to outside value

Internal value alone is not enough. If CMN buys a steady amount of work inside Commons but drifts far from what it is worth outside, people cannot trust it. The rule watches both.

**One target, two measures.** The rule steers a composite index:

$$I = w \cdot I_{\text{work}} + (1 - w) \cdot I_{\text{market}}$$

I_work is the work price index. I_market is CMN's price against a basket of major assets. The market weight (1 − w) starts at 10%, because early markets are thin and easy to push, and grows to at most 25% as liquidity deepens.

**Where the market price comes from.** The time-weighted average price of CMN's own on-chain pools over seven days. A seven-day average cannot be moved by a short burst of trading.

**A band, not a peg.** When internal and external value drift more than ±10% apart, the rule leans against the gap:

| Situation | What it means | What the rule does |
|---|---|---|
| Market price far above internal value | Speculative run-up | Releases more CMN, up to an extra 0.5% of circulating money a day |
| Market price far below internal value | Undervalued outside | Halves releases and keeps CMN in the treasury |
| Within the band | Normal | Follows internal value and real growth |

Markets help too. When CMN is cheap outside, it buys a lot of work inside, so people buy CMN to use it, and the price comes back.

**What the simulation showed.** We simulated five years of a growing network, 40 runs per case, with an outside premium that swings 60% a year and fades by arbitrage with a 60-day half-life, plus a bubble (+80% in a month), a crash (−45% in ten days) and a three-day pump in a thin market:

| Market weight | Largest error in internal value, normal | Largest error, crash | Years per four that internal and external value sit more than 15% apart |
|---|---|---|---|
| 0% | 7% | 7% | 1.40 |
| 10% | 9% | 9% | 1.37 |
| 20% | 12% | 14% | 1.34 |
| 50% | 21% | 25% | 1.30 |

Giving the market more weight barely brings the two values closer, but it makes internal value up to three times less steady. Most of the gap is market mood, which policy cannot remove; what closes it is arbitrage, people buying cheap CMN to use it. So the market weight stays small: enough to keep the two in sight of each other, not enough to import every swing. The three-day pump left no measurable trace.

## Issuance: where new CMN comes from

New CMN exists only when the rule says the economy needs more money. During a bootstrap of up to six years, part of that money is mined by useful work. The rest, and after the bootstrap all of it, reaches the market only through the treasury, the banks and the projects they sponsor. There are no staking rewards.

**Every day** the rule compares money in circulation with the target M\*.

- **Too little money:** 10% of the gap becomes new money that day, capped at 2% of circulating money.
- **Too much money:** nothing is released. Fees keep flowing into the treasury and stay there, which takes money out of circulation.

**Every epoch** (about three months) the banks' share is released from the treasury.

- If the treasury holds enough, nothing new is created.
- If it holds less, the shortfall is issued as new CMN into the treasury first, capped at 15% of total supply per epoch.
- No new CMN is issued while money is being hoarded, meaning circulation has slowed more than 5% below its trend. Parked money comes back later, and money issued against it would be too much once it does.

**Holding is not taxed.** CMN can sit in wallets, exchange pools and lending protocols like any token. Hoarding is held in check by the design itself: the rise is capped at 25% a year, so holding has a limited payoff; issuance pauses when money is parked; and the treasury withholds when there is too much money.

**What flows into the treasury**

| Source | Share to the treasury |
|---|---|
| Protocol fee on compute jobs, app sales and royalties | 15% at target; up to 30% when work costs too much, down to 5% when it costs too little |
| Listing a program or app version | All of it (5 CMN at the starting price) |
| Chartering a bank | All of the 10 CMN fee |
| Slashed provider bonds | All of it |
| Unvested operator rewards of a closed bank | All of it |

### Bootstrap: proof of useful work

The first CMN is mined, but not by solving puzzles. It is mined by real work on the platform: compute jobs that someone asked for and paid for, run and checked by independent providers.

**The rule decides how much is mined, not a fixed schedule.** Every day the rule already works out how much new money the economy needs. During the bootstrap a share of that new money is mined, and the rest goes to banks. The mined share starts at 100% and halves every year. After six halvings, or once 10 billion CMN have been mined, mining ends and all new money goes through banks.

- **Who earns.** Each day's mined amount is shared across that day's verified work units: 80% to the providers whose results agreed, 20% to the developer of the program.
- **Limit per job.** A job earns at most 75% of what its buyer paid, and only jobs run by at least three agreeing providers can mine.
- **Starting money.** The first job needs CMN to pay for it, so 1,000,000 CMN exists at genesis. It goes to the people who ran and published real jobs on the test network, in proportion to verified work with the same 80/20 split, at most 1% per address. There is no team or investor allocation.

**Why the rule decides.** A fixed reward per unit of work creates money in proportion to activity, but the money an economy needs depends on how fast activity grows. We simulated ten years of three adoption paths (300, 5,000 and 100,000 core-years of compute bought per year at maturity), with money changing hands 5, 10 or 20 times a year:

| Result | Fixed schedule (reward 1× price, halving yearly) | Rule decides (this design) |
|---|---|---|
| Highest price of work, 10 turns a year (target 1.00) | 3.64 | 1.03 |
| Highest price of work, any case tested | 33.9 | 1.43 |
| Years outside the ±15% band, 10 turns a year (small / medium / large network) | 2.3 / 1.0 / 10 | 0.0 / 0.8 / 2.0 |

When the rule decides, the price of work does not run away. Its time outside the band falls in the first year or two, while CMN is still scarce and buys more work than its target. The worst case comes from the starting money being large for the smallest network, which is why the genesis amount is kept small.

**Self-dealing.** Someone could post jobs to their own program and hope they are drawn to their own providers. Assume they pay nothing for the computing itself and the protocol fee is at its lowest, 5%. With the 75% limit and the 80/20 split, this loses money unless they hold more than 55% of the bonded stake, which we checked by simulating the random draw. Anyone with that share could already outvote honest replicas, so one defence covers both: a large, bonded, open set of providers.

**Faster issuance during growth.** A cap of 5% of supply per epoch proved too tight for a network that grows several times a year; money stayed scarce for years in the fastest path. The cap is 15% per epoch.

## Banks

Banks are how new money reaches the people who build. They receive what the treasury releases and sponsor projects with it. They do not lend, invest or create money: the rule decides how much money there is, and banks decide where it goes.

**Founding.** No bank exists at genesis. Anyone who has used the network can propose one with a 10 CMN fee to the treasury and a 100 CMN deposit, naming between one and five operators and how many of them must sign each grant (for example two of three). The deposit comes back unless users later vote the bank out.

**Opening.** A proposal opens when at least five users endorse it and their combined weight reaches 10% of all active weight within two epochs. Otherwise it expires and the deposit is returned. At most twelve banks are open at once.

**Who has a say.** A user's weight is the protocol fees they paid into the treasury over the last 90 days. Weight is linear, so splitting activity across many wallets gives no advantage, and buying weight costs exactly what it buys: CMN paid to the treasury, which funds builders. No address may hold more than 5% of the total weight in an epoch. Holding coins gives no influence.

**Sharing the release.** Each epoch, users vote on how the release is split between banks. A bank in its first four epochs receives at most 20% of a release.

**Sponsorship.** Builders apply to a bank; grants need the bank's operator threshold, are paid at once and recorded on chain with their purpose. One grant can take at most 30% of a bank's funds, and operators cannot grant to their own listed addresses.

**What operators earn.** Running a bank is work, and it should pay when it is done well:

- **Operating share.** A bank's operators receive 3% of everything the bank receives. It vests over four epochs; if users vote the bank out, the unvested part returns to the treasury.
- **Success share.** For two years after a grant, 1% of the protocol fees generated by the sponsored project's programs and apps is paid from the treasury to the bank's operators. Operators earn most by funding what people actually use.

**Continuity.** Once a year users vote on every bank. A bank that more weight votes to close than to keep closes; its funds and deposit return to the treasury.

Every charter, vote, release and grant is recorded on chain.

## The compute market

The compute market is where useful work happens: the work that mines CMN during the bootstrap and anchors its value for good.

**Programs.** A developer publishes a compute program by registering the hash of its WebAssembly module and a royalty per job. The listing fee goes to the treasury.

**Providers.** Anyone can become a provider by locking a bond of at least 100 CMN and posting an ask per work unit. There is no fixed number of providers. The Commons app can run as a provider, so anyone with a spare computer can earn CMN by doing work.

**Jobs.** A buyer posts a job naming the program, the hash of its input, the number of replicas and a price limit, and pays the limit into escrow. After a later slot, the chain draws the replicas, weighted by bond, from providers within the limit.

**Verification.** Each replica runs the module in a metered sandbox and posts the hash of its result and the instruction count. The job settles when a majority agrees on both. Agreeing replicas are paid the clearing price for the agreed work, the developer receives the royalty, and the buyer's unused escrow is refunded.

**Bonds at risk.** While a job is open, each replica's bond backs it with at least the value of the job. A replica whose result disagrees with the majority, or that never answers, loses that backing. The larger the job, the more a provider risks by not doing it honestly.

## The Store and the Commons app

Smart contracts run small programs inside consensus. Commons also gives ordinary programs a home on chain: published, bought, run and paid for on Commons.

| Kind | What it is | How it is paid |
|---|---|---|
| App | A program you buy once and run on your own computer. The chain records the license and the hash of every build; a download that does not match is refused. | Price set by the developer |
| Compute program | A WebAssembly program that runs on independent providers, cross-checked by replicas. | Work units at the clearing price, plus a royalty per job |

The protocol fee on every one of these payments goes to the treasury.

**The Commons app** is the everyday window onto all of this, for macOS and Windows. Its Store lists every app registered on chain, buys it with CMN and keeps the license in the user's wallet; its launcher installs builds only when their hash matches the one registered on chain; its wallet shows CMN and the state of the economy. In earn mode it runs compute jobs as a provider.

## Phase 1: CMN on Solana

Commons launches in two phases. The currency goes first, on Solana, where wallets, markets and users already exist. The chain follows once the currency has proved itself.

**Why this order.** A new chain is cheapest to attack when it holds the least value, and it starts with no wallets, exchanges or liquidity. The currency is the part that has to prove itself first, and it can do that on Solana. The chain and the currency were designed as separate layers, so moving the currency later is a planned step, not a rewrite.

**How it is built.** CMN is a Token-2022 token with six decimals, named Commons. Its mint authority is a single Solana program, so only the program's rules can create CMN. The program holds the monetary rule, the compute market, bootstrap mining, the banks and the Store. Every CMN the program holds sits in one vault, and the program's ledger records whose it is: treasury, escrow, provider bonds and bank funds. Money in circulation is the total supply minus the vault.

The arithmetic of the rule lives in a small Rust library with no dependencies, written in integer arithmetic so every validator computes it bit for bit alike. The same library will run the rule on the Commons chain.

**Who runs the daily step.** Closing a day (reading the price of work, running the rule, fixing the day's mining rate) and closing an epoch are instructions anyone can call. They need no special key and pay nothing but transaction fees.

**Treasury income in phase 1** comes from the protocol fee on compute and app payments, listing and charter fees and slashed bonds. Transaction fees on Solana are paid in SOL and do not reach the treasury.

## Phase 2: the Commons chain

The move happens when three conditions are met: Byzantine-fault-tolerant consensus with an open validator set, an independent audit of the chain and the bridge, and a vote of users weighted as in bank votes. CMN moves one-to-one through a bridge; balances, banks and the treasury carry over, and the Solana program stops issuing, so there is only ever one source of new CMN. CMN stays available on Solana as a bridged token.

The Commons chain adds what only a chain of its own can do.

**Flat, relational state.** There is no tree of accounts. Every piece of state is a flat record keyed `table/id`, and relations between things are records of their own. Records written separately never contend, so blocks can be applied in parallel. The state is committed with a lattice hash: each record's hash is expanded and summed, so a block updates the commitment by adding and removing only the records it touched.

**Fees in CMN.** Every transaction pays gas in CMN; half goes to the block proposer and half to the treasury.

**Native tokens.** One token standard built into the chain, so every token, from a project's governance token to a meme coin, works with every wallet and market from day one, and trades against CMN on the chain's own markets.

**Rent by computing load.** A token or program that exists forever for free bloats the chain for everyone. Commons charges rent each epoch, mostly for the lasting computing load a program puts on the network and partly for the storage it occupies:

- **Computing load:** 5% of the gas a program's transactions used, plus 2% for every 1% of the chain's total load it takes, up to 50%. The rate rises with share so that no single program can crowd out the rest cheaply.
- **Storage:** 100 WU of work per kilobyte per year, 5 CMN at the starting price.

Whoever launches a token or program chooses who pays, and the choice is recorded at launch:

| Mode | How rent is paid |
|---|---|
| Deposit, then users | The creator prepays a deposit; when it runs out, users pay a small surcharge on each transaction. |
| Creator pays | The creator covers all rent and keeps the deposit topped up. |
| Users pay | Users pay a surcharge on each transaction from the start. |

**When rent goes unpaid.** Commons keeps a deposit, as Solana does, and archives rather than deletes, as Stellar does:

| Stage | When | What happens |
|---|---|---|
| Warning | Deposit below one epoch of rent | Wallets and the Store show the date the program will freeze. |
| Frozen | Deposit used up | Reads still work; writes are refused except rent payments, which anyone can make. Lasts 30 days. |
| Archived | After 30 days frozen | The records leave the live state; a commitment to them stays on chain and archive nodes keep the data. |
| Restored | Anyone pays | Back rent plus a new deposit; the records are checked against the commitment and return exactly as they were. |

The minimum deposit is one year of storage rent plus one epoch of computing-load rent. Token balances are never deleted; at worst they wait in the archive until someone restores them.

## Growth: who joins first, and why

CMN will never out-pump a meme coin, and it does not try to. Commons wins its first users with things other networks do not offer.

1. **Builders: funding that does not run out.** On Commons, growth makes the rule release more money, and that money reaches builders through banks for as long as the network grows. Builders come for the funding and the users.
2. **Providers: pay for spare computers.** Anyone can run the Commons app in earn mode and be paid for real work, and during the bootstrap, mined CMN on top.
3. **People who need money that holds still.** Compute buyers and sellers, developers selling software and AI agents paying for compute need prices they can plan around. CMN is priced in work, so a budget in CMN buys the same computation next month as today.
4. **Early contributors.** Whoever builds, provides or uses the network early receives the new money first, and holds a currency that rises with the network's output.

**The loop.** Bank funding draws builders. Their programs bring users, and users bring demand for CMN. The rule answers demand by letting CMN rise within its cap and releasing new money to the banks. Bigger bank budgets draw more builders. No one has to decide to fund growth: the rule does it.

**The loop can run backwards.** If activity falls, releases stop and bank budgets shrink. The treasury's balance cushions that, and the yearly continuity vote closes banks that stop working. Faking activity to win funding is costly: weight is bought only by fees paid to the treasury, and every grant is signed by a bank's operators and recorded on chain.

## How Commons compares

| | Anchor of value | Where new money goes | Can it be redeemed? |
|---|---|---|---|
| Bitcoin | Fixed supply | Miners solving puzzles | No |
| USD stablecoins | One US dollar, backed by reserves | The issuer, against deposits | Yes, by the issuer, who can freeze balances |
| Terra UST (collapsed in 2022) | One US dollar, by minting and burning LUNA | Arbitrageurs | Yes, for newly minted LUNA, which fed a spiral |
| RAI | A floating target set by a controller | Borrowers against ETH collateral | Against collateral |
| Ampleforth | An inflation-adjusted dollar target | Every holder, by rebasing balances | No |
| **CMN** | **A fixed amount of metered work** | **Useful work, then builders through banks** | **No** |

CMN shares RAI's idea of a currency steered by a rule rather than pegged, but it is anchored in something the network itself produces and measures. It promises no redemption, so there is no run to start: when CMN is in less demand, the rule simply stops releasing money.

## Governance and the road to mainnet

On devnet, the program is upgradable by its developer, and the market price is supplied by a test key. Before mainnet:

1. **Upgrades move to a multisig with a seven-day delay**, so every change is public a week before it takes effect.
2. **The market price is read only from CMN's own pools**, as a seven-day time-weighted average, with no privileged key.
3. **An independent audit** covers the program and the rule's library.
4. **Parameter changes go to a vote** weighted as bank votes are, within bounds written into the program, and the delay applies to them too.
5. **Genesis claims** are published as a list of test-network work and a Merkle root anyone can check.

Over time, the aim is to fix the rule's core in code and let votes adjust only its bounded parameters.

## Parameters

| Parameter | Value |
|---|---|
| Work unit | 1,000,000,000 metered WebAssembly instructions |
| Price of work at genesis | 0.05 CMN per work unit (1 CMN = 20 WU) |
| Work price index | work-weighted median of daily clearing prices; moves at most 1% a day |
| Price read by the rule | bounded to ±30% of the index |
| Share of the money gap closed per day | 10%, at most 2% of circulating money |
| New CMN per epoch, maximum | 15% of total supply |
| Hoarding threshold (no issuance) | circulation 5% below its trend |
| Rise with real output, maximum | 25% a year |
| Market weight in the composite index | 10% at start, up to 25% |
| Divergence band | ±10% |
| Protocol fee | 15% at target, 5% to 30% |
| Listing a program or app version | 5 CMN × work price index |
| Provider bond, minimum | 100 CMN; at least the job's value at risk per open job |
| Replicas per mining job, minimum | 3 |
| Bootstrap | mined share 100%, halving yearly, ends after 6 halvings or 10 billion CMN |
| Mining split / limit per job | 80% providers, 20% developer / 75% of what the buyer paid |
| CMN at genesis | 1,000,000, to test-network work, at most 1% per address |
| Bank charter | 10 CMN fee + 100 CMN deposit; 1–5 operators with a signing threshold |
| Bank opening | 5 endorsers and 10% of active weight within 2 epochs |
| Banks, maximum | 12 |
| Vote weight | protocol fees paid in the last 90 days, linear; at most 5% per address |
| New bank cap | 20% of a release for 4 epochs |
| One grant, maximum | 30% of a bank's funds |
| Operator rewards | 3% of what the bank receives, vesting over 4 epochs; 1% of sponsored projects' protocol fees for 2 years |
| Continuity vote | yearly; closes when close weight exceeds keep weight |
| Epoch | 91 days |
| Rent, phase 2 | 5% of gas + 2% per 1% of chain load, up to 50%; storage 100 WU per KB per year |

## Status

| Part | State |
|---|---|
| The rule's library: price index, daily rule, integral term, rise cap, composite index and band, bootstrap mining, epoch release, work units, clearing price, vote weight, operator rewards | Built and tested |
| Solana program: CMN token, genesis claims, compute market, daily and epoch steps, mining, banks | Deployed on devnet |
| Work units, binding asks, bond-weighted draw, clearing-price measurement | Deployed on devnet |
| Bank operator rewards, linear vote weight, multi-operator grants | Deployed on devnet |
| Store with on-chain licenses and hash-verified installs | Deployed on devnet |
| Metered WebAssembly runner (until then, providers report instruction counts and replicas must agree) | Next |
| Commons app for macOS: Store, wallet, verified installs | Working build, not yet notarized |
| Commons app for Windows, earn mode | Planned |
| Commons chain: flat state, lattice hash, WebAssembly contracts, banks | Running as a development network |
| Rent, native tokens, BFT consensus | Planned for phase 2 |

## Open questions

- **Native and GPU work.** The benchmark jobs that convert their time into work units need a design that resists hardware that games the benchmark.
- **The market basket.** Which assets the market price is measured against once CMN's pools exist.
- **Genesis list.** How test-network work is counted and published.

---

Commons was built by one person, with a lot of help from Claude. Website and code: [interactiveapps.net](https://interactiveapps.net).

This paper describes software under development. CMN on devnet has no value, and nothing here is an offer or investment advice.
