//! Dutch (descending-price) auction implementation.
//!
//! The price starts high and drops linearly over time.
//! The first bidder to "buy" at the current price wins instantly.
//! Supports max_price slippage protection to guard against ledger latency.

use soroban_sdk::{Address, Env};

use crate::escrow;
use crate::events;
use crate::types::{
    Auction, AuctionFormat, AuctionStatus, BidRecord, StorageKey, PERSISTENT_BUMP_THRESHOLD,
    PERSISTENT_LIFETIME,
};

/// Calculate the current price for a Dutch auction based on elapsed time.
pub fn get_current_price(env: &Env, auction: &Auction) -> i128 {
    let now = env.ledger().timestamp();

    if now <= auction.start_time {
        return auction.start_price;
    }

    let elapsed = now.saturating_sub(auction.start_time) as i128;
    let decay = elapsed
        .checked_mul(auction.price_decay_per_second)
        .unwrap_or(i128::MAX);

    let current = auction
        .start_price
        .checked_sub(decay)
        .unwrap_or(auction.reserve_price);

    if current < auction.reserve_price {
        auction.reserve_price
    } else {
        current
    }
}

/// Accept the current price and win the Dutch auction instantly.
///
/// # Requirements
/// - Auction must be Active.
/// - Auction must not have ended.
/// - Buyer pays the current computed price (guarded by optional max_price slippage limit).
/// - Auction closes immediately upon successful buy.
pub fn buy_now(env: &Env, auction_id: u64, buyer: &Address, max_price: Option<i128>) {
    buyer.require_auth();

    let auction_key = StorageKey::Auction(auction_id);
    let mut auction: Auction = env
        .storage()
        .persistent()
        .get(&auction_key)
        .unwrap_or_else(|| panic!("Auction not found: {}", auction_id));

    // ── Validation ──────────────────────────────────────────────────────────
    assert!(
        auction.format == AuctionFormat::Dutch,
        "Not a Dutch auction"
    );
    assert!(
        auction.status == AuctionStatus::Active,
        "Auction not active"
    );
    assert!(*buyer != auction.seller, "Seller cannot buy own auction");

    let now = env.ledger().timestamp();
    assert!(now >= auction.start_time, "Auction not yet started");
    assert!(now < auction.end_time, "Auction has ended");

    let price = get_current_price(env, &auction);

    // Slippage protection: guarantee buyer doesn't pay more than expected
    if let Some(limit) = max_price {
        assert!(price <= limit, "Current price exceeds max acceptable price");
    }

    // ── Lock buyer funds into escrow ────────────────────────────────────────
    escrow::lock_bid(env, &auction.payment_token, buyer, price);

    // ── Record as winning bid ───────────────────────────────────────────────
    auction.highest_bidder = Some(buyer.clone());
    auction.highest_bid = price;
    auction.current_dutch_price = price;
    auction.status = AuctionStatus::Ended;

    env.storage().persistent().set(&auction_key, &auction);
    env.storage().persistent().extend_ttl(
        &auction_key,
        PERSISTENT_BUMP_THRESHOLD,
        PERSISTENT_LIFETIME,
    );

    // ── Emit events ─────────────────────────────────────────────────────────
    events::emit_bid_placed(
        env,
        &BidRecord {
            auction_id,
            bidder: buyer.clone(),
            amount: price,
            timestamp: now,
            format: AuctionFormat::Dutch,
        },
    );

    events::emit_auction_closed(env, auction_id, buyer, price, &AuctionFormat::Dutch);
}
