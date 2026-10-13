//! The Commons monetary rule, as integer arithmetic every validator computes
//! identically. No dependencies, no floating point: this crate is shared by the
//! Solana program (phase 1) and mirrors `commons-chain/internal/econ` (phase 2).
//!
//! Units: amounts in µCMN (1 CMN = 1_000_000), ratios in ppm (1_000_000 = 1.0),
//! time in days since genesis. Work in milli-work-units (mWU): one work unit is
//! 1,000,000,000 metered WebAssembly instructions, so 1 mWU = 1,000,000.
#![no_std]

pub const MICRO: u64 = 1_000_000;
pub const PPM: i64 = 1_000_000;
/// Metered instructions in one milli-work-unit.
pub const INSTR_PER_MWU: u64 = 1_000_000;
pub const MWU_PER_WU: i64 = 1_000;
/// Buckets of the daily clearing-price histogram: 1% wide, 70% to 130% of the
/// reference price (the price the rule reads is bounded to ±30% anyway).
pub const PRICE_BUCKETS: usize = 61;

/// Parameters. Values are the white paper's.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Params {
    // Work prices at index 1.000.
    pub price_per_wu: i64, // µCMN per work unit (1 CMN = 20 WU)
    pub publish_fee: i64,  // µCMN per program or app version

    // Work price index.
    pub index_ema_ppm: i64,
    pub index_max_day_ppm: i64, // the index moves at most 1% a day
    pub price_bound_ppm: i64, // price read by the rule stays within ±this of the index

    // Monetary rule.
    pub short_ema_ppm: i64,
    pub long_ema_ppm: i64,
    pub warmup_days: i64,
    pub integral_gain_ppm: i64,
    pub integral_max_ppm: i64,
    pub price_band_ppm: i64,
    pub gap_close_day_ppm: i64,
    pub max_release_day_ppm: i64,
    pub max_issue_epoch_ppm: i64,
    pub velocity_band_ppm: i64,

    // Productivity-linked rise: the target falls with real output growth,
    // at most this much per day (ln(1.25)/365 ≈ 611 ppm: 25% a year).
    pub max_rise_day_ppm: i64,

    // Outside value.
    pub market_weight_min_ppm: i64, // 10%
    pub market_weight_max_ppm: i64, // 25%
    pub market_depth_full: i64,     // µCMN of on-chain market depth at which the weight is at max
    pub signal_twap_ppm: i64,       // weight of a new observation in the 7-day average
    pub signal_trend_ppm: i64,      // weight in the long trend
    pub signal_band_ppm: i64,       // ±10%
    pub signal_stale_days: i64,
    pub overheat_release_ppm: i64, // extra release while overheated, of circulating money per day

    // Protocol fee.
    pub protocol_fee_ppm: i64,
    pub fee_mult_min_ppm: i64,
    pub fee_mult_max_ppm: i64,
    pub fee_mult_step_ppm: i64,

    // Time.
    pub epoch_days: i64,

    // Bootstrap mining.
    pub halving_days: i64,
    pub halvings: i64,
    pub mining_cap: i64,             // µCMN
    pub mining_job_cap_ppm: i64,     // a job earns at most this share of what its buyer paid
    pub mining_provider_ppm: i64,    // providers' share; the developer gets the rest
    pub mining_min_replicas: u8,     // agreeing replicas a job needs to mine
    pub genesis_amount: i64,         // µCMN
    pub genesis_max_claim_ppm: i64,  // per address, of the genesis amount

    // Compute market.
    pub min_provider_bond: i64,
    pub min_replicas: u8,
    pub max_replicas: u8,

    // Vote weight: protocol fees paid in the last `weight_periods` periods of
    // `weight_period_days` (90 days), linear, at most `weight_cap_ppm` of the total.
    pub weight_period_days: i64,
    pub weight_periods: i64,
    pub weight_cap_ppm: i64,

    // Banks.
    pub charter_fee: i64,
    pub charter_deposit: i64,
    pub charter_min_endorsers: u32,
    pub charter_quorum_ppm: i64,
    pub charter_window_epochs: i64,
    pub max_banks: u32,
    pub probation_epochs: i64,
    pub probation_cap_ppm: i64,
    pub bank_max_sponsor_ppm: i64,
    pub continuity_epochs: i64,
    pub max_operators: u8,
    pub operator_share_ppm: i64,  // of everything a bank receives
    pub vest_epochs: i64,
    pub success_share_ppm: i64,   // of sponsored projects' protocol fees
    pub success_days: i64,
}

