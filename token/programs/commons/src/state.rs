use anchor_lang::prelude::*;
use commons_econ as econ;

pub const MAX_REPLICAS: usize = 5;
pub const MAX_OPERATORS: usize = 5;

/// Mirror of `commons_econ::State`, stored on chain.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct EconState {
    pub supply: i64,
    pub issued: i64,
    pub mined: i64,
    pub released: i64,
    pub index_ppm: i64,
    pub target_ppm: i64,
    pub work_price: i64,
    pub q_short: i64,
    pub q_long: i64,
    pub v_short: i64,
    pub v_long: i64,
    pub days: i64,
    pub budget: i64,
    pub gap_integral: i64,
    pub hoarding: bool,
    pub fee_mult_ppm: i64,
    pub sig_twap: i64,
    pub sig_trend: i64,
    pub sig_depth: i64,
    pub sig_day: i64,
    pub sig_deviate_ppm: i64,
    pub last_day: i64,
    pub bootstrap_over: bool,
}

impl From<&EconState> for econ::State {
    fn from(e: &EconState) -> Self {
        econ::State {
            supply: e.supply,
            issued: e.issued,
            mined: e.mined,
            released: e.released,
            index_ppm: e.index_ppm,
            target_ppm: e.target_ppm,
            work_price: e.work_price,
            q_short: e.q_short,
            q_long: e.q_long,
            v_short: e.v_short,
            v_long: e.v_long,
            days: e.days,
            budget: e.budget,
            gap_integral: e.gap_integral,
            hoarding: e.hoarding,
            fee_mult_ppm: e.fee_mult_ppm,
            signal: econ::Signal {
                twap: e.sig_twap,
                trend: e.sig_trend,
                depth: e.sig_depth,
                day: e.sig_day,
                deviate_ppm: e.sig_deviate_ppm,
            },
            last_day: e.last_day,
            bootstrap_over: e.bootstrap_over,
        }
    }
}

impl From<&econ::State> for EconState {
    fn from(s: &econ::State) -> Self {
        EconState {
            supply: s.supply,
            issued: s.issued,
            mined: s.mined,
            released: s.released,
            index_ppm: s.index_ppm,
            target_ppm: s.target_ppm,
            work_price: s.work_price,
            q_short: s.q_short,
            q_long: s.q_long,
            v_short: s.v_short,
            v_long: s.v_long,
            days: s.days,
            budget: s.budget,
            gap_integral: s.gap_integral,
            hoarding: s.hoarding,
            fee_mult_ppm: s.fee_mult_ppm,
            sig_twap: s.signal.twap,
            sig_trend: s.signal.trend,
            sig_depth: s.signal.depth,
            sig_day: s.signal.day,
            sig_deviate_ppm: s.signal.deviate_ppm,
            last_day: s.last_day,
            bootstrap_over: s.bootstrap_over,
        }
    }
}

/// The program's single configuration and ledger. Every CMN the program holds
/// sits in one vault; the ledger fields say whose it is. (The Commons app reads
/// the fields up to `econ.target_ppm` by position: keep their order.)
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub bump: u8,
    pub vault_bump: u8,
    pub mint_bump: u8,
    pub mint: Pubkey,
    pub vault: Pubkey,
    /// Posts the outside market price until reading CMN's own pools replaces it.
    pub oracle: Pubkey,
    /// Sets the token's name, symbol and metadata link; has no other power.
    pub admin: Pubkey,
    pub metadata_set: bool,
    pub day_secs: i64,
    pub genesis_ts: i64,
    pub merkle_root: [u8; 32],
    pub genesis_claimed: u64,
    pub econ: EconState,

    // Ledger of the vault.
    pub treasury: u64,
    pub genesis_left: u64,
    pub escrow: u64,
    pub bonds: u64,
    pub bank_funds: u64,
    pub bank_deposits: u64,
    /// Owed to bank operators: vesting, vested and success shares.
    pub rewards: u64,

    // Platform spending by day (for the velocity of money).
    pub spend_day: i64,
    pub day_spend: u64,
    pub closed_day: i64,
    pub closed_spend: u64,
    pub processed_day: i64,

    // All protocol fees paid in the rolling 90-day window: the total vote weight.
    pub fee_last: i64,
    pub fee_buckets: [u64; 3],

    pub epoch: i64,
    pub next_job: u64,
    pub next_bank: u64,
    pub active_banks: u32,
    /// Number of provider accounts. Assigning a job reads all of them.
    pub providers: u32,
}

