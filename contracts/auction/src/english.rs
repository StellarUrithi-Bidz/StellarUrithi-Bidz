//! English (ascending) auction implementation.
//!
//! Bidders place increasing bids. The highest bidder wins when the auction ends.
//! Previous highest bidders are automatically refunded when outbid.

use soroban_sdk::{Address, Env};

use crate::escrow;
use crate::events;
use crate::types::{Auction, AuctionFormat, AuctionStatus, BidRecord, StorageKey};

/// Place a bid on an English auction.
///
/// # Requirements
/// - Auction must be Active.
/// - Auction must not have ended.
/// - Bid must exceed the current highest bid by at least `min_increment`.
/// - Bid must meet or exceed the reserve price.
/// - Previous highest bidder (if any) is refunded automatically.
pub fn place_bid(
    env: &Env,
    auction_id: u64,
    bidder: &Address,
    bid_amount: i128,
) {
    bidder.require_auth();

    let mut auction: Auction = env
        .storage()
        .instance()
        .get(&StorageKey::Auction(auction_id))
        .unwrap_or_else(|| panic!("Auction not found: {}", auction_id));

    // ── Validation ──────────────────────────────────────────────────────────
    assert!(
        auction.format == AuctionFormat::English,
        "Not an English auction"
    );
    assert!(auction.status == AuctionStatus::Active, "Auction not active");
    assert!(*bidder != auction.seller, "Seller cannot bid on own auction");

    let now = env.ledger().timestamp();
    assert!(now < auction.end_time, "Auction has ended");
    assert!(now >= auction.start_time, "Auction not yet started");
    assert!(
        bid_amount >= auction.reserve_price,
        "Bid below reserve price"
    );

    let min_next_bid = auction.highest_bid + auction.min_increment;
    assert!(
        bid_amount >= min_next_bid,
        "Bid must exceed highest bid by at least min_increment"
    );

    // ── Lock new bid funds ──────────────────────────────────────────────────
    escrow::lock_bid(env, &auction.payment_token, bidder, bid_amount);

    // ── Refund previous highest bidder ──────────────────────────────────────
    if let Some(ref prev_bidder) = auction.highest_bidder {
        escrow::refund_bid(
            env,
            &auction.payment_token,
            prev_bidder,
            auction.highest_bid,
        );

        events::emit_bid_refunded(env, auction_id, prev_bidder, auction.highest_bid);
    }

    // ── Update auction state ────────────────────────────────────────────────
    auction.highest_bidder = Some(bidder.clone());
    auction.highest_bid = bid_amount;

    env.storage()
        .instance()
        .set(&StorageKey::Auction(auction_id), &auction);

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
