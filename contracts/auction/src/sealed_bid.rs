//! Sealed-bid (commit-reveal) auction implementation.
//!
//! Two-phase auction:
//! 1. **Commit phase**: Bidders submit a hash of (bid_amount + salt). Funds are locked.
//! 2. **Reveal phase**: Bidders reveal their bid and salt. Highest valid bid wins.
//!    Losing bidders are refunded after winner determination.

use soroban_sdk::{Address, Bytes, BytesN, Env};

use crate::escrow;
use crate::events;
use crate::types::{
    Auction, AuctionFormat, AuctionStatus, BidCommitment, SealedBidEntry, StorageKey,
};

/// Submit a commitment hash during the commit phase.
///
/// The commitment should be `SHA256(bid_amount || salt)` where `salt` is a
/// random 32-byte value the bidder generates and keeps secret until reveal.
/// The full bid amount is escrowed at commit time to prevent griefing.
pub fn commit_bid(
    env: &Env,
    auction_id: u64,
    bidder: &Address,
    commitment: BytesN<32>,
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
        auction.format == AuctionFormat::SealedBid,
        "Not a sealed-bid auction"
    );
    assert!(auction.status == AuctionStatus::Active, "Auction not active");

    let now = env.ledger().timestamp();
    assert!(now < auction.commit_deadline, "Commit phase has ended");
    assert!(now >= auction.start_time, "Auction not yet started");
    assert!(
        bid_amount >= auction.reserve_price,
        "Bid below reserve price"
    );

    // Ensure bidder hasn't already committed
    let key = StorageKey::Commitment(auction_id, bidder.clone());
    assert!(
        env.storage().instance().get::<_, BidCommitment>(&key).is_none(),
        "Bidder already committed"
    );

    // ── Lock the full bid amount in escrow ──────────────────────────────────
    escrow::lock_bid(env, &auction.payment_token, bidder, bid_amount);

    // ── Store commitment ────────────────────────────────────────────────────
    let commitment_record = BidCommitment {
        bidder: bidder.clone(),
        commitment,
        timestamp: now,
    };
    env.storage().instance().set(&key, &commitment_record);

    events::emit_commitment_stored(env, auction_id, bidder);
}

/// Reveal a bid during the reveal phase.
///
/// The contract verifies `SHA256(bid_amount || salt) == stored_commitment`.
/// Only valid reveals are recorded for winner determination.
pub fn reveal_bid(
    env: &Env,
    auction_id: u64,
    bidder: &Address,
    bid_amount: i128,
    salt: BytesN<32>,
) {
    bidder.require_auth();

    let mut auction: Auction = env
        .storage()
        .instance()
        .get(&StorageKey::Auction(auction_id))
        .unwrap_or_else(|| panic!("Auction not found: {}", auction_id));

    // ── Validation ──────────────────────────────────────────────────────────
    assert!(
        auction.format == AuctionFormat::SealedBid,
        "Not a sealed-bid auction"
    );

    let now = env.ledger().timestamp();
    assert!(
        now >= auction.commit_deadline,
        "Commit phase not yet ended"
    );
    assert!(now < auction.reveal_deadline, "Reveal phase has ended");

    // Verify stored commitment
    let key = StorageKey::Commitment(auction_id, bidder.clone());
    let stored: BidCommitment = env
        .storage()
        .instance()
        .get(&key)
        .unwrap_or_else(|| panic!("No commitment found for bidder"));

    // Recompute commitment: SHA256(bid_amount || salt)
    let mut preimage = Bytes::new(env);
    preimage.append(&bid_amount.to_be_bytes().into());
    preimage.append(&salt.to_array().into());

    let computed = env.crypto().sha256(&preimage);
    assert!(
        computed == stored.commitment,
        "Commitment verification failed"
    );

    // ── Ensure no duplicate reveal ──────────────────────────────────────────
    let reveal_key = StorageKey::RevealedBid(auction_id, bidder.clone());
    assert!(
        env.storage()
            .instance()
            .get::<_, SealedBidEntry>(&reveal_key)
            .is_none(),
        "Bid already revealed"
    );

    // ── Record revealed bid ─────────────────────────────────────────────────
    let entry = SealedBidEntry {
        bidder: bidder.clone(),
        amount: bid_amount,
        revealed_at: now,
    };

    auction.revealed_bids.push_back(entry.clone());
    env.storage()
        .instance()
        .set(&StorageKey::Auction(auction_id), &auction);
    env.storage().instance().set(&reveal_key, &entry);

    events::emit_bid_revealed(env, auction_id, bidder, bid_amount);
}

/// Finalize a sealed-bid auction after the reveal phase ends.
///
/// Determines the highest valid revealed bid as the winner.
/// Refunds all losing bidders and marks the auction as Ended.
/// Can be called by anyone after the reveal deadline.
pub fn finalize_sealed_auction(env: &Env, auction_id: u64) {
    let mut auction: Auction = env
        .storage()
        .instance()
        .get(&StorageKey::Auction(auction_id))
        .unwrap_or_else(|| panic!("Auction not found: {}", auction_id));

    assert!(
        auction.format == AuctionFormat::SealedBid,
        "Not a sealed-bid auction"
    );
    assert!(auction.status == AuctionStatus::Active, "Auction not active");

    let now = env.ledger().timestamp();
    assert!(now >= auction.reveal_deadline, "Reveal phase not yet ended");

    // ── Find highest bidder ─────────────────────────────────────────────────
    let mut highest_entry: Option<SealedBidEntry> = None;

    for entry in auction.revealed_bids.iter() {
        match &highest_entry {
            None => highest_entry = Some(entry.clone()),
            Some(current) => {
                if entry.amount > current.amount {
                    highest_entry = Some(entry.clone());
                }
            }
        }
    }

    let winner = highest_entry
        .unwrap_or_else(|| panic!("No valid bids revealed"));

    // ── Refund all losing bidders ───────────────────────────────────────────
    for entry in auction.revealed_bids.iter() {
        if entry.bidder != winner.bidder {
            escrow::refund_bid(
                env,
                &auction.payment_token,
                &entry.bidder,
                entry.amount,
            );
            events::emit_bid_refunded(
                env,
                auction_id,
                &entry.bidder,
                entry.amount,
            );
        }
    }

    // ── Update auction state ────────────────────────────────────────────────
    auction.highest_bidder = Some(winner.bidder.clone());
    auction.highest_bid = winner.amount;
    auction.status = AuctionStatus::Ended;

    env.storage()
        .instance()
        .set(&StorageKey::Auction(auction_id), &auction);

    events::emit_auction_closed(
        env,
        auction_id,
        &winner.bidder,
        winner.amount,
        &AuctionFormat::SealedBid,
    );
}
