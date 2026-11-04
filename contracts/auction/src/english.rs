//! English (ascending) auction implementation.
//!
//! Bidders place increasing bids. The highest bidder wins when the auction ends.
//! Outbid bidders are credited claimable escrow refunds (pull-payment pattern).
//! Includes anti-sniping soft-close extension.

use soroban_sdk::{Address, Env};

use crate::escrow;
use crate::events;
use crate::types::{
    Auction, AuctionFormat, AuctionStatus, BidRecord, StorageKey, PERSISTENT_BUMP_THRESHOLD,
    PERSISTENT_LIFETIME,
};

/// Anti-sniping window: if a bid is placed within the last 5 minutes, extend by 5 minutes.
pub const ANTI_SNIPE_WINDOW_SECS: u64 = 300;
pub const EXTENSION_SECS: u64 = 300;

/// Place a bid on an English auction.
///
/// # Requirements
/// - Auction must be Active.
/// - Auction must not have ended.
/// - Bid must exceed the current highest bid by at least `min_increment`.
/// - Bid must meet or exceed the reserve price.
/// - Previous highest bidder (if any) is credited with a claimable refund (pull pattern).
pub fn place_bid(env: &Env, auction_id: u64, bidder: &Address, bid_amount: i128) {
    bidder.require_auth();

    let auction_key = StorageKey::Auction(auction_id);
    let mut auction: Auction = env
        .storage()
        .persistent()
        .get(&auction_key)
        .unwrap_or_else(|| panic!("Auction not found: {}", auction_id));

    // ── Validation ──────────────────────────────────────────────────────────
    assert!(
        auction.format == AuctionFormat::English,
        "Not an English auction"
    );
    assert!(
        auction.status == AuctionStatus::Active,
        "Auction not active"
    );
    assert!(
        *bidder != auction.seller,
        "Seller cannot bid on own auction"
    );

    let now = env.ledger().timestamp();
    assert!(now < auction.end_time, "Auction has ended");
    assert!(now >= auction.start_time, "Auction not yet started");
    assert!(
        bid_amount >= auction.reserve_price,
        "Bid below reserve price"
    );

    let min_next_bid = auction.highest_bid.saturating_add(auction.min_increment);
    assert!(
        bid_amount >= min_next_bid,
        "Bid must exceed highest bid by at least min_increment"
    );

    // ── Lock new bid funds into escrow ───────────────────────────────────────
    escrow::lock_bid(env, &auction.payment_token, bidder, bid_amount);

    // ── Credit refund to previous highest bidder (Pull over Push) ───────────
    if let Some(ref prev_bidder) = auction.highest_bidder {
        let refund_key = StorageKey::Refund(auction_id, prev_bidder.clone());
        let current_refund: i128 = env.storage().persistent().get(&refund_key).unwrap_or(0);
        let new_refund = current_refund.saturating_add(auction.highest_bid);
        env.storage().persistent().set(&refund_key, &new_refund);
        env.storage().persistent().extend_ttl(
            &refund_key,
            PERSISTENT_BUMP_THRESHOLD,
            PERSISTENT_LIFETIME,
        );

        events::emit_bid_outbid(env, auction_id, prev_bidder, auction.highest_bid);
    }

    // ── Anti-sniping: extend deadline if placed near expiration ──────────────
    if auction.end_time.saturating_sub(now) < ANTI_SNIPE_WINDOW_SECS {
        auction.end_time = now.saturating_add(EXTENSION_SECS);
        events::emit_auction_extended(env, auction_id, auction.end_time);
    }

    // ── Update auction state in persistent storage ──────────────────────────
    auction.highest_bidder = Some(bidder.clone());
    auction.highest_bid = bid_amount;

    env.storage().persistent().set(&auction_key, &auction);
    env.storage().persistent().extend_ttl(
        &auction_key,
        PERSISTENT_BUMP_THRESHOLD,
        PERSISTENT_LIFETIME,
    );

    // ── Emit event ──────────────────────────────────────────────────────────
    events::emit_bid_placed(
        env,
        &BidRecord {
            auction_id,
            bidder: bidder.clone(),
            amount: bid_amount,
            timestamp: now,
            format: AuctionFormat::English,
        },
    );
}