impl Params {
    pub const DEFAULT: Params = Params {
        price_per_wu: 50_000,
        publish_fee: 5 * MICRO as i64,

        index_ema_ppm: 100_000,
        index_max_day_ppm: 10_000,
        price_bound_ppm: 300_000,

        short_ema_ppm: 300_000,
        long_ema_ppm: 50_000,
        warmup_days: 3,
        integral_gain_ppm: 20_000,
        integral_max_ppm: 1_000_000,
        price_band_ppm: 20_000,
        gap_close_day_ppm: 100_000,
        max_release_day_ppm: 20_000,
        max_issue_epoch_ppm: 150_000,
        velocity_band_ppm: 50_000,

        max_rise_day_ppm: 611,

        market_weight_min_ppm: 100_000,
        market_weight_max_ppm: 250_000,
        market_depth_full: 10_000_000 * MICRO as i64,
        signal_twap_ppm: 133_000, // ≈ 2/(7+1): a 7-day average
        signal_trend_ppm: 20_000,
        signal_band_ppm: 100_000,
        signal_stale_days: 2,
        overheat_release_ppm: 5_000,

        protocol_fee_ppm: 150_000,
        fee_mult_min_ppm: 333_334,
        fee_mult_max_ppm: 2_000_000,
        fee_mult_step_ppm: 100_000,

        epoch_days: 91,

        halving_days: 365,
        halvings: 6,
        mining_cap: 10_000_000_000 * MICRO as i64,
        mining_job_cap_ppm: 750_000,
        mining_provider_ppm: 800_000,
        mining_min_replicas: 3,
        genesis_amount: 1_000_000 * MICRO as i64,
        genesis_max_claim_ppm: 10_000,

        min_provider_bond: 100 * MICRO as i64,
        min_replicas: 3,
        max_replicas: 5,

        weight_period_days: 30,
        weight_periods: 3,
        weight_cap_ppm: 50_000,

        charter_fee: 10 * MICRO as i64,
        charter_deposit: 100 * MICRO as i64,
        charter_min_endorsers: 5,
        charter_quorum_ppm: 100_000,
        charter_window_epochs: 2,
        max_banks: 12,
        probation_epochs: 4,
        probation_cap_ppm: 200_000,
        bank_max_sponsor_ppm: 300_000,
        continuity_epochs: 4,
        max_operators: 5,
        operator_share_ppm: 30_000,
        vest_epochs: 4,
        success_share_ppm: 10_000,
        success_days: 730,
    };
}

// ---------- arithmetic ----------

/// a*b/c, floor, with a 128-bit intermediate, saturating to i64.
pub fn mul_div(a: i64, b: i64, c: i64) -> i64 {
    if c == 0 {
        return 0;
    }
    let r = (a as i128) * (b as i128) / (c as i128);
    if r > i64::MAX as i128 {
        i64::MAX
    } else if r < i64::MIN as i128 {
        i64::MIN
    } else {
        r as i64
    }
}

pub fn isqrt(n: i64) -> i64 {
    if n <= 0 {
        return 0;
    }
    // Newton's method from a power of two at or above the root.
    let bits = 64 - (n as u64).leading_zeros() as i64;
    let mut x: i64 = 1i64 << ((bits + 1) / 2).min(62);
    loop {
        let y = (x + n / x) / 2;
        if y >= x {
            break;
        }
        x = y;
    }
    x
}

pub fn clamp(x: i64, lo: i64, hi: i64) -> i64 {
    if x < lo {
        lo
    } else if x > hi {
        hi
    } else {
        x
    }
}

fn ema(prev: i64, x: i64, w_ppm: i64) -> i64 {
    prev + mul_div(x - prev, w_ppm, PPM)
}

