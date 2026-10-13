//! Commons, phase 1: CMN on Solana.
//!
//! One program holds the monetary rule, bootstrap mining by useful work, the
//! compute market it mines on, the banks and the Store. CMN is a Token-2022
//! mint whose mint authority is the program's config account. Every CMN the
//! program holds sits in one vault; the config's ledger fields say whose it
//! is. Money in circulation is the mint's supply minus the vault.
//!
//! Work is measured in metered WebAssembly instructions: one work unit (WU) is
//! a billion of them. Providers post binding asks per WU; a job is drawn to
//! bonded providers within the buyer's limit and clears at the highest drawn
//! ask. The work price index follows the day's work-weighted median clearing
//! price.
//!
//! The arithmetic lives in `commons-econ`, shared with the Commons chain.
//! Anyone can run the daily and epoch steps (`run_day`, `run_epoch`).
use anchor_lang::prelude::*;
use anchor_spl::token_2022_extensions::spl_token_metadata_interface::state::Field;
use anchor_spl::token_2022_extensions::token_metadata::{token_metadata_initialize, token_metadata_update_field, TokenMetadataInitialize, TokenMetadataUpdateField};
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked};
use commons_econ as econ;
use solana_sha256_hasher::hashv;

mod state;
use state::*;

declare_id!("t5V6zr4BQhVRReaKDWiKF98ER8FMEL2cZeQdacsKMfa");

const P: econ::Params = econ::Params::DEFAULT;
const DECIMALS: u8 = 6;
/// Length of a day on mainnet. Devnet may use a shorter day (set at initialize)
/// so the daily rule, mining and epochs can be watched in minutes.
const DAY_SECS: i64 = 86_400;
const MIN_DAY_SECS: i64 = 60;
const SLOT_HASHES: Pubkey = anchor_lang::pubkey!("SysvarS1otHashes111111111111111111111111111");

/// SHA-256 of the concatenated parts (the runtime's hashing syscall on chain).
fn sha(parts: &[&[u8]]) -> [u8; 32] {
    let h = hashv(parts);
    let mut out = [0u8; 32];
    out.copy_from_slice(h.as_ref());
    out
}

#[program]
pub mod commons {
    use super::*;

    /// Creates the mint, the vault and the config, and mints the genesis amount
    /// into the vault. `merkle_root` commits to the test-network work list
    /// (address, amount) that may claim it.
    pub fn initialize(ctx: Context<Initialize>, merkle_root: [u8; 32], oracle: Pubkey, day_secs: i64) -> Result<()> {
        require!(day_secs >= MIN_DAY_SECS && day_secs <= DAY_SECS, CommonsError::BadAmount);
        let now = Clock::get()?.unix_timestamp;
        let c = &mut ctx.accounts.config;
        c.bump = ctx.bumps.config;
        c.vault_bump = ctx.bumps.vault;
        c.mint_bump = ctx.bumps.mint;
        c.mint = ctx.accounts.mint.key();
        c.vault = ctx.accounts.vault.key();
        c.oracle = oracle;
        c.admin = ctx.accounts.payer.key();
        c.day_secs = day_secs;
        c.genesis_ts = now;
        c.merkle_root = merkle_root;
        c.econ = EconState::from(&econ::State::new(&P, P.genesis_amount));
        c.genesis_left = P.genesis_amount as u64;
        c.spend_day = 0;
        c.closed_day = -1;
        c.processed_day = -1;
        c.fee_last = -1;

        let bump = c.bump;
        mint_to_ai(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.config.to_account_info(),
            bump,
            P.genesis_amount as u64,
        )
    }

