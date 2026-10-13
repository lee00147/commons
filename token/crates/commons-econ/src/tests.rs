extern crate std;
use super::*;
use std::vec::Vec;

const P: Params = Params::DEFAULT;
const CMN: i64 = MICRO as i64;

const WORK: i64 = 200_000; // mWU delivered a day in the tests

fn warm(s: &mut State, days: i64, spend: i64, circ: i64) {
    for d in 0..days {
        s.daily(&P, d, spend, WORK, circ);
    }
}

#[test]
fn math() {
    assert_eq!(mul_div(i64::MAX, 2, 1), i64::MAX);
    assert_eq!(mul_div(10, 3, 4), 7);
    for n in [0i64, 1, 2, 3, 4, 15, 16, 17, 1_000_000, 999_999_999_999, i64::MAX] {
        let r = isqrt(n);
        assert!(r * r <= n || n == 0);
        assert!((r as i128 + 1) * (r as i128 + 1) > n as i128, "isqrt {n}");
    }
}

#[test]
fn halving_share() {
    assert_eq!(halving_share_ppm(&P, 0), PPM);
    assert_eq!(halving_share_ppm(&P, 365), PPM / 2);
    assert_eq!(halving_share_ppm(&P, 730), PPM / 4);
    assert!(halving_share_ppm(&P, 182) < PPM && halving_share_ppm(&P, 182) > PPM / 2);
    assert_eq!(halving_share_ppm(&P, 6 * 365), 0);
    assert_eq!(halving_share_ppm(&P, 10_000), 0);
}

#[test]
fn index_moves_at_most_one_percent_a_day() {
    let mut s = State::new(&P, 1_000_000 * CMN);
    s.update_index(&P, Some(100_000)); // jobs cleared at twice the genesis price
    assert_eq!(s.index_ppm, 1_010_000);
    for _ in 0..3 {
        s.update_index(&P, Some(1));
    }
    assert!(s.index_ppm >= 1_010_000 * 97 / 100);
    // A day without settled jobs changes nothing.
    let before = s.index_ppm;
    s.update_index(&P, None);
    assert_eq!(s.index_ppm, before);
}

#[test]
fn clearing_price_histogram_median_is_work_weighted() {
    let r = 50_000;
    assert_eq!(price_bucket(r, r), 30);
    assert_eq!(bucket_price(30, r), r);
    assert_eq!(price_bucket(r * 2, r), PRICE_BUCKETS - 1, "clamped high");
    assert_eq!(price_bucket(1, r), 0, "clamped low");
    assert_eq!(price_bucket(r * 105 / 100, r), 35);
    let mut h = [0u64; PRICE_BUCKETS];
    // Many small cheap jobs, one large job at +5%: the large job's price wins.
    h[price_bucket(r * 90 / 100, r)] += 10 * 100;
    h[price_bucket(r * 105 / 100, r)] += 5_000;
    assert_eq!(weighted_median(&h, r), Some(r * 105 / 100));
    assert_eq!(weighted_median(&[0u64; PRICE_BUCKETS], r), None);
}

#[test]
fn work_units_and_pay() {
    assert_eq!(mwu_of(0), 0);
    assert_eq!(mwu_of(1), 1);
    assert_eq!(mwu_of(1_000_000), 1);
    assert_eq!(mwu_of(1_000_001), 2);
    assert_eq!(mwu_of(20_000_000_000), 20_000); // 20 WU
    // 20 WU at the genesis price is 1 CMN.
    assert_eq!(pay_for(P.price_per_wu, 20_000), CMN);
    let s = State::new(&P, 0);
    assert_eq!(s.wu_price(&P), 50_000);
}

#[test]
fn warmup_then_release_when_work_is_cheap() {
    let mut s = State::new(&P, 1_000_000 * CMN);
    let circ = 900_000 * CMN;
    warm(&mut s, 3, 10_000 * CMN, circ);
    // Work got cheaper: CMN gained value, money is short.
    s.work_price = 40_000;
    let r = s.daily(&P, 3, 10_000 * CMN, WORK, circ);
    assert!(!r.warming_up);
    assert!(r.gap > 0);
    assert!(r.new_money > 0);
    assert!(r.new_money <= circ * 2 / 100);
    // Day 3 of the bootstrap: almost all of it is mined.
    assert!(r.to_mining > r.to_banks * 50);
    assert_eq!(r.to_mining + r.to_banks, r.new_money);
}

#[test]
fn no_release_when_work_is_dear() {
    let mut s = State::new(&P, 1_000_000 * CMN);
    let circ = 900_000 * CMN;
    warm(&mut s, 3, 10_000 * CMN, circ);
    s.work_price = 60_000;
    let r = s.daily(&P, 3, 10_000 * CMN, WORK, circ);
    assert!(r.gap < 0);
    assert_eq!(r.new_money, 0);
    assert!(s.fee_mult_ppm > PPM, "the fee rises to absorb money");
}