/// 0.5^(day/halving_days) in ppm, linear between halvings.
pub fn halving_share_ppm(p: &Params, day: i64) -> i64 {
    if day < 0 {
        return PPM;
    }
    let n = day / p.halving_days;
    if n >= p.halvings {
        return 0;
    }
    let hi = PPM >> n;
    let lo = PPM >> (n + 1);
    let frac = day % p.halving_days;
    hi - mul_div(hi - lo, frac, p.halving_days)
}

// ---------- state ----------

/// The external market observation: CMN's price in a basket of other coins
/// (time-weighted, from on-chain pools). Only its movement against its own
/// trend is used, so its unit does not matter.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Signal {
    pub twap: i64,
    pub trend: i64,
    pub depth: i64, // µCMN of liquidity behind the price
    pub day: i64,
    pub deviate_ppm: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Market {
    None,
    Normal,
    Overheated,
    Slumping,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct State {
    pub supply: i64,
    pub issued: i64, // by the rule through the treasury, since genesis
    pub mined: i64,  // by bootstrap mining, since genesis
    pub released: i64,

    pub index_ppm: i64,
    pub target_ppm: i64,
    pub work_price: i64, // last measured median clearing price, µCMN per WU

    pub q_short: i64,
    pub q_long: i64,
    pub v_short: i64,
    pub v_long: i64,
    pub days: i64,

    pub budget: i64, // bank release budget since the last epoch
    pub gap_integral: i64,
    pub hoarding: bool,
    pub fee_mult_ppm: i64,
    pub signal: Signal,
    pub last_day: i64,
    pub bootstrap_over: bool,
}

/// What the rule did at a day boundary.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct DayRecord {
    pub day: i64,
    pub spend: i64,
    pub output: i64,        // work delivered by settled jobs, mWU
    pub circulating: i64,
    pub velocity_ppm: i64,
    pub price_ppm: i64,     // price of work the rule acted on (composite)
    pub market_weight_ppm: i64,
    pub target: i64,        // money target M*
    pub gap: i64,
    pub new_money: i64,     // today's share of the gap
    pub to_mining: i64,     // part of it paid to useful work
    pub to_banks: i64,      // part of it added to the bank budget
    pub target_ppm: i64,
    pub warming_up: bool,
}

impl State {
    pub fn new(p: &Params, genesis_supply: i64) -> State {
        State {
            supply: genesis_supply,
            issued: 0,
            mined: 0,
            released: 0,
            index_ppm: PPM,
            target_ppm: PPM,
            work_price: p.price_per_wu,
            q_short: 0,
            q_long: 0,
            v_short: 0,
            v_long: 0,
            days: 0,
            budget: 0,
            gap_integral: 0,
            hoarding: false,
            fee_mult_ppm: PPM,
            signal: Signal::default(),
            last_day: 0,
            bootstrap_over: false,
        }
    }

    // ----- work prices -----

    /// The posted price of a work unit at today's index (µCMN).
    pub fn wu_price(&self, p: &Params) -> i64 {
        mul_div(p.price_per_wu, self.index_ppm, PPM)
    }
    pub fn publish_fee(&self, p: &Params) -> i64 {
        mul_div(p.publish_fee, self.index_ppm, PPM)
    }
    pub fn fee_ppm(&self, p: &Params) -> i64 {
        mul_div(p.protocol_fee_ppm, self.fee_mult_ppm, PPM)
    }
    /// Splits a payment into (to the earner, to the treasury).
    pub fn split_payment(&self, p: &Params, amount: i64) -> (i64, i64) {
        let cut = mul_div(amount, self.fee_ppm(p), PPM);
        (amount - cut, cut)
    }

    /// Moves the index toward the day's work-weighted median clearing price.
    /// A day without settled jobs leaves it where it is.
    pub fn update_index(&mut self, p: &Params, median_clearing: Option<i64>) {
        let Some(m) = median_clearing else { return };
        if m <= 0 {
            return;
        }
        self.work_price = m;
        let want = mul_div(m, PPM, p.price_per_wu);
        let next = ema(self.index_ppm, want, p.index_ema_ppm);
        let step = mul_div(self.index_ppm, p.index_max_day_ppm, PPM);
        self.index_ppm = clamp(next, self.index_ppm - step, self.index_ppm + step);
    }

    // ----- outside value -----