    /// Claims a share of the genesis amount for verified test-network work.
    pub fn claim_genesis(ctx: Context<ClaimGenesis>, amount: u64, proof: Vec<[u8; 32]>) -> Result<()> {
        let c = &mut ctx.accounts.config;
        let max = econ::mul_div(P.genesis_amount, P.genesis_max_claim_ppm, econ::PPM) as u64;
        require!(amount > 0 && amount <= max, CommonsError::ClaimTooLarge);
        require!(amount <= c.genesis_left, CommonsError::GenesisExhausted);
        let claimer = ctx.accounts.claimer.key();
        let amount_le = amount.to_le_bytes();
        let mut node = sha(&[b"commons-genesis".as_ref(), claimer.as_ref(), amount_le.as_ref()]);
        for sib in proof.iter() {
            node = if node <= *sib { sha(&[node.as_ref(), sib.as_ref()]) } else { sha(&[sib.as_ref(), node.as_ref()]) };
        }
        require!(node == c.merkle_root, CommonsError::BadProof);
        c.genesis_left -= amount;
        c.genesis_claimed += amount;
        let bump = c.bump;
        transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint, &ctx.accounts.to.to_account_info(), &ctx.accounts.config.to_account_info(), bump, amount)
    }

    // ------------------------------------------------------------------
    // Compute market: the useful work that mines and prices CMN
    // ------------------------------------------------------------------

    /// Becomes a provider with a bond (at least 100 CMN) and a binding ask per WU.
    pub fn register_provider(ctx: Context<RegisterProvider>, ask: u64, bond: u64) -> Result<()> {
        require!(bond as i64 >= P.min_provider_bond, CommonsError::BondTooSmall);
        require!(ask > 0, CommonsError::BadAmount);
        let pr = &mut ctx.accounts.provider_account;
        pr.key = ctx.accounts.provider.key();
        pr.ask = ask;
        pr.bond = bond;
        let c = &mut ctx.accounts.config;
        c.bonds += bond;
        c.providers += 1;
        transfer_to_vault(&ctx.accounts.token_program, &ctx.accounts.from, &ctx.accounts.mint, &ctx.accounts.vault, &ctx.accounts.provider, bond)
    }

    /// Adds to a provider's bond, so it can back larger jobs.
    pub fn add_bond(ctx: Context<AddBond>, amount: u64) -> Result<()> {
        require!(amount > 0, CommonsError::BadAmount);
        ctx.accounts.provider_account.bond += amount;
        ctx.accounts.config.bonds += amount;
        transfer_to_vault(&ctx.accounts.token_program, &ctx.accounts.from, &ctx.accounts.mint, &ctx.accounts.vault, &ctx.accounts.provider, amount)
    }

    /// Changes the ask. It is binding: a job that draws this provider clears at
    /// no less than it, and the provider is paid the clearing price.
    pub fn set_ask(ctx: Context<SetAsk>, ask: u64) -> Result<()> {
        require!(ask > 0, CommonsError::BadAmount);
        ctx.accounts.provider_account.ask = ask;
        Ok(())
    }

    /// Leaves the provider set and takes the bond back. Not while jobs are open.
    pub fn leave_provider(ctx: Context<LeaveProvider>) -> Result<()> {
        let pr = &ctx.accounts.provider_account;
        require!(pr.open_jobs == 0 && pr.locked == 0, CommonsError::JobsOpen);
        let bond = pr.bond;
        let c = &mut ctx.accounts.config;
        c.bonds -= bond;
        c.providers -= 1;
        let bump = c.bump;
        transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint, &ctx.accounts.to.to_account_info(), &ctx.accounts.config.to_account_info(), bump, bond)
    }

    /// Lists a compute program: the hash of its WebAssembly module and a royalty
    /// per job. The listing fee (5 CMN × index) goes to the treasury.
    pub fn list_program(ctx: Context<ListProgram>, name: String, module_hash: [u8; 32], royalty: u64) -> Result<()> {
        require!(!name.is_empty() && name.len() <= 32, CommonsError::BadName);
        let today = today(&ctx.accounts.config)?;
        let es: econ::State = (&ctx.accounts.config.econ).into();
        let fee = es.publish_fee(&P) as u64;
        let l = &mut ctx.accounts.listing;
        l.developer = ctx.accounts.developer.key();
        l.name = name;
        l.module_hash = module_hash;
        l.royalty = royalty;
        let c = &mut ctx.accounts.config;
        c.treasury += fee;
        record_spend(c, today, fee);
        record_fee(c, &mut ctx.accounts.stats, ctx.accounts.developer.key(), today, fee);
        transfer_to_vault(&ctx.accounts.token_program, &ctx.accounts.from, &ctx.accounts.mint, &ctx.accounts.vault, &ctx.accounts.developer, fee)
    }

    /// Posts a job: at most `max_mwu` of work per replica, at most
    /// `limit_price` per WU, run by `replicas` providers (3 to 5). The buyer
    /// pays the limit for every replica plus the royalty into escrow; whatever
    /// the job does not use is refunded at settlement. Providers are drawn by
    /// `assign_job`, from a slot hash that does not exist yet.
    pub fn post_job(ctx: Context<PostJob>, max_mwu: u64, limit_price: u64, replicas: u8, input_hash: [u8; 32]) -> Result<()> {
        require!(max_mwu > 0 && limit_price > 0, CommonsError::BadAmount);
        require!(replicas >= P.min_replicas && replicas <= P.max_replicas, CommonsError::BadReplicas);
        let clock = Clock::get()?;
        let value = job_value(limit_price, max_mwu)?;
        require!(value > 0, CommonsError::BadAmount);
        let royalty = ctx.accounts.listing.royalty;
        let total = value.checked_mul(replicas as u64).and_then(|x| x.checked_add(royalty)).ok_or(CommonsError::Overflow)?;

        let j = &mut ctx.accounts.job;
        j.id = ctx.accounts.config.next_job;
        j.buyer = ctx.accounts.buyer.key();
        j.listing = ctx.accounts.listing.key();
        j.developer = ctx.accounts.listing.developer;
        j.input_hash = input_hash;
        j.max_mwu = max_mwu;
        j.limit_price = limit_price;
        j.royalty = royalty;
        j.replicas = replicas;
        j.created_slot = clock.slot;
        j.created_ts = clock.unix_timestamp;
        j.status = job_status::POSTED;
        ctx.accounts.listing.jobs += 1;

        let c = &mut ctx.accounts.config;
        c.next_job += 1;
        c.escrow += total;
        transfer_to_vault(&ctx.accounts.token_program, &ctx.accounts.from, &ctx.accounts.mint, &ctx.accounts.vault, &ctx.accounts.buyer, total)
    }

    /// Draws a posted job's replicas. Anyone can call it once a later slot
    /// exists. The draw uses the hash of the first slot after the job was
    /// posted, so the buyer could not know it, and is weighted by bond among
    /// providers whose ask is within the limit and whose free bond covers the
    /// job's value. The job clears at the highest ask drawn.
    /// Remaining accounts: every provider account (all `config.providers` of them).
    pub fn assign_job<'info>(ctx: Context<'info, AssignJob<'info>>) -> Result<()> {
        let clock = Clock::get()?;
        let j = &mut ctx.accounts.job;
        require!(j.status == job_status::POSTED, CommonsError::JobClosed);
        require!(clock.slot > j.created_slot, CommonsError::TooEarly);
        require!(ctx.remaining_accounts.len() == ctx.accounts.config.providers as usize, CommonsError::BadAccounts);

        let mut provs: Vec<Account<'info, Provider>> = Vec::with_capacity(ctx.remaining_accounts.len());
        for ai in ctx.remaining_accounts.iter() {
            let p: Account<'info, Provider> = Account::try_from(ai)?;
            require!(!provs.iter().any(|x| x.key() == p.key()), CommonsError::BadAccounts);
            provs.push(p);
        }
        let value = job_value(j.limit_price, j.max_mwu)?;
        let eligible: Vec<usize> = (0..provs.len())
            .filter(|&i| provs[i].bond > 0 && provs[i].ask <= j.limit_price && provs[i].bond.saturating_sub(provs[i].locked) >= value && provs[i].key != j.buyer)
            .collect();
        let k = j.replicas as usize;
        require!(eligible.len() >= k, CommonsError::NotEnoughProviders);

        let seed = slot_hash_after(&ctx.accounts.slot_hashes, j.created_slot)?;
        let id_le = j.id.to_le_bytes();
        let mut picked: Vec<usize> = Vec::with_capacity(k);
        for r in 0..k {
            let total: u128 = eligible.iter().filter(|&&i| !picked.contains(&i)).map(|&i| provs[i].bond as u128).sum();
            let r_le = (r as u32).to_le_bytes();
            let h = sha(&[seed.as_ref(), id_le.as_ref(), r_le.as_ref()]);
            let mut x = u128::from_le_bytes(h[0..16].try_into().unwrap()) % total;
            for &i in eligible.iter() {
                if picked.contains(&i) {
                    continue;
                }
                let w = provs[i].bond as u128;
                if x < w {
                    picked.push(i);
                    break;
                }
                x -= w;
            }
        }
        let clearing = picked.iter().map(|&i| provs[i].ask).max().unwrap_or(j.limit_price);
        for (slot, &i) in picked.iter().enumerate() {
            j.assigned[slot] = provs[i].key;
            provs[i].locked += value;
            provs[i].open_jobs += 1;
        }
        j.clearing_price = clearing;
        j.at_risk = value;
        j.assigned_ts = clock.unix_timestamp;
        j.status = job_status::ASSIGNED;
        for &i in picked.iter() {
            provs[i].exit(&crate::ID)?;
        }
        emit!(JobAssigned { job: j.id, clearing_price: clearing, providers: j.assigned });
        Ok(())
    }

    /// The buyer takes the escrow back from a job no one could be drawn for
    /// within a day.
    pub fn cancel_job(ctx: Context<CancelJob>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let j = &mut ctx.accounts.job;
        require!(j.status == job_status::POSTED, CommonsError::JobClosed);
        let c = &mut ctx.accounts.config;
        require!(now > j.created_ts + c.day_secs, CommonsError::TooEarly);
        let total = job_value(j.limit_price, j.max_mwu)? * j.replicas as u64 + j.royalty;
        c.escrow -= total;
        j.status = job_status::CANCELLED;
        let bump = c.bump;
        transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint, &ctx.accounts.buyer_token.to_account_info(), &ctx.accounts.config.to_account_info(), bump, total)
    }

    /// A drawn provider posts the hash of its result and the number of
    /// instructions the metered run took.
    pub fn submit_result(ctx: Context<SubmitResult>, result_hash: [u8; 32], instructions: u64) -> Result<()> {
        let j = &mut ctx.accounts.job;
        require!(j.status == job_status::ASSIGNED, CommonsError::JobClosed);
        let key = ctx.accounts.provider.key();
        let slot = (0..j.replicas as usize).find(|&i| j.assigned[i] == key).ok_or(CommonsError::NotAssigned)?;
        require!(j.submitted & (1 << slot) == 0, CommonsError::AlreadySubmitted);
        require!(instructions > 0 && econ::mwu_of(instructions) as u64 <= j.max_mwu, CommonsError::TooMuchWork);
        j.results[slot] = result_hash;
        j.instructions[slot] = instructions;
        j.submitted |= 1 << slot;
        Ok(())
    }

    /// Settles a job once every replica has posted, or a day after assignment.
    /// It needs a majority agreeing on both the result and the instruction
    /// count. Agreeing replicas are paid the clearing price for the agreed
    /// work; the others lose the bond they backed the job with.
    /// Remaining accounts: the drawn providers' accounts in order, then their
    /// CMN token accounts in order, then the developer's token account.
    pub fn settle_job<'info>(ctx: Context<'info, SettleJob<'info>>, day: i64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let today = today(&ctx.accounts.config)?;
        require!(day == today, CommonsError::WrongDay);
        let j = &mut ctx.accounts.job;
        require!(j.status == job_status::ASSIGNED, CommonsError::JobClosed);
        let k = j.replicas as usize;
        let all_in = j.submitted.count_ones() as usize == k;
        require!(all_in || now > j.assigned_ts + ctx.accounts.config.day_secs, CommonsError::TooEarly);
        require!(ctx.remaining_accounts.len() == 2 * k + 1, CommonsError::BadAccounts);

        // Majority on (result, instruction count).
        let mut best = 0usize;
        let mut best_i = 0usize;
        for i in 0..k {
            if j.submitted & (1 << i) == 0 {
                continue;
            }
            let n = (0..k)
                .filter(|&x| j.submitted & (1 << x) != 0 && j.results[x] == j.results[i] && j.instructions[x] == j.instructions[i])
                .count();
            if n > best {
                best = n;
                best_i = i;
            }
        }
        let majority = best * 2 > k;
        let (best_hash, best_instr) = (j.results[best_i], j.instructions[best_i]);
        let mwu = if majority { econ::mwu_of(best_instr) as u64 } else { 0 };
        let pay_each = econ::pay_for(j.clearing_price as i64, mwu as i64).max(0) as u64;

        let es: econ::State = (&ctx.accounts.config.econ).into();
        let c = &mut ctx.accounts.config;
        let bump = c.bump;
        let cfg_ai = c.to_account_info();
        let escrowed = j.at_risk * k as u64 + j.royalty;
        c.escrow -= escrowed;

        let mut spent = 0u64;
        let mut fees = 0u64;
        let mut agreeing = 0u8;
        for i in 0..k {
            let key = j.assigned[i];
            let mut pr: Account<'info, Provider> = Account::try_from(&ctx.remaining_accounts[i])?;
            require_keys_eq!(pr.key, key, CommonsError::BadAccounts);
            let agreed = majority && j.submitted & (1 << i) != 0 && j.results[i] == best_hash && j.instructions[i] == best_instr;
            if agreed {
                j.agreed |= 1 << i;
                agreeing += 1;
                pr.jobs_done += 1;
                let (pay, cut) = es.split_payment(&P, pay_each as i64);
                fees += cut as u64;
                spent += pay_each;
                let to = token_account_for(&ctx.remaining_accounts[k + i], &key, &c.mint)?;
                transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint, &to, &cfg_ai, bump, pay as u64)?;
            } else if majority {
                // A wrong or missing result loses the bond it backed the job with.
                let slash = j.at_risk.min(pr.bond);
                pr.bond -= slash;
                c.bonds -= slash;
                c.treasury += slash;
            }
            pr.locked = pr.locked.saturating_sub(j.at_risk).min(pr.bond);
            pr.open_jobs = pr.open_jobs.saturating_sub(1);
            pr.exit(&crate::ID)?;
        }
        // Royalty to the developer when the job produced an agreed result.
        if majority && j.royalty > 0 {
            let (pay, cut) = es.split_payment(&P, j.royalty as i64);
            fees += cut as u64;
            spent += j.royalty;
            let to = token_account_for(&ctx.remaining_accounts[2 * k], &j.developer, &c.mint)?;
            transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint, &to, &cfg_ai, bump, pay as u64)?;
        }
        let refund = escrowed - spent;
        if refund > 0 {
            let to = &ctx.accounts.buyer_token;
            require_keys_eq!(to.owner, j.buyer, CommonsError::BadAccounts);
            transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint, &to.to_account_info(), &cfg_ai, bump, refund)?;
        }

        // Fees: to the treasury, less the sponsoring bank's success share; they
        // count as the buyer's vote weight.
        credit_fees(c, ctx.accounts.sponsorship.as_deref_mut(), &j.developer, now, fees);
        record_fee(c, &mut ctx.accounts.buyer_stats, j.buyer, today, fees);
        record_spend(c, today, spent);

        j.status = if majority { job_status::SETTLED } else { job_status::REFUNDED };
        j.settled_day = today;
        j.mwu = mwu;
        j.paid_compute = pay_each * agreeing as u64;
        if majority {
            let w = &mut ctx.accounts.day_work;
            if w.ref_price == 0 {
                w.day = today;
                w.ref_price = es.wu_price(&P);
            }
            let b = econ::price_bucket(j.clearing_price as i64, w.ref_price);
            w.hist[b] = w.hist[b].saturating_add(mwu);
            w.delivered_mwu = w.delivered_mwu.saturating_add(mwu);
            // Jobs with at least 3 agreeing replicas are verified work that mines.
            if agreeing >= P.mining_min_replicas {
                j.mineable = true;
                w.verified_mwu = w.verified_mwu.saturating_add(mwu);
            }
        }
        emit!(JobSettled { job: j.id, majority, mwu, clearing_price: j.clearing_price, paid: spent, refund, fees });
        Ok(())
    }

    /// Mints a settled job's mining reward once its day has been closed.
    /// Remaining accounts: the agreeing providers' token accounts in replica
    /// order, then the developer's.
    pub fn claim_mining<'info>(ctx: Context<'info, ClaimMining<'info>>) -> Result<()> {
        let j = &mut ctx.accounts.job;
        require!(j.mineable && !j.mined, CommonsError::NotMineable);
        let w = &ctx.accounts.day_work;
        require!(w.closed && w.day == j.settled_day, CommonsError::DayOpen);
        let agreeing: Vec<usize> = (0..j.replicas as usize).filter(|&i| j.agreed & (1 << i) != 0).collect();
        require!(ctx.remaining_accounts.len() == agreeing.len() + 1, CommonsError::BadAccounts);
        let (each, dev, total) = econ::job_reward(&P, w.rate, j.mwu as i64, j.paid_compute as i64, agreeing.len() as i64);
        j.mined = true;
        if total <= 0 {
            return Ok(());
        }
        let c = &mut ctx.accounts.config;
        let mut es: econ::State = (&c.econ).into();
        require!(es.mined + total <= P.mining_cap, CommonsError::MiningCap);
        es.mine(total);
        c.econ = EconState::from(&es);
        let bump = c.bump;
        let cfg_ai = c.to_account_info();
        let mint_key = c.mint;
        for (n, i) in agreeing.iter().enumerate() {
            let to = token_account_for(&ctx.remaining_accounts[n], &j.assigned[*i], &mint_key)?;
            mint_to_ai(&ctx.accounts.token_program, &ctx.accounts.mint, &to, &cfg_ai, bump, each as u64)?;
        }
        let to = token_account_for(&ctx.remaining_accounts[agreeing.len()], &j.developer, &mint_key)?;
        mint_to_ai(&ctx.accounts.token_program, &ctx.accounts.mint, &to, &cfg_ai, bump, dev as u64)
    }

    /// Closes a finished job and returns its rent to the buyer.
    pub fn close_job(ctx: Context<CloseJob>) -> Result<()> {
        let j = &ctx.accounts.job;
        let done = match j.status {
            job_status::SETTLED => !j.mineable || j.mined,
            job_status::REFUNDED | job_status::CANCELLED => true,
            _ => false,
        };
        require!(done, CommonsError::JobClosed);
        Ok(())
    }

    // ------------------------------------------------------------------
    // The rule
    // ------------------------------------------------------------------

    /// Interim price input: the oracle posts CMN's time-weighted pool price and
    /// the depth behind it. Before mainnet this is replaced by reading CMN's
    /// own pools.
    pub fn post_market_price(ctx: Context<OracleOnly>, price: u64, depth: u64) -> Result<()> {
        let today = today(&ctx.accounts.config)?;
        let c = &mut ctx.accounts.config;
        let mut es: econ::State = (&c.econ).into();
        es.observe_market(&P, today, price as i64, depth as i64);
        c.econ = EconState::from(&es);
        Ok(())
    }

    /// Closes the next unprocessed day: moves the work price index toward the
    /// day's work-weighted median clearing price, runs the rule and sets that
    /// day's mining rate. Anyone can call it.
    pub fn run_day(ctx: Context<RunDay>, day: i64) -> Result<()> {
        let today = today(&ctx.accounts.config)?;
        let c = &mut ctx.accounts.config;
        require!(day == c.processed_day + 1 && day < today, CommonsError::WrongDay);
        let spend = if c.closed_day == day {
            let s = c.closed_spend;
            c.closed_day = -1;
            c.closed_spend = 0;
            s
        } else if c.spend_day == day {
            let s = c.day_spend;
            c.day_spend = 0;
            s
        } else {
            0
        };
        let w = &mut ctx.accounts.day_work;
        w.day = day;
        let mut es: econ::State = (&c.econ).into();
        es.update_index(&P, econ::weighted_median(&w.hist, w.ref_price));
        es.supply = ctx.accounts.mint.supply as i64;
        let circulating = ctx.accounts.mint.supply.saturating_sub(ctx.accounts.vault.amount) as i64;
        let rec = es.daily(&P, day, spend as i64, w.delivered_mwu as i64, circulating);
        c.econ = EconState::from(&es);
        c.processed_day = day;

        w.to_mining = rec.to_mining.max(0) as u64;
        w.rate = econ::mining_rate(rec.to_mining, w.verified_mwu as i64);
        w.closed = true;
        emit!(DayClosed {
            day,
            spend,
            delivered_mwu: w.delivered_mwu,
            circulating: circulating as u64,
            index_ppm: es.index_ppm,
            target_ppm: es.target_ppm,
            price_ppm: rec.price_ppm,
            new_money: rec.new_money,
            to_mining: rec.to_mining,
            to_banks: rec.to_banks,
        });
        Ok(())
    }

    /// Ends an epoch: vests operator rewards, releases the bank budget from the
    /// treasury (issuing the shortfall, capped) and splits it among active
    /// banks by votes. 3% of each bank's share vests to its operators over
    /// four epochs. Remaining accounts: every active bank, writable.
    pub fn run_epoch<'info>(ctx: Context<'info, RunEpoch<'info>>) -> Result<()> {
        let today = today(&ctx.accounts.config)?;
        let now_epoch = today / P.epoch_days;
        let c = &mut ctx.accounts.config;
        require!(now_epoch > c.epoch, CommonsError::TooEarly);
        require!(ctx.remaining_accounts.len() == c.active_banks as usize, CommonsError::BadAccounts);
        let mut es: econ::State = (&c.econ).into();
        es.supply = ctx.accounts.mint.supply as i64;
        let mut banks: Vec<Account<'info, Bank>> = Vec::new();
        for ai in ctx.remaining_accounts.iter() {
            let b: Account<'info, Bank> = Account::try_from(ai)?;
            require!(b.status == bank_status::ACTIVE, CommonsError::BadAccounts);
            require!(!banks.iter().any(|x| x.key() == b.key()), CommonsError::BadAccounts);
            banks.push(b);
        }
        // Vesting first, so this epoch's new tranche starts vesting next epoch.
        for b in banks.iter_mut() {
            let bk: &mut Bank = &mut **b;
            let vested = econ::vest_step(&mut bk.vest_left, &bk.vest_quarter);
            bk.claimable += vested;
        }
        let (release, issue) = if banks.is_empty() { (0, 0) } else { es.epoch_release(&P, c.treasury as i64) };
        c.econ = EconState::from(&es);
        if issue > 0 {
            let bump = c.bump;
            c.treasury += issue as u64;
            let cfg_ai = c.to_account_info();
            mint_to_ai(&ctx.accounts.token_program, &ctx.accounts.mint, &ctx.accounts.vault.to_account_info(), &cfg_ai, bump, issue as u64)?;
        }
        if release > 0 {
            let votes: Vec<u64> = banks.iter().map(|b| if b.vote_epoch == c.epoch { b.votes } else { 0 }).collect();
            let total: u64 = votes.iter().sum();
            let mut paid = 0u64;
            for (i, b) in banks.iter_mut().enumerate() {
                let bk: &mut Bank = &mut **b;
                let mut share = if total == 0 { release as u64 / votes.len() as u64 } else { econ::mul_div(release, votes[i] as i64, total as i64) as u64 };
                if bk.active_epoch + P.probation_epochs > c.epoch {
                    share = share.min(econ::mul_div(release, P.probation_cap_ppm, econ::PPM) as u64);
                }
                let reward = econ::operator_share(&P, share);
                econ::vest_add(&mut bk.vest_left, &mut bk.vest_quarter, now_epoch, reward);
                bk.funds += share - reward;
                bk.received += share;
                c.bank_funds += share - reward;
                c.rewards += reward;
                paid += share;
            }
            // What probation caps hold back stays in the treasury.
            c.treasury -= paid;
        }
        for b in banks.iter() {
            b.exit(&crate::ID)?;
        }
        c.epoch = now_epoch;
        Ok(())
    }

    // ------------------------------------------------------------------
    // Banks
    // ------------------------------------------------------------------

    /// Proposes a bank run by 1 to 5 operators, any `threshold` of whom must
    /// sign each grant. Costs a 10 CMN fee to the treasury and a 100 CMN
    /// deposit, returned unless users vote the bank out.
    pub fn propose_bank(ctx: Context<ProposeBank>, name: String, operators: Vec<Pubkey>, threshold: u8) -> Result<()> {
        require!(!name.is_empty() && name.len() <= 32, CommonsError::BadName);
        let n = operators.len();
        require!(n >= 1 && n <= P.max_operators as usize && threshold >= 1 && threshold as usize <= n, CommonsError::BadOperators);
        for (i, o) in operators.iter().enumerate() {
            require!(!operators[..i].contains(o), CommonsError::BadOperators);
        }
        let today = today(&ctx.accounts.config)?;
        let epoch = today / P.epoch_days;
        let fee = P.charter_fee as u64;
        let deposit = P.charter_deposit as u64;
        let c = &mut ctx.accounts.config;
        let b = &mut ctx.accounts.bank;
        b.id = c.next_bank;
        b.founder = ctx.accounts.founder.key();
        for (i, o) in operators.iter().enumerate() {
            b.operators[i] = *o;
        }
        b.n_operators = n as u8;
        b.threshold = threshold;
        b.name = name;
        b.status = bank_status::PROPOSED;
        b.created_epoch = epoch;
        b.deposit = deposit;
        b.vote_epoch = -1;
        b.round = epoch / P.continuity_epochs;
        c.next_bank += 1;
        c.treasury += fee;
        c.bank_deposits += deposit;
        record_spend(c, today, fee);
        record_fee(c, &mut ctx.accounts.stats, ctx.accounts.founder.key(), today, fee);
        transfer_to_vault(&ctx.accounts.token_program, &ctx.accounts.from, &ctx.accounts.mint, &ctx.accounts.vault, &ctx.accounts.founder, fee + deposit)
    }

    /// Endorses a proposed bank with the user's weight (protocol fees paid in
    /// the last 90 days, at most 5% of all weight). It opens with 5 endorsers
    /// and 10% of all active weight, if fewer than 12 banks are open.
    pub fn endorse_bank(ctx: Context<EndorseBank>) -> Result<()> {
        let today = today(&ctx.accounts.config)?;
        let epoch = today / P.epoch_days;
        let c = &mut ctx.accounts.config;
        let (w, total) = weight_of(c, &ctx.accounts.stats, today);
        require!(w > 0, CommonsError::NoUsage);
        let b = &mut ctx.accounts.bank;
        require!(b.status == bank_status::PROPOSED, CommonsError::BankState);
        require!(epoch < b.created_epoch + P.charter_window_epochs, CommonsError::BankExpired);
        b.endorsers += 1;
        b.endorse_weight += w;
        let quorum = econ::mul_div(total as i64, P.charter_quorum_ppm, econ::PPM) as u64;
        if b.endorsers >= P.charter_min_endorsers && b.endorse_weight >= quorum && c.active_banks < P.max_banks {
            b.status = bank_status::ACTIVE;
            b.active_epoch = epoch;
            c.active_banks += 1;
        }
        Ok(())
    }

    /// Returns the deposit of a proposal that did not open in time.
    pub fn expire_bank(ctx: Context<ExpireBank>) -> Result<()> {
        let today = today(&ctx.accounts.config)?;
        let epoch = today / P.epoch_days;
        let b = &mut ctx.accounts.bank;
        require!(b.status == bank_status::PROPOSED && epoch >= b.created_epoch + P.charter_window_epochs, CommonsError::BankState);
        b.status = bank_status::EXPIRED;
        let amount = b.deposit;
        b.deposit = 0;
        let c = &mut ctx.accounts.config;
        c.bank_deposits -= amount;
        let bump = c.bump;
        transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint, &ctx.accounts.to.to_account_info(), &ctx.accounts.config.to_account_info(), bump, amount)
    }

    /// Votes the user's weight for one bank's share of the next release.
    pub fn vote_release(ctx: Context<VoteRelease>) -> Result<()> {
        let today = today(&ctx.accounts.config)?;
        let epoch = today / P.epoch_days;
        let c = &ctx.accounts.config;
        require!(epoch == c.epoch, CommonsError::WrongDay);
        let (w, _) = weight_of(c, &ctx.accounts.stats, today);
        require!(w > 0, CommonsError::NoUsage);
        let b = &mut ctx.accounts.bank;
        require!(b.status == bank_status::ACTIVE, CommonsError::BankState);
        if b.vote_epoch != epoch {
            b.vote_epoch = epoch;
            b.votes = 0;
        }
        b.votes += w;
        Ok(())
    }

    /// A grant from a bank, signed by at least `threshold` of its operators
    /// (the payer plus any other operators passed as signing remaining
    /// accounts). At most 30% of the bank's funds; never to an operator. The
    /// recipient becomes the bank's sponsored project: for two years, 1% of
    /// the protocol fees its programs and apps generate goes to the operators.
    pub fn sponsor(ctx: Context<Sponsor>, amount: u64, purpose: String) -> Result<()> {
        require!(purpose.len() <= 64, CommonsError::BadName);
        let now = Clock::get()?.unix_timestamp;
        let b = &mut ctx.accounts.bank;
        require!(b.status == bank_status::ACTIVE, CommonsError::BankState);
        let mut signers: Vec<Pubkey> = Vec::with_capacity(MAX_OPERATORS);
        let payer = ctx.accounts.operator.key();
        require!(b.is_operator(&payer), CommonsError::NotOperator);
        signers.push(payer);
        for ai in ctx.remaining_accounts.iter() {
            if ai.is_signer && b.is_operator(ai.key) && !signers.contains(ai.key) {
                signers.push(*ai.key);
            }
        }
        require!(signers.len() >= b.threshold as usize, CommonsError::NotEnoughSigners);
        let project = ctx.accounts.to.owner;
        require!(!b.is_operator(&project), CommonsError::OperatorRecipient);
        let max = econ::mul_div(b.funds as i64, P.bank_max_sponsor_ppm, econ::PPM) as u64;
        require!(amount > 0 && amount <= max, CommonsError::SponsorTooLarge);
        b.funds -= amount;
        b.granted += amount;

        let s = &mut ctx.accounts.sponsorship;
        if s.bank == Pubkey::default() || s.until_ts < now {
            s.project = project;
            s.bank = b.key();
            s.until_ts = now + P.success_days * ctx.accounts.config.day_secs;
        }
        let c = &mut ctx.accounts.config;
        c.bank_funds -= amount;
        let bump = c.bump;
        emit!(Granted { bank: b.id, to: project, amount, purpose });
        transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint, &ctx.accounts.to.to_account_info(), &ctx.accounts.config.to_account_info(), bump, amount)
    }

    /// Moves a sponsored project's accrued success share to its bank's
    /// operators (or back to the treasury if the bank has closed). Anyone can call it.
    pub fn collect_success_share(ctx: Context<CollectSuccessShare>) -> Result<()> {
        let s = &mut ctx.accounts.sponsorship;
        let owed = s.owed;
        s.owed = 0;
        let b = &mut ctx.accounts.bank;
        if b.status == bank_status::ACTIVE {
            b.claimable += owed;
        } else {
            let c = &mut ctx.accounts.config;
            c.rewards -= owed;
            c.treasury += owed;
        }
        Ok(())
    }

    /// Pays a bank's vested operator rewards, split equally among its operators.
    /// Remaining accounts: each operator's CMN token account, in order.
    pub fn claim_operator_rewards<'info>(ctx: Context<'info, ClaimOperatorRewards<'info>>) -> Result<()> {
        let b = &mut ctx.accounts.bank;
        let n = b.n_operators as usize;
        require!(ctx.remaining_accounts.len() == n, CommonsError::BadAccounts);
        let each = b.claimable / n as u64;
        if each == 0 {
            return Ok(());
        }
        b.claimable -= each * n as u64;
        let ops = b.operators;
        let c = &mut ctx.accounts.config;
        c.rewards -= each * n as u64;
        let bump = c.bump;
        let cfg_ai = c.to_account_info();
        let mint_key = c.mint;
        for i in 0..n {
            let to = token_account_for(&ctx.remaining_accounts[i], &ops[i], &mint_key)?;
            transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint, &to, &cfg_ai, bump, each)?;
        }
        Ok(())
    }

    /// Yearly continuity vote: keep or close, with the user's weight.
    pub fn continuity_vote(ctx: Context<ContinuityVote>, round: i64, keep: bool) -> Result<()> {
        let today = today(&ctx.accounts.config)?;
        let epoch = today / P.epoch_days;
        require!(round == epoch / P.continuity_epochs, CommonsError::WrongDay);
        let (w, _) = weight_of(&ctx.accounts.config, &ctx.accounts.stats, today);
        require!(w > 0, CommonsError::NoUsage);
        let b = &mut ctx.accounts.bank;
        require!(b.status == bank_status::ACTIVE, CommonsError::BankState);
        if b.round != round {
            b.round = round;
            b.keep_weight = 0;
            b.close_weight = 0;
        }
        if keep {
            b.keep_weight += w;
        } else {
            b.close_weight += w;
        }
        Ok(())
    }

    /// After a round ends, closes a bank that more weight voted to close than
    /// to keep. Its funds, deposit and operators' unvested rewards return to
    /// the treasury; rewards already vested stay claimable.
    pub fn close_bank(ctx: Context<CloseBank>) -> Result<()> {
        let today = today(&ctx.accounts.config)?;
        let round = (today / P.epoch_days) / P.continuity_epochs;
        let b = &mut ctx.accounts.bank;
        require!(b.status == bank_status::ACTIVE && round > b.round, CommonsError::TooEarly);
        require!(b.close_weight > b.keep_weight, CommonsError::BankKept);
        b.status = bank_status::CLOSED;
        let unvested: u64 = b.vest_left.iter().sum();
        let c = &mut ctx.accounts.config;
        c.treasury += b.funds + b.deposit + unvested;
        c.bank_funds -= b.funds;
        c.bank_deposits -= b.deposit;
        c.rewards -= unvested;
        c.active_banks -= 1;
        b.funds = 0;
        b.deposit = 0;
        b.vest_left = [0; 4];
        b.vest_quarter = [0; 4];
        Ok(())
    }

    // ------------------------------------------------------------------
    // Token name
    // ------------------------------------------------------------------

    /// Writes the token's name, symbol and metadata URI into the mint (once).
    pub fn set_metadata(ctx: Context<SetMetadata>, name: String, symbol: String, uri: String) -> Result<()> {
        require!(!name.is_empty() && name.len() <= 32 && symbol.len() <= 10 && uri.len() <= 200, CommonsError::BadName);
        let c = &mut ctx.accounts.config;
        require!(!c.metadata_set, CommonsError::MetadataSet);
        c.metadata_set = true;
        let bump = c.bump;
        // The mint grows to hold the metadata; fund the extra rent first.
        let extra = 4 + 32 + 32 + 4 + name.len() + 4 + symbol.len() + 4 + uri.len() + 4;
        let mint_ai = ctx.accounts.mint.to_account_info();
        let need = Rent::get()?.minimum_balance(mint_ai.data_len() + extra).saturating_sub(mint_ai.lamports());
        if need > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new(ctx.accounts.system_program.key(), anchor_lang::system_program::Transfer { from: ctx.accounts.admin.to_account_info(), to: mint_ai.clone() }),
                need,
            )?;
        }
        let cfg_ai = ctx.accounts.config.to_account_info();
        let seeds: &[&[u8]] = &[b"config", &[bump]];
        token_metadata_initialize(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TokenMetadataInitialize {
                    program_id: ctx.accounts.token_program.to_account_info(),
                    metadata: mint_ai.clone(),
                    update_authority: cfg_ai.clone(),
                    mint_authority: cfg_ai,
                    mint: mint_ai,
                },
                &[seeds],
            ),
            name,
            symbol,
            uri,
        )
    }

    /// Points the token at its metadata file (name, symbol, logo). Admin only;
    /// changes nothing else.
    pub fn update_metadata_uri(ctx: Context<SetMetadata>, uri: String) -> Result<()> {
        require!(uri.len() <= 200, CommonsError::BadName);
        let c = &ctx.accounts.config;
        require!(c.metadata_set, CommonsError::BadAccounts);
        let bump = c.bump;
        let mint_ai = ctx.accounts.mint.to_account_info();
        let need = Rent::get()?.minimum_balance(mint_ai.data_len() + uri.len()).saturating_sub(mint_ai.lamports());
        if need > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new(ctx.accounts.system_program.key(), anchor_lang::system_program::Transfer { from: ctx.accounts.admin.to_account_info(), to: mint_ai.clone() }),
                need,
            )?;
        }
        let cfg_ai = ctx.accounts.config.to_account_info();
        let seeds: &[&[u8]] = &[b"config", &[bump]];
        token_metadata_update_field(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TokenMetadataUpdateField { program_id: ctx.accounts.token_program.to_account_info(), metadata: mint_ai, update_authority: cfg_ai },
                &[seeds],
            ),
            Field::Uri,
            uri,
        )
    }

    // ------------------------------------------------------------------
    // Store: apps bought once and run on the buyer's computer
    // ------------------------------------------------------------------

    /// Publishes an app. The listing fee (5 CMN × index) goes to the treasury.
    /// `artifact_hash` is the SHA-256 of the build; the Store refuses a
    /// download that does not match it.
    pub fn publish_app(ctx: Context<PublishApp>, name: String, description: String, version: String, price: u64, artifact_hash: [u8; 32], uri: String) -> Result<()> {
        require!(!name.is_empty() && name.len() <= 32 && description.len() <= 200 && version.len() <= 16 && uri.len() <= 200, CommonsError::BadName);
        let now = Clock::get()?.unix_timestamp;
        let today = today(&ctx.accounts.config)?;
        let es: econ::State = (&ctx.accounts.config.econ).into();
        let fee = es.publish_fee(&P) as u64;
        let a = &mut ctx.accounts.app;
        a.developer = ctx.accounts.developer.key();
        a.name = name;
        a.description = description;
        a.version = version;
        a.price = price;
        a.artifact_hash = artifact_hash;
        a.uri = uri;
        a.published_ts = now;
        a.updated_ts = now;
        let c = &mut ctx.accounts.config;
        c.treasury += fee;
        record_spend(c, today, fee);
        record_fee(c, &mut ctx.accounts.stats, ctx.accounts.developer.key(), today, fee);
        transfer_to_vault(&ctx.accounts.token_program, &ctx.accounts.from, &ctx.accounts.mint, &ctx.accounts.vault, &ctx.accounts.developer, fee)
    }

    /// Publishes a new version (or price, or description). Each version pays the listing fee.
    pub fn update_app(ctx: Context<UpdateApp>, description: String, version: String, price: u64, artifact_hash: [u8; 32], uri: String) -> Result<()> {
        require!(description.len() <= 200 && version.len() <= 16 && uri.len() <= 200, CommonsError::BadName);
        let now = Clock::get()?.unix_timestamp;
        let today = today(&ctx.accounts.config)?;
        let es: econ::State = (&ctx.accounts.config.econ).into();
        let fee = es.publish_fee(&P) as u64;
        let a = &mut ctx.accounts.app;
        a.description = description;
        a.version = version;
        a.price = price;
        a.artifact_hash = artifact_hash;
        a.uri = uri;
        a.updated_ts = now;
        let c = &mut ctx.accounts.config;
        c.treasury += fee;
        record_spend(c, today, fee);
        record_fee(c, &mut ctx.accounts.stats, ctx.accounts.developer.key(), today, fee);
        transfer_to_vault(&ctx.accounts.token_program, &ctx.accounts.from, &ctx.accounts.mint, &ctx.accounts.vault, &ctx.accounts.developer, fee)
    }

    /// Buys an app: a license account records that the buyer owns it. The
    /// developer gets the price less the protocol fee, which goes to the treasury.
    pub fn buy_app(ctx: Context<BuyApp>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let today = today(&ctx.accounts.config)?;
        let price = ctx.accounts.app.price;
        let developer = ctx.accounts.app.developer;
        let es: econ::State = (&ctx.accounts.config.econ).into();
        let (to_dev, cut) = es.split_payment(&P, price as i64);
        let l = &mut ctx.accounts.license;
        l.app = ctx.accounts.app.key();
        l.owner = ctx.accounts.buyer.key();
        l.paid = price;
        l.ts = now;
        ctx.accounts.app.sales += 1;
        if price == 0 {
            return Ok(());
        }
        let c = &mut ctx.accounts.config;
        credit_fees(c, ctx.accounts.sponsorship.as_deref_mut(), &developer, now, cut as u64);
        record_spend(c, today, price);
        record_fee(c, &mut ctx.accounts.stats, ctx.accounts.buyer.key(), today, cut as u64);
        transfer_to_vault(&ctx.accounts.token_program, &ctx.accounts.from, &ctx.accounts.mint, &ctx.accounts.vault, &ctx.accounts.buyer, cut as u64)?;
        if to_dev > 0 {
            token_interface::transfer_checked(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.from.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.developer_token.to_account_info(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    },
                ),
                to_dev as u64,
                DECIMALS,
            )?;
        }
        Ok(())
    }
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