#[test]
fn bank_share_grows_and_mining_ends() {
    let mut s = State::new(&P, 1_000_000 * CMN);
    let circ = 900_000 * CMN;
    warm(&mut s, 3, 10_000 * CMN, circ);
    s.work_price = 40_000;
    let y1 = s.daily(&P, 365 + 3, 10_000 * CMN, WORK, circ);
    assert!((y1.to_mining - y1.to_banks).abs() <= y1.new_money / 100 + 1, "half and half after a year");
    let y7 = s.daily(&P, 7 * 365, 10_000 * CMN, WORK, circ);
    assert_eq!(y7.to_mining, 0);
    assert!(s.bootstrap_over);
    let later = s.daily(&P, 3 * 365, 10_000 * CMN, WORK, circ);
    assert_eq!(later.to_mining, 0, "once over, mining never restarts");
}

#[test]
fn mining_cap_ends_bootstrap() {
    let mut s = State::new(&P, 1_000_000 * CMN);
    s.mined = P.mining_cap - 5 * CMN;
    let circ = 900_000 * CMN;
    warm(&mut s, 3, 10_000 * CMN, circ);
    s.work_price = 40_000;
    let r = s.daily(&P, 3, 10_000 * CMN, WORK, circ);
    assert_eq!(r.to_mining, 5 * CMN);
    assert!(s.bootstrap_over);
}

#[test]
fn job_reward_limits_and_split() {
    // Plenty of budget: the 75% cap binds.
    let rate = mining_rate(1_000_000 * CMN, 1_000);
    let (each, dev, total) = job_reward(&P, rate, 100, 15 * CMN, 3);
    assert_eq!(total, 15 * CMN * 3 / 4);
    assert_eq!(each * 3 + dev, total);
    assert!(dev >= total / 5 && dev < total / 5 + 3);
    // Thin budget: the rate binds.
    let rate = mining_rate(1 * CMN, 1_000);
    let (_, _, total) = job_reward(&P, rate, 100, 15 * CMN, 3);
    assert_eq!(total, CMN / 10);
}

#[test]
fn self_dealing_loses_money_below_55_percent() {
    // Attacker is buyer and developer and controls share f of providers, with
    // free compute and the lowest protocol fee (5%). Expected profit per job.
    let fee = mul_div(P.protocol_fee_ppm, P.fee_mult_min_ppm, PPM); // ≈ 5%
    let k = 3i64;
    let price = 1_000 * CMN; // per replica
    let paid = k * price;
    let total = mul_div(paid, P.mining_job_cap_ppm, PPM);
    for (f_ppm, profitable) in [(400_000i64, false), (500_000, false), (540_000, false), (600_000, true)] {
        let back = mul_div(k * f_ppm, price - mul_div(price, fee, PPM), PPM);
        let providers = mul_div(total, P.mining_provider_ppm, PPM);
        let mined = mul_div(providers, f_ppm, PPM) + (total - providers);
        let profit = back + mined - paid;
        assert_eq!(profit > 0, profitable, "f={f_ppm} profit={profit}");
    }
}

#[test]
fn epoch_release_issues_only_the_shortfall_up_to_15_percent() {
    let mut s = State::new(&P, 1_000_000 * CMN);
    s.budget = 400_000 * CMN;
    let (rel, iss) = s.epoch_release(&P, 100_000 * CMN);
    assert_eq!(iss, 150_000 * CMN);
    assert_eq!(rel, 250_000 * CMN);
    assert_eq!(s.supply, 1_150_000 * CMN);
    assert_eq!(s.budget, 0);
    // Hoarding: release only what the treasury holds.
    s.budget = 10 * CMN;
    s.hoarding = true;
    assert_eq!(s.epoch_release(&P, 3 * CMN), (3 * CMN, 0));
}

#[test]
fn hoarding_is_detected_and_stops_issuance() {
    let mut s = State::new(&P, 1_000_000 * CMN);
    let circ = 900_000 * CMN;
    for d in 0..40 {
        s.daily(&P, d, 10_000 * CMN, WORK, circ);
    }
    assert!(!s.hoarding);
    // Spending collapses while money stays put: circulation slows.
    for d in 40..45 {
        s.daily(&P, d, 2_000 * CMN, WORK, circ);
    }
    assert!(s.hoarding);
    s.budget = 100 * CMN;
    assert_eq!(s.epoch_release(&P, 0), (0, 0), "nothing issued while hoarding");
}