    pub fn observe_market(&mut self, p: &Params, day: i64, price: i64, depth: i64) {
        if price <= 0 {
            return;
        }
        let s = &mut self.signal;
        if s.trend <= 0 {
            s.trend = price;
            s.twap = price;
        } else {
            s.twap = ema(s.twap, price, p.signal_twap_ppm);
            s.trend = ema(s.trend, price, p.signal_trend_ppm);
        }
        s.depth = depth.max(0);
        s.day = day;
        s.deviate_ppm = mul_div(s.twap - s.trend, PPM, s.trend);
    }

    pub fn market(&self, p: &Params, day: i64) -> Market {
        let s = &self.signal;
        if s.trend <= 0 || day - s.day > p.signal_stale_days {
            return Market::None;
        }
        if s.deviate_ppm > p.signal_band_ppm {
            Market::Overheated
        } else if s.deviate_ppm < -p.signal_band_ppm {
            Market::Slumping
        } else {
            Market::Normal
        }
    }

    /// Market weight: 10% with thin markets, rising to 25% as depth grows.
    pub fn market_weight_ppm(&self, p: &Params, day: i64) -> i64 {
        if self.market(p, day) == Market::None {
            return 0;
        }
        let f = clamp(mul_div(self.signal.depth, PPM, p.market_depth_full), 0, PPM);
        p.market_weight_min_ppm + mul_div(p.market_weight_max_ppm - p.market_weight_min_ppm, f, PPM)
    }

    // ----- the daily rule -----

    /// Runs once per day with the day that ended, the platform spending of that
    /// day (µCMN), the work delivered by jobs settled that day (mWU) and the
    /// money circulating now (supply minus everything the program holds).
    pub fn daily(&mut self, p: &Params, day: i64, spend: i64, output_mwu: i64, circulating: i64) -> DayRecord {
        let mut rec = DayRecord { day, spend, circulating, ..Default::default() };
        rec.output = output_mwu.max(0);
        if circulating > 0 {
            rec.velocity_ppm = mul_div(spend, PPM, circulating);
        }
        let q_long_before = self.q_long;
        if self.days == 0 && (spend > 0 || rec.output > 0) && circulating > 0 {
            self.q_short = rec.output;
            self.q_long = rec.output;
            self.v_short = rec.velocity_ppm;
            self.v_long = rec.velocity_ppm;
            self.days = 1;
        } else if self.days > 0 {
            self.q_short = ema(self.q_short, rec.output, p.short_ema_ppm);
            self.q_long = ema(self.q_long, rec.output, p.long_ema_ppm);
            self.v_short = ema(self.v_short, rec.velocity_ppm, p.short_ema_ppm);
            self.v_long = ema(self.v_long, rec.velocity_ppm, p.long_ema_ppm);
            self.days += 1;
        }
        self.last_day = day;
        let market = self.market(p, day);
        let work_ppm = mul_div(self.work_price, PPM, p.price_per_wu);

        // Hoarding: money circulating more than 5% slower than its trend.
        // No new CMN is issued while it lasts.
        if self.days > 0 && self.v_long > 0 {
            let ratio = mul_div(self.v_short, PPM, self.v_long);
            self.hoarding = ratio < PPM - p.velocity_band_ppm;
        }

        // Productivity-linked rise: real output growth lowers the target, capped.
        if self.days > p.warmup_days && q_long_before > 0 && self.q_long > q_long_before {
            let g = mul_div(self.q_long - q_long_before, PPM, q_long_before);
            let g = clamp(g, 0, p.max_rise_day_ppm);
            self.target_ppm -= mul_div(self.target_ppm, g, PPM);
        }
        rec.target_ppm = self.target_ppm;

        if self.days < p.warmup_days || circulating <= 0 {
            rec.warming_up = true;
            return rec;
        }

        // Composite price: work, plus a small market weight. A market run-up
        // (CMN dearer outside) reads as a lower price level in CMN.
        let bound = mul_div(self.index_ppm, p.price_bound_ppm, PPM);
        let work = clamp(work_ppm, self.index_ppm - bound, self.index_ppm + bound);
        let w_mkt = self.market_weight_ppm(p, day);
        let mkt = if w_mkt > 0 { mul_div(work, PPM, PPM + self.signal.deviate_ppm) } else { work };
        let price = mul_div(work, PPM - w_mkt, PPM) + mul_div(mkt, w_mkt, PPM);
        rec.price_ppm = price;
        rec.market_weight_ppm = w_mkt;

        // M* = M·P*/P with an integral term.
        let gap = mul_div(price - self.target_ppm, PPM, self.target_ppm);
        self.gap_integral = clamp(self.gap_integral + gap, -p.integral_max_ppm, p.integral_max_ppm);
        let mut target = mul_div(circulating, self.target_ppm, price);
        target -= mul_div(target, mul_div(self.gap_integral, p.integral_gain_ppm, PPM), PPM);
        target = target.max(0);

        // Protocol fee multiplier.
        if price > self.target_ppm + p.price_band_ppm {
            self.fee_mult_ppm += p.fee_mult_step_ppm;
        } else if price < self.target_ppm - p.price_band_ppm {
            self.fee_mult_ppm -= p.fee_mult_step_ppm;
        }
        self.fee_mult_ppm = clamp(self.fee_mult_ppm, p.fee_mult_min_ppm, p.fee_mult_max_ppm);

        rec.target = target;
        rec.gap = target - circulating;
        let max_day = mul_div(circulating, p.max_release_day_ppm, PPM);
        let mut new_money = clamp(mul_div(rec.gap - self.budget, p.gap_close_day_ppm, PPM), 0, max_day);
        match market {
            Market::Overheated => new_money += mul_div(circulating, p.overheat_release_ppm, PPM),
            Market::Slumping => new_money /= 2,
            _ => {}
        }
        rec.new_money = new_money;

        // Bootstrap: a halving share goes to useful work, the rest to banks.
        let share = if self.bootstrap_over { 0 } else { halving_share_ppm(p, day) };
        if share == 0 {
            self.bootstrap_over = true;
        }
        let mut to_mining = mul_div(new_money, share, PPM);
        let room = p.mining_cap - self.mined;
        if to_mining >= room {
            to_mining = room.max(0);
            self.bootstrap_over = true;
        }
        rec.to_mining = to_mining;
        rec.to_banks = new_money - to_mining;
        self.budget += rec.to_banks;
        rec
    }