fn today(c: &Config) -> Result<i64> {
    Ok((Clock::get()?.unix_timestamp - c.genesis_ts).max(0) / c.day_secs.max(MIN_DAY_SECS))
}

/// What one replica of a job can earn at most: the limit price for the most work.
fn job_value(limit_price: u64, max_mwu: u64) -> Result<u64> {
    let v = (limit_price as u128) * (max_mwu as u128) / econ::MWU_PER_WU as u128;
    u64::try_from(v).map_err(|_| error!(CommonsError::Overflow))
}

/// Adds platform spending to the day's total (for the velocity of money).
fn record_spend(c: &mut Config, today: i64, amount: u64) {
    if today > c.spend_day {
        if c.spend_day > c.processed_day && c.day_spend > 0 {
            if c.closed_day > c.processed_day {
                c.closed_spend += c.day_spend; // the crank is behind: fold into the waiting day
            } else {
                c.closed_day = c.spend_day;
                c.closed_spend = c.day_spend;
            }
        }
        c.spend_day = today;
        c.day_spend = 0;
    }
    c.day_spend += amount;
}

/// Adds protocol fees paid by `user` to their rolling 90-day window and to the total.
fn record_fee(c: &mut Config, s: &mut UserStats, user: Pubkey, today: i64, fee: u64) {
    s.user = user;
    if s.fee_last == 0 && s.fees == [0; 3] {
        s.fee_last = -1;
    }
    if fee == 0 {
        return;
    }
    let period = today / P.weight_period_days;
    econ::window_add(&mut s.fees, &mut s.fee_last, period, fee);
    econ::window_add(&mut c.fee_buckets, &mut c.fee_last, period, fee);
}

