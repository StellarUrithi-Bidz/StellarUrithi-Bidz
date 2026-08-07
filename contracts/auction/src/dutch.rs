//! Dutch (descending-price) auction implementation.
//!
//! The price starts high and drops linearly over time.
//! The first bidder to "buy" at the current price wins instantly.

use soroban_sdk::{Address, Env};

use crate::escrow;
use crate::events;
use crate::types::{Auction, AuctionFormat, AuctionStatus, BidRecord, StorageKey};

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
/// - Buyer pays the current computed price.
/// - Auction closes immediately upon successful buy.
pub fn buy_now(env: &Env, auction_id: u64, buyer: &Address) {
    buyer.require_auth();

    let mut auction: Auction = env
        .storage()
        .instance()
        .get(&StorageKey::Auction(auction_id))
        .unwrap_or_else(|| panic!("Auction not found: {}", auction_id));

    // ── Validation ──────────────────────────────────────────────────────────
    assert!(
        auction.format == AuctionFormat::Dutch,
        "Not a Dutch auction"
    );
    assert!(auction.status == AuctionStatus::Active, "Auction not active");
    assert!(*buyer != auction.seller, "Seller cannot buy own auction");

    let now = env.ledger().timestamp();
    assert!(now >= auction.start_time, "Auction not yet started");
    assert!(now < auction.end_time, "Auction has ended");

    let price = get_current_price(env, &auction);

    // ── Lock buyer funds ────────────────────────────────────────────────────
    escrow::lock_bid(env, &auction.payment_token, buyer, price);

    // ── Record as winning bid ───────────────────────────────────────────────
    auction.highest_bidder = Some(buyer.clone());
    auction.highest_bid = price;
    auction.current_dutch_price = price;
    auction.status = AuctionStatus::Ended;

    env.storage()
        .instance()
        .set(&StorageKey::Auction(auction_id), &auction);

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

    events::emit_auction_closed(
        env,
        auction_id,
        buyer,
        price,
        &AuctionFormat::Dutch,
    );
}