    /// Records CMN actually minted to miners (at most the day's `to_mining`).
    pub fn mine(&mut self, amount: i64) {
        self.mined += amount;
        self.supply += amount;
    }

    /// End of epoch: how much the treasury releases to banks, and how much of
    /// that is newly issued because the treasury holds less. Resets the budget.
    pub fn epoch_release(&mut self, p: &Params, treasury: i64) -> (i64, i64) {
        let mut release = self.budget;
        self.budget = 0;
        if release <= 0 {
            return (0, 0);
        }
        let mut issue = 0;
        if release > treasury {
            if self.hoarding {
                return (treasury.max(0), 0);
            }
            issue = (release - treasury).min(mul_div(self.supply, p.max_issue_epoch_ppm, PPM));
            release = treasury + issue;
        }
        self.issued += issue;
        self.supply += issue;
        self.released += release;
        (release, issue)
    }

}

// ---------- the compute market ----------

/// What `mwu` of work costs at `price_per_wu` (µCMN), rounded down.
pub fn pay_for(price_per_wu: i64, mwu: i64) -> i64 {
    mul_div(price_per_wu, mwu, MWU_PER_WU)
}

/// Metered instructions to mWU, rounded up so any work is at least 1 mWU.
pub fn mwu_of(instructions: u64) -> i64 {
    if instructions == 0 {
        return 0;
    }
    ((instructions - 1) / INSTR_PER_MWU + 1) as i64
}

/// The histogram bucket for a clearing price, relative to the day's reference price.
pub fn price_bucket(price: i64, reference: i64) -> usize {
    if reference <= 0 {
        return PRICE_BUCKETS / 2;
    }
    let r = mul_div(price, PPM, reference); // ppm of the reference
    let i = (r - 700_000 + 5_000).div_euclid(10_000);
    clamp(i, 0, PRICE_BUCKETS as i64 - 1) as usize
}

/// The price a bucket stands for.
pub fn bucket_price(i: usize, reference: i64) -> i64 {
    mul_div(reference, 700_000 + 10_000 * i as i64, PPM)
}