/// A user's vote weight now and the total it is measured against.
fn weight_of(c: &Config, s: &UserStats, today: i64) -> (u64, u64) {
    let period = today / P.weight_period_days;
    let total = econ::window_sum(&c.fee_buckets, c.fee_last, period);
    let mine = econ::window_sum(&s.fees, s.fee_last, period);
    (econ::capped_weight(&P, mine, total), total)
}

/// Credits protocol fees to the treasury, less the success share owed to the
/// bank that sponsors the developer, if that sponsorship is still running.
fn credit_fees(c: &mut Config, sponsorship: Option<&mut Account<Sponsorship>>, developer: &Pubkey, now: i64, fees: u64) {
    let mut share = 0u64;
    if let Some(s) = sponsorship {
        if s.project == *developer && s.bank != Pubkey::default() && now <= s.until_ts {
            share = econ::success_share(&P, fees);
            s.owed += share;
            s.earned += share;
        }
    }
    c.treasury += fees - share;
    c.rewards += share;
}

/// The hash of the first slot after `slot`, from the SlotHashes sysvar
/// (newest first: a u64 count, then (slot, hash) pairs). If that slot has
/// already left the sysvar, the oldest hash it still holds.
fn slot_hash_after(ai: &UncheckedAccount, slot: u64) -> Result<[u8; 32]> {
    let data = ai.try_borrow_data()?;
    require!(data.len() >= 8, CommonsError::BadAccounts);
    let n = u64::from_le_bytes(data[0..8].try_into().unwrap()) as usize;
    let n = n.min((data.len() - 8) / 40);
    require!(n > 0, CommonsError::BadAccounts);
    let mut best = n - 1; // oldest
    for i in 0..n {
        let off = 8 + i * 40;
        let s = u64::from_le_bytes(data[off..off + 8].try_into().unwrap());
        if s > slot {
            best = i; // entries are newest first, so the last match is the earliest
        } else {
            break;
        }
    }
    let off = 8 + best * 40 + 8;
    let mut h = [0u8; 32];
    h.copy_from_slice(&data[off..off + 32]);
    Ok(h)
}

