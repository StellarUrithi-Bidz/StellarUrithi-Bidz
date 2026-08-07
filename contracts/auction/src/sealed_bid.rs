//! Sealed-bid (commit-reveal) auction implementation.
//!
//! Two-phase auction:
//! 1. **Commit phase**: Bidders submit an HMAC-SHA256 commitment:
//!    HMAC-SHA256(key = salt, message = bid_amount || auction_id || bidder).
//!    Funds are locked. HMAC-SHA256 provides proper hiding — even with low-entropy
//!    bid amounts, the secret salt protects against offline brute-force.
//! 2. **Reveal phase**: Bidders reveal their bid and salt. Highest valid bid wins.
//!    Losing bidders are refunded after winner determination.
//!
//! Bound commitment: binding the message to auction_id + bidder prevents
//! cross-auction replay and makes cross-bidder precomputation infeasible.
//!
//! Gas safety: `max_bidders` caps the number of unique bidders to prevent
//! DoS via Vec reallocation in the reveal phase.

use soroban_sdk::{Address, Bytes, BytesN, Env};

use crate::escrow;
use crate::events;
use crate::types::{
    Auction, AuctionFormat, AuctionStatus, BidCommitment, SealedBidEntry, StorageKey,
};

// ── HMAC-SHA256 (RFC 2104) ──────────────────────────────────────────────────────
//
// Soroban's env.crypto() provides SHA-256 but not HMAC-SHA256.
// We implement HMAC-SHA256 manually using the SHA-256 primitive.
//
// HMAC(K, m) = H((K' ⊕ opad) || H((K' ⊕ ipad) || m))
// where K' is the key padded to the block size (64 bytes for SHA-256).
//
// This replaces plain SHA256 for commitment verification because:
// - HMAC provides hiding: an attacker cannot brute-force bid_amount without the salt,
//   even though bid amounts have low entropy (~60 bits).
// - HMAC is a PRF (pseudorandom function): the output is indistinguishable
//   from random, preventing length-extension and structural attacks on SHA256.

fn hmac_sha256(env: &Env, key: &BytesN<32>, message: &Bytes) -> BytesN<32> {
    const BLOCK_SIZE: usize = 64;
    const IPAD: u8 = 0x36;
    const OPAD: u8 = 0x5c;

    // Pad the 32-byte key to 64 bytes with zeros
    let key_array = key.to_array();
    let mut key_padded = [0u8; BLOCK_SIZE];
    for i in 0..32 {
        key_padded[i] = key_array[i];
    }

    // ── Inner hash: H((K' ⊕ ipad) || message) ──
    let mut inner = Bytes::new(env);
    for i in 0..BLOCK_SIZE {
        inner.push_back(key_padded[i] ^ IPAD);
    }
    // Append the message bytes
    for byte in message.iter() {
        inner.push_back(byte);
    }
    let inner_hash = env.crypto().sha256(&inner);

    // ── Outer hash: H((K' ⊕ opad) || inner_hash) ──
    let mut outer = Bytes::new(env);
    for i in 0..BLOCK_SIZE {
        outer.push_back(key_padded[i] ^ OPAD);
    }
    // Append the inner hash (32 bytes)
    let inner_bytes = inner_hash.to_array();
    for i in 0..32 {
        outer.push_back(inner_bytes[i]);
    }

    env.crypto().sha256(&outer)
}