/// Work-weighted median of a day's clearing prices, from its histogram.
pub fn weighted_median(hist: &[u64], reference: i64) -> Option<i64> {
    let total: u128 = hist.iter().map(|&w| w as u128).sum();
    if total == 0 {
        return None;
    }
    let mut acc: u128 = 0;
    for (i, &w) in hist.iter().enumerate() {
        acc += w as u128;
        if acc * 2 >= total {
            return Some(bucket_price(i, reference));
        }
    }
    None
}

// ---------- vote weight ----------

/// A voter's weight: the protocol fees they paid in the window, at most
/// `weight_cap_ppm` of all weight. Linear, so splitting across wallets gains nothing.
pub fn capped_weight(p: &Params, fees: u64, total: u64) -> u64 {
    let cap = mul_div(total as i64, p.weight_cap_ppm, PPM).max(0) as u64;
    fees.min(cap)
}

/// Sums a rolling fee window: `buckets[i]` holds the fees of period
/// `period - k` where `i = (period - k) % n`, valid while `last` is recent.
pub fn window_sum(buckets: &[u64], last_period: i64, period: i64) -> u64 {
    let n = buckets.len() as i64;
    let mut t = 0u64;
    for k in 0..n {
        let q = period - k;
        if q >= 0 && q <= last_period && q > last_period - n {
            t = t.saturating_add(buckets[(q % n) as usize]);
        }
    }
    t
}

/// Adds `amount` to the rolling window for `period`, clearing periods that
/// have fallen out of it.
pub fn window_add(buckets: &mut [u64], last_period: &mut i64, period: i64, amount: u64) {
    let n = buckets.len() as i64;
    if period > *last_period {
        let from = (*last_period + 1).max(period - n + 1);
        for q in from..=period {
            buckets[(q % n) as usize] = 0;
        }
        *last_period = period;
    }
    if period > *last_period - n {
        let i = (period % n) as usize;
        buckets[i] = buckets[i].saturating_add(amount);
    }
}

// ---------- bank operators ----------

/// Operators' share of what a bank receives (vests over `vest_epochs`).
pub fn operator_share(p: &Params, received: u64) -> u64 {
    mul_div(received as i64, p.operator_share_ppm, PPM).max(0) as u64
}

/// Operators' success share of a protocol fee from a sponsored project.
pub fn success_share(p: &Params, fee: u64) -> u64 {
    mul_div(fee as i64, p.success_share_ppm, PPM).max(0) as u64
}

/// Linear vesting in four tranches. Each epoch vests a quarter of every
/// tranche still vesting; a new tranche goes in the slot that just emptied.
pub fn vest_step(left: &mut [u64; 4], quarter: &[u64; 4]) -> u64 {
    let mut vested = 0u64;
    for i in 0..4 {
        let v = quarter[i].min(left[i]);
        left[i] -= v;
        vested += v;
    }
    vested
}

pub fn vest_add(left: &mut [u64; 4], quarter: &mut [u64; 4], epoch: i64, amount: u64) {
    let i = (epoch.rem_euclid(4)) as usize;
    // The slot's previous tranche has fully vested after four steps.
    left[i] = left[i].saturating_add(amount);
    quarter[i] = left[i].div_ceil(4);
}

// ---------- bootstrap mining ----------

/// The day's reward rate per verified mWU (µCMN per mWU, scaled by PPM).
pub fn mining_rate(to_mining: i64, verified_mwu: i64) -> i64 {
    if verified_mwu <= 0 {
        return 0;
    }
    mul_div(to_mining, PPM, verified_mwu)
}

/// A job's mining reward: (to each agreeing provider, to the developer, total).
pub fn job_reward(p: &Params, rate: i64, mwu: i64, buyer_paid: i64, agreeing: i64) -> (i64, i64, i64) {
    if agreeing <= 0 {
        return (0, 0, 0);
    }
    let by_rate = mul_div(mwu, rate, PPM);
    let total = by_rate.min(mul_div(buyer_paid, p.mining_job_cap_ppm, PPM));
    let providers = mul_div(total, p.mining_provider_ppm, PPM);
    let each = providers / agreeing;
    let developer = total - each * agreeing;
    (each, developer, each * agreeing + developer)
}

#[cfg(test)]
mod tests;