fn token_account_for<'info>(ai: &'info AccountInfo<'info>, owner: &Pubkey, mint: &Pubkey) -> Result<AccountInfo<'info>> {
    let ta = InterfaceAccount::<TokenAccount>::try_from(ai)?;
    require_keys_eq!(ta.owner, *owner, CommonsError::BadAccounts);
    require_keys_eq!(ta.mint, *mint, CommonsError::BadAccounts);
    Ok(ai.clone())
}

fn transfer_to_vault<'info>(
    tp: &Interface<'info, TokenInterface>,
    from: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    authority: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token_interface::transfer_checked(
        CpiContext::new(
            tp.key(),
            TransferChecked { from: from.to_account_info(), mint: mint.to_account_info(), to: vault.to_account_info(), authority: authority.to_account_info() },
        ),
        amount,
        DECIMALS,
    )
}

fn transfer_from_vault<'info>(
    tp: &Interface<'info, TokenInterface>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &AccountInfo<'info>,
    config: &AccountInfo<'info>,
    bump: u8,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let seeds: &[&[u8]] = &[b"config", &[bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            tp.key(),
            TransferChecked { from: vault.to_account_info(), mint: mint.to_account_info(), to: to.clone(), authority: config.clone() },
            &[seeds],
        ),
        amount,
        DECIMALS,
    )
}