/// A compute provider: a bond and a binding ask per work unit.
#[account]
#[derive(InitSpace)]
pub struct Provider {
    pub key: Pubkey,
    pub ask: u64,  // µCMN per WU; what the provider is paid when it clears
    pub bond: u64,
    pub locked: u64, // bond backing open jobs
    pub open_jobs: u32,
    pub jobs_done: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub developer: Pubkey,
    #[max_len(32)]
    pub name: String,
    /// SHA-256 of the WebAssembly module providers run.
    pub module_hash: [u8; 32],
    pub royalty: u64, // µCMN per job
    pub jobs: u64,
}

pub mod job_status {
    pub const POSTED: u8 = 0;
    pub const ASSIGNED: u8 = 1;
    pub const SETTLED: u8 = 2;
    pub const REFUNDED: u8 = 3;
    pub const CANCELLED: u8 = 4;
}

#[account]
#[derive(InitSpace)]
pub struct Job {
    pub id: u64,
    pub buyer: Pubkey,
    pub listing: Pubkey,
    pub developer: Pubkey,
    pub input_hash: [u8; 32],
    pub max_mwu: u64,     // most work one replica may do (and be paid for)
    pub limit_price: u64, // most the buyer pays per WU
    pub royalty: u64,
    pub replicas: u8,
    pub created_slot: u64,
    pub created_ts: i64,
    pub assigned_ts: i64,
    pub assigned: [Pubkey; 5],
    pub clearing_price: u64, // highest ask among the drawn replicas
    pub at_risk: u64,        // bond each replica backs the job with
    pub results: [[u8; 32]; 5],
    pub instructions: [u64; 5],
    pub submitted: u8, // bit i: replica i has posted
    pub agreed: u8,    // bit i: replica i matched the majority
    pub status: u8,
    pub mwu: u64,          // agreed work
    pub paid_compute: u64, // what the buyer paid for the work
    pub settled_day: i64,
    pub mineable: bool,
    pub mined: bool,
}

#[account]
#[derive(InitSpace)]
pub struct DayWork {
    pub day: i64,
    /// Price the histogram buckets are relative to (the posted WU price when first used).
    pub ref_price: i64,
    pub hist: [u64; 61],
    pub delivered_mwu: u64,
    pub verified_mwu: u64,
    pub to_mining: u64,
    pub rate: i64,
    pub closed: bool,
}

/// A user's protocol fees over the rolling 90-day window: their vote weight.
#[account]
#[derive(InitSpace)]
pub struct UserStats {
    pub user: Pubkey,
    pub fee_last: i64,
    pub fees: [u64; 3],
}

#[account]
#[derive(InitSpace)]
pub struct Marker {}

pub mod bank_status {
    pub const PROPOSED: u8 = 0;
    pub const ACTIVE: u8 = 1;
    pub const CLOSED: u8 = 2;
    pub const EXPIRED: u8 = 3;
}

#[account]
#[derive(InitSpace)]
pub struct Bank {
    pub id: u64,
    pub founder: Pubkey,
    pub operators: [Pubkey; 5],
    pub n_operators: u8,
    pub threshold: u8,
    #[max_len(32)]
    pub name: String,
    pub status: u8,
    pub created_epoch: i64,
    pub active_epoch: i64,
    pub endorsers: u32,
    pub endorse_weight: u64,
    pub funds: u64,
    pub deposit: u64,
    pub vote_epoch: i64,
    pub votes: u64,
    pub round: i64,
    pub keep_weight: u64,
    pub close_weight: u64,
    pub received: u64,
    pub granted: u64,
    // Operator rewards.
    pub vest_left: [u64; 4],
    pub vest_quarter: [u64; 4],
    pub claimable: u64,
}

impl Bank {
    pub fn is_operator(&self, k: &Pubkey) -> bool {
        self.operators[..self.n_operators as usize].contains(k)
    }
}

/// A project a bank sponsored: for two years, 1% of the protocol fees its
/// programs and apps generate goes to that bank's operators.
#[account]
#[derive(InitSpace)]
pub struct Sponsorship {
    pub project: Pubkey,
    pub bank: Pubkey,
    pub until_ts: i64,
    pub owed: u64,
    pub earned: u64,
}

/// An app in the Store: bought once, run on the buyer's computer.
#[account]
#[derive(InitSpace)]
pub struct App {
    pub developer: Pubkey,
    #[max_len(32)]
    pub name: String,
    #[max_len(200)]
    pub description: String,
    #[max_len(16)]
    pub version: String,
    pub price: u64,
    pub artifact_hash: [u8; 32],
    #[max_len(200)]
    pub uri: String,
    pub sales: u64,
    pub published_ts: i64,
    pub updated_ts: i64,
}

/// Proof that `owner` bought `app`.
#[account]
#[derive(InitSpace)]
pub struct License {
    pub app: Pubkey,
    pub owner: Pubkey,
    pub paid: u64,
    pub ts: i64,
}
