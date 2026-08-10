//! Event emission helpers for StellarUrithi-Bidz.
//! All events follow Soroban best practices: lightweight topics + rich data payload.
//! Event symbols are capped at 9 characters (symbol_short! limit in soroban-sdk v22).

use soroban_sdk::{symbol_short, Address, Env, String, Symbol};

use crate::types::{AuctionFormat, BidRecord};

/// Emitted when a new auction is created.
pub fn emit_auction_created(
    env: &Env,
    auction_id: u64,
    seller: &Address,
    format: &AuctionFormat,
    reserve_price: i128,
    end_time: u64,
    metadata_uri: &String,
) {
    let topics = (symbol_short!("auc_new"), auction_id, seller.clone());
    let format_symbol = match format {
        AuctionFormat::English => symbol_short!("english"),
        AuctionFormat::Dutch => symbol_short!("dutch"),
        AuctionFormat::SealedBid => symbol_short!("sealed"),
    };
    env.events().publish(
        topics,
        (format_symbol, reserve_price, end_time, metadata_uri.clone()),
    );
}

/// Emitted when a bid is placed (English auction) or a buy occurs (Dutch).
pub fn emit_bid_placed(env: &Env, record: &BidRecord) {
    let topics = (
        symbol_short!("bid_new"),
        record.auction_id,
        record.bidder.clone(),
    );
    env.events().publish(
        topics,
        (
            record.amount,
            record.timestamp,
            format_to_symbol(record.format.clone()),
        ),
    );
}

/// Emitted when a previous bidder is refunded after being outbid.
pub fn emit_bid_refunded(env: &Env, auction_id: u64, bidder: &Address, amount: i128) {
    let topics = (symbol_short!("bid_ref"), auction_id, bidder.clone());
    env.events().publish(topics, (amount,));
}

/// Emitted when a sealed bid commitment is accepted.
pub fn emit_commitment_stored(env: &Env, auction_id: u64, bidder: &Address) {
    let topics = (symbol_short!("cmt_stor"), auction_id, bidder.clone());
    env.events().publish(topics, ());
}

/// Emitted when a sealed bid is revealed.
pub fn emit_bid_revealed(env: &Env, auction_id: u64, bidder: &Address, amount: i128) {
    let topics = (symbol_short!("bid_rev"), auction_id, bidder.clone());
    env.events().publish(topics, (amount,));
}

/// Emitted when an auction closes with a winner.
pub fn emit_auction_closed(
    env: &Env,
    auction_id: u64,
    winner: &Address,
    winning_bid: i128,
    format: &AuctionFormat,
) {
    let topics = (symbol_short!("auc_end"), auction_id, winner.clone());
    env.events()
        .publish(topics, (winning_bid, format_to_symbol(format.clone())));
}

/// Emitted when an auction is settled and funds are distributed.
pub fn emit_auction_settled(
    env: &Env,
    auction_id: u64,
    seller_proceeds: i128,
    royalty_amount: i128,
    platform_fee: i128,
) {
    let topics = (symbol_short!("auc_set"), auction_id);
    env.events()
        .publish(topics, (seller_proceeds, royalty_amount, platform_fee));
}

/// Emitted when physical-item custodian attestation is recorded.
pub fn emit_attestation_recorded(env: &Env, auction_id: u64, custodian: &Address) {
    let topics = (symbol_short!("att_rec"), auction_id, custodian.clone());
    env.events().publish(topics, ());
}

/// Emitted when an auction is cancelled.
pub fn emit_auction_cancelled(env: &Env, auction_id: u64, seller: &Address) {
    let topics = (symbol_short!("auc_cxl"), auction_id, seller.clone());
    env.events().publish(topics, ());
}

/// Emitted when the seller approves the auction contract to transfer the NFT.
pub fn emit_nft_approved(env: &Env, auction_id: u64, nft_contract: &Address, token_id: u64) {
    let topics = (symbol_short!("nft_appr"), auction_id);
    env.events()
        .publish(topics, (nft_contract.clone(), token_id));
}

/// Emitted when an unrevealed sealed-bid is refunded after the reveal deadline.
pub fn emit_unrevealed_refunded(env: &Env, auction_id: u64, bidder: &Address, amount: i128) {
    let topics = (symbol_short!("urv_ref"), auction_id, bidder.clone());
    env.events().publish(topics, (amount,));
}

// ── Helpers ────────────────────────────────────────────────────────────────────────

fn format_to_symbol(format: AuctionFormat) -> Symbol {
    match format {
        AuctionFormat::English => symbol_short!("english"),
        AuctionFormat::Dutch => symbol_short!("dutch"),
        AuctionFormat::SealedBid => symbol_short!("sealed"),
    }
}