fn mint_to_ai<'info>(
    tp: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &AccountInfo<'info>,
    config: &AccountInfo<'info>,
    bump: u8,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let seeds: &[&[u8]] = &[b"config", &[bump]];
    token_interface::mint_to(CpiContext::new_with_signer(tp.key(), MintTo { mint: mint.to_account_info(), to: to.clone(), authority: config.clone() }, &[seeds]), amount)
}

// ----------------------------------------------------------------------
// Accounts
// ----------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        init,
        payer = payer,
        seeds = [b"mint"],
        bump,
        mint::decimals = 6,
        mint::authority = config,
        mint::token_program = token_program,
        extensions::metadata_pointer::authority = config,
        extensions::metadata_pointer::metadata_address = mint,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init, payer = payer, seeds = [b"vault"], bump, token::mint = mint, token::authority = config, token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimGenesis<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(init, payer = claimer, space = 8 + Marker::INIT_SPACE, seeds = [b"genesis", claimer.key().as_ref()], bump)]
    pub claim: Account<'info, Marker>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint)]
    pub to: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterProvider<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(init, payer = provider, space = 8 + Provider::INIT_SPACE, seeds = [b"provider", provider.key().as_ref()], bump)]
    pub provider_account: Box<Account<'info, Provider>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = provider)]
    pub from: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddBond<'info> {
    pub provider: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [b"provider", provider.key().as_ref()], bump)]
    pub provider_account: Box<Account<'info, Provider>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = provider)]
    pub from: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SetAsk<'info> {
    pub provider: Signer<'info>,
    #[account(mut, seeds = [b"provider", provider.key().as_ref()], bump)]
    pub provider_account: Box<Account<'info, Provider>>,
}