#[test]
fn productivity_rise_is_capped_at_25_percent_a_year() {
    let mut s = State::new(&P, 1_000_000 * CMN);
    let circ = 900_000 * CMN;
    let mut work = WORK;
    for d in 0..365 {
        work = work * 1_010 / 1_000; // delivered work grows ~3600% a year
        s.daily(&P, d, 10_000 * CMN, work, circ);
    }
    // Target fell (CMN buys more work), but by no more than ~25%.
    assert!(s.target_ppm < PPM);
    assert!(s.target_ppm >= 790_000, "target {}", s.target_ppm);
    // Flat activity: once the long average has caught up, the target holds.
    for d in 365..1_000 {
        s.daily(&P, d, 10_000 * CMN, work, circ);
    }
    let before = s.target_ppm;
    for d in 1_000..1_035 {
        s.daily(&P, d, 10_000 * CMN, work, circ);
    }
    assert_eq!(s.target_ppm, before);
}

#[test]
fn market_signal_band_and_weight() {
    let mut s = State::new(&P, 1_000_000 * CMN);
    for d in 0..30 {
        s.observe_market(&P, d, 1_000, 0);
    }
    assert_eq!(s.market(&P, 29), Market::Normal);
    assert_eq!(s.market_weight_ppm(&P, 29), 100_000);
    s.observe_market(&P, 30, 1_000, P.market_depth_full * 2);
    assert_eq!(s.market_weight_ppm(&P, 30), 250_000);
    for d in 31..40 {
        s.observe_market(&P, d, 1_600, 0);
    }
    assert_eq!(s.market(&P, 39), Market::Overheated);
    assert_eq!(s.market(&P, 39 + 3), Market::None, "stale");
    // A 3-day pump of +30% does not cross the band.
    let mut q = State::new(&P, 0);
    for d in 0..60 {
        q.observe_market(&P, d, 1_000, 0);
    }
    for d in 60..63 {
        q.observe_market(&P, d, 1_300, 0);
    }
    assert_eq!(q.market(&P, 62), Market::Normal, "deviation {}", q.signal.deviate_ppm);
}

#[test]
fn overheated_market_adds_release() {
    let mut s = State::new(&P, 1_000_000 * CMN);
    let circ = 900_000 * CMN;
    for d in 0..30 {
        s.observe_market(&P, d, 1_000, 0);
    }
    for d in 30..40 {
        s.observe_market(&P, d, 1_800, 0);
    }
    warm(&mut s, 3, 10_000 * CMN, circ);
    let r = s.daily(&P, 39, 10_000 * CMN, WORK, circ);
    assert!(r.new_money >= circ * 5 / 1000);
}

#[test]
fn split_and_linear_capped_weights() {
    let s = State::new(&P, 0);
    assert_eq!(s.split_payment(&P, 100 * CMN), (85 * CMN, 15 * CMN));
    // Linear: two wallets with half the fees each weigh the same as one.
    let total = 1_000 * CMN as u64;
    assert_eq!(capped_weight(&P, 20 * CMN as u64, total) * 2, capped_weight(&P, 40 * CMN as u64, total));
    // Capped at 5% of all weight.
    assert_eq!(capped_weight(&P, 900 * CMN as u64, total), 50 * CMN as u64);
}

#[test]
fn rolling_fee_window_covers_three_periods() {
    let mut b = [0u64; 3];
    let mut last = -1i64;
    window_add(&mut b, &mut last, 0, 10);
    window_add(&mut b, &mut last, 1, 20);
    window_add(&mut b, &mut last, 2, 30);
    assert_eq!(window_sum(&b, last, 2), 60);
    window_add(&mut b, &mut last, 3, 1); // period 0 falls out
    assert_eq!(window_sum(&b, last, 3), 51);
    assert_eq!(window_sum(&b, last, 5), 1, "only period 3 is still inside the window at period 5");
    assert_eq!(window_sum(&b, last, 6), 0);
    window_add(&mut b, &mut last, 9, 7); // a long gap clears everything
    assert_eq!(window_sum(&b, last, 9), 7);
}

#[test]
fn operator_rewards_vest_linearly_over_four_epochs() {
    assert_eq!(operator_share(&P, 1_000 * CMN as u64), 30 * CMN as u64);
    assert_eq!(success_share(&P, 100 * CMN as u64), CMN as u64);
    let (mut left, mut q) = ([0u64; 4], [0u64; 4]);
    vest_add(&mut left, &mut q, 0, 100);
    let mut got = Vec::new();
    for e in 1..=5 {
        got.push(vest_step(&mut left, &q));
        if e == 1 {
            vest_add(&mut left, &mut q, 1, 40);
        }
    }
    assert_eq!(got, [25, 35, 35, 35, 10]);
    assert_eq!(left, [0; 4]);
}
