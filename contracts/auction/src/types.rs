//! Shared types, storage keys, and data structures for StellarUrithi-Bidz auctions.
//! Supports English (ascending), Dutch (descending), and Sealed-Bid auction formats.

use soroban_sdk::{contracttype, Address, BytesN, String, Vec};

// ── Auction Format Enum ──────────────────────────────────────────────────────────

/// The auction format determines bidding mechanics and settlement logic.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum AuctionFormat {
    /// Traditional ascending-bid auction: highest bidder wins at their bid price.
    English,
    /// Descending-price auction: first bidder to accept the current price wins.
    Dutch,
    /// Commit-reveal auction: bids are hidden until the reveal phase.
    SealedBid,
}

// ── Auction Status ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum AuctionStatus {
    /// Auction created but not yet started.
    Created,
    /// Bidding is open.
    Active,
    /// Bidding phase ended, winner determined.
    Ended,
    /// Funds distributed, item transferred.
    Settled,
    /// Auction cancelled by seller (no bids placed yet).
    Cancelled,
}

// ── Item Type ────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ItemType {
    /// A Stellar SEP-41 NFT token (on-chain asset).
    Digital { nft_contract: Address, token_id: u64 },
    /// A physical item requiring custodian attestation.
    Physical { custodian: Address, attestation_hash: BytesN<32> },
}

// ── Storage Keys ──────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Maps auction_id -> Auction
    Auction(u64),
    /// Maps (auction_id, bidder) -> SealedBidCommitment (for sealed-bid commit phase)
    Commitment(u64, Address),
    /// Maps (auction_id, bidder) -> revealed bid amount (for sealed-bid reveal phase)
    RevealedBid(u64, Address),
    /// Global auction counter
    AuctionCount,
    /// Platform configuration
    Config,
}

// ── Auction ───────────────────────────────────────────────────────────────────────

/// Core auction data stored on-chain.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Auction {
    /// Sequential auction identifier.
    pub id: u64,
    /// Address of the seller who listed this item.
    pub seller: Address,
    /// The original creator entitled to royalties.
    pub original_creator: Address,
    /// Auction format.
    pub format: AuctionFormat,
    /// Current status.
    pub status: AuctionStatus,
    /// What is being auctioned.
    pub item: ItemType,
    /// Token contract for bidding currency (e.g., XLM or stablecoin).
    pub payment_token: Address,
    /// Reserve / minimum price (in stroops of payment_token).
    pub reserve_price: i128,
    /// Royalty rate in basis points (e.g., 500 = 5%).
    pub royalty_bps: u32,
    /// Platform fee in basis points.
    pub platform_fee_bps: u32,
    /// Unix timestamp (ledger) when bidding opens.
    pub start_time: u64,
    /// Unix timestamp (ledger) when bidding closes.
    pub end_time: u64,
    /// IPFS CID for item metadata (title, description, images).
    pub metadata_uri: String,

    // ── English auction state ──
    /// Current highest bidder (English / sealed-bid).
    pub highest_bidder: Option<Address>,
    /// Current highest bid amount (English).
    pub highest_bid: i128,
    /// Minimum bid increment (English only).
    pub min_increment: i128,

    // ── Dutch auction state ──
    /// Starting (maximum) price for Dutch auctions.
    pub start_price: i128,
    /// Current price (tracked for Dutch; updated on-chain each interaction).
    pub current_dutch_price: i128,
    /// Decrement per second for Dutch auctions (in stroops).
    pub price_decay_per_second: i128,

    // ── Sealed-bid state ──
    /// Deadline after which commitments are no longer accepted.
    pub commit_deadline: u64,
    /// Deadline after which reveals must be submitted.
    pub reveal_deadline: u64,
    /// Revealed bids collected during reveal phase (winner selection).
    pub revealed_bids: Vec<SealedBidEntry>,

    /// Whether custodian attestation has been verified (physical items).
    pub attested: bool,
}

// ── Sealed-Bid Structures ──────────────────────────────────────────────────────────

/// A single revealed bid entry during the sealed-bid reveal phase.
#[contracttype]
#[derive(Clone, Debug)]
pub struct SealedBidEntry {
    pub bidder: Address,
    pub amount: i128,
    pub revealed_at: u64,
}

/// Commitment hash stored during commit phase.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BidCommitment {
    pub bidder: Address,
    pub commitment: BytesN<32>,
    pub timestamp: u64,
}

// ── Bid Record (event data) ────────────────────────────────────────────────────────

/// Emitted as event data for every bid placed.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BidRecord {
    pub auction_id: u64,
    pub bidder: Address,
    pub amount: i128,
    pub timestamp: u64,
    pub format: AuctionFormat,
}

// ── Platform Configuration ─────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct PlatformConfig {
    /// Admin address that can update configuration.
    pub admin: Address,
    /// Default platform fee in basis points.
    pub default_platform_fee_bps: u32,
    /// Maximum royalty in basis points (to prevent abuse).
    pub max_royalty_bps: u32,
    /// Whether the platform is paused.
    pub paused: bool,
}