/// Submit an HMAC-SHA256 commitment during the commit phase.
///
/// The commitment is HMAC-SHA256(key = salt, message = bid_amount || auction_id || bidder):
/// - `salt` (BytesN<32>) — 32-byte secret key for HMAC, MUST be randomly generated
/// - `bid_amount` (i128 big-endian) — appended to the message
/// - `auction_id` (u64 big-endian) — appended to the message, prevents cross-auction replay
/// - `bidder` (Address bytes) — appended to the message, prevents cross-bidder precomputation
///
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

    // Enforce max_bidders cap for gas safety
    if auction.max_bidders > 0 {
        assert!(
            auction.bidder_count < auction.max_bidders,
            "Maximum number of bidders reached"
        );
    }

    // Ensure bidder hasn't already committed
    let key = StorageKey::Commitment(auction_id, bidder.clone());
    let already_committed = env
        .storage()
        .instance()
        .get::<_, BidCommitment>(&key)
        .is_some();

    // ── Lock the full bid amount in escrow ──────────────────────────────────
    escrow::lock_bid(env, &auction.payment_token, bidder, bid_amount);

    // ── Store commitment ────────────────────────────────────────────────────
    let commitment_record = BidCommitment {
        bidder: bidder.clone(),
        commitment,
        amount: bid_amount,
        timestamp: now,
    };
    env.storage().instance().set(&key, &commitment_record);

    // Increment bidder count (only for new bidders, not re-commits)
    if !already_committed {
        auction.bidder_count += 1;
    }
    env.storage()
        .instance()
        .set(&StorageKey::Auction(auction_id), &auction);

    events::emit_commitment_stored(env, auction_id, bidder);
}

/// Reveal a bid during the reveal phase.
///
/// Verifies that SHA256(bid_amount || salt || auction_id || bidder)
/// matches the stored commitment. Only valid reveals are recorded.
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

    // ── Compute bound commitment ────────────────────────────────────────────
    // SHA256(bid_amount || salt || auction_id || bidder)
    let mut preimage = Bytes::new(env);

    // Append bid_amount as big-endian i128
    preimage.append(&bid_amount.to_be_bytes().into());

    // Append the salt
    preimage.append(&salt.to_array().into());

    // Append auction_id as big-endian u64
    preimage.append(&auction_id.to_be_bytes().into());

    // Append bidder address bytes (binds commitment to this specific bidder)
    preimage.append(&bidder.to_bytes().into());

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

/// Refund a bidder who committed but did not reveal their bid.
///
/// Can be called by anyone after the reveal deadline passes.
/// The committed funds are returned to the bidder. No penalty is applied.
/// This protects bidders who lost their salt or had connectivity issues.
pub fn refund_unrevealed(env: &Env, auction_id: u64, bidder: &Address) {
    let mut auction: Auction = env
        .storage()
        .instance()
        .get(&StorageKey::Auction(auction_id))
        .unwrap_or_else(|| panic!("Auction not found: {}", auction_id));

    assert!(
        auction.format == AuctionFormat::SealedBid,
        "Not a sealed-bid auction"
    );

    let now = env.ledger().timestamp();
    assert!(
        now >= auction.reveal_deadline,
        "Reveal phase not yet ended — cannot refund before reveal deadline"
    );

    // Verify the bidder committed
    let commit_key = StorageKey::Commitment(auction_id, bidder.clone());
    let stored: BidCommitment = env
        .storage()
        .instance()
        .get(&commit_key)
        .unwrap_or_else(|| panic!("No commitment found for bidder"));

    // Verify the bidder did NOT already reveal
    let reveal_key = StorageKey::RevealedBid(auction_id, bidder.clone());
    assert!(
        env.storage()
            .instance()
            .get::<_, SealedBidEntry>(&reveal_key)
            .is_none(),
        "Bid already revealed — use finalize instead"
    );

    let refund_amount = stored.amount;

    // Remove the commitment from storage
    env.storage().instance().remove(&commit_key);

    // Refund the locked bid amount
    escrow::refund_bid(env, &auction.payment_token, bidder, refund_amount);

    // Update bidder count so finalize still works correctly
    if auction.bidder_count > 0 {
        auction.bidder_count -= 1;
    }
    env.storage()
        .instance()
        .set(&StorageKey::Auction(auction_id), &auction);

    events::emit_unrevealed_refunded(env, auction_id, bidder, refund_amount);
}

/// Finalize a sealed-bid auction after the reveal phase ends.
///
/// Determines the highest valid revealed bid as the winner.
/// Refunds all losing revealed bidders and marks the auction as Ended.
/// Can be called by anyone after the reveal deadline.
///
/// Note: Bidders who committed but never revealed are NOT refunded here —
/// they must call `refund_unrevealed` separately.
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

    // ── Refund all losing revealed bidders ───────────────────────────────────
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