#[derive(Accounts)]
pub struct LeaveProvider<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, close = provider, seeds = [b"provider", provider.key().as_ref()], bump)]
    pub provider_account: Box<Account<'info, Provider>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = provider)]
    pub to: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct ListProgram<'info> {
    #[account(mut)]
    pub developer: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(init, payer = developer, space = 8 + Listing::INIT_SPACE, seeds = [b"program", name.as_bytes()], bump)]
    pub listing: Box<Account<'info, Listing>>,
    #[account(init_if_needed, payer = developer, space = 8 + UserStats::INIT_SPACE, seeds = [b"user", developer.key().as_ref()], bump)]
    pub stats: Box<Account<'info, UserStats>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = developer)]
    pub from: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PostJob<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub listing: Box<Account<'info, Listing>>,
    #[account(init, payer = buyer, space = 8 + Job::INIT_SPACE, seeds = [b"job", config.next_job.to_le_bytes().as_ref()], bump)]
    pub job: Box<Account<'info, Job>>,
    #[account(init_if_needed, payer = buyer, space = 8 + UserStats::INIT_SPACE, seeds = [b"user", buyer.key().as_ref()], bump)]
    pub stats: Box<Account<'info, UserStats>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = buyer)]
    pub from: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AssignJob<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub job: Box<Account<'info, Job>>,
    /// CHECK: the SlotHashes sysvar, read for the draw.
    #[account(address = SLOT_HASHES)]
    pub slot_hashes: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelJob<'info> {
    pub buyer: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = buyer)]
    pub job: Box<Account<'info, Job>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = buyer)]
    pub buyer_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SubmitResult<'info> {
    pub provider: Signer<'info>,
    #[account(mut)]
    pub job: Box<Account<'info, Job>>,
}

#[derive(Accounts)]
#[instruction(day: i64)]
pub struct SettleJob<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub job: Box<Account<'info, Job>>,
    #[account(init_if_needed, payer = caller, space = 8 + DayWork::INIT_SPACE, seeds = [b"day", day.to_le_bytes().as_ref()], bump)]
    pub day_work: Box<Account<'info, DayWork>>,
    #[account(mut, seeds = [b"user", job.buyer.as_ref()], bump)]
    pub buyer_stats: Box<Account<'info, UserStats>>,
    #[account(mut, seeds = [b"sponsored", job.developer.as_ref()], bump)]
    pub sponsorship: Option<Box<Account<'info, Sponsorship>>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint)]
    pub buyer_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimMining<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub job: Box<Account<'info, Job>>,
    #[account(seeds = [b"day", job.settled_day.to_le_bytes().as_ref()], bump)]
    pub day_work: Box<Account<'info, DayWork>>,
    #[account(mut, address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CloseJob<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut, close = buyer, has_one = buyer)]
    pub job: Box<Account<'info, Job>>,
}

#[derive(Accounts)]
pub struct OracleOnly<'info> {
    #[account(address = config.oracle)]
    pub oracle: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
}

#[derive(Accounts)]
#[instruction(day: i64)]
pub struct RunDay<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(init_if_needed, payer = caller, space = 8 + DayWork::INIT_SPACE, seeds = [b"day", day.to_le_bytes().as_ref()], bump)]
    pub day_work: Box<Account<'info, DayWork>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RunEpoch<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ProposeBank<'info> {
    #[account(mut)]
    pub founder: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(init, payer = founder, space = 8 + Bank::INIT_SPACE, seeds = [b"bank", config.next_bank.to_le_bytes().as_ref()], bump)]
    pub bank: Box<Account<'info, Bank>>,
    #[account(init_if_needed, payer = founder, space = 8 + UserStats::INIT_SPACE, seeds = [b"user", founder.key().as_ref()], bump)]
    pub stats: Box<Account<'info, UserStats>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = founder)]
    pub from: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EndorseBank<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub bank: Box<Account<'info, Bank>>,
    #[account(seeds = [b"user", user.key().as_ref()], bump)]
    pub stats: Box<Account<'info, UserStats>>,
    #[account(init, payer = user, space = 8 + Marker::INIT_SPACE, seeds = [b"endorse", bank.key().as_ref(), user.key().as_ref()], bump)]
    pub marker: Account<'info, Marker>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExpireBank<'info> {
    pub founder: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = founder)]
    pub bank: Box<Account<'info, Bank>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = founder)]
    pub to: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct VoteRelease<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub bank: Box<Account<'info, Bank>>,
    #[account(seeds = [b"user", user.key().as_ref()], bump)]
    pub stats: Box<Account<'info, UserStats>>,
    #[account(init, payer = user, space = 8 + Marker::INIT_SPACE, seeds = [b"vote", user.key().as_ref(), config.epoch.to_le_bytes().as_ref()], bump)]
    pub marker: Account<'info, Marker>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Sponsor<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub bank: Box<Account<'info, Bank>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint)]
    pub to: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init_if_needed, payer = operator, space = 8 + Sponsorship::INIT_SPACE, seeds = [b"sponsored", to.owner.as_ref()], bump)]
    pub sponsorship: Box<Account<'info, Sponsorship>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CollectSuccessShare<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub sponsorship: Box<Account<'info, Sponsorship>>,
    #[account(mut, address = sponsorship.bank)]
    pub bank: Box<Account<'info, Bank>>,
}

#[derive(Accounts)]
pub struct ClaimOperatorRewards<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub bank: Box<Account<'info, Bank>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(round: i64)]
pub struct ContinuityVote<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub bank: Box<Account<'info, Bank>>,
    #[account(seeds = [b"user", user.key().as_ref()], bump)]
    pub stats: Box<Account<'info, UserStats>>,
    #[account(init, payer = user, space = 8 + Marker::INIT_SPACE, seeds = [b"keep", bank.key().as_ref(), user.key().as_ref(), round.to_le_bytes().as_ref()], bump)]
    pub marker: Account<'info, Marker>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseBank<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub bank: Box<Account<'info, Bank>>,
}

#[derive(Accounts)]
pub struct SetMetadata<'info> {
    #[account(mut, address = config.admin)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct PublishApp<'info> {
    #[account(mut)]
    pub developer: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(init, payer = developer, space = 8 + App::INIT_SPACE, seeds = [b"app", name.as_bytes()], bump)]
    pub app: Box<Account<'info, App>>,
    #[account(init_if_needed, payer = developer, space = 8 + UserStats::INIT_SPACE, seeds = [b"user", developer.key().as_ref()], bump)]
    pub stats: Box<Account<'info, UserStats>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = developer)]
    pub from: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateApp<'info> {
    #[account(mut)]
    pub developer: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = developer)]
    pub app: Box<Account<'info, App>>,
    #[account(init_if_needed, payer = developer, space = 8 + UserStats::INIT_SPACE, seeds = [b"user", developer.key().as_ref()], bump)]
    pub stats: Box<Account<'info, UserStats>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = developer)]
    pub from: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyApp<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub app: Box<Account<'info, App>>,
    #[account(init, payer = buyer, space = 8 + License::INIT_SPACE, seeds = [b"license", app.key().as_ref(), buyer.key().as_ref()], bump)]
    pub license: Box<Account<'info, License>>,
    #[account(init_if_needed, payer = buyer, space = 8 + UserStats::INIT_SPACE, seeds = [b"user", buyer.key().as_ref()], bump)]
    pub stats: Box<Account<'info, UserStats>>,
    #[account(mut, seeds = [b"sponsored", app.developer.as_ref()], bump)]
    pub sponsorship: Option<Box<Account<'info, Sponsorship>>>,
    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.vault)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = buyer)]
    pub from: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = app.developer)]
    pub developer_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

// ----------------------------------------------------------------------
// Events and errors
// ----------------------------------------------------------------------

#[event]
pub struct DayClosed {
    pub day: i64,
    pub spend: u64,
    pub delivered_mwu: u64,
    pub circulating: u64,
    pub index_ppm: i64,
    pub target_ppm: i64,
    pub price_ppm: i64,
    pub new_money: i64,
    pub to_mining: i64,
    pub to_banks: i64,
}

#[event]
pub struct JobAssigned {
    pub job: u64,
    pub clearing_price: u64,
    pub providers: [Pubkey; 5],
}

#[event]
pub struct JobSettled {
    pub job: u64,
    pub majority: bool,
    pub mwu: u64,
    pub clearing_price: u64,
    pub paid: u64,
    pub refund: u64,
    pub fees: u64,
}

#[event]
pub struct Granted {
    pub bank: u64,
    pub to: Pubkey,
    pub amount: u64,
    pub purpose: String,
}

#[error_code]
pub enum CommonsError {
    #[msg("Amount must be positive")]
    BadAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Claim is above 1% of the genesis amount")]
    ClaimTooLarge,
    #[msg("The genesis amount has been fully claimed")]
    GenesisExhausted,
    #[msg("Proof does not match the genesis list")]
    BadProof,
    #[msg("Bond is below the minimum of 100 CMN")]
    BondTooSmall,
    #[msg("Provider still has open jobs")]
    JobsOpen,
    #[msg("Name must be 1 to 32 bytes")]
    BadName,
    #[msg("Replicas must be between 3 and 5")]
    BadReplicas,
    #[msg("Not enough providers within the limit with enough free bond")]
    NotEnoughProviders,
    #[msg("Job is not in the right state")]
    JobClosed,
    #[msg("Not drawn for this job")]
    NotAssigned,
    #[msg("Result already submitted")]
    AlreadySubmitted,
    #[msg("More work than the job allows")]
    TooMuchWork,
    #[msg("Too early")]
    TooEarly,
    #[msg("Accounts do not match")]
    BadAccounts,
    #[msg("Job cannot mine, or already has")]
    NotMineable,
    #[msg("The job's day has not been closed yet")]
    DayOpen,
    #[msg("Bootstrap mining cap reached")]
    MiningCap,
    #[msg("Days must be closed in order, after they end")]
    WrongDay,
    #[msg("No protocol fees paid in the last 90 days")]
    NoUsage,
    #[msg("Bank is not in the right state")]
    BankState,
    #[msg("Proposal window has passed")]
    BankExpired,
    #[msg("A bank needs 1 to 5 distinct operators and a threshold between 1 and their number")]
    BadOperators,
    #[msg("Only the bank's operators can do this")]
    NotOperator,
    #[msg("Not enough operators signed")]
    NotEnoughSigners,
    #[msg("A bank cannot grant to its own operators")]
    OperatorRecipient,
    #[msg("A grant can take at most 30% of a bank's funds")]
    SponsorTooLarge,
    #[msg("Users voted to keep this bank")]
    BankKept,
    #[msg("The token's name is already set")]
    MetadataSet,
}
